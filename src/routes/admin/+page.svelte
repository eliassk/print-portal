<script lang="ts">
	import { enhance } from '$app/forms';
	import AdminBar from '$lib/AdminBar.svelte';
	import { api, message } from '$lib/api';
	import Icon from '$lib/Icon.svelte';
	import { dateLocale, ui } from '$lib/i18n';
	import TrayList from '$lib/TrayList.svelte';
	import { TONER_LOW } from '$lib/status';
	let { data, form } = $props();

	const TONER_ORDER = ['black', 'cyan', 'magenta', 'yellow'];
	const time = (t: number) => new Date(t).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' });
	const day = (d: string) => new Date(`${d}T12:00`).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short', year: 'numeric' });

	function period(from: string | null, until: string | null) {
		const p = ui.admin.period;
		if (from && until) return p.range(day(from), day(until));
		if (from) return p.from(day(from));
		if (until) return p.until(day(until));
		return p.always;
	}

	type C = { id?: number; name: string; code: string; enabled: boolean; activeFrom: string | null; activeUntil: string | null; networks: string };
	const blank: C = { name: '', code: '', enabled: true, activeFrom: null, activeUntil: null, networks: '' };
	let adding = $state(false);
	let tgError = $state('');
	let adminLink = $state<{ url: string; hours: number } | null>(null);
	let copied = $state(false);
	let linkInput = $state<HTMLInputElement>();

	async function connectAdminChat() {
		tgError = '';
		copied = false;
		try {
			adminLink = await api<{ url: string; hours: number }>('/admin/telegram');
		} catch (e) {
			tgError = message(e);
		}
	}

	async function copyLink() {
		if (!adminLink) return;
		try {
			await navigator.clipboard.writeText(adminLink.url);
		} catch {
			// The clipboard API needs HTTPS; on plain HTTP the selected text can be copied by hand.
			linkInput?.select();
			document.execCommand('copy');
		}
		copied = true;
	}
</script>

<svelte:head><title>{ui.admin.title} · {ui.appName}</title></svelte:head>

