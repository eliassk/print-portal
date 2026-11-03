<script lang="ts">
	import Icon from '$lib/Icon.svelte';
	import { ui } from '$lib/i18n';
	import { usesBypass } from '$lib/options';
	import type { Portal } from './portal.svelte';

	let { portal: p }: { portal: Portal } = $props();
	const tray = $derived(p.tray);
</script>

{#if p.printer && !p.printer.online}
	<p class="note warn"><Icon name="alert" size={18} />{ui.printerOffline}</p>
{:else if usesBypass(p.effective.paper)}
	<p class="note warn"><Icon name="info" size={18} />{ui.loadBypass(ui.papers[p.effective.paper].name)}{tray?.state === 'empty' ? ` ${ui.bypassEmpty}` : ''}</p>
{:else if tray?.state === 'empty'}
	<p class="note bad"><Icon name="alert" size={18} />{ui.emptyTray(ui.trays[tray.key])}</p>
{:else if tray?.state === 'low'}
	<p class="note warn"><Icon name="alert" size={18} />{ui.lowTray(ui.trays[tray.key])}</p>
{:else if tray}
	<p class="note info"><Icon name="info" size={18} />{ui.fromCassette(ui.trays[tray.key])}</p>
{/if}
