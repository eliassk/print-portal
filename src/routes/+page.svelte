<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { pl } from '$lib/i18n/pl';
	import TrayList from '$lib/TrayList.svelte';
	import { NUP_CHOICES, PAPER_GSM, PAPERS, PRESETS, normalize, usesBypass, type Kind, type PrintOptions } from '$lib/options';
	import { parseRange } from '$lib/pages';
	import type { PrinterStatus } from '$lib/status';
	import { trayFor } from '$lib/trayFor';

	type Screen = 'start' | 'file' | 'opts' | 'sum' | 'pin';
	type Status = PrinterStatus & { colorAllowed: boolean };
	const STORE = 'print-portal.settings';

	let screen = $state<Screen>('start');
	let kind = $state<Kind>('doc');
	let saved = $state<Partial<Record<Kind, PrintOptions>>>({});
	let opts = $state<PrintOptions>({ ...PRESETS.doc });
	let remember = $state(true);
	let fileName = $state('');
	let draft = $state<string | null>(null);
	let items = $state(0);
	let busy = $state(false);
	let error = $state('');
	let printer = $state<Status | null>(null);
	let preview = $state<{ image: string; faces: number; sheets: number; lowRes: boolean } | null>(null);
	let sheet = $state(1);
	let landscape = $state(false);
	let previewBusy = $state(false);
	let result = $state<{ id: string; pin: string; expires: number; sheets: number } | null>(null);
	let now = $state(Date.now());

	try {
		const s = JSON.parse(localStorage.getItem(STORE) ?? 'null');
		if (s?.last === 'doc' || s?.last === 'photo') kind = s.last;
		if (s?.opts) saved = s.opts;
	} catch {
		// Private mode or no saved settings: defaults are fine.
	}

	const effective = $derived(normalize(opts, kind));
	const rangeOk = $derived(kind === 'photo' || parseRange(opts.range, items) !== null);
	const tray = $derived(trayFor(effective, printer));
	const left = $derived(result ? Math.max(0, result.expires - now) : 0);
	const mmss = $derived(`${String(Math.floor(left / 60000)).padStart(2, '0')}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`);
	const fileKey = $derived(kind === 'doc' ? pl.pages(items) : pl.photos(items));
	// The printer's 5 mm edge as a share of the sheet, to draw the printable area on the preview.
	const edge = $derived.by(() => {
		const [w, h] = effective.size === 'A4' ? [210, 297] : [297, 420];
		const [x, y] = landscape ? [h, w] : [w, h];
		return `${(5 / y) * 100}% ${(5 / x) * 100}%`;
	});

	const timer = setInterval(() => (now = Date.now()), 1000);
	onDestroy(() => clearInterval(timer));

	async function loadPrinter() {
		try {
			const res = await fetch('/api/printer');
			if (res.ok) printer = await res.json();
		} catch {
			printer = null;
		}
	}
	onMount(() => {
		loadPrinter();
		const t = setInterval(loadPrinter, 60_000);
		return () => clearInterval(t);
	});

	// Refreshes the preview after options settle, so quick taps do not each render.
	let debounce: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const body = JSON.stringify(effective);
		const page = sheet;
		if (screen !== 'opts' || !draft || !rangeOk) return;
		clearTimeout(debounce);
		debounce = setTimeout(() => renderPreview(body, page), 250);
	});

	async function renderPreview(body: string, page: number) {
		if (!draft) return;
		previewBusy = true;
		try {
			const res = await fetch(`/api/preview/${draft}?sheet=${page}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
			const data = await res.json();
			if (!res.ok) throw new Error(data.error ?? pl.errors.generic);
			preview = data;
			if (sheet > data.faces) sheet = data.faces;
			error = '';
		} catch (err) {
			error = err instanceof Error ? err.message : pl.errors.generic;
		} finally {
			previewBusy = false;
		}
	}

	function choose(k: Kind) {
		kind = k;
		opts = { ...PRESETS[k], ...saved[k], range: '' };
		if (printer && !printer.colorAllowed) opts.color = 'mono';
		error = '';
		screen = 'file';
	}

	async function upload(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const files = [...(input.files ?? [])];
		if (files.length === 0) return;
		error = '';
		busy = true;
		fileName = files.length === 1 ? files[0].name : pl.photos(files.length);
		try {
			const body = new FormData();
			for (const f of files) body.append('file', f);
			const res = await fetch('/api/upload', { method: 'POST', body });
			const data = await res.json();
			if (!res.ok) throw new Error(data.error ?? pl.errors.generic);
			draft = data.draft;
			items = data.items;
			if (data.kind !== kind) choose(data.kind);
			preview = null;
			sheet = 1;
			screen = 'opts';
		} catch (err) {
			error = err instanceof Error ? err.message : pl.errors.generic;
		} finally {
			busy = false;
			input.value = '';
		}
	}

	async function send() {
		if (!draft) return;
		error = '';
		busy = true;
		try {
			const res = await fetch(`/api/print/${draft}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(effective) });
			const data = await res.json();
			if (!res.ok) throw new Error(data.error ?? pl.errors.generic);
			result = data;
			draft = null;
			screen = 'pin';
			try {
				if (remember) localStorage.setItem(STORE, JSON.stringify({ last: kind, opts: { ...saved, [kind]: { ...effective, range: '' } } }));
				else localStorage.removeItem(STORE);
			} catch {
				// Storage blocked: nothing to remember.
			}
		} catch (err) {
			error = err instanceof Error ? err.message : pl.errors.generic;
			if (error === pl.errors.expiredDraft) draft = null;
		} finally {
			busy = false;
		}
	}

	function restart() {
		result = null;
		preview = null;
		fileName = '';
		items = 0;
		error = '';
		screen = 'start';
	}

	const back: Partial<Record<Screen, Screen>> = { file: 'start', opts: 'file', sum: 'opts' };
	const order: Screen[] = ['start', 'file', 'opts', 'sum', 'pin'];