{#snippet fields(c: C)}
	<div class="fields">
		<label class="f name"><span>{ui.admin.customerCols.name}</span><input name="name" value={c.name} required maxlength="100" /></label>
		<label class="f"><span>{ui.admin.customerCols.code}</span><input name="code" value={c.code} class="mono" placeholder={ui.admin.codeAuto} maxlength="32" /></label>
		<label class="f"><span>{ui.admin.customerCols.from}</span><input name="activeFrom" type="date" value={c.activeFrom ?? ''} /></label>
		<label class="f"><span>{ui.admin.customerCols.until}</span><input name="activeUntil" type="date" value={c.activeUntil ?? ''} /></label>
		<label class="f wide">
			<span>{ui.admin.customerCols.networks}</span>
			<textarea name="networks" rows="2" placeholder="10.20.0.0/16">{c.networks}</textarea>
			<small>{ui.admin.networksHint}</small>
		</label>
		<label class="toggle wide"><input type="checkbox" class="switch" name="enabled" checked={c.enabled} /><span>{ui.admin.enabledLabel}</span></label>
	</div>
{/snippet}

{#if data.state !== 'in'}
	<div class="gate">
		<div class="gate-card">
			<span class="logo"><Icon name="lock" size={24} /></span>
			<h1>{ui.admin.title}</h1>
			<p class="muted">{ui.admin.loginHint}</p>
			{#if data.state === 'disabled'}
				<p class="note">{ui.admin.disabled}</p>
			{:else}
				<form method="POST" action="?/login" class="login">
					<label for="password">{ui.admin.password}</label>
					<input id="password" name="password" type="password" autocomplete="current-password" required />
					{#if form?.error}<p class="err">{form.error}</p>{/if}
					<button class="btn">{ui.admin.login}</button>
				</form>
			{/if}
			<a class="back" href="/"><Icon name="left" size={16} />{ui.admin.backToPortal}</a>
		</div>
	</div>
{:else}
	{@const toners = [...data.status.toner].sort((a, b) => TONER_ORDER.indexOf(a.key) - TONER_ORDER.indexOf(b.key))}
	{@const waiting = data.recent.filter((j) => j.expires > data.now).length}
	{@const activeCustomers = data.customers.filter((c) => c.state === 'active').length}
	<AdminBar current="panel" />

	<main>
		<section class="stats" aria-label={ui.admin.today}>
			<div class="stat"><span>{ui.admin.stats.prints}</span><b>{data.today.jobs}</b></div>
			<div class="stat"><span>{ui.admin.stats.sheets}</span><b>{data.today.sheets}</b></div>
			<div class="stat" class:hot={waiting > 0}><span>{ui.admin.stats.waiting}</span><b>{waiting}</b></div>
			<div class="stat"><span>{ui.admin.stats.customers}</span><b>{activeCustomers}<small>/ {data.customers.length}</small></b></div>
		</section>

		<section class="card printer">
			<div class="ch">
				<h2>{ui.admin.printer}</h2>
				<span class="chip" class:off={!data.status.online}><i></i>{data.status.online ? ui.printerOk : ui.printerOff}</span>
			</div>
			{#if data.status.online}
				<TrayList trays={data.status.trays} />
				{#if toners.length}
					<h3>{ui.admin.toner}</h3>
					<div class="toners">
						{#each toners as t (t.key)}
							<div class="toner" class:low={t.level <= TONER_LOW}>
								<span class="tname"><span class="dot {t.key}" aria-hidden="true"></span>{ui.toner[t.key]}</span>
								<span class="tbar" aria-hidden="true"><span class={t.key} style="width: {t.level}%"></span></span>
								<b>{t.level}%</b>
							</div>
						{/each}
					</div>
				{/if}
			{:else}
				<p class="err">{ui.admin.offline}</p>
			{/if}
		</section>

		<form method="POST" action="?/save" class="card settings" use:enhance={() => ({ update }) => update({ reset: false })}>
			<div class="ch">
				<h2>{ui.admin.settings}</h2>
				{#if form?.saved}<span class="ok">{ui.admin.saved}</span>{/if}
			</div>
			<label class="set">
				<span><b>{ui.admin.colorAllowed}</b><small>{ui.admin.colorHint}</small></span>
				<input type="checkbox" class="switch" name="colorAllowed" checked={data.settings.colorAllowed} />
			</label>
			<label class="set">
				<span><b>{ui.admin.dailyPages}</b><small>{ui.admin.dailyHint}</small></span>
				<input type="number" name="dailyPages" min="1" max="1000" value={data.settings.dailyPages} />
			</label>
			<label class="set">
				<span><b>{ui.admin.maxPages}</b><small>{ui.admin.maxHint}</small></span>
				<input type="number" name="maxPages" min="1" max="500" value={data.settings.maxPages} />
			</label>
			<button class="btn small">{ui.admin.save}</button>
		</form>

		<section class="card admins">
			<div class="ch">
				<h2>{ui.admin.adminChats} <span class="count">{data.settings.adminChats.length}</span></h2>
				{#if !adminLink}<button type="button" class="btn small" onclick={connectAdminChat}><Icon name="plus" size={16} />{ui.admin.addAdmin}</button>{/if}
			</div>
			<p class="muted">{ui.admin.adminChatsHint}</p>
			{#if tgError || form?.adminChatError}<p class="err">{tgError || form?.adminChatError}</p>{/if}

			{#if adminLink}
				<div class="share">
					<div class="share-head">
						<b>{ui.admin.shareTitle}</b>
						<button type="button" class="x" onclick={() => (adminLink = null)} aria-label={ui.admin.cancel}>×</button>
					</div>
					<p>{ui.admin.connectAdminHint(adminLink.hours)}</p>
					<input bind:this={linkInput} readonly value={adminLink.url} onfocus={(e) => e.currentTarget.select()} aria-label={ui.admin.shareTitle} />
					<div class="share-acts">
						<button type="button" class="btn small" onclick={copyLink}><Icon name={copied ? 'check' : 'clipboard'} size={16} />{copied ? ui.admin.copied : ui.admin.copyLink}</button>
						<a class="btn small sec" href={adminLink.url} target="_blank" rel="noopener"><Icon name="send" size={16} />{ui.admin.openLink}</a>
					</div>
				</div>
			{/if}

			{#if data.settings.adminChats.length}
				<ul class="chats">
					{#each data.settings.adminChats as c (c)}
						{@const who = data.settings.adminNames[c]}
						<li>
							<span class="avatar" aria-hidden="true">{(who || '?').replace('@', '').charAt(0).toUpperCase()}</span>
							<span class="who">
								<b class:unknown={!who}>{who || ui.admin.unknownChat}</b>
								<small>ID {c}</small>
							</span>
							<form method="POST" action="?/removeAdminChat" use:enhance={({ cancel }) => {
								if (!confirm(ui.admin.confirmRemoveChat(who || String(c)))) cancel();
							}}>
								<input type="hidden" name="chat" value={c} /><button class="link del">{ui.admin.deleteCustomer}</button>
							</form>
						</li>
					{/each}
				</ul>
			{:else if !adminLink}
				<p class="empty">{ui.admin.noAdmins}</p>
			{/if}

			<details class="byid">
				<summary>{ui.admin.addById}</summary>
				<form method="POST" action="?/addAdminChat" use:enhance>
					<input name="chat" inputmode="numeric" placeholder={ui.admin.chatIdPlaceholder} aria-label={ui.admin.chatIdPlaceholder} required />
					<button class="btn small sec">{ui.admin.add}</button>
				</form>
			</details>
		</section>

		<section class="card customers">
			<div class="ch">
				<h2>{ui.admin.customers} <span class="count">{data.customers.length}</span></h2>
				{#if !adding}<button class="btn small" onclick={() => (adding = true)}><Icon name="plus" size={16} />{ui.admin.addCustomer}</button>{/if}
			</div>
			<p class="muted">{ui.admin.customersHint}</p>
			{#if form?.customerError}<p class="err">{form.customerError}</p>{/if}

			{#if adding}
				<form method="POST" action="?/addCustomer" class="editor new" use:enhance={() => async ({ result, update }) => {
					await update();
					if (result.type === 'success') adding = false;
				}}>
					<h3>{ui.admin.newCustomer}</h3>
					{@render fields(blank)}
					<div class="acts">
						<button class="btn small">{ui.admin.addCustomer}</button>
						<button type="button" class="link" onclick={() => (adding = false)}>{ui.admin.cancel}</button>
					</div>
				</form>
			{/if}

			{#if data.customers.length === 0 && !adding}
				<p class="note">{ui.admin.noCustomers}</p>
			{:else}
				<ul class="clist">
					{#each data.customers as c (c.id)}
						<li class="cust state-{c.state}">
							<details>
								<summary>
									<span class="cname">
										<b>{c.name}</b>
										<span class="pill {c.state}">{ui.admin.states[c.state]}</span>
									</span>
									<span class="code">{c.code}</span>
									<span class="cmeta">
										<span>{period(c.activeFrom, c.activeUntil)}</span>
										{#if c.networks}
											{#each c.networks.split('\n') as n (n)}<span class="net">{n}</span>{/each}
										{:else}
											<span class="net none">{ui.admin.networksNone}</span>
										{/if}
									</span>
									<span class="edit-hint">{ui.admin.edit}<Icon name="right" size={16} /></span>
								</summary>
								<form method="POST" action="?/updateCustomer" class="editor" use:enhance={() => ({ update }) => update({ reset: false })}>
									<input type="hidden" name="id" value={c.id} />
									{@render fields(c)}
									<div class="acts">
										<button class="btn small">{ui.admin.save}</button>
										<button
											class="link del"
											formaction="?/deleteCustomer"
											formnovalidate
											onclick={(e) => {
												if (!confirm(ui.admin.confirmDelete(c.name))) e.preventDefault();
											}}>{ui.admin.deleteCustomer}</button
										>
									</div>
								</form>
							</details>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="card recent">
			<div class="ch">
				<h2>{ui.admin.recent}</h2>
				<span class="muted">{ui.admin.todayTotals(data.today.jobs, data.today.sheets)}</span>
			</div>
			{#if data.recent.length === 0}
				<p class="muted">{ui.admin.noJobs}</p>
			{:else}
				<div class="tw">
					<table>
						<thead>
							<tr><th>{ui.admin.cols.time}</th><th>{ui.admin.cols.id}</th><th>{ui.admin.customer}</th><th>{ui.admin.cols.sheets}</th><th>{ui.admin.cols.paper}</th><th>{ui.admin.cols.state}</th></tr>
						</thead>
						<tbody>
							{#each data.recent as j (j.at + j.jobId)}
								<tr>
									<td>{time(j.at)}</td>
									<td class="mono">{j.jobId}</td>
									<td>{j.customer ?? '—'}</td>
									<td>{j.sheets}</td>
									<td class="paper">{j.size} · {ui.papers[j.paper as keyof typeof ui.papers]?.name ?? j.paper} · {ui.colorOptions[j.color as 'mono' | 'color']}</td>
									<td><span class="pill" class:wait={j.expires > data.now}>{j.expires > data.now ? ui.admin.waiting : ui.admin.gone}</span></td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>
	</main>
{/if}

<style>
	/* Login */
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
		margin: 0;
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

	/* Layout */
	main {
		max-width: 1120px;
		margin: 0 auto;
		padding: 24px max(16px, env(safe-area-inset-right, 0px)) 48px max(16px, env(safe-area-inset-left, 0px));
		display: grid;
		gap: 16px;
		grid-template-columns: minmax(0, 1fr);
	}
	@media (min-width: 900px) {
		main {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			align-items: stretch;
		}
		.stats,
		.printer,
		.customers,
		.recent {
			grid-column: 1 / -1;
		}
	}
	.card {
		padding: 20px;
		gap: 14px;
	}

	.ch {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		flex-wrap: wrap;
	}
	h2 {
		font-size: 1.1rem;
		margin: 0;
		display: flex;
		align-items: center;
		gap: 8px;
	}
	h3 {
		font: 600 0.72rem var(--mono);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted);
		margin: 4px 0 0;
	}
	.count {
		font: 600 12px var(--mono);
		padding: 2px 8px;
		border-radius: 99px;
		background: var(--sunk);
		color: var(--muted);
	}
	.muted {
		color: var(--muted);
		margin: 0;
		font-size: 14px;
	}
	.btn.small {
		width: auto;
		justify-self: start;
		border-radius: 12px;
		padding: 10px 16px;
		font-size: 14.5px;
		box-shadow: none;
	}

	/* Stats */
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
		font-size: 13px;
		color: var(--muted);
	}
	.stat b {
		display: flex;
		align-items: baseline;
		font-size: 1.75rem;
		font-weight: 650;
		letter-spacing: -0.02em;
		font-variant-numeric: tabular-nums;
	}
	.stat small {
		font-size: 0.95rem;
		font-weight: 500;
		color: var(--muted);
		margin-left: 4px;
	}
	.stat.hot b {
		color: var(--warn);
	}

	/* Printer */
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		font-weight: 550;
		padding: 4px 10px;
		border-radius: 99px;
		background: var(--ok-soft);
		color: var(--ok);
	}
	.chip i {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: currentColor;
	}
	.chip.off {
		background: var(--bad-soft);
		color: var(--bad);
	}
	.toners {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px 24px;
	}
	@media (min-width: 900px) {
		.toners {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}
	@media (max-width: 560px) {
		.toners {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	.toner {
		display: grid;
		grid-template-columns: 84px minmax(0, 1fr) 40px;
		align-items: center;
		gap: 10px;
		font-size: 14px;
	}
	.toner b {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.toner.low b {
		color: var(--bad);
	}
	.tname {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--muted);
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
	}
	.tbar {
		height: 8px;
		border-radius: 4px;
		background: var(--line);
		overflow: hidden;
	}
	.tbar span {
		display: block;
		height: 100%;
		border-radius: 4px;
	}
	.black {
		background: #8a93a3;
	}
	.cyan {
		background: #10a5d8;
	}
	.magenta {
		background: #d6338a;
	}
	.yellow {
		background: #e8c21a;
	}

	/* Settings */
	.set {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 16px;
		padding: 12px 0;
		border-bottom: 1px solid var(--line);
		cursor: pointer;
	}
	.set span {
		display: grid;
		gap: 2px;
	}
	.set b {
		font-weight: 550;
		font-size: 15px;
	}
	.set small {
		color: var(--muted);
		font-size: 13px;
	}
	.share {
		display: grid;
		gap: 10px;
		padding: 14px;
		border: 1px solid var(--accent);
		border-radius: 12px;
		background: color-mix(in srgb, var(--accent-soft) 40%, var(--surface));
	}
	.share-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.share p {
		margin: 0;
		color: var(--muted);
		font-size: 13.5px;
	}
	.share input {
		width: 100%;
		font: 13px var(--mono);
		border: 1px solid var(--line-strong);
		border-radius: 10px;
		padding: 9px 10px;
		background: var(--surface);
		color: var(--fg);
	}
	.share-acts {
		display: flex;
		gap: 8px;
	}
	.share-acts a {
		text-decoration: none;
	}
	.x {
		border: 0;
		background: none;
		color: var(--muted);
		font-size: 22px;
		line-height: 1;
		cursor: pointer;
		padding: 0 4px;
	}
	.chats {
		list-style: none;
		margin: 0;
		padding: 0;
		border: 1px solid var(--line);
		border-radius: 12px;
	}
	.chats li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 14px;
	}
	.chats li + li {
		border-top: 1px solid var(--line);
	}
	.avatar {
		flex: none;
		width: 34px;
		height: 34px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-weight: 650;
		background: var(--accent-soft);
		color: var(--accent);
	}
	.who {
		flex: 1;
		min-width: 0;
		display: grid;
	}
	.who b {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.who b.unknown {
		color: var(--muted);
		font-weight: 500;
		font-style: italic;
	}
	.who small {
		color: var(--muted);
		font: 12px var(--mono);
	}
	.empty {
		margin: 0;
		padding: 14px;
		border: 1px dashed var(--line-strong);
		border-radius: 12px;
		color: var(--muted);
		font-size: 14px;
		text-align: center;
	}
	.byid summary {
		cursor: pointer;
		color: var(--muted);
		font-size: 13.5px;
		width: fit-content;
	}
	.byid summary:hover {
		color: var(--fg);
	}
	.byid form {
		display: flex;
		gap: 8px;
		margin-top: 10px;
	}
	.byid input {
		flex: 1;
		min-width: 0;
	}
	.settings .btn {
		margin-top: 4px;
	}
	input[type='number'],
	input[type='date'],
	input:not([type]),
	textarea {
		border: 1px solid var(--line-strong);
		border-radius: 10px;
		padding: 8px 10px;
		background: var(--surface);
		color: var(--fg);
		font: inherit;
		font-size: 15px;
	}
	input[type='number'] {
		width: 5.5em;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	input:focus,
	textarea:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-soft);
	}
	.switch {
		appearance: none;
		flex: none;
		width: 44px;
		height: 26px;
		border-radius: 99px;
		background: var(--line-strong);
		position: relative;
		cursor: pointer;
		transition: background 0.15s;
		margin: 0;
	}
	.switch::after {
		content: '';
		position: absolute;
		top: 3px;
		left: 3px;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: #fff;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
		transition: transform 0.15s;
	}
	.switch:checked {
		background: var(--accent);
	}
	.switch:checked::after {
		transform: translateX(18px);
	}
	.switch:focus-visible {
		outline: 3px solid var(--accent-soft);
	}

	/* Customers */
	.clist {
		list-style: none;
		margin: 0;
		padding: 0;
		border: 1px solid var(--line);
		border-radius: 12px;
		overflow: hidden;
	}
	.cust + .cust {
		border-top: 1px solid var(--line);
	}
	.cust summary {
		list-style: none;
		display: grid;
		grid-template-columns: minmax(0, 1.2fr) auto minmax(0, 1.6fr) auto;
		align-items: center;
		gap: 16px;
		padding: 14px 16px;
		cursor: pointer;
	}
	.cust summary::-webkit-details-marker {
		display: none;
	}
	.cust summary:hover {
		background: var(--sunk);
	}
	.cust details[open] summary {
		background: var(--sunk);
	}
	.cname {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}
	.code {
		font: 600 15px var(--mono);
		letter-spacing: 0.1em;
		padding: 4px 10px;
		border-radius: 8px;
		background: var(--sunk);
		border: 1px solid var(--line);
		user-select: all;
	}
	.cmeta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 10px;
		color: var(--muted);
		font-size: 13.5px;
	}
	.net {
		font: 12.5px var(--mono);
		padding: 2px 8px;
		border-radius: 6px;
		background: var(--accent-soft);
		color: var(--accent);
	}
	.net.none {
		font-family: var(--sans);
		background: var(--sunk);
		color: var(--muted);
	}
	.edit-hint {
		display: flex;
		align-items: center;
		gap: 2px;
		color: var(--accent);
		font-size: 14px;
		font-weight: 550;
	}
	details[open] .edit-hint :global(svg) {
		transform: rotate(90deg);
	}
	.state-off .cname b,
	.state-ended .cname b {
		color: var(--muted);
	}
	@media (max-width: 760px) {
		.cust summary {
			grid-template-columns: minmax(0, 1fr) auto;
			gap: 8px 12px;
		}
		.cmeta {
			grid-column: 1 / -1;
		}
		.edit-hint {
			display: none;
		}
	}
	.editor {
		display: grid;
		gap: 14px;
		padding: 16px;
		border-top: 1px solid var(--line);
	}
	.editor.new {
		border: 1px solid var(--accent);
		border-radius: 12px;
		background: color-mix(in srgb, var(--accent-soft) 40%, var(--surface));
	}
	.fields {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 12px;
	}
	@media (max-width: 760px) {
		.fields {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	.f {
		display: grid;
		gap: 6px;
		align-content: start;
	}
	.f > span {
		font-size: 12.5px;
		font-weight: 600;
		color: var(--muted);
	}
	.f input,
	.f textarea {
		width: 100%;
		min-width: 0;
	}
	.f small {
		color: var(--muted);
		font-size: 12.5px;
	}
	.wide {
		grid-column: 1 / -1;
	}
	textarea {
		resize: vertical;
		font-family: var(--mono);
		font-size: 14px;
	}
	.mono {
		font-family: var(--mono);
		text-transform: uppercase;
	}
	.mono::placeholder {
		font-family: var(--sans);
		text-transform: none;
	}
	.toggle {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 15px;
		cursor: pointer;
	}
	.acts {
		display: flex;
		align-items: center;
		gap: 16px;
	}
	.del {
		color: var(--bad);
		margin-left: auto;
	}

	/* Pills */
	.pill {
		font-size: 12px;
		font-weight: 600;
		padding: 2px 8px;
		border-radius: 99px;
		background: var(--sunk);
		color: var(--muted);
		white-space: nowrap;
	}
	.pill.active {
		background: var(--ok-soft);
		color: var(--ok);
	}
	.pill.upcoming,
	.pill.wait {
		background: var(--warn-soft);
		color: var(--warn);
	}
	.pill.ended {
		background: var(--bad-soft);
		color: var(--bad);
	}

	/* Recent prints */
	.tw {
		overflow-x: auto;
		margin: 0 -20px -20px;
	}
	table {
		border-collapse: collapse;
		width: 100%;
		font-size: 14px;
	}
	th,
	td {
		text-align: left;
		padding: 10px 20px;
		border-top: 1px solid var(--line);
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	th {
		font: 600 0.7rem var(--mono);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted);
		background: var(--sunk);
	}
	tbody tr:hover {
		background: var(--sunk);
	}
	td.paper {
		color: var(--muted);
	}
	td.mono {
		text-transform: none;
	}

	.note {
		background: var(--warn-soft);
		color: var(--warn);
		padding: 12px 14px;
		border-radius: 12px;
		margin: 0;
	}
	.ok {
		color: var(--ok);
		font-weight: 600;
		font-size: 14px;
	}
	.err {
		margin: 0;
	}
</style>
