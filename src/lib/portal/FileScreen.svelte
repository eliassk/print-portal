<script lang="ts">
	import Icon from '$lib/Icon.svelte';
	import { ui } from '$lib/i18n';
	import type { Portal } from './portal.svelte';

	let { portal: p }: { portal: Portal } = $props();
	let dragging = $state(false);

	// Ctrl+V or Cmd+V anywhere on this screen.
	function onPaste(e: ClipboardEvent) {
		if (p.busy) return;
		const files = [...(e.clipboardData?.files ?? [])];
		if (!files.length) return;
		e.preventDefault();
		p.uploadFiles(files.map(named));
	}

	/** iOS and Safari show their own "Paste" bubble; the page sees only what the person allows. */
	async function pasteButton() {
		p.error = '';
		const files: File[] = [];
		try {
			for (const item of await navigator.clipboard.read()) {
				const type = item.types.find((t) => t.startsWith('image/') || t === 'application/pdf');
				if (type) files.push(named(new File([await item.getType(type)], '', { type })));
			}
		} catch {
			// Denied or unsupported: same answer as an empty clipboard.
		}
		if (files.length) await p.uploadFiles(files);
		else p.error = ui.pasteEmpty;
	}

	/** Pasted images often have no name; the server only needs the extension. */
	function named(f: File): File {
		if (f.name) return f;
		const ext = f.type === 'application/pdf' ? 'pdf' : (f.type.split('/')[1] ?? 'png');
		return new File([f], `${ui.pastedName}.${ext}`, { type: f.type });
	}

	async function upload(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		await p.uploadFiles([...(input.files ?? [])]);
		input.value = '';
	}

	function drop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		if (!p.busy) p.uploadFiles([...(e.dataTransfer?.files ?? [])]);
	}
</script>

<svelte:window onpaste={onPaste} />

<div class="hero">
	<h1>{ui.pickFile[p.kind]}</h1>
	<p>{ui.fileTypes[p.kind]}</p>
</div>
<label
	class="drop"
	class:dragging
	class:busy={p.busy}
	ondragover={(e) => {
		e.preventDefault();
		dragging = true;
	}}
	ondragleave={() => (dragging = false)}
	ondrop={drop}
>
	<span class="ic big"><Icon name={p.busy ? 'printer' : 'upload'} size={30} /></span>
	<b>{p.busy ? ui.converting : ui.pickFile[p.kind]}</b>
	{#if !p.busy}<small>{ui.dropHint}</small>{/if}
	{#if p.kind === 'doc'}
		<input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.rtf,application/pdf" onchange={upload} disabled={p.busy} />
	{:else}
		<input type="file" accept="image/jpeg,image/png" multiple onchange={upload} disabled={p.busy} />
	{/if}
</label>
<button class="paste" disabled={p.busy} onclick={pasteButton}><Icon name="clipboard" size={18} />{ui.paste}</button>

<style>
	.drop {
		position: relative;
		display: grid;
		gap: 8px;
		justify-items: center;
		text-align: center;
		border: 2px dashed var(--line-strong);
		border-radius: 20px;
		padding: 40px 20px;
		background: var(--surface);
		cursor: pointer;
		transition:
			border-color 0.15s,
			background 0.15s;
	}
	.drop:hover,
	.drop.dragging {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.drop.busy {
		cursor: progress;
		opacity: 0.8;
	}
	.drop b {
		font-size: 1.1rem;
	}
	.paste {
		justify-self: center;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		margin-top: 12px;
		padding: 10px 16px;
		border: 1px solid var(--line-strong);
		border-radius: 12px;
		background: var(--surface);
		color: inherit;
		font-weight: 600;
		cursor: pointer;
	}
	.paste:hover {
		border-color: var(--accent);
	}
	input[type='file'] {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
	@media (min-width: 720px) {
		.drop {
			padding: 72px 24px;
		}
	}
</style>
