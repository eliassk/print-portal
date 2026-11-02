<script lang="ts">
	import Icon from '$lib/Icon.svelte';
	import { pl } from '$lib/i18n/pl';
	import TrayList from '$lib/TrayList.svelte';
	let { data, form } = $props();

	const time = (t: number) => new Date(t).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
</script>

<svelte:head><title>{pl.admin.title} · {pl.appName}</title></svelte:head>

{#if data.state !== 'in'}
	<div class="gate">
		<div class="gate-card">
			<span class="logo"><Icon name="lock" size={24} /></span>
			<h1>{pl.admin.title}</h1>
			<p class="muted">{pl.admin.loginHint}</p>
			{#if data.state === 'disabled'}
				<p class="note">{pl.admin.disabled}</p>
			{:else}
				<form method="POST" action="?/login" class="login">
					<label for="password">{pl.admin.password}</label>
					<input id="password" name="password" type="password" autocomplete="current-password" required />
					{#if form?.error}<p class="err">{form.error}</p>{/if}
					<button class="btn">{pl.admin.login}</button>
				</form>
			{/if}
			<a class="back" href="/"><Icon name="left" size={16} />{pl.admin.backToPortal}</a>
		</div>
	</div>
{:else}
<main>
	<header>
		<h1>{pl.admin.title}</h1>
		<form method="POST" action="?/logout"><button class="link">{pl.admin.logout}</button></form>
	</header>

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
</main>
{/if}

<style>
	.gate {
		min-height: 100dvh;
		display: grid;
		place-items: center;
		padding: 24px max(16px, env(safe-area-inset-right, 0px)) 24px max(16px, env(safe-area-inset-left, 0px));
	}
	.gate-card {
		width: 100%;
		max-width: 380px;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 20px;
		box-shadow: var(--shadow-lift);
		padding: 32px 28px 24px;
		display: grid;
		gap: 14px;
		justify-items: center;
		text-align: center;
	}
	.gate-card h1 {
		font-size: 1.4rem;
	}
	.gate-card .muted {
		margin: -6px 0 6px;
	}
	.logo {
		width: 52px;
		height: 52px;
		border-radius: 16px;
		display: grid;
		place-items: center;
		background: var(--accent-soft);
		color: var(--accent);
	}
	.login {
		width: 100%;
		display: grid;
		gap: 8px;
		text-align: left;
	}
	.login label {
		font-size: 13px;
		font-weight: 600;
		color: var(--muted);
	}
	.login input {
		height: 46px;
		font-size: 16px;
	}
	.login input:focus {
		border-color: var(--accent);
		outline: 3px solid var(--accent-soft);
	}
	.login .btn {
		margin-top: 6px;
		height: 46px;
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin-top: 6px;
		font-size: 14px;
		text-decoration: none;
	}
	main {
		max-width: 1040px;
		margin: 0 auto;
		padding: 32px max(16px, env(safe-area-inset-right, 0px)) 48px max(16px, env(safe-area-inset-left, 0px));
		display: grid;
		gap: 16px;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	h1 {
		font-size: 1.8rem;
		letter-spacing: -0.02em;
		margin: 0;
	}
	@media (min-width: 900px) {
		main {
			grid-template-columns: 1fr 1fr;
			align-items: start;
		}
		header,
		main > section:nth-of-type(2),
		main > p {
			grid-column: 1 / -1;
		}
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
		border-radius: var(--radius);
		box-shadow: var(--shadow);
		padding: 20px;
		min-width: 0;
	}
	.login {
		display: grid;
		gap: 10px;
		max-width: 360px;
	}
	input[type='password'],
	input[type='number'] {
		border: 1px solid var(--line-strong);
		border-radius: 10px;
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
		border-radius: 12px;
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
