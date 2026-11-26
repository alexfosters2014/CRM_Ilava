<script lang="ts">
	import { fly } from 'svelte/transition';
	import type { Snippet } from 'svelte';

	/**
	 * Barra flotante de acciones para un lote seleccionado.
	 *
	 * Marco flotante: superficie navy elevada, anillo oscuro y filo claro.
	 * Ningún botón tiene violeta en reposo: el gradiente violeta aparece
	 * solo en :hover (selección) y es igual para todos.
	 */
	let { etiqueta, children }: { etiqueta: string; children: Snippet } = $props();
</script>

<div
	class="barra-lotes"
	transition:fly={{ y: 18, duration: 190, opacity: 0.5 }}
	role="toolbar"
	aria-label="Acciones sobre el lote seleccionado"
>
	<span class="lote-info">{etiqueta}</span>
	<div class="lote-acciones">{@render children()}</div>
</div>

<style>
	.barra-lotes {
		position: fixed;
		left: 50%;
		bottom: 1.5rem;
		transform: translateX(-50%);
		z-index: 45;
		display: flex;
		align-items: center;
		gap: 0.8rem;
		max-width: min(70rem, calc(100vw - 2rem));
		padding: 0.55rem;
		border: 1px solid var(--barra-lotes-borde);
		border-radius: 1rem;
		background: var(--barra-lotes-fondo);
		box-shadow:
			0 0 0 3px var(--barra-lotes-anillo),
			0 0 0 4px var(--barra-lotes-anillo-borde),
			0 24px 60px var(--barra-lotes-sombra);
	}
	.lote-info {
		padding: 0.55rem 0.9rem;
		border: 1px solid var(--barra-lotes-chip-borde);
		border-radius: 0.6rem;
		background: var(--barra-lotes-chip);
		color: var(--barra-lotes-info);
		font-size: 0.78rem;
		font-weight: 800;
		letter-spacing: 0.01em;
		white-space: nowrap;
	}
	.lote-acciones {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.lote-acciones :global(.lote-accion) {
		display: grid;
		justify-items: center;
		align-content: center;
		gap: 0.16rem;
		min-width: 6.4rem;
		padding: 0.4rem 0.8rem;
		border: 1px solid var(--barra-lotes-tecla-borde);
		border-radius: 0.65rem;
		background: var(--barra-lotes-tecla);
		color: var(--barra-lotes-tecla-texto);
		font: inherit;
		font-size: 0.7rem;
		font-weight: 800;
		cursor: pointer;
		transition:
			background 0.16s ease,
			border-color 0.16s ease,
			color 0.16s ease,
			box-shadow 0.16s ease,
			transform 0.16s ease;
	}
	/* Único estado violeta: hover de cualquier botón del menú. */
	.lote-acciones :global(.lote-accion:hover:not(:disabled)) {
		border-color: transparent;
		background: var(--barra-lotes-hover);
		color: #ffffff;
		box-shadow: 0 10px 24px var(--barra-lotes-glow);
		transform: translateY(-1px);
	}
	.lote-acciones :global(.lote-accion:focus-visible) {
		outline: 2px solid #d8b4fe;
		outline-offset: 3px;
	}
	.lote-acciones :global(.lote-accion:disabled) {
		opacity: 0.45;
		cursor: progress;
	}
	.lote-acciones :global(.lote-icono) {
		display: grid;
		place-items: center;
		font-size: 1.2rem;
	}
	.lote-acciones :global(.lote-etiqueta) {
		text-align: center;
		line-height: 1.15;
	}
</style>
