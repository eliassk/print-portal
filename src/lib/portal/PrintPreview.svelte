<script lang="ts">
	import Icon from '$lib/Icon.svelte';
	import { ui } from '$lib/i18n';
	import { SIZES } from '$lib/layout';
	import type { Portal } from './portal.svelte';

	let { portal: p }: { portal: Portal } = $props();
	let landscape = $state(false);
	// The printer's 5 mm edge as a share of the sheet, to draw the printable area on the preview.
	const edge = $derived.by(() => {
		const [w, h] = SIZES[p.effective.size];
		const [x, y] = landscape ? [h, w] : [w, h];
		return `${(5 / y) * 100}% ${(5 / x) * 100}%`;
	});
</script>

<div class="prev" class:busy={p.previewBusy}>
	{#if p.preview}
		<div class="paper-img">
			<img
				src={p.preview.image}
				alt={ui.previewPage(p.sheet, p.preview.faces)}
				onload={(e) => {
					const img = e.currentTarget as HTMLImageElement;
					landscape = img.naturalWidth > img.naturalHeight;
				}}
			/>
			<span class="safe" style="inset: {edge}" aria-hidden="true"></span>
		</div>
	{:else}<div class="ph"></div>{/if}
</div>
{#if p.preview && p.preview.faces > 1}
	<div class="pager">
		<button aria-label={ui.prevPage} disabled={p.sheet <= 1} onclick={() => p.sheet--}><Icon name="left" size={18} /></button>
		<span>{ui.previewPage(p.sheet, p.preview.faces)}</span>
		<button aria-label={ui.nextPage} disabled={p.sheet >= p.preview.faces} onclick={() => p.sheet++}><Icon name="right" size={18} /></button>
	</div>
{/if}

<style>
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
	.pager button {
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
	.pager button:not(:disabled):hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	@media (min-width: 1000px) {
		.prev {
			min-height: 420px;
		}
		.prev img {
			max-height: 460px;
		}
	}
</style>
