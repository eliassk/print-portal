<script lang="ts">
	import AdminBar from '$lib/AdminBar.svelte';
	import Icon from '$lib/Icon.svelte';
	import { dateLocale, ui } from '$lib/i18n';
	let { data } = $props();

	const t = ui.admin.billing;
	const n = (v: number) => v.toLocaleString(dateLocale);
	const name = (id: number | null) => (id === null ? t.noCustomer : (data.names[id] ?? '—'));
	const paper = (p: string) => ui.papers[p as keyof typeof ui.papers]?.name ?? p;
	const colour = (c: string) => ui.colorOptions[c as 'mono' | 'color'] ?? c;
	const range = (from: string, to: string) => `?from=${from}&to=${to}`;

	const all = $derived(
		data.usage.reduce(
			(s, u) => ({ sides: s.sides + u.total.sides, color: s.color + u.color.sides, mono: s.mono + u.mono.sides, sheets: s.sheets + u.total.sheets }),
			{ sides: 0, color: 0, mono: 0, sheets: 0 }
		)
	);
	const isThis = $derived(data.from === data.months.current.from && data.to === data.months.current.to);
	const isLast = $derived(data.from === data.months.previous.from && data.to === data.months.previous.to);
</script>

<svelte:head><title>{t.title} · {ui.appName}</title></svelte:head>

<AdminBar current="billing" />

