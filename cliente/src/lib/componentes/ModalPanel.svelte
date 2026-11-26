<script lang="ts">
	/**
	 * Componente: ModalPanel.
	 *
	 * Modal reutilizable de 70vw × 70vh centrado, con fondo difuminado. Recibe
	 * el título, un subtítulo opcional y el cuerpo como snippet, así sirve para
	 * cualquier tabla o detalle sin repetir el cascarón.
	 */
	import type { Snippet } from 'svelte';

	interface Props {
		titulo: string;
		subtitulo?: string;
		/** Texto chico arriba del título, como "ENVIADOS A FACTURAR". */
		etiqueta?: string;
		onCerrar: () => void;
		children: Snippet;
		/** Acciones opcionales del pie (botones). */
		acciones?: Snippet;
		/** Reemplaza la cabecera estándar (título/subtítulo). El botón de cerrar se mantiene. */
		cabecera?: Snippet;
		/** Modal más ancho, para detalles con tablas y controles densos. */
		amplio?: boolean;
		/** Panel chico y de alto automático, para acciones puntuales. */
		compacto?: boolean;
	}

	let { titulo, subtitulo, etiqueta, onCerrar, children, acciones, cabecera, amplio = false, compacto = false }: Props = $props();
</script>

<svelte:window
	onkeydown={(evento) => {
		if (evento.key === 'Escape') {
			evento.preventDefault();
			onCerrar();
		}
	}}
/>

<div
	class="fondo"
	role="presentation"
	onclick={onCerrar}
	onkeydown={(evento) => {
		if (evento.key === 'Escape') onCerrar();
	}}
>
	<div
		class="panel"
		class:con-pie={!!acciones}
		class:amplio
		class:compacto
		role="dialog"
		aria-modal="true"
		aria-label={titulo}
		tabindex="-1"
		onclick={(evento) => evento.stopPropagation()}
		onkeydown={(evento) => {
			if (evento.key === 'Escape') onCerrar();
		}}
	>
		{#if cabecera}
			<header class="cabecera-personalizada">
				{@render cabecera()}
				<button type="button" class="cerrar cerrar-claro" aria-label="Cerrar" onclick={onCerrar}>×</button>
			</header>
		{:else}
			<header class="cabecera">
				<div class="titulos">
					{#if etiqueta}
						<span class="etiqueta">{etiqueta}</span>
					{/if}
					<h2>{titulo}</h2>
					{#if subtitulo}
						<p class="subtitulo">{subtitulo}</p>
					{/if}
				</div>
				<button type="button" class="cerrar" aria-label="Cerrar" onclick={onCerrar}>×</button>
			</header>
		{/if}

		<div class="cuerpo">
			{@render children()}
		</div>

		{#if acciones}
			<footer class="pie">
				{@render acciones()}
			</footer>
		{/if}
	</div>
</div>

<style>
	.fondo {
		position: fixed;
		inset: 0;
		z-index: 90;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: var(--velo-modal);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
	}

	.panel {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		width: 70vw;
		height: 70vh;
		max-width: 100%;
		max-height: 100%;
		border-radius: 1rem;
		background: var(--modal-fondo);
		box-shadow: var(--sombra-modal);
		overflow: hidden;
	}

	.panel.amplio {
		width: 65vw;
	}

	/* Acciones puntuales: no necesita ocupar 70vh. */
	.panel.compacto {
		width: min(560px, 100%);
		height: auto;
		max-height: min(90vh, 44rem);
	}

	/* El detalle con tablas necesita más ancho útil: menos margen lateral. */
	.panel.amplio .cuerpo {
		padding: 1rem 1rem 1.1rem;
	}

	.cabecera {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1.5rem;
		padding: 1.35rem 1.6rem 1.15rem;
		border-bottom: 1px solid var(--borde-suave);
		background: var(--modal-cabecera-fondo);
	}

	.titulos {
		display: grid;
		gap: 0.15rem;
		min-width: 0;
	}

	.etiqueta {
		font-size: 0.6rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--primario-texto);
	}

	.cabecera h2 {
		margin: 0;
		font-size: 1.45rem;
		line-height: 1.15;
		color: var(--texto);
	}

	.subtitulo {
		margin: 0.2rem 0 0;
		font-size: 0.75rem;
		color: var(--texto-suave);
	}

	.cerrar {
		flex: 0 0 auto;
		width: 1.9rem;
		height: 1.9rem;
		border: 1px solid var(--borde-suave);
		border-radius: 0.5rem;
		background: var(--superficie);
		color: var(--texto-suave);
		font-size: 1rem;
		line-height: 1;
		cursor: pointer;
	}

	.cerrar:hover {
		background: var(--superficie-suave);
	}

	/* La cabecera personalizada trae su propio fondo; el cierre flota arriba. */
	.cabecera-personalizada {
		position: relative;
	}

	.cabecera-personalizada .cerrar-claro {
		position: absolute;
		top: 0.9rem;
		right: 1rem;
		border-color: rgba(255, 255, 255, 0.35);
		background: rgba(255, 255, 255, 0.12);
		color: var(--texto-inverso);
	}

	.cabecera-personalizada .cerrar-claro:hover {
		background: rgba(255, 255, 255, 0.25);
	}

	.cuerpo {
		min-height: 0;
		overflow: auto;
		padding: 1.15rem 1.6rem 1.4rem;
	}

	.panel.con-pie {
		grid-template-rows: auto minmax(0, 1fr) auto;
	}

	.pie {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.6rem;
		padding: 0.8rem 1.6rem;
		border-top: 1px solid var(--borde-suave);
		background: var(--modal-cabecera-fondo);
	}

	@media (max-width: 60rem) {
		.panel {
			width: 92vw;
			height: 85vh;
		}
	}
</style>
