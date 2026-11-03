<script lang="ts">
	import Icon from '$lib/Icon.svelte';
	import { ui } from '$lib/i18n';
	import { PAPER_GSM } from '$lib/options';
	import PrintPreview from './PrintPreview.svelte';
	import TrayNote from './TrayNote.svelte';
	import type { Portal } from './portal.svelte';

	let { portal: p }: { portal: Portal } = $props();
	const o = $derived(p.effective);
</script>

<div class="hero"><h1>{ui.summary}</h1></div>
<div class="split sum-split">
	<section class="card"><PrintPreview portal={p} /></section>
	<div class="narrow">
		<section class="card sum">
			<div><span>{ui.file}</span><b>{p.fileName}</b></div>
			{#if p.kind === 'doc'}<div><span>{ui.range}</span><b>{o.range || ui.allPages}</b></div>{/if}
			<div><span>{ui.copies}</span><b>{o.copies}</b></div>
			<div><span>{ui.size}</span><b>{o.size}</b></div>
			<div><span>{ui.color}</span><b>{ui.colorOptions[o.color]}</b></div>
			<div><span>{ui.print}</span><b>{ui.duplexSummary[o.duplex]}</b></div>
			<div><span>{ui.nup[p.kind]}</span><b>{o.nup}</b></div>
			<div><span>{ui.paper}</span><b>{[ui.papers[o.paper].name, ui.gsm(PAPER_GSM[o.paper])].filter(Boolean).join(' · ')}</b></div>
			{#if p.tray}<div><span>{ui.tray}</span><b>{ui.trays[p.tray.key]}</b></div>{/if}
			<div class="tot"><span>{ui.total}</span><b>{ui.sheets(p.preview?.sheets ?? 0)}</b></div>
		</section>
		<TrayNote portal={p} />
		<button class="btn" disabled={p.busy} onclick={() => p.send()}><Icon name="lock" size={18} />{p.busy ? ui.sending : ui.send}</button>
		<p class="hint center">{ui.waitsForPin}</p>
	</div>
</div>

<style>
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
	@media (min-width: 1000px) {
		.sum-split {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		}
	}
</style>
