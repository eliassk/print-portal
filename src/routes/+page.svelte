<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/Icon.svelte';
	import FileScreen from '$lib/portal/FileScreen.svelte';
	import OptionsScreen from '$lib/portal/OptionsScreen.svelte';
	import PinScreen from '$lib/portal/PinScreen.svelte';
	import { Portal } from '$lib/portal/portal.svelte';
	import StartScreen from '$lib/portal/StartScreen.svelte';
	import SummaryScreen from '$lib/portal/SummaryScreen.svelte';
	import TopBar from '$lib/portal/TopBar.svelte';

	const p = new Portal();

	onMount(() => {
		const claim = new URLSearchParams(location.search).get('d');
		if (claim) {
			history.replaceState(null, '', location.pathname);
			p.openClaim(claim);
		}
		p.loadPrinter();
		const t = setInterval(() => p.loadPrinter(), 60_000);
		return () => clearInterval(t);
	});

	// Refreshes the preview after options settle, so quick taps do not each render.
	let debounce: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const body = JSON.stringify(p.effective);
		const page = p.sheet;
		void p.revision;
		if ((p.screen !== 'opts' && p.screen !== 'sum') || !p.draft || !p.rangeOk) return;
		clearTimeout(debounce);
		debounce = setTimeout(() => p.renderPreview(body, page), 250);
	});
</script>

<div class="app">
	<TopBar portal={p} />

	<main class="screen-{p.screen}">
		{#if p.screen === 'start'}
			<StartScreen portal={p} />
		{:else if p.screen === 'file'}
			<FileScreen portal={p} />
		{:else if p.screen === 'opts'}
			<OptionsScreen portal={p} />
		{:else if p.screen === 'sum'}
			<SummaryScreen portal={p} />
		{:else if p.screen === 'pin' && p.result}
			<PinScreen portal={p} />
		{/if}

		{#if p.error}<p class="note bad toast" role="alert"><Icon name="alert" size={18} />{p.error}</p>{/if}
	</main>
</div>

<style>
	.app {
		min-height: 100dvh;
	}
	main {
		max-width: 560px;
		margin: 0 auto;
		display: grid;
		gap: 16px;
		padding: 20px max(16px, env(safe-area-inset-right, 0px)) calc(40px + env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px));
	}
	@media (min-width: 720px) {
		main {
			max-width: 760px;
			padding-top: 36px;
		}
	}
	@media (min-width: 1000px) {
		main.screen-opts {
			max-width: 1120px;
		}
		main.screen-sum {
			max-width: 1000px;
		}
		.toast {
			position: sticky;
			bottom: 20px;
		}
	}
</style>
