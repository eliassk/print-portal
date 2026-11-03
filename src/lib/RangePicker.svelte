<script lang="ts">
	import { onMount } from 'svelte';
	import { pl } from '$lib/i18n/pl';

	type Grid = { cols: number; rows: number; cells: string[][]; clipped: boolean };
	type Box = { c1: number; r1: number; c2: number; r2: number };

	let { draft, name, range, onpick, onclose }: { draft: string; name: string; range: string; onpick: (range: string) => void; onclose: () => void } = $props();

	let grid = $state<Grid | null>(null);
	let failed = $state(false);
	let anchor = $state<[number, number] | null>(null);
	let end = $state<[number, number] | null>(null);
	let dragging = $state(false);
	// Touch picks with two taps, so a finger can still scroll the grid.
	let tapNext = $state<'first' | 'last'>('first');
	let touch = $state(false);
	let dialog: HTMLDialogElement;

	const colName = (n: number) => {
		let s = '';
		for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
		return s;
	};
	const colNum = (c: string) => [...c.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

	function parse(input: string): Box | null {
		const m = input.trim().match(/^\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?$/i);
		if (!m) return null;
		const [a, b] = [colNum(m[1]), colNum(m[3] ?? m[1])];
		const [x, y] = [Number(m[2]), Number(m[4] ?? m[2])];
		return { c1: Math.min(a, b), r1: Math.min(x, y), c2: Math.max(a, b), r2: Math.max(x, y) };
	}

	const box = $derived<Box | null>(
		anchor && end
			? { c1: Math.min(anchor[0], end[0]), r1: Math.min(anchor[1], end[1]), c2: Math.max(anchor[0], end[0]), r2: Math.max(anchor[1], end[1]) }
			: null
	);
	const text = $derived(box ? `${colName(box.c1)}${box.r1}:${colName(box.c2)}${box.r2}` : '');
	const inside = (c: number, r: number) => !!box && c >= box.c1 && c <= box.c2 && r >= box.r1 && r <= box.r2;

	onMount(async () => {
		touch = matchMedia('(pointer: coarse)').matches;
		dialog.showModal();
		const b = parse(range);
		if (b) [anchor, end] = [[b.c1, b.r1], [b.c2, b.r2]];
		try {
			const res = await fetch(`/api/sheets/${draft}?name=${encodeURIComponent(name)}`);
			if (!res.ok) throw new Error();
			grid = await res.json();
		} catch {
			failed = true;
		}
	});

	function down(e: PointerEvent, c: number, r: number) {
		if (e.pointerType !== 'mouse') return;
		e.preventDefault();
		anchor = end = [c, r];
		dragging = true;
	}
	function over(c: number, r: number) {
		if (dragging) end = [c, r];
	}
	function tap(e: MouseEvent, c: number, r: number) {
		if (!touch) return;
		if (tapNext === 'first') {
			anchor = end = [c, r];
			tapNext = 'last';
		} else {
			end = [c, r];
			tapNext = 'first';
		}
	}
	function pickColumn(c: number) {
		if (!grid) return;
		anchor = [c, 1];
		end = [c, grid.rows];
	}
	function pickRow(r: number) {
		if (!grid) return;
		anchor = [1, r];
		end = [grid.cols, r];
	}
</script>

<svelte:window onpointerup={() => (dragging = false)} />

<dialog bind:this={dialog} class="picker" onclose={onclose} aria-label={pl.rangePick.title(name)}>
	<header>
		<h2>{pl.rangePick.title(name)}</h2>
		<p>{touch ? pl.rangePick.hintTouch : pl.rangePick.hintMouse}</p>
	</header>
	<div class="scroll" class:dragging>
		{#if grid}
			<table>
				<thead>
					<tr>
						<th class="corner"></th>
						{#each { length: grid.cols } as _, i}
							<th class:hit={!!box && i + 1 >= box.c1 && i + 1 <= box.c2} onclick={() => pickColumn(i + 1)}>{colName(i + 1)}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each grid.cells as row, ri}
						<tr>
							<th class:hit={!!box && ri + 1 >= box.r1 && ri + 1 <= box.r2} onclick={() => pickRow(ri + 1)}>{ri + 1}</th>
							{#each row as cell, ci}
								<td
									class:in={inside(ci + 1, ri + 1)}
									class:start={!!anchor && anchor[0] === ci + 1 && anchor[1] === ri + 1}
									onpointerdown={(e) => down(e, ci + 1, ri + 1)}
									onpointerenter={() => over(ci + 1, ri + 1)}
									onclick={(e) => tap(e, ci + 1, ri + 1)}
									title={cell}>{cell}</td
								>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		{:else if failed}
			<p class="msg">{pl.errors.generic}</p>
		{:else}
			<p class="msg">{pl.sheetsBusy}</p>
		{/if}
	</div>
	{#if grid?.clipped}<p class="note">{pl.rangePick.clipped}</p>{/if}
	<footer>
		<div class="sel">
			<b>{text || '—'}</b>
			{#if box}<span>{pl.rangePick.cells(box.c2 - box.c1 + 1, box.r2 - box.r1 + 1)}</span>{/if}
		</div>
		<button class="btn sec" onclick={() => { onpick(''); dialog.close(); }}>{pl.rangePick.whole}</button>
		<button class="btn sec" onclick={() => dialog.close()}>{pl.rangePick.cancel}</button>
		<button class="btn" disabled={!box} onclick={() => { onpick(text); dialog.close(); }}>{pl.rangePick.ok}</button>
	</footer>
</dialog>

<style>
	.picker {
		width: min(1100px, calc(100vw - 32px));
		max-height: calc(100dvh - 32px);
		padding: 0;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--fg);
		box-shadow: var(--shadow-lift);
	}
	.picker[open] {
		display: flex;
		flex-direction: column;
	}
	.picker::backdrop {
		background: rgb(0 0 0 / 0.55);
	}
	header {
		padding: 18px 20px 10px;
	}
	h2 {
		margin: 0 0 4px;
		font-size: 1.1rem;
	}
	header p,
	.note {
		margin: 0;
		color: var(--muted);
		font-size: 0.9rem;
	}
	.note {
		padding: 8px 20px 0;
	}
	.scroll {
		overflow: auto;
		min-height: 200px;
		margin: 0 20px;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--sunk);
	}
	.scroll.dragging {
		cursor: cell;
		user-select: none;
	}
	table {
		border-collapse: separate;
		border-spacing: 0;
		font-size: 0.82rem;
	}
	th,
	td {
		border-right: 1px solid var(--line);
		border-bottom: 1px solid var(--line);
		height: 28px;
		padding: 0 8px;
		white-space: nowrap;
	}
	td {
		max-width: 220px;
		min-width: 56px;
		overflow: hidden;
		text-overflow: ellipsis;
		background: var(--surface);
		cursor: cell;
		user-select: none;
	}
	th {
		position: sticky;
		background: var(--sunk);
		color: var(--muted);
		font-weight: 600;
		cursor: pointer;
		z-index: 1;
	}
	thead th {
		top: 0;
		text-align: center;
	}
	tbody th {
		left: 0;
		text-align: right;
		min-width: 40px;
	}
	.corner {
		left: 0;
		z-index: 2;
	}
	th.hit {
		background: var(--accent-soft);
		color: var(--accent);
	}
	td.in {
		background: color-mix(in srgb, var(--accent) 22%, var(--surface));
	}
	td.start {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
	.msg {
		padding: 24px;
		color: var(--muted);
	}
	footer {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 14px 20px 18px;
		flex-wrap: wrap;
	}
	.sel {
		margin-right: auto;
		display: flex;
		align-items: baseline;
		gap: 10px;
	}
	.sel b {
		font-size: 1.1rem;
	}
	.sel span {
		color: var(--muted);
		font-size: 0.9rem;
	}
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 42px;
		padding: 0 18px;
		border: 0;
		border-radius: 12px;
		background: var(--accent);
		color: var(--on-accent);
		font-weight: 600;
		cursor: pointer;
	}
	.btn:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.btn.sec {
		background: var(--surface);
		color: var(--fg);
		border: 1px solid var(--line);
	}
</style>
