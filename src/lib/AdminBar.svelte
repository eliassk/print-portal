<script lang="ts">
	import Icon from '$lib/Icon.svelte';
	import { ui } from '$lib/i18n';

	let { current }: { current: 'panel' | 'billing' } = $props();
</script>

<header class="top">
	<div class="top-in">
		<a class="brand" href="/admin"><span class="logo"><Icon name="printer" size={18} /></span><span class="bt">{ui.admin.title}</span></a>
		<nav>
			<a href="/admin" class:on={current === 'panel'}>{ui.admin.panel}</a>
			<a href="/admin/billing" class:on={current === 'billing'}>{ui.admin.billing.nav}</a>
			<a href="/" class="ext">{ui.admin.portal}</a>
			<a href="/admin#plakat" class="ext">{ui.admin.posterNav}</a>
			<form method="POST" action="/admin?/logout"><button class="link">{ui.admin.logout}</button></form>
		</nav>
	</div>
</header>

<style>
	.top {
		position: sticky;
		top: 0;
		z-index: 2;
		background: color-mix(in srgb, var(--surface) 88%, transparent);
		backdrop-filter: saturate(1.4) blur(12px);
		border-bottom: 1px solid var(--line);
	}
	.top-in {
		max-width: 1120px;
		margin: 0 auto;
		min-height: 60px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: calc(12px + env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px)) 12px max(16px, env(safe-area-inset-left, 0px));
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
		font-weight: 650;
		letter-spacing: -0.01em;
		color: var(--fg);
		text-decoration: none;
	}
	.logo {
		width: 32px;
		height: 32px;
		border-radius: 10px;
		display: grid;
		place-items: center;
		background: var(--accent-soft);
		color: var(--accent);
	}
	nav {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 14px;
	}
	nav a {
		white-space: nowrap;
		padding: 6px 10px;
		border-radius: 8px;
		color: var(--muted);
		text-decoration: none;
		font-weight: 550;
	}
	nav a:hover {
		background: var(--sunk);
		color: var(--fg);
	}
	nav a.on {
		background: var(--accent-soft);
		color: var(--accent);
	}
	@media (max-width: 720px) {
		.bt,
		.ext {
			display: none;
		}
	}
</style>
