<script lang="ts">
	import { pl } from '$lib/i18n/pl';
	import type { Tray } from '$lib/status';
	let { trays, compact = false }: { trays: Tray[]; compact?: boolean } = $props();
</script>

<div class="trays" class:compact>
	{#each trays as t (t.key)}
		<div class="tray">
			<div class="head"><b>{pl.trays[t.key]}</b><span class="pill {t.state}">{pl.trayStates[t.state]}</span></div>
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
	.head {
		display: flex;
		justify-content: space-between;
		gap: 6px;
		align-items: center;
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
	small {
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
