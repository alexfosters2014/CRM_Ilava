<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	interface Props {
		valor: string;
		tipo?: string;
		etiqueta: string;
		ph?: string;
		autocomplete?: HTMLInputAttributes['autocomplete'];
		// Longitud del código OTP: si se pasa, aplica maxlength y inputMode numérico.
		largo?: number;
	}

	let { valor = $bindable(), tipo = 'text', etiqueta, ph, autocomplete, largo }: Props = $props();
</script>

<label class="campo">
	<span class="etiqueta">{etiqueta}</span>
	<input
		type={tipo}
		bind:value={valor}
		placeholder={ph}
		autocomplete={autocomplete}
		maxlength={largo}
		inputmode={largo ? 'numeric' : undefined}
	/>
</label>

<style>
	.campo {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.etiqueta {
		color: var(--texto-suave);
		font-size: 0.6rem;
		font-weight: 800;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	input {
		width: 100%;
		min-height: 2.5rem;
		padding: 0.55rem 0.7rem;
		border: 1px solid var(--borde);
		border-radius: 0.7rem;
		background: var(--superficie);
		color: var(--texto);
		font: inherit;
		font-size: 0.75rem;
	}

	input:focus {
		outline: 2px solid var(--foco);
		outline-offset: 1px;
	}
</style>
