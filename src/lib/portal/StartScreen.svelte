<script lang="ts">
	import { api, message } from '$lib/api';
	import Icon from '$lib/Icon.svelte';
	import { ui } from '$lib/i18n';
	import { TONER_LOW } from '$lib/status';
	import TrayList from '$lib/TrayList.svelte';
	import type { Portal } from './portal.svelte';

	let { portal: p }: { portal: Portal } = $props();
	let tgBusy = $state(false);
	const TONER_ORDER = ['black', 'cyan', 'magenta', 'yellow'];
	const toners = $derived([...(p.printer?.toner ?? [])].sort((a, b) => TONER_ORDER.indexOf(a.key) - TONER_ORDER.indexOf(b.key)));

	async function connectTelegram() {
		p.error = '';
		tgBusy = true;
		try {
			// A t.me link opens the Telegram app on phones and Telegram Web elsewhere.
			location.href = (await api<{ url: string }>('/api/telegram')).url;
		} catch (e) {
			p.error = message(e);
		} finally {
			setTimeout(() => (tgBusy = false), 3000);
		}
	}
</script>

<div class="hero">
	<h1>{ui.startQuestion}</h1>
	<p>{ui.tagline}</p>
	{#if p.customer}
		<p class="who">
			{ui.customer.printingFor(p.customer.name)}
			{#if p.customer.code}· <button class="link" onclick={() => p.signOut()}>{ui.customer.signOut}</button>{/if}
		</p>
	{/if}
</div>
<div class="presets">
	{#each ['doc', 'photo'] as const as k (k)}
		<button class="preset" onclick={() => p.choose(k)}>
			<span class="ic"><Icon name={k === 'doc' ? 'file' : 'photo'} size={26} /></span>
			<span class="ptext"><b>{ui.presets[k].name}</b><small>{ui.presets[k].hint}</small></span>
			<span class="go"><Icon name="right" size={20} /></span>
		</button>
	{/each}
</div>
{#if p.printer?.telegram}
	<section class="card tg">
		<span class="ic sm"><Icon name="send" size={20} /></span>
		<div class="tg-text">
			<h2>{ui.telegram.title}</h2>
			<p>{ui.telegram.body}</p>
		</div>
		<button class="btn tg-btn" disabled={tgBusy} onclick={connectTelegram}><Icon name="send" size={18} />{tgBusy ? ui.telegram.opening : ui.telegram.connect}</button>
		<div class="tg-safety">
			<Icon name="shield" size={18} />
			<ul>{#each ui.telegram.safety as s (s)}<li>{s}</li>{/each}</ul>
		</div>
	</section>
{/if}
<section class="card privacy">
	<div class="ptitle"><span class="ic sm"><Icon name="shield" size={20} /></span><h2>{ui.privacy.title}</h2></div>
	<ul>{#each ui.privacy.points(p.printer?.pinTtlMin ?? 60) as s (s)}<li>{s}</li>{/each}</ul>
</section>
{#if p.printer?.online}
	<section class="card">
		<h2 class="lbl">{ui.printerLabel}</h2>
		<TrayList trays={p.printer.trays} />
		{#if p.printer.toner.length}
			<h3 class="lbl sub">{ui.tonerLabel}</h3>
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
	</section>
{/if}

<style>
	.hero .who {
		margin-top: 8px;
		font-size: 14px;
	}
	.presets {
		display: grid;
		gap: 12px;
	}
	.preset {
		display: flex;
		gap: 16px;
		align-items: center;
		text-align: left;
		width: 100%;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
		padding: 18px;
		cursor: pointer;
		transition:
			transform 0.15s ease,
			box-shadow 0.15s ease,
			border-color 0.15s ease;
	}
	.preset:hover {
		border-color: var(--accent);
		box-shadow: var(--shadow-lift);
		transform: translateY(-2px);
	}
	.preset b {
		font-size: 1.1rem;
	}
	.go {
		color: var(--muted);
	}
	.preset:hover .go {
		color: var(--accent);
	}
	.lbl.sub {
		margin: 18px 0 10px;
	}
	.toners {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px 28px;
	}
	@media (max-width: 560px) {
		.toners {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	.toner {
		display: grid;
		grid-template-columns: 92px minmax(0, 1fr) 42px;
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
	.tg {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 14px;
		align-items: center;
	}
	.tg h2 {
		font-size: 1.05rem;
		margin: 0;
	}
	.tg p {
		margin: 4px 0 0;
		color: var(--muted);
		font-size: 14px;
	}
	.tg-btn {
		width: auto;
		padding: 12px 20px;
		white-space: nowrap;
	}
	.tg-safety {
		grid-column: 1 / -1;
		display: flex;
		gap: 10px;
		align-items: flex-start;
		padding: 12px 14px;
		border-radius: 12px;
		background: var(--sunk);
		color: var(--muted);
		font-size: 14px;
	}
	.tg-safety :global(svg) {
		flex: none;
		margin-top: 1px;
	}
	.tg-safety ul {
		margin: 0;
		padding-left: 16px;
		display: grid;
		gap: 4px;
	}
	@media (max-width: 560px) {
		.tg {
			grid-template-columns: auto minmax(0, 1fr);
		}
		.tg-btn {
			grid-column: 1 / -1;
			width: 100%;
		}
	}
	.ptitle {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.ptitle h2 {
		font-size: 1.05rem;
		margin: 0;
	}
	.privacy ul {
		margin: 0;
		padding-left: 1.2em;
		display: grid;
		gap: 6px;
		color: var(--muted);
		font-size: 14.5px;
	}
	@media (min-width: 720px) {
		.presets {
			grid-template-columns: 1fr 1fr;
		}
		.preset {
			flex-direction: column;
			align-items: flex-start;
			padding: 24px;
			min-height: 190px;
		}
		.preset .go {
			margin-top: auto;
			align-self: flex-end;
		}
	}
</style>