<main>
	<header class="head">
		<div>
			<h1>{t.title}</h1>
			<p class="muted">{t.hint}</p>
		</div>
		<a class="btn small sec" href="/admin/billing/export{range(data.from, data.to)}" download><Icon name="upload" size={16} />{t.exportCsv}</a>
	</header>

	<form class="card period" method="GET">
		<div class="quick">
			<a href={range(data.months.current.from, data.months.current.to)} class:on={isThis}>{t.thisMonth}</a>
			<a href={range(data.months.previous.from, data.months.previous.to)} class:on={isLast}>{t.lastMonth}</a>
		</div>
		<label><span>{t.from}</span><input type="date" name="from" value={data.from} required /></label>
		<label><span>{t.to}</span><input type="date" name="to" value={data.to} required /></label>
		<button class="btn small">{t.show}</button>
	</form>

	<section class="stats">
		<div class="stat main"><span>{t.totals.sides}</span><b>{n(all.sides)}</b></div>
		<div class="stat"><span><i class="sw color"></i>{t.totals.color}</span><b>{n(all.color)}</b></div>
		<div class="stat"><span><i class="sw mono"></i>{t.totals.mono}</span><b>{n(all.mono)}</b></div>
		<div class="stat"><span>{t.totals.sheets}</span><b>{n(all.sheets)}</b></div>
	</section>

	<section class="card list">
		<div class="row hdr" aria-hidden="true">
			<span>{t.cols.customer}</span><span>{t.cols.jobs}</span><span>{t.cols.mono}</span><span>{t.cols.color}</span><span>{t.cols.sides}</span><span>{t.cols.sheets}</span><span></span>
		</div>
		{#if data.usage.length === 0 && data.idle.length === 0}
			<p class="muted empty">{t.noUsage}</p>
		{/if}
		{#each data.usage as u (u.customerId)}
			<details>
				<summary class="row" class:none={u.customerId === null}>
					<b class="name">{name(u.customerId)}</b>
					<span data-l={t.cols.jobs}>{n(u.total.jobs)}</span>
					<span data-l={t.cols.mono}>{n(u.mono.sides)}</span>
					<span data-l={t.cols.color} class="col">{n(u.color.sides)}</span>
					<span data-l={t.cols.sides} class="sum">{n(u.total.sides)}</span>
					<span data-l={t.cols.sheets}>{n(u.total.sheets)}</span>
					<span class="more">{t.details}<Icon name="right" size={16} /></span>
				</summary>
				<div class="tw">
					<table>
						<thead><tr><th>{t.cols.size}</th><th>{t.cols.colour}</th><th>{t.cols.paper}</th><th>{t.cols.jobs}</th><th>{t.cols.sheets}</th><th>{t.cols.sides}</th></tr></thead>
						<tbody>
							{#each u.rows as r (r.size + r.color + r.paper)}
								<tr><td>{r.size}</td><td>{colour(r.color)}</td><td>{paper(r.paper)}</td><td>{n(r.jobs)}</td><td>{n(r.sheets)}</td><td><b>{n(r.sides)}</b></td></tr>
							{/each}
						</tbody>
					</table>
				</div>
			</details>
		{/each}
		{#each data.idle as id (id)}
			<div class="row idle"><b class="name">{name(id)}</b><span class="nothing">{t.nothing}</span></div>
		{/each}
	</section>

	<p class="muted note"><Icon name="info" size={16} />{t.sentNote}</p>
</main>

<style>
	main {
		max-width: 1120px;
		margin: 0 auto;
		padding: 24px max(16px, env(safe-area-inset-right, 0px)) 48px max(16px, env(safe-area-inset-left, 0px));
		display: grid;
		gap: 16px;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 16px;
	}
	h1 {
		font-size: 1.6rem;
		letter-spacing: -0.02em;
		margin: 0 0 4px;
	}
	.muted {
		color: var(--muted);
		margin: 0;
		font-size: 14px;
		max-width: 70ch;
	}
	.btn.small {
		width: auto;
		flex: none;
		border-radius: 12px;
		padding: 10px 16px;
		font-size: 14.5px;
		box-shadow: none;
		text-decoration: none;
	}
	.card {
		padding: 16px 20px;
	}

	/* Period */
	.period {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 12px 16px;
	}
	.quick {
		display: flex;
		gap: 6px;
		margin-right: auto;
		align-self: center;
	}
	.quick a {
		padding: 8px 12px;
		border-radius: 10px;
		border: 1px solid var(--line);
		color: var(--fg);
		text-decoration: none;
		font-size: 14px;
		font-weight: 550;
	}
	.quick a:hover {
		background: var(--sunk);
	}
	.quick a.on {
		background: var(--accent-soft);
		border-color: transparent;
		color: var(--accent);
	}
	.period label {
		display: grid;
		gap: 4px;
	}
	.period label span {
		font-size: 12.5px;
		font-weight: 600;
		color: var(--muted);
	}
	input[type='date'] {
		border: 1px solid var(--line-strong);
		border-radius: 10px;
		padding: 8px 10px;
		background: var(--surface);
		color: var(--fg);
		font: inherit;
	}
	input:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-soft);
	}

	/* Totals */
	.stats {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 12px;
	}
	@media (max-width: 700px) {
		.stats {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	.stat {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
		padding: 14px 16px;
		display: grid;
		gap: 4px;
	}
	.stat span {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		color: var(--muted);
	}
	.stat b {
		font-size: 1.75rem;
		font-weight: 650;
		letter-spacing: -0.02em;
		font-variant-numeric: tabular-nums;
	}
	.stat.main b {
		color: var(--accent);
	}
	.sw {
		width: 10px;
		height: 10px;
		border-radius: 3px;
	}
	.sw.color {
		background: conic-gradient(#10a5d8 0 33%, #d6338a 0 66%, #e8c21a 0);
	}
	.sw.mono {
		background: #8a93a3;
	}

	/* Per customer */
	.list {
		padding: 0;
		gap: 0;
		overflow: hidden;
	}
	.row {
		display: grid;
		grid-template-columns: minmax(0, 2fr) repeat(5, minmax(0, 1fr)) 110px;
		align-items: center;
		gap: 12px;
		padding: 14px 20px;
		font-variant-numeric: tabular-nums;
	}
	@media (min-width: 761px) {
		.row > span[data-l],
		.hdr > span:not(:first-child) {
			text-align: right;
		}
	}
	.hdr {
		padding-block: 10px;
		background: var(--sunk);
		font: 600 0.7rem var(--mono);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted);
	}
	details,
	.idle {
		border-top: 1px solid var(--line);
	}
	summary {
		list-style: none;
		cursor: pointer;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary:hover,
	details[open] summary {
		background: var(--sunk);
	}
	.name {
		font-weight: 600;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.none .name {
		color: var(--muted);
		font-style: italic;
	}
	.sum {
		font-weight: 650;
	}
	.more {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 2px;
		color: var(--accent);
		font-size: 14px;
		font-weight: 550;
	}
	details[open] .more :global(svg) {
		transform: rotate(90deg);
	}
	.idle .name {
		color: var(--muted);
		font-weight: 500;
	}
	.nothing {
		grid-column: 2 / -1;
		color: var(--muted);
		font-size: 13.5px;
	}
	.empty {
		padding: 20px;
	}
	.tw {
		overflow-x: auto;
		padding: 4px 20px 16px;
		background: var(--sunk);
	}
	table {
		border-collapse: collapse;
		width: 100%;
		font-size: 14px;
		background: var(--surface);
		border-radius: 10px;
		overflow: hidden;
	}
	th,
	td {
		text-align: left;
		padding: 8px 14px;
		border-bottom: 1px solid var(--line);
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	th:nth-child(n + 4),
	td:nth-child(n + 4) {
		text-align: right;
	}
	th {
		font: 600 0.68rem var(--mono);
		text-transform: uppercase;
		color: var(--muted);
	}
	tr:last-child td {
		border-bottom: 0;
	}
	@media (max-width: 760px) {
		.hdr {
			display: none;
		}
		.row {
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 8px 12px;
		}
		.name,
		.more {
			grid-column: 1 / -1;
		}
		.more {
			display: none;
		}
		.row > span[data-l] {
			display: grid;
			font-size: 15px;
		}
		.row > span[data-l]::before {
			content: attr(data-l);
			font-size: 11.5px;
			color: var(--muted);
		}
		.nothing {
			grid-column: 1 / -1;
		}
		.head {
			flex-direction: column;
		}
	}
	.note {
		display: flex;
		gap: 8px;
		align-items: center;
	}
</style>
