<script lang="ts">
	import Icon from '$lib/Icon.svelte';
	import { ui } from '$lib/i18n';
	import { COMMON_PAPERS, MARGINS, NUP_CHOICES, PAPER_GSM, PAPERS, usesBypass } from '$lib/options';
	import RangePicker from './RangePicker.svelte';
	import PrintPreview from './PrintPreview.svelte';
	import TrayNote from './TrayNote.svelte';
	import type { Portal } from './portal.svelte';

	let { portal: p }: { portal: Portal } = $props();
	let picking = $state<string | null>(null);
	let morePapers = $state(false);
	// A chosen rare paper MUST stay visible, or the choice is hidden from the person.
	const allPapers = $derived(morePapers || !(COMMON_PAPERS as readonly string[]).includes(p.opts.paper));
	const shownPapers = $derived(allPapers ? PAPERS : COMMON_PAPERS);
	const fileKey = $derived(p.kind === 'doc' ? ui.pages(p.items) : ui.photos(p.items));
</script>

{#snippet seg<T extends string | number>(values: readonly T[], current: T, set: (v: T) => void, label: (v: T) => string, disabled?: (v: T) => boolean)}
	<div class="seg" role="group">
		{#each values as v (v)}
			<button aria-pressed={current === v} disabled={disabled?.(v)} onclick={() => set(v)}>{label(v)}</button>
		{/each}
	</div>
{/snippet}

<div class="split">
	<aside class="side">
		<section class="card">
			<div class="filerow">
				<span class="ic sm"><Icon name={p.kind === 'doc' ? 'file' : 'photo'} size={20} /></span>
				<span class="fname"><b>{p.fileName}</b>{#if p.fileName !== fileKey}<small>{fileKey}</small>{/if}</span>
				<button class="link" onclick={() => (p.screen = 'file')}>{ui.changeFile}</button>
			</div>
			<PrintPreview portal={p} />
			<p class="hint">{ui.previewNote}</p>
			{#if p.preview?.lowRes}<p class="note warn"><Icon name="alert" size={18} />{ui.lowRes}</p>{/if}
		</section>
		<div class="cta desk">
			{#if p.preview}<span class="total">{ui.total}: <b>{ui.sheets(p.preview.sheets)}</b></span>{/if}
			<button class="btn" disabled={!p.rangeOk || !p.preview} onclick={() => (p.screen = 'sum')}>{ui.next}: {ui.summary.toLowerCase()}<Icon name="right" size={18} /></button>
		</div>
	</aside>

	<div class="settings">
		{#if p.book}
			<section class="card">
				<span class="lbl">{ui.sheetsTitle}</span>
				<div class="books">
					{#each p.picks as s (s.name)}
						<div class="bsheet" class:on={s.on}>
							<label class="bname"><input type="checkbox" bind:checked={s.on} /><span>{s.name}</span></label>
							<input class="input" type="text" aria-label={ui.cellRangeFor(s.name)} placeholder={ui.cellRangePlaceholder} disabled={!s.on} bind:value={s.range} />
							<button class="gridbtn" aria-label={ui.rangePick.open(s.name)} title={ui.rangePick.open(s.name)} disabled={!s.on} onclick={() => (picking = s.name)}><Icon name="grid" size={20} /></button>
						</div>
					{/each}
				</div>
				{#if picking && p.draft}
					{@const s = p.picks.find((x) => x.name === picking)!}
					<RangePicker draft={p.draft} name={s.name} range={s.range} onpick={(range) => (s.range = range)} onclose={() => (picking = null)} />
				{/if}
				<p class="hint">{ui.cellRangeHint}</p>
				<label class="toggle"><input type="checkbox" bind:checked={p.fitWide} /><span>{ui.fitWide}</span></label>
				{#if p.pickDirty}
					<button class="btn" disabled={p.bookBusy || !p.pickNow.sheets.length} onclick={() => p.applySheets()}>{p.bookBusy ? ui.sheetsBusy : ui.sheetsApply}</button>
				{/if}
			</section>
		{/if}
		<section class="card">
			<div class="row">
				<div class="field">
					<span class="lbl">{ui.copies}</span>
					<div class="stepper">
						<button aria-label={ui.fewerCopies} onclick={() => (p.opts.copies = Math.max(1, p.opts.copies - 1))}><Icon name="minus" size={18} /></button>
						<output>{p.opts.copies}</output>
						<button aria-label={ui.moreCopies} onclick={() => (p.opts.copies = Math.min(20, p.opts.copies + 1))}><Icon name="plus" size={18} /></button>
					</div>
				</div>
				{#if p.kind === 'doc' && p.items > 1}
					<label class="field grow">
						<span class="lbl">{ui.range}</span>
						<input id="range" class="input" type="text" inputmode="numeric" placeholder={ui.rangePlaceholder} bind:value={p.opts.range} />
					</label>
				{/if}
			</div>
			{#if !p.rangeOk}<p class="err">{ui.errors.rangeInvalid}</p>{/if}
		</section>

		<section class="card grid2">
			<div class="field">
				<span class="lbl">{ui.size}</span>
				{@render seg(['A5', 'A4', 'A3'] as const, p.opts.size, (v) => (p.opts.size = v), (v) => v)}
			</div>
			<div class="field">
				<span class="lbl">{ui.color}</span>
				{@render seg(['mono', 'color'] as const, p.opts.color, (v) => (p.opts.color = v), (v) => ui.colorOptions[v], (v) => v === 'color' && p.printer?.colorAllowed === false)}
				{#if p.printer?.colorAllowed === false}<p class="hint">{ui.colorOff}</p>{/if}
			</div>
		</section>

		<section class="card grid2">
			<div class="field">
				<span class="lbl">{ui.nup[p.kind]}</span>
				{@render seg(NUP_CHOICES[p.kind], p.effective.nup, (v) => (p.opts.nup = v), (v) => String(v))}
			</div>
			{#if p.kind === 'photo'}
				<div class="field">
					<span class="lbl">{ui.fit}</span>
					{@render seg(['fit', 'fill'] as const, p.opts.fit, (v) => (p.opts.fit = v), (v) => ui.fitOptions[v])}
					<p class="hint">{ui.fitHint[p.opts.fit]}</p>
				</div>
				<div class="field wide">
					<span class="lbl">{ui.orientation}</span>
					{@render seg(['auto', 'portrait', 'landscape'] as const, p.opts.orientation, (v) => (p.opts.orientation = v), (v) => ui.orientationOptions[v])}
					<p class="hint">{ui.orientationHint[p.opts.orientation]}</p>
				</div>
			{/if}
			<div class="field wide">
				<span class="lbl">{ui.margin}</span>
				{@render seg(MARGINS, p.opts.margin, (v) => (p.opts.margin = v), (v) => ui.marginLabel(v))}
				<p class="hint">{ui.marginHint}</p>
			</div>
			<div class="field wide">
				<span class="lbl">{ui.duplex}</span>
				{@render seg(['off', 'long', 'short'] as const, p.effective.duplex, (v) => (p.opts.duplex = v), (v) => ui.duplexOptions[v], (v) => v !== 'off' && usesBypass(p.opts.paper))}
				<p class="hint">{usesBypass(p.opts.paper) ? ui.duplexThick : ui.duplexHint[p.effective.duplex]}</p>
			</div>
		</section>

		<section class="card">
			<span class="lbl">{ui.paper}</span>
			<div class="papers">
				{#each shownPapers as paper (paper)}
					<button class="paper" aria-pressed={p.opts.paper === paper} onclick={() => (p.opts.paper = paper)}>
						<span class="sw" class:special={!PAPER_GSM[paper]} style="height: {PAPER_GSM[paper] ? 6 + PAPERS.indexOf(paper) * 3.5 : 6}px" aria-hidden="true"></span>
						<span class="ptext"><b>{ui.papers[paper].name}</b><small>{[ui.gsm(PAPER_GSM[paper]), ui.papers[paper].use].filter(Boolean).join(' · ')}</small></span>
						{#if p.opts.paper === paper}<span class="tick"><Icon name="check" size={16} /></span>{/if}
					</button>
				{/each}
			</div>
			<button class="more" aria-expanded={allPapers} onclick={() => (morePapers = !allPapers)}>
				<Icon name={allPapers ? 'minus' : 'plus'} size={16} />{allPapers ? ui.fewerPapers : ui.morePapers(PAPERS.length - COMMON_PAPERS.length)}
			</button>
			<TrayNote portal={p} />
		</section>

		<div class="cta mob">
			<button class="btn" disabled={!p.rangeOk || !p.preview} onclick={() => (p.screen = 'sum')}>{ui.next}: {ui.summary.toLowerCase()}<Icon name="right" size={18} /></button>
		</div>
	</div>
</div>

<style>
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
	.stepper button:hover {
		border-color: var(--accent);
		color: var(--accent);
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
	/* One row of equal buttons, full width, so no option ever wraps onto a second line. */
	.seg {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: minmax(0, 1fr);
		gap: 4px;
		padding: 4px;
		border-radius: 12px;
		background: var(--sunk);
		border: 1px solid var(--line);
	}
	.seg button {
		border: 0;
		background: transparent;
		border-radius: 9px;
		padding: 9px 6px;
		min-height: 40px;
		line-height: 1.2;
		text-align: center;
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
	.books {
		display: grid;
		gap: 8px;
		margin: 8px 0 6px;
	}
	.bsheet {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 140px 42px;
		gap: 10px;
		align-items: center;
	}
	.bname {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
		cursor: pointer;
		color: var(--muted);
	}
	.bsheet.on .bname {
		color: inherit;
		font-weight: 600;
	}
	.bname span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.bname input {
		flex: none;
		width: 20px;
		height: 20px;
		accent-color: var(--accent);
	}
	.bsheet .input:disabled,
	.gridbtn:disabled {
		opacity: 0.45;
	}
	.gridbtn {
		display: grid;
		place-items: center;
		height: 42px;
		border: 1px solid var(--line-strong);
		border-radius: 12px;
		background: var(--surface);
		color: var(--accent);
		cursor: pointer;
	}
	.gridbtn:hover:not(:disabled) {
		background: var(--accent-soft);
	}
	.more {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-top: 10px;
		padding: 6px 2px;
		border: 0;
		background: none;
		color: var(--accent);
		font-weight: 600;
		cursor: pointer;
	}
	.sw.special {
		background: repeating-linear-gradient(45deg, currentColor 0 2px, transparent 2px 5px);
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
	@media (min-width: 1000px) {
		.side {
			position: sticky;
			top: 84px;
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
</style>
