<script lang="ts">
	import Icon from '$lib/Icon.svelte';
	import { ui } from '$lib/i18n';
	import { BACK, SCREENS, type Portal } from './portal.svelte';

	let { portal: p }: { portal: Portal } = $props();
	const at = $derived(SCREENS.indexOf(p.screen));
</script>

<header class="bar">
	<div class="bar-in">
		{#if BACK[p.screen]}
			<button class="back" onclick={() => (p.screen = BACK[p.screen]!)}><Icon name="left" size={18} />{ui.back}</button>
		{:else}
			<span class="brand"><span class="logo"><Icon name="printer" size={18} /></span>{ui.appName}</span>
		{/if}
		<!-- The steps mean nothing until the code is entered. -->
		{#if p.customer}
			<ol class="steps" aria-label={ui.stepsLabel}>
				{#each SCREENS as s, i (s)}
					<li class:done={i < at} class:now={s === p.screen}><span>{i + 1}</span>{ui.stepNames[i]}</li>
				{/each}
			</ol>
		{/if}
		{#if p.printer}
			<span class="chip" class:off={!p.printer.online}><i></i>{ui.printerLabel}: {p.printer.online ? ui.printerOk : ui.printerOff}</span>
		{/if}
	</div>
	{#if p.customer}
		<div class="progress" aria-hidden="true">
			<i style="width: {((at + 1) / SCREENS.length) * 100}%"></i>
		</div>
	{/if}
</header>

<style>
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
	}
</style>
