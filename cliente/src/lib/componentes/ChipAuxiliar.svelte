<script lang="ts">
	/**
	 * Componente: ChipAuxiliar.
	 *
	 * Muestra un campo auxiliar de EFactura SOLO cuando tiene valor. Si se pasa
	 * `onclick` se comporta como botón para abrir el modal en ese campo.
	 */
	interface Props {
		etiqueta: string;
		valor: string | null | undefined;
		onclick?: () => void;
		disabled?: boolean;
	}

	let { etiqueta, valor, onclick, disabled = false }: Props = $props();

	let texto = $derived((valor ?? '').trim());
</script>

{#if texto}
	{#if onclick}
		<button
			type="button"
			class="chip-aux"
			{disabled}
			title={`${etiqueta}: ${texto}`}
			onclick={onclick}
		>
			<span class="etiqueta">{etiqueta}</span>
			<span class="valor">{texto}</span>
		</button>
	{:else}
		<span class="chip-aux" title={`${etiqueta}: ${texto}`}>
			<span class="etiqueta">{etiqueta}</span>
			<span class="valor">{texto}</span>
		</span>
	{/if}
{/if}

<style>
	.chip-aux {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		max-width: 13rem;
		padding: 0.1rem 0.4rem;
		border: 1px solid var(--primario-borde);
		border-radius: 0.4rem;
		background: var(--primario-tenue);
		color: var(--primario-texto);
		font: inherit;
		font-size: 0.58rem;
		line-height: 1.3;
		text-align: left;
	}

	button.chip-aux {
		cursor: pointer;
	}

	button.chip-aux:hover {
		background: var(--primario-tenue);
	}

	button.chip-aux:disabled {
		cursor: default;
		opacity: 0.75;
	}

	.etiqueta {
		flex: 0 0 auto;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.02em;
		font-size: 0.5rem;
		opacity: 0.75;
	}

	.valor {
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
