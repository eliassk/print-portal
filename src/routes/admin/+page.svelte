<script lang="ts">
	import { pl } from '$lib/i18n/pl';
	import TrayList from '$lib/TrayList.svelte';
	let { data, form } = $props();

	const time = (t: number) => new Date(t).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
</script>

<svelte:head><title>{pl.admin.title} · {pl.appName}</title></svelte:head>

<main>
	<header>
		<h1>{pl.admin.title}</h1>
		{#if data.state === 'in'}
			<form method="POST" action="?/logout"><button class="link">{pl.admin.logout}</button></form>
		{/if}
	</header>

	{#if data.state === 'disabled'}
		<p class="note">{pl.admin.disabled}</p>
	{:else if data.state === 'login'}
		<form method="POST" action="?/login" class="card login">
			<label for="password">{pl.admin.password}</label>
			<input id="password" name="password" type="password" autocomplete="current-password" required />
			{#if form?.error}<p class="err">{form.error}</p>{/if}
			<button class="btn">{pl.admin.login}</button>
		</form>
	{:else}
		<section class="card">
			<h2>{pl.admin.printer}</h2>
			{#if data.status.online}
				<TrayList trays={data.status.trays} />
				<h3>{pl.admin.toner}</h3>
				<div class="toner">
					{#each data.status.toner as t (t.key)}
						<div><b class:low={t.level <= 15}>{t.level}%</b>{pl.toner[t.key]}</div>
					{/each}
				</div>
			{:else}
				<p class="err">{pl.admin.offline}</p>
			{/if}
		</section>

		<form method="POST" action="?/save" class="card">
			<h2>{pl.admin.settings}</h2>
			<label class="row"><span>{pl.admin.colorAllowed}</span><input type="checkbox" name="colorAllowed" checked={data.settings.colorAllowed} /></label>
			<label class="row"><span>{pl.admin.dailyPages}</span><input type="number" name="dailyPages" min="1" max="1000" value={data.settings.dailyPages} /></label>
			<label class="row"><span>{pl.admin.maxPages}</span><input type="number" name="maxPages" min="1" max="500" value={data.settings.maxPages} /></label>
			<div class="row"><button class="btn">{pl.admin.save}</button>{#if form?.saved}<span class="ok">{pl.admin.saved}</span>{/if}</div>
		</form>

		<section class="card">
			<h2>{pl.admin.recent}</h2>
			<p class="muted">{pl.admin.today}: {pl.admin.todayTotals(data.today.jobs, data.today.sheets)}</p>
			{#if data.recent.length === 0}
				<p class="muted">{pl.admin.noJobs}</p>
			{:else}
				<div class="tw">
					<table>
						<thead><tr><th>{pl.admin.cols.time}</th><th>{pl.admin.cols.id}</th><th>{pl.admin.cols.sheets}</th><th>{pl.admin.cols.paper}</th><th>{pl.admin.cols.state}</th></tr></thead>
						<tbody>
							{#each data.recent as j (j.at + j.jobId)}
								<tr>
									<td>{time(j.at)}</td>
									<td>{j.jobId}</td>
									<td>{j.sheets}</td>
									<td>{j.size} · {pl.papers[j.paper as keyof typeof pl.papers]?.name ?? j.paper} · {pl.colorOptions[j.color as 'mono' | 'color']}</td>
									<td><span class="pill" class:wait={j.expires > data.now}>{j.expires > data.now ? pl.admin.waiting : pl.admin.gone}</span></td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>
		<p><a href="/karta">{pl.admin.card}</a></p>
	{/if}
</main>

<style>
	main {
		max-width: 760px;
		margin: 0 auto;
		padding: 24px max(16px, env(safe-area-inset-right, 0px)) 48px max(16px, env(safe-area-inset-left, 0px));
		display: grid;
		gap: 16px;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	h1 {
		font-size: 1.5rem;
		margin: 0;
	}
	h2 {
		font-size: 1.1rem;
		margin: 0 0 12px;
	}
	h3 {
		font-size: 0.95rem;
		margin: 16px 0 8px;
	}
	.card {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 12px;
		padding: 16px;
		min-width: 0;
	}
	.login {
		display: grid;
		gap: 10px;
		max-width: 360px;
	}
	input[type='password'],
	input[type='number'] {
		border: 1px solid var(--line);
		border-radius: 8px;
		padding: 8px 10px;
		background: var(--surface);
	}
	input[type='number'] {
		width: 6em;
	}
	.row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 8px 0;
		border-bottom: 1px solid var(--line);
	}
	.row:last-child {
		border: 0;
	}
	.btn {
		border: 0;
		border-radius: 10px;
		padding: 10px 16px;
		font-weight: 600;
		background: var(--accent);
		color: var(--on-accent);
		cursor: pointer;
	}
	.link {
		border: 0;
		background: none;
		color: var(--accent);
		cursor: pointer;
	}
	.toner {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 8px;
		text-align: center;
		color: var(--muted);
		font-size: 14px;
	}
	.toner b {
		display: block;
		color: var(--fg);
		font: 600 1.1rem var(--mono);
	}
	.toner b.low {
		color: var(--bad);
	}
	.tw {
		overflow-x: auto;
	}
	table {
		border-collapse: collapse;
		width: 100%;
		font-size: 14px;
	}
	th,
	td {
		text-align: left;
		padding: 8px;
		border-bottom: 1px solid var(--line);
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	th {
		font: 600 0.7rem var(--mono);
		text-transform: uppercase;
		color: var(--muted);
	}
	.pill {
		font-size: 12px;
		font-weight: 600;
		padding: 2px 8px;
		border-radius: 99px;
		background: var(--sunk);
		color: var(--muted);
	}
	.pill.wait {
		background: var(--warn-soft);
		color: var(--warn);
	}
	.muted {
		color: var(--muted);
		margin: 0 0 8px;
	}
	.note {
		background: var(--warn-soft);
		color: var(--warn);
		padding: 12px;
		border-radius: 10px;
	}
	.err {
		color: var(--bad);
		margin: 0;
	}
	.ok {
		color: var(--ok);
		font-weight: 600;
	}
	a {
		color: var(--accent);
	}
</style>
