<script lang="ts">
	import { onDestroy } from 'svelte';
	import Icon from '$lib/Icon.svelte';
	import { ui } from '$lib/i18n';
	import { usesBypass } from '$lib/options';
	import type { Portal } from './portal.svelte';

	let { portal: p }: { portal: Portal } = $props();
	const result = $derived(p.result!);
	let now = $state(Date.now());
	const timer = setInterval(() => (now = Date.now()), 1000);
	onDestroy(() => clearInterval(timer));
	const left = $derived(Math.max(0, result.expires - now));
	const mmss = $derived(`${String(Math.floor(left / 60000)).padStart(2, '0')}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`);
</script>

<div class="narrow">
	<section class="card pinbox">
		<span class="ok-badge"><Icon name="check" size={22} /></span>
		<h1>{ui.collect}</h1>
		<div class="codes">
			<div><span class="lbl">{ui.jobId}</span><span class="pin">{result.id}</span></div>
			<div><span class="lbl">{ui.pin}</span><span class="pin">{result.pin.slice(0, 3)} {result.pin.slice(3)}</span></div>
		</div>
		{#if left > 0}<span class="timer">{ui.validFor(mmss)}</span>{:else}<span class="err">{ui.expired}</span>{/if}
	</section>
	{#if result.telegram}<p class="note info"><Icon name="send" size={18} />{ui.telegram.pinSent}</p>{/if}
	<section class="card">
		<span class="lbl">{ui.atPrinter}</span>
		<ol class="how">{#each ui.steps as s (s)}<li>{s}</li>{/each}</ol>
		<p class="hint">{ui.secureNote}</p>
	</section>
	{#if usesBypass(p.effective.paper)}<p class="note warn"><Icon name="info" size={18} />{ui.loadBypass(ui.papers[p.effective.paper].name)}</p>{/if}
	<button class="btn sec" onclick={() => p.restart()}>{ui.printAnother}</button>
</div>

<style>
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
	/* Stacked on phones so the PIN stays on one line; side by side from tablet width. */
	.codes {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
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
		white-space: nowrap;
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
	@media (min-width: 720px) {
		.codes {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		}
	}
</style>
