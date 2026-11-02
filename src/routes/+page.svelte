<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { pl } from '$lib/i18n/pl';
	import Icon from '$lib/Icon.svelte';
	import TrayList from '$lib/TrayList.svelte';
	import { MARGINS, NUP_CHOICES, PAPER_GSM, PAPERS, PRESETS, normalize, usesBypass, type Kind, type PrintOptions } from '$lib/options';
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
	let dragging = $state(false);

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
		await uploadFiles([...(input.files ?? [])]);
		input.value = '';
	}

	function drop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		if (!busy) uploadFiles([...(e.dataTransfer?.files ?? [])]);
	}

	async function uploadFiles(files: File[]) {
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
		<p class="note warn"><Icon name="alert" size={18} />{pl.printerOffline}</p>
	{:else if usesBypass(effective.paper)}
		<p class="note warn"><Icon name="info" size={18} />{pl.loadBypass(pl.papers[effective.paper].name)}{tray?.state === 'empty' ? ` ${pl.bypassEmpty}` : ''}</p>
	{:else if tray?.state === 'empty'}
		<p class="note bad"><Icon name="alert" size={18} />{pl.emptyTray(pl.trays[tray.key])}</p>
	{:else if tray?.state === 'low'}
		<p class="note warn"><Icon name="alert" size={18} />{pl.lowTray(pl.trays[tray.key])}</p>
	{:else if tray}
		<p class="note info"><Icon name="info" size={18} />{pl.fromCassette(pl.trays[tray.key])}</p>
	{/if}
{/snippet}

{#snippet seg<T extends string | number>(values: readonly T[], current: T, set: (v: T) => void, label: (v: T) => string, disabled?: (v: T) => boolean)}
	<div class="seg" role="group">
		{#each values as v (v)}
			<button aria-pressed={current === v} disabled={disabled?.(v)} onclick={() => set(v)}>{label(v)}</button>
		{/each}
	</div>
{/snippet}

<div class="app">
	<header class="bar">
		<div class="bar-in">
			{#if back[screen]}
				<button class="back" onclick={() => (screen = back[screen]!)}><Icon name="left" size={18} />{pl.back}</button>
			{:else}
				<span class="brand"><span class="logo"><Icon name="printer" size={18} /></span>{pl.appName}</span>
			{/if}
			<ol class="steps" aria-label="Kroki">
				{#each order as s, i (s)}
					<li class:done={i < order.indexOf(screen)} class:now={s === screen}><span>{i + 1}</span>{pl.stepNames[i]}</li>
				{/each}
			</ol>
			{#if printer}
				<span class="chip" class:off={!printer.online}><i></i>{pl.printerLabel}: {printer.online ? pl.printerOk : pl.printerOff}</span>
			{/if}
		</div>
		<div class="progress" aria-hidden="true">
			<i style="width: {((order.indexOf(screen) + 1) / order.length) * 100}%"></i>
		</div>
	</header>

	<main class="screen-{screen}">
		{#if screen === 'start'}
			<div class="hero">
				<h1>{pl.startQuestion}</h1>
				<p>{pl.tagline}</p>
			</div>
			<div class="presets">
				{#each ['doc', 'photo'] as const as k (k)}
					<button class="preset" onclick={() => choose(k)}>
						<span class="ic"><Icon name={k === 'doc' ? 'file' : 'photo'} size={26} /></span>
						<span class="ptext"><b>{pl.presets[k].name}</b><small>{pl.presets[k].hint}</small></span>
						<span class="go"><Icon name="right" size={20} /></span>
					</button>
				{/each}
			</div>
			{#if saved[kind]}<p class="note info"><Icon name="check" size={18} />{pl.lastUsed}: <b>{pl.presets[kind].name}</b>. {pl.remembered}</p>{/if}
			{#if printer?.online}
				<section class="card">
					<h2 class="lbl">{pl.printerLabel}</h2>
					<TrayList trays={printer.trays} />
				</section>
			{/if}
		{:else if screen === 'file'}
			<div class="hero">
				<h1>{pl.pickFile[kind]}</h1>
				<p>{pl.fileTypes[kind]}</p>
			</div>
			<label
				class="drop"
				class:dragging
				class:busy
				ondragover={(e) => {
					e.preventDefault();
					dragging = true;
				}}
				ondragleave={() => (dragging = false)}
				ondrop={drop}
			>
				<span class="ic big"><Icon name={busy ? 'printer' : 'upload'} size={30} /></span>
				<b>{busy ? pl.converting : pl.pickFile[kind]}</b>
				{#if !busy}<small>{pl.dropHint}</small>{/if}
				{#if kind === 'doc'}
					<input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.rtf,application/pdf" onchange={upload} disabled={busy} />
				{:else}
					<input type="file" accept="image/jpeg,image/png" multiple onchange={upload} disabled={busy} />
				{/if}
			</label>
			{#if kind === 'photo'}
				<label class="btn sec cam">
					<Icon name="camera" size={20} />{pl.takePhoto}
					<input type="file" accept="image/*" capture="environment" onchange={upload} disabled={busy} />
				</label>
			{/if}
		{:else if screen === 'opts'}
			<div class="split">
				<aside class="side">
					<section class="card">
						<div class="filerow">
							<span class="ic sm"><Icon name={kind === 'doc' ? 'file' : 'photo'} size={20} /></span>
							<span class="fname"><b>{fileName}</b>{#if fileName !== fileKey}<small>{fileKey}</small>{/if}</span>
							<button class="link" onclick={() => (screen = 'file')}>{pl.changeFile}</button>
						</div>
						<div class="prev" class:busy={previewBusy}>
							{#if preview}
								<div class="paper-img">
									<img
										src={preview.image}
										alt={pl.previewPage(sheet, preview.faces)}
										onload={(e) => {
											const img = e.currentTarget as HTMLImageElement;
											landscape = img.naturalWidth > img.naturalHeight;
										}}
									/>
									<span class="safe" style="inset: {edge}" aria-hidden="true"></span>
								</div>
							{:else}<div class="ph"></div>{/if}
						</div>
						{#if preview && preview.faces > 1}
							<div class="pager">
								<button aria-label={pl.prevPage} disabled={sheet <= 1} onclick={() => sheet--}><Icon name="left" size={18} /></button>
								<span>{pl.previewPage(sheet, preview.faces)}</span>
								<button aria-label={pl.nextPage} disabled={sheet >= preview.faces} onclick={() => sheet++}><Icon name="right" size={18} /></button>
							</div>
						{/if}
						<p class="hint">{pl.previewNote}</p>
						{#if preview?.lowRes}<p class="note warn"><Icon name="alert" size={18} />{pl.lowRes}</p>{/if}
					</section>
					<div class="cta desk">
						{#if preview}<span class="total">{pl.total}: <b>{pl.sheets(preview.sheets)}</b></span>{/if}
						<button class="btn" disabled={!rangeOk || !preview} onclick={() => (screen = 'sum')}>{pl.next}: {pl.summary.toLowerCase()}<Icon name="right" size={18} /></button>
					</div>
				</aside>

				<div class="settings">
					<section class="card">
						<div class="row">
							<div class="field">
								<span class="lbl">{pl.copies}</span>
								<div class="stepper">
									<button aria-label={pl.fewerCopies} onclick={() => (opts.copies = Math.max(1, opts.copies - 1))}><Icon name="minus" size={18} /></button>
									<output>{opts.copies}</output>
									<button aria-label={pl.moreCopies} onclick={() => (opts.copies = Math.min(20, opts.copies + 1))}><Icon name="plus" size={18} /></button>
								</div>
							</div>
							{#if kind === 'doc' && items > 1}
								<label class="field grow">
									<span class="lbl">{pl.range}</span>
									<input id="range" class="input" type="text" inputmode="numeric" placeholder={pl.rangePlaceholder} bind:value={opts.range} />
								</label>
							{/if}
						</div>
						{#if !rangeOk}<p class="err">{pl.errors.rangeInvalid}</p>{/if}
					</section>

					<section class="card grid2">
						<div class="field">
							<span class="lbl">{pl.size}</span>
							{@render seg(['A4', 'A3'] as const, opts.size, (v) => (opts.size = v), (v) => v)}
						</div>
						<div class="field">
							<span class="lbl">{pl.color}</span>
							{@render seg(['mono', 'color'] as const, opts.color, (v) => (opts.color = v), (v) => pl.colorOptions[v], (v) => v === 'color' && printer?.colorAllowed === false)}
							{#if printer?.colorAllowed === false}<p class="hint">{pl.colorOff}</p>{/if}
						</div>
					</section>

					<section class="card grid2">
						<div class="field">
							<span class="lbl">{pl.nup[kind]}</span>
							{@render seg(NUP_CHOICES[kind], effective.nup, (v) => (opts.nup = v), (v) => String(v))}
						</div>
						{#if kind === 'photo'}
							<div class="field">
								<span class="lbl">{pl.fit}</span>
								{@render seg(['fit', 'fill'] as const, opts.fit, (v) => (opts.fit = v), (v) => pl.fitOptions[v])}
								<p class="hint">{pl.fitHint[opts.fit]}</p>
							</div>
							<div class="field wide">
								<span class="lbl">{pl.orientation}</span>
								{@render seg(['auto', 'portrait', 'landscape'] as const, opts.orientation, (v) => (opts.orientation = v), (v) => pl.orientationOptions[v])}
								<p class="hint">{pl.orientationHint[opts.orientation]}</p>
							</div>
						{/if}
						<div class="field wide">
							<span class="lbl">{pl.margin}</span>
							{@render seg(MARGINS, opts.margin, (v) => (opts.margin = v), (v) => pl.marginLabel(v))}
							<p class="hint">{pl.marginHint}</p>
						</div>
						<div class="field wide">
							<span class="lbl">{pl.duplex}</span>
							{@render seg(['off', 'long', 'short'] as const, effective.duplex, (v) => (opts.duplex = v), (v) => pl.duplexOptions[v], (v) => v !== 'off' && usesBypass(opts.paper))}
							{#if usesBypass(opts.paper)}<p class="hint">{pl.duplexThick}</p>{/if}
						</div>
					</section>

					<section class="card">
						<span class="lbl">{pl.paper}</span>
						<div class="papers">
							{#each PAPERS as p, i (p)}
								<button class="paper" aria-pressed={opts.paper === p} onclick={() => (opts.paper = p)}>
									<span class="sw" style="height: {6 + i * 3.5}px" aria-hidden="true"></span>
									<span class="ptext"><b>{pl.papers[p].name}</b><small>{pl.gsm(PAPER_GSM[p])} · {pl.papers[p].use}</small></span>
									{#if opts.paper === p}<span class="tick"><Icon name="check" size={16} /></span>{/if}
								</button>
							{/each}
						</div>
						{@render trayNote()}
					</section>

					<label class="toggle"><input type="checkbox" bind:checked={remember} /><span>{pl.remember}</span></label>
					<div class="cta mob">
						<button class="btn" disabled={!rangeOk || !preview} onclick={() => (screen = 'sum')}>{pl.next}: {pl.summary.toLowerCase()}<Icon name="right" size={18} /></button>
					</div>
				</div>
			</div>
		{:else if screen === 'sum'}
			<div class="narrow">
				<div class="hero"><h1>{pl.summary}</h1></div>
				<section class="card sum">
					<div><span>{pl.file}</span><b>{fileName}</b></div>
					{#if kind === 'doc'}<div><span>{pl.range}</span><b>{effective.range || pl.allPages}</b></div>{/if}
					<div><span>{pl.copies}</span><b>{effective.copies}</b></div>
					<div><span>{pl.size}</span><b>{effective.size}</b></div>
					<div><span>{pl.color}</span><b>{pl.colorOptions[effective.color]}</b></div>
					<div><span>{pl.print}</span><b>{pl.duplexOptions[effective.duplex]}</b></div>
					<div><span>{pl.nup[kind]}</span><b>{effective.nup}</b></div>
					<div><span>{pl.paper}</span><b>{pl.papers[effective.paper].name} · {pl.gsm(PAPER_GSM[effective.paper])}</b></div>
					{#if tray}<div><span>{pl.tray}</span><b>{pl.trays[tray.key]}</b></div>{/if}
					<div class="tot"><span>{pl.total}</span><b>{pl.sheets(preview?.sheets ?? 0)}</b></div>
				</section>
				{@render trayNote()}
				<button class="btn" disabled={busy} onclick={send}><Icon name="lock" size={18} />{busy ? pl.sending : pl.send}</button>
				<p class="hint center">{pl.waitsForPin}</p>
			</div>
		{:else if screen === 'pin' && result}
			<div class="narrow">
				<section class="card pinbox">
					<span class="ok-badge"><Icon name="check" size={22} /></span>
					<h1>{pl.collect}</h1>
					<div class="codes">
						<div><span class="lbl">{pl.jobId}</span><span class="pin">{result.id}</span></div>
						<div><span class="lbl">{pl.pin}</span><span class="pin">{result.pin.slice(0, 3)} {result.pin.slice(3)}</span></div>
					</div>
					{#if left > 0}<span class="timer">{pl.validFor(mmss)}</span>{:else}<span class="err">{pl.expired}</span>{/if}
				</section>
				<section class="card">
					<span class="lbl">{pl.atPrinter}</span>
					<ol class="how">{#each pl.steps as s (s)}<li>{s}</li>{/each}</ol>
					<p class="hint">{pl.secureNote}</p>
				</section>
				{#if usesBypass(effective.paper)}<p class="note warn"><Icon name="info" size={18} />{pl.loadBypass(pl.papers[effective.paper].name)}</p>{/if}
				<button class="btn sec" onclick={restart}>{pl.printAnother}</button>
			</div>
		{/if}

		{#if error}<p class="note bad toast" role="alert"><Icon name="alert" size={18} />{error}</p>{/if}
	</main>
</div>

<style>
	.app {
		min-height: 100dvh;
	}
	.bar {
		position: sticky;
		top: 0;
		z-index: 2;
		background: color-mix(in srgb, var(--surface) 88%, transparent);
		backdrop-filter: saturate(1.4) blur(12px);
		border-bottom: 1px solid var(--line);
	}
	.bar-in {
		max-width: 1120px;
		margin: 0 auto;
		display: flex;
		align-items: center;
		gap: 16px;
		padding: calc(12px + env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px)) 12px max(16px, env(safe-area-inset-left, 0px));
		min-height: 60px;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
		font-weight: 650;
		letter-spacing: -0.01em;
	}
	.logo {
		width: 32px;
		height: 32px;
		border-radius: 10px;
		display: grid;
		place-items: center;
		background: var(--accent);
		color: var(--on-accent);
	}
	.back {
		display: flex;
		align-items: center;
		gap: 4px;
		border: 0;
		background: none;
		color: var(--accent);
		font-weight: 550;
		padding: 6px 8px 6px 2px;
		cursor: pointer;
	}
	.steps {
		display: none;
		list-style: none;
		margin: 0 auto;
		padding: 0;
		gap: 4px;
	}
	.steps li {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
		color: var(--muted);
		padding: 6px 10px;
		border-radius: 99px;
	}
	.steps li span {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-size: 12px;
		font-weight: 650;
		background: var(--sunk);
		border: 1px solid var(--line);
	}
	.steps li.done span {
		background: var(--accent-soft);
		color: var(--accent);
		border-color: transparent;
	}
	.steps li.now {
		color: var(--fg);
		font-weight: 600;
		background: var(--accent-soft);
	}
	.steps li.now span {
		background: var(--accent);
		color: var(--on-accent);
		border-color: transparent;
	}
	.chip {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		color: var(--muted);
		padding: 6px 12px;
		border-radius: 99px;
		border: 1px solid var(--line);
		background: var(--surface);
		white-space: nowrap;
	}
	.chip i {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--ok);
		box-shadow: 0 0 0 3px var(--ok-soft);
	}
	.chip.off i {
		background: var(--bad);
		box-shadow: 0 0 0 3px var(--bad-soft);
	}
	.progress {
		height: 3px;
		background: transparent;
	}
	.progress i {
		display: block;
		height: 100%;
		background: var(--accent);
		border-radius: 0 3px 3px 0;
		transition: width 0.3s ease;
	}
	main {
		max-width: 560px;
		margin: 0 auto;
		display: grid;
		gap: 16px;
		padding: 20px max(16px, env(safe-area-inset-right, 0px)) calc(40px + env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px));
	}
	.hero h1 {
		font-size: clamp(1.6rem, 1.2rem + 1.6vw, 2.3rem);
		line-height: 1.15;
		letter-spacing: -0.02em;
		margin: 4px 0 6px;
		text-wrap: balance;
	}
	.hero p {
		margin: 0;
		color: var(--muted);
		max-width: 52ch;
	}
	.card {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
		padding: 16px;
		min-width: 0;
		display: grid;
		/* minmax(0, 1fr): long file names MUST NOT widen the card past its column. */
		grid-template-columns: minmax(0, 1fr);
		gap: 12px;
		align-content: start;
	}
	.lbl {
		font-size: 12px;
		font-weight: 650;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--muted);
		margin: 0;
	}
	small {
		display: block;
		color: var(--muted);
		font-size: 13.5px;
	}
	.ic {
		width: 52px;
		height: 52px;
		border-radius: 14px;
		display: grid;
		place-items: center;
		background: var(--accent-soft);
		color: var(--accent);
		flex: none;
	}
	.ic.sm {
		width: 40px;
		height: 40px;
		border-radius: 11px;
	}
	.ic.big {
		width: 64px;
		height: 64px;
		border-radius: 18px;
	}
	.presets {
		display: grid;
		gap: 12px;
	}
	.preset {
		display: flex;
		gap: 16px;
		align-items: center;
		text-align: left;
		width: 100%;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
		padding: 18px;
		cursor: pointer;
		transition:
			transform 0.15s ease,
			box-shadow 0.15s ease,
			border-color 0.15s ease;
	}
	.preset:hover {
		border-color: var(--accent);
		box-shadow: var(--shadow-lift);
		transform: translateY(-2px);
	}
	.preset b {
		font-size: 1.1rem;
	}
	.ptext {
		flex: 1;
		min-width: 0;
	}
	.go {
		color: var(--muted);
	}
	.preset:hover .go {
		color: var(--accent);
	}
	.drop {
		position: relative;
		display: grid;
		gap: 8px;
		justify-items: center;
		text-align: center;
		border: 2px dashed var(--line-strong);
		border-radius: 20px;
		padding: 40px 20px;
		background: var(--surface);
		cursor: pointer;
		transition:
			border-color 0.15s,
			background 0.15s;
	}
	.drop:hover,
	.drop.dragging {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.drop.busy {
		cursor: progress;
		opacity: 0.8;
	}
	.drop b {
		font-size: 1.1rem;
	}
	input[type='file'] {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
	.cam {
		position: relative;
	}
	.split {
		display: grid;
		gap: 16px;
	}
	.side,
	.settings {
		display: grid;
		gap: 16px;
		align-content: start;
		min-width: 0;
	}
	.filerow {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.fname {
		flex: 1;
		min-width: 0;
	}
	.fname b {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.link {
		border: 0;
		background: none;
		color: var(--accent);
		font-size: 14px;
		font-weight: 550;
		cursor: pointer;
		padding: 4px;
	}
	.prev {
		background: var(--sunk);
		border-radius: 12px;
		padding: 20px;
		display: grid;
		place-items: center;
		min-height: 260px;
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
		max-height: 380px;
		background: #fff;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12), 0 12px 28px rgba(0, 0, 0, 0.12);
		border-radius: 2px;
	}
	.safe {
		position: absolute;
		border: 1px dashed #8a94a3;
		pointer-events: none;
	}
	.ph {
		width: 170px;
		aspect-ratio: 210 / 297;
		background: var(--surface);
		border-radius: 2px;
		animation: pulse 1.2s ease-in-out infinite alternate;
	}
	@keyframes pulse {
		to {
			opacity: 0.5;
		}
	}
	.pager {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		font-size: 14px;
		color: var(--muted);
	}
	.pager button,
	.stepper button {
		width: 40px;
		height: 40px;
		border-radius: 12px;
		border: 1px solid var(--line);
		background: var(--surface);
		display: grid;
		place-items: center;
		cursor: pointer;
	}
	.pager button:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.pager button:not(:disabled):hover,
	.stepper button:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	.hint {
		margin: 0;
		font-size: 13.5px;
		color: var(--muted);
	}
	.center {
		text-align: center;
	}
	.btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		width: 100%;
		border: 0;
		border-radius: 14px;
		padding: 15px 20px;
		font-weight: 600;
		font-size: 1rem;
		background: var(--accent);
		color: var(--on-accent);
		cursor: pointer;
		box-shadow: 0 6px 16px color-mix(in srgb, var(--accent) 28%, transparent);
		transition:
			background 0.15s,
			transform 0.1s;
	}
	.btn:hover:not(:disabled) {
		background: var(--accent-hover);
	}
	.btn:active:not(:disabled) {
		transform: scale(0.99);
	}
	.btn:disabled {
		opacity: 0.5;
		cursor: default;
		box-shadow: none;
	}
	.btn.sec {
		background: var(--surface);
		color: var(--fg);
		border: 1px solid var(--line);
		box-shadow: var(--shadow);
	}
	.btn.sec:hover {
		background: var(--sunk);
	}
	.cta {
		display: grid;
		gap: 10px;
	}
	.cta.desk {
		display: none;
	}
	.total {
		color: var(--muted);
		text-align: center;
	}
	.total b {
		color: var(--fg);
	}
	.field {
		display: grid;
		gap: 8px;
		align-content: start;
		min-width: 0;
	}
	.grow {
		flex: 1;
		min-width: 180px;
	}
	.grid2 {
		grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr));
		gap: 18px;
	}
	.wide {
		grid-column: 1 / -1;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 16px;
		align-items: end;
	}
	.seg {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 4px;
		padding: 4px;
		border-radius: 12px;
		background: var(--sunk);
		border: 1px solid var(--line);
		justify-self: start;
	}
	.seg button {
		border: 0;
		background: transparent;
		border-radius: 9px;
		padding: 8px 14px;
		min-width: 44px;
		font-size: 15px;
		color: var(--muted);
		cursor: pointer;
		transition:
			background 0.15s,
			color 0.15s;
	}
	.seg button:hover:not(:disabled) {
		color: var(--fg);
	}
	.seg button[aria-pressed='true'] {
		background: var(--surface);
		color: var(--accent);
		font-weight: 600;
		box-shadow: 0 1px 3px rgba(20, 26, 36, 0.12);
	}
	.seg button:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.stepper {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.stepper output {
		font: 650 1.2rem var(--mono);
		min-width: 2ch;
		text-align: center;
	}
	.input {
		width: 100%;
		border: 1px solid var(--line-strong);
		border-radius: 12px;
		padding: 9px 12px;
		background: var(--surface);
		height: 42px;
	}
	.input:focus {
		border-color: var(--accent);
		outline: 3px solid var(--accent-soft);
	}
	.papers {
		display: grid;
		gap: 8px;
	}
	.paper {
		display: flex;
		gap: 14px;
		align-items: center;
		text-align: left;
		width: 100%;
		border: 1px solid var(--line);
		border-radius: 12px;
		padding: 11px 13px;
		background: var(--surface);
		cursor: pointer;
		transition:
			border-color 0.15s,
			background 0.15s;
	}
	.paper:hover {
		border-color: var(--line-strong);
	}
	.paper[aria-pressed='true'] {
		border-color: var(--accent);
		background: var(--accent-soft);
		box-shadow: inset 0 0 0 1px var(--accent);
	}
	.sw {
		width: 30px;
		flex: none;
		border-radius: 2px;
		background: #fff;
		border: 1px solid var(--line-strong);
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
	}
	.tick {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: var(--accent);
		color: var(--on-accent);
		display: grid;
		place-items: center;
		flex: none;
	}
	.toggle {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 2px 4px;
		cursor: pointer;
		color: var(--muted);
	}
	.toggle input {
		width: 20px;
		height: 20px;
		accent-color: var(--accent);
	}
	.narrow {
		display: grid;
		gap: 16px;
	}
	.sum {
		gap: 0;
		padding: 6px 18px;
	}
	.sum div {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		padding: 12px 0;
		border-bottom: 1px solid var(--line);
	}
	.sum div:last-child {
		border: 0;
	}
	.sum span {
		color: var(--muted);
	}
	.sum b {
		text-align: right;
		overflow-wrap: anywhere;
	}
	.sum .tot b {
		font-size: 1.1rem;
	}
	.pinbox {
		text-align: center;
		justify-items: center;
		padding: 28px 20px;
		gap: 14px;
	}
	.pinbox h1 {
		margin: 0;
		font-size: 1.5rem;
		letter-spacing: -0.01em;
	}
	.ok-badge {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: var(--ok-soft);
		color: var(--ok);
	}
	.codes {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 12px;
		width: 100%;
	}
	.codes > div {
		display: grid;
		gap: 4px;
		background: var(--sunk);
		border-radius: 14px;
		padding: 14px;
	}
	.pin {
		font: 700 2.4rem/1.1 var(--mono);
		letter-spacing: 0.12em;
	}
	.timer {
		font: 600 0.95rem var(--mono);
		color: var(--accent);
		background: var(--accent-soft);
		padding: 6px 12px;
		border-radius: 99px;
	}
	.how {
		margin: 0;
		padding-left: 1.3em;
		display: grid;
		gap: 6px;
	}
	.note {
		display: flex;
		gap: 10px;
		align-items: flex-start;
		margin: 0;
		font-size: 14.5px;
		border-radius: 12px;
		padding: 12px 14px;
	}
	.note :global(svg) {
		flex: none;
		margin-top: 1px;
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

	/* Tablet and up: two presets side by side. */
	@media (min-width: 720px) {
		main {
			max-width: 760px;
			padding-top: 36px;
		}
		.presets {
			grid-template-columns: 1fr 1fr;
		}
		.preset {
			flex-direction: column;
			align-items: flex-start;
			padding: 24px;
			min-height: 190px;
		}
		.preset .go {
			margin-top: auto;
			align-self: flex-end;
		}
		.drop {
			padding: 72px 24px;
		}
	}

	/* Desktop: steps in the bar, preview on the left, settings on the right. */
	@media (min-width: 1000px) {
		.steps {
			display: flex;
		}
		.chip {
			margin-left: 0;
		}
		.progress {
			display: none;
		}
		main.screen-opts {
			max-width: 1120px;
		}
		.split {
			grid-template-columns: minmax(0, 440px) minmax(0, 1fr);
			gap: 24px;
			align-items: start;
		}
		.side {
			position: sticky;
			top: 84px;
		}
		.prev {
			min-height: 420px;
		}
		.prev img {
			max-height: 460px;
		}
		.cta.desk {
			display: grid;
		}
		.cta.mob {
			display: none;
		}
		.papers {
			grid-template-columns: 1fr 1fr;
		}
	}
	@media (min-width: 1000px) {
		.toast {
			position: sticky;
			bottom: 20px;
		}
	}
</style>