</script>

{#snippet trayNote()}
	{#if printer && !printer.online}
		<p class="note warn">{pl.printerOffline}</p>
	{:else if usesBypass(effective.paper)}
		<p class="note warn">{pl.loadBypass(pl.papers[effective.paper].name)}{tray?.state === 'empty' ? ` ${pl.bypassEmpty}` : ''}</p>
	{:else if tray?.state === 'empty'}
		<p class="note bad">{pl.emptyTray(pl.trays[tray.key])}</p>
	{:else if tray?.state === 'low'}
		<p class="note warn">{pl.lowTray(pl.trays[tray.key])}</p>
	{:else if tray}
		<p class="note info">{pl.fromCassette(pl.trays[tray.key])}</p>
	{/if}
{/snippet}

<main>
	<header>
		{#if back[screen]}
			<button class="back" onclick={() => (screen = back[screen]!)}>‹ {pl.back}</button>
		{:else}
			<b>🖨 {pl.appName}</b>
		{/if}
	</header>
	<div class="progress" aria-hidden="true">
		{#each order as s, i (s)}<i class:on={i <= order.indexOf(screen)}></i>{/each}
	</div>

	<section>
		{#if screen === 'start'}
			<p class="lbl">{pl.startQuestion}</p>
			{#each ['doc', 'photo'] as const as k (k)}
				<button class="preset" onclick={() => choose(k)}>
					<span class="ic" aria-hidden="true">{k === 'doc' ? '📄' : '🖼'}</span>
					<span><b>{pl.presets[k].name}</b><small>{pl.presets[k].hint}</small></span>
				</button>
			{/each}
			{#if saved[kind]}<p class="note info">{pl.lastUsed}: <b>{pl.presets[kind].name}</b>. {pl.remembered}</p>{/if}
			{#if printer?.online}<TrayList trays={printer.trays} compact />{/if}
		{:else if screen === 'file'}
			<label class="drop">
				<span aria-hidden="true" class="big">{kind === 'doc' ? '📄' : '🖼'}</span>
				<b>{busy ? pl.converting : pl.pickFile[kind]}</b>
				{#if kind === 'doc'}
					<input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.rtf,application/pdf" onchange={upload} disabled={busy} />
				{:else}
					<input type="file" accept="image/jpeg,image/png" multiple onchange={upload} disabled={busy} />
				{/if}
			</label>
			{#if kind === 'photo'}
				<label class="btn sec cam">
					📷 {pl.takePhoto}
					<input type="file" accept="image/*" capture="environment" onchange={upload} disabled={busy} />
				</label>
			{/if}
			<p class="hint">{pl.fileTypes[kind]}</p>
		{:else if screen === 'opts'}
			<div class="card file"><b>{fileName}</b>{#if fileName !== fileKey}<small>{fileKey}</small>{/if}</div>

			<div class="card">
				<p class="lbl">{pl.preview}</p>
				<div class="prev" class:busy={previewBusy}>
					{#if preview}
						<div class="paper-img">
							<img src={preview.image} alt={pl.previewPage(sheet, preview.faces)} onload={(e) => {
								const img = e.currentTarget as HTMLImageElement;
								landscape = img.naturalWidth > img.naturalHeight;
							}} />
							<span class="safe" style="inset: {edge}" aria-hidden="true"></span>
						</div>
					{:else}<div class="ph"></div>{/if}
				</div>
				{#if preview && preview.faces > 1}
					<div class="pager">
						<button aria-label={pl.prevPage} disabled={sheet <= 1} onclick={() => sheet--}>‹</button>
						<span>{pl.previewPage(sheet, preview.faces)}</span>
						<button aria-label={pl.nextPage} disabled={sheet >= preview.faces} onclick={() => sheet++}>›</button>
					</div>
				{/if}
				<p class="hint small">{pl.previewNote}</p>
				{#if preview?.lowRes}<p class="note warn">{pl.lowRes}</p>{/if}
			</div>

			<div class="card">
				<p class="lbl">{pl.copies}</p>
				<div class="row">
					<div class="stepper">
						<button aria-label={pl.fewerCopies} onclick={() => (opts.copies = Math.max(1, opts.copies - 1))}>−</button>
						<output>{opts.copies}</output>
						<button aria-label={pl.moreCopies} onclick={() => (opts.copies = Math.min(20, opts.copies + 1))}>+</button>
					</div>
					{#if kind === 'doc' && items > 1}
						<label class="range">
							<span class="lbl">{pl.range}</span>
							<input id="range" type="text" inputmode="numeric" placeholder={pl.rangePlaceholder} bind:value={opts.range} />
						</label>
					{/if}
				</div>
				{#if !rangeOk}<p class="err">{pl.errors.rangeInvalid}</p>{/if}
			</div>

			<div class="card grid2">
				<div>
					<p class="lbl">{pl.size}</p>
					<div class="seg">{#each ['A4', 'A3'] as const as v (v)}<button aria-pressed={opts.size === v} onclick={() => (opts.size = v)}>{v}</button>{/each}</div>
				</div>
				<div>
					<p class="lbl">{pl.color}</p>
					<div class="seg">
						{#each ['mono', 'color'] as const as v (v)}
							<button aria-pressed={opts.color === v} disabled={v === 'color' && printer?.colorAllowed === false} onclick={() => (opts.color = v)}>{pl.colorOptions[v]}</button>
						{/each}
					</div>
					{#if printer?.colorAllowed === false}<p class="hint small">{pl.colorOff}</p>{/if}
				</div>
			</div>

			<div class="card">
				<p class="lbl">{pl.nup[kind]}</p>
				<div class="seg">{#each NUP_CHOICES[kind] as n (n)}<button aria-pressed={effective.nup === n} onclick={() => (opts.nup = n)}>{n}</button>{/each}</div>
				{#if kind === 'photo'}
					<p class="lbl gap">{pl.fit}</p>
					<div class="seg">{#each ['fit', 'fill'] as const as v (v)}<button aria-pressed={opts.fit === v} onclick={() => (opts.fit = v)}>{pl.fitOptions[v]}</button>{/each}</div>
					<p class="hint small">{pl.fitHint[opts.fit]}</p>
				{/if}
			</div>

			<div class="card">
				<p class="lbl">{pl.duplex}</p>
				<div class="seg">
					{#each ['off', 'long', 'short'] as const as v (v)}
						<button aria-pressed={effective.duplex === v} disabled={v !== 'off' && usesBypass(opts.paper)} onclick={() => (opts.duplex = v)}>{pl.duplexOptions[v]}</button>
					{/each}
				</div>
				{#if usesBypass(opts.paper)}<p class="hint small">{pl.duplexThick}</p>{/if}
			</div>

			<div class="card">
				<p class="lbl">{pl.paper}</p>
				<div class="papers">
					{#each PAPERS as p, i (p)}
						<button class="paper" aria-pressed={opts.paper === p} onclick={() => (opts.paper = p)}>
							<span class="sw" style="height: {6 + i * 3.5}px" aria-hidden="true"></span>
							<span><b>{pl.papers[p].name}</b> <small class="inline">· {pl.gsm(PAPER_GSM[p])}</small><small>{pl.papers[p].use}</small></span>
						</button>
					{/each}
				</div>
				{@render trayNote()}
			</div>

			<label class="toggle"><span>{pl.remember}</span><input type="checkbox" bind:checked={remember} /></label>
			<button class="btn" disabled={!rangeOk || !preview} onclick={() => (screen = 'sum')}>{pl.next}: {pl.summary.toLowerCase()}</button>
		{:else if screen === 'sum'}
			<div class="card sum">
				<div><span>{pl.file}</span><b>{fileName}</b></div>
				{#if kind === 'doc'}<div><span>{pl.range}</span><b>{effective.range || pl.allPages}</b></div>{/if}
				<div><span>{pl.copies}</span><b>{effective.copies}</b></div>
				<div><span>{pl.size}</span><b>{effective.size}</b></div>
				<div><span>{pl.color}</span><b>{pl.colorOptions[effective.color]}</b></div>
				<div><span>{pl.print}</span><b>{pl.duplexOptions[effective.duplex]}</b></div>
				<div><span>{pl.nup[kind]}</span><b>{effective.nup}</b></div>
				<div><span>{pl.paper}</span><b>{pl.papers[effective.paper].name} · {pl.gsm(PAPER_GSM[effective.paper])}</b></div>
				{#if tray}<div><span>{pl.tray}</span><b>{pl.trays[tray.key]}</b></div>{/if}
				<div><span>{pl.total}</span><b>{pl.sheets(preview?.sheets ?? 0)}</b></div>
			</div>
			{@render trayNote()}
			<button class="btn" disabled={busy} onclick={send}>{busy ? pl.sending : pl.send}</button>
			<p class="hint center">{pl.waitsForPin}</p>
		{:else if screen === 'pin' && result}
			<div class="pinbox">
				<span class="lbl">{pl.jobId}</span>
				<span class="pin">{result.id}</span>
				<span class="lbl">{pl.pin}</span>
				<span class="pin">{result.pin.slice(0, 3)} {result.pin.slice(3)}</span>
				{#if left > 0}<span class="timer">{pl.validFor(mmss)}</span>{:else}<span class="err">{pl.expired}</span>{/if}
			</div>
			<div class="card">
				<p class="lbl">{pl.atPrinter}</p>
				<ol>{#each pl.steps as s (s)}<li>{s}</li>{/each}</ol>
			</div>
			{#if usesBypass(effective.paper)}<p class="note warn">{pl.loadBypass(pl.papers[effective.paper].name)}</p>{/if}
			<button class="btn sec" onclick={restart}>{pl.printAnother}</button>
		{/if}

		{#if error}<p class="note bad" role="alert">{error}</p>{/if}
	</section>
</main>

<style>
	main {
		max-width: 480px;
		margin: 0 auto;
		min-height: 100dvh;
		padding-bottom: env(safe-area-inset-bottom, 0px);
	}
	header {
		position: sticky;
		top: 0;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: calc(12px + env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px)) 12px max(16px, env(safe-area-inset-left, 0px));
		background: var(--surface);
		border-bottom: 1px solid var(--line);
		z-index: 1;
	}
	.back {
		border: 0;
		background: none;
		color: var(--accent);
		padding: 4px 6px;
		cursor: pointer;
	}
	.progress {
		display: flex;
		gap: 4px;
		padding: 10px 16px 0;
	}
	.progress i {
		flex: 1;
		height: 4px;
		border-radius: 2px;
		background: var(--line);
	}
	.progress i.on {
		background: var(--accent);
	}
	section {
		display: grid;
		gap: 14px;
		padding: 16px max(16px, env(safe-area-inset-right, 0px)) 32px max(16px, env(safe-area-inset-left, 0px));
	}
	.lbl {
		font: 600 0.72rem var(--mono);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted);
		margin: 0 0 6px;
		display: block;
	}
	.lbl.gap {
		margin-top: 12px;
	}
	.card {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 12px;
		padding: 12px;
		min-width: 0;
		display: grid;
		gap: 8px;
	}
	.card .lbl {
		margin: 0;
	}
	.grid2 {
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 12px;
	}
	.grid2 > div {
		display: grid;
		gap: 6px;
		align-content: start;
	}
	.card.file {
		gap: 0;
	}
	.card.file b {
		overflow-wrap: anywhere;
	}
	small {
		display: block;
		color: var(--muted);
	}
	small.inline {
		display: inline;
	}
	.preset {
		display: flex;
		gap: 12px;
		align-items: center;
		text-align: left;
		width: 100%;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 12px;
		padding: 14px;
		cursor: pointer;
	}
	.ic {
		width: 44px;
		height: 44px;
		border-radius: 10px;
		background: var(--accent-soft);
		display: grid;
		place-items: center;
		font-size: 22px;
		flex: none;
	}
	.drop {
		position: relative;
		display: grid;
		gap: 6px;
		justify-items: center;
		border: 1.5px dashed var(--line);
		border-radius: 12px;
		padding: 28px 16px;
		background: var(--surface);
		cursor: pointer;
		text-align: center;
	}
	input[type='file'] {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
	}
	.cam {
		position: relative;
		text-align: center;
	}
	.big {
		font-size: 34px;
	}
	.hint {
		margin: 0;
		font-size: 14px;
		color: var(--muted);
	}
	.hint.small {
		font-size: 13px;
	}
	.center {
		text-align: center;
	}
	.prev {
		background: var(--sunk);
		border-radius: 10px;
		padding: 14px;
		display: grid;
		place-items: center;
		min-height: 220px;
		transition: opacity 0.15s;
	}
	.prev.busy {
		opacity: 0.55;
	}
	.paper-img {
		position: relative;
		line-height: 0;
	}
	.prev img {
		max-width: 100%;
		max-height: 340px;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
		background: #fff;
	}
	.safe {
		position: absolute;
		border: 1px dashed #8a94a3;
		pointer-events: none;
	}
	.ph {
		width: 150px;
		aspect-ratio: 210 / 297;
		background: var(--surface);
		border-radius: 2px;
	}
	.pager {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		font-size: 14px;
	}
	.pager button {
		width: 36px;
		height: 36px;
		border-radius: 8px;
		border: 1px solid var(--line);
		background: var(--surface);
		font-size: 18px;
		cursor: pointer;
	}
	.btn {
		display: block;
		width: 100%;
		border: 0;
		border-radius: 12px;
		padding: 14px;
		font-weight: 600;
		background: var(--accent);
		color: var(--on-accent);
		cursor: pointer;
	}
	.btn:disabled {
		opacity: 0.55;
		cursor: default;
	}
	.btn.sec {
		background: var(--surface);
		color: var(--fg);
		border: 1px solid var(--line);
	}
	.seg {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.seg button {
		border: 1px solid var(--line);
		background: var(--surface);
		border-radius: 8px;
		padding: 8px 12px;
		cursor: pointer;
		min-width: 44px;
	}
	.seg button[aria-pressed='true'] {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--accent);
		font-weight: 600;
	}
	.seg button:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.papers {
		display: grid;
		gap: 6px;
	}
	.paper {
		display: flex;
		gap: 12px;
		align-items: center;
		text-align: left;
		width: 100%;
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: 9px 11px;
		background: var(--surface);
		cursor: pointer;
	}
	.paper[aria-pressed='true'] {
		border: 2px solid var(--accent);
		padding: 8px 10px;
	}
	.sw {
		width: 28px;
		flex: none;
		border-radius: 2px;
		background: #fff;
		border: 1px solid var(--line);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		align-items: end;
		justify-content: space-between;
	}
	.stepper {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.stepper button {
		width: 40px;
		height: 40px;
		border-radius: 8px;
		border: 1px solid var(--line);
		background: var(--surface);
		font-size: 20px;
		cursor: pointer;
	}
	.stepper output {
		font: 600 1.1rem var(--mono);
		min-width: 2ch;
		text-align: center;
	}
	.range {
		flex: 1;
		min-width: 160px;
		display: grid;
		gap: 6px;
	}
	.range input {
		width: 100%;
		border: 1px solid var(--line);
		border-radius: 8px;
		padding: 8px 10px;
		background: var(--surface);
	}
	.toggle {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 4px 2px;
	}
	.toggle input {
		width: 22px;
		height: 22px;
	}
	.sum {
		gap: 8px;
	}
	.sum div {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		border-bottom: 1px solid var(--line);
		padding-bottom: 8px;
	}
	.sum div:last-child {
		border: 0;
		padding: 0;
	}
	.sum span {
		color: var(--muted);
	}
	.sum b {
		text-align: right;
		overflow-wrap: anywhere;
	}
	.pinbox {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 14px;
		padding: 20px;
		text-align: center;
		display: grid;
		gap: 4px;
	}
	.pin {
		font: 600 2.4rem/1.1 var(--mono);
		letter-spacing: 0.16em;
		margin-bottom: 10px;
	}
	.timer {
		font: 600 1rem var(--mono);
		color: var(--accent);
	}
	ol {
		margin: 0;
		padding-left: 1.3em;
		display: grid;
		gap: 4px;
	}
	.note {
		margin: 0;
		font-size: 14px;
		border-radius: 10px;
		padding: 10px 12px;
	}
	.note.info {
		background: var(--accent-soft);
		color: var(--accent);
	}
	.note.warn {
		background: var(--warn-soft);
		color: var(--warn);
	}
	.note.bad {
		background: var(--bad-soft);
		color: var(--bad);
	}
	.err {
		color: var(--bad);
		font-size: 14px;
		margin: 0;
	}
	@media (prefers-reduced-motion: reduce) {
		.prev {
			transition: none;
		}
	}
</style>
