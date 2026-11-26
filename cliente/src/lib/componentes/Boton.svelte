<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		tipo?: 'submit' | 'button';
		deshabilitado?: boolean;
		onclick?: () => void;
		// Svelte 5 pasa el contenido entre etiquetas como snippet `children`.
		children: Snippet;
	}

	let { tipo = 'submit', deshabilitado = false, onclick, children }: Props = $props();
</script>

<button type={tipo} disabled={deshabilitado} {onclick}>
	{@render children()}
</button>

<style>
	button {
		font: inherit;
		padding: 0.65rem 1.25rem;
		border: none;
		border-radius: 0.5rem;
		background: var(--primario);
		color: var(--texto-inverso);
		cursor: pointer;
	}

	button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	button:not(:disabled):hover {
		filter: brightness(1.05);
	}
</style>
