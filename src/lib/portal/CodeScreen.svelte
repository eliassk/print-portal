<script lang="ts">
	import Icon from '$lib/Icon.svelte';
	import { ui } from '$lib/i18n';
	import type { Portal } from './portal.svelte';

	let { portal: p }: { portal: Portal } = $props();
	let code = $state('');
	// Bumped on each refusal, so the shake plays again.
	let tries = $state(0);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		await p.enterCode(code);
		if (p.error) tries++;
	}
</script>

<div class="wrap">
	<form class="card gate" onsubmit={submit}>
		<span class="badge"><Icon name="lock" size={26} /></span>
		<div class="head">
			<h1>{ui.customer.title}</h1>
			<p>{ui.customer.hint}</p>
		</div>
		{#key tries}
			<input
				class:bad={!!p.error}
				class:shake={tries > 0}
				bind:value={code}
				oninput={() => (p.error = '')}
				aria-label={ui.customer.label}
				aria-invalid={!!p.error}
				aria-describedby={p.error ? 'code-error' : undefined}
				inputmode="numeric"
				autocomplete="one-time-code"
				placeholder="• • • • • •"
				maxlength="32"
				spellcheck="false"
				required
			/>
		{/key}
		{#if p.error}<p id="code-error" class="err" role="alert"><Icon name="alert" size={16} />{p.error}</p>{/if}
		<button class="btn" disabled={p.busy || !code.trim()}>{p.busy ? ui.customer.checking : ui.customer.submit}<Icon name="right" size={18} /></button>
	</form>
</div>

<style>
	.wrap {
		min-height: calc(100dvh - 160px);
		display: grid;
		place-items: center;
	}
	.gate {
		width: 100%;
		max-width: 400px;
		display: grid;
		gap: 16px;
		justify-items: center;
		text-align: center;
		padding: 32px 24px 28px;
		box-shadow: var(--shadow-lift);
	}
	.badge {
		width: 56px;
		height: 56px;
		border-radius: 18px;
		display: grid;
		place-items: center;
		background: var(--accent-soft);
		color: var(--accent);
	}
	.head h1 {
		font-size: 1.5rem;
		letter-spacing: -0.02em;
		margin: 0 0 6px;
		text-wrap: balance;
	}
	.head p {
		margin: 0;
		color: var(--muted);
		font-size: 15px;
	}
	input {
		width: 100%;
		height: 64px;
		margin-top: 4px;
		text-align: center;
		font: 600 1.75rem var(--mono);
		letter-spacing: 0.3em;
		text-indent: 0.3em;
		text-transform: uppercase;
		border: 1.5px solid var(--line-strong);
		border-radius: 14px;
		background: var(--sunk);
		color: var(--fg);
		transition:
			border-color 0.15s ease,
			box-shadow 0.15s ease;
	}
	input::placeholder {
		color: var(--muted);
		opacity: 0.5;
		letter-spacing: 0.1em;
	}
	input:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 4px var(--accent-soft);
	}
	input.bad {
		border-color: var(--bad);
	}
	.shake {
		animation: shake 0.35s ease;
	}
	@keyframes shake {
		25% {
			transform: translateX(-6px);
		}
		50% {
			transform: translateX(5px);
		}
		75% {
			transform: translateX(-3px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.shake {
			animation: none;
		}
	}
	.err {
		display: flex;
		gap: 6px;
		align-items: flex-start;
		margin: -6px 0 0;
		color: var(--bad);
		font-size: 14px;
		text-align: left;
	}
	.err :global(svg) {
		flex: none;
		margin-top: 2px;
	}
	.btn {
		width: 100%;
		height: 52px;
	}
</style>
