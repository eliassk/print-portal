<script lang="ts">
	import { ui } from '$lib/i18n';
	import type { Tray } from '$lib/status';
	let { trays, compact = false }: { trays: Tray[]; compact?: boolean } = $props();
</script>

<div class="trays" class:compact>
	{#each trays as t (t.key)}
		<div class="tray">
			<div class="head"><b>{ui.trays[t.key]}</b><span class="pill {t.state}">{ui.trayStates[t.state]}</span></div>
			<div class="bar" aria-hidden="true"><i class={t.state} style="width: {t.level ?? 0}%"></i></div>
			{#if t.size}<small>{t.size}</small>{/if}
		</div>
	{/each}
</div>

<style>
	.trays {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 10px;
	}
	.compact {
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: 8px;
	}
	.tray {
		background: var(--sunk);
		border: 1px solid var(--line);
		border-radius: 12px;
		padding: 12px 14px;
		min-width: 0;
	}
	/* Name above, status label below, in every card, so the bars line up across the row. */
	.head {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 6px;
	}
	.head b {
		white-space: nowrap;
	}
	.compact .head b {
		font-size: 14px;
	}
	.bar {
		height: 6px;
		border-radius: 3px;
		background: var(--line);
		overflow: hidden;
		margin: 6px 0;
	}
	.bar i {
		display: block;
		height: 100%;
		background: var(--ok);
	}
	.bar i.low {
		background: var(--warn);
	}
	/* Inline, unlike the shared block-level small. */
	small {
		display: inline;
		font-size: smaller;
		color: var(--muted);
	}
	.pill {
		font-size: 11.5px;
		font-weight: 600;
		padding: 2px 7px;
		border-radius: 99px;
		white-space: nowrap;
		background: var(--ok-soft);
		color: var(--ok);
	}
	.pill.low {
		background: var(--warn-soft);
		color: var(--warn);
	}
	.pill.empty {
		background: var(--bad-soft);
		color: var(--bad);
	}
	.pill.unknown {
		color: var(--muted);
	}
</style>
