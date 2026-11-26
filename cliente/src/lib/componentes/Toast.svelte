<script lang="ts">
	/**
	 * Componente: Toast.
	 *
	 * Aviso de una línea, arriba al centro (3 px del borde superior). Lo
	 * alimenta el servicio global `notificar()`.
	 */
	import { iconos } from './iconos.ts';
	import { notificacion } from './notificaciones.svelte.ts';

	const icono = $derived(
		notificacion.tipo === 'exito'
			? iconos.checkCirculo
			: notificacion.tipo === 'error'
				? iconos.alerta
				: iconos.info
	);
</script>

{#if notificacion.visible}
	<div class="toast {notificacion.tipo}" role="status" aria-live="polite">
		{@html icono}
		<span>{notificacion.mensaje}</span>
	</div>
{/if}

<style>
	.toast {
		position: fixed;
		top: 3px;
		left: 50%;
		z-index: 300;
		display: flex;
		align-items: center;
		gap: 0.45rem;
		max-width: min(92vw, 46rem);
		padding: 0.5rem 0.8rem;
		border: 1px solid var(--exito-borde);
		border-radius: 0.6rem;
		background: var(--exito-tenue);
		color: var(--exito-texto);
		font-size: 0.68rem;
		font-weight: 650;
		line-height: 1.4;
		box-shadow: 0 14px 36px rgba(2, 6, 23, 0.35);
		transform: translateX(-50%);
		animation: entrar 160ms ease-out;
	}

	.toast.error {
		border-color: var(--peligro-borde);
		background: var(--peligro-tenue);
		color: var(--peligro-texto);
	}

	.toast.info {
		border-color: var(--info-borde);
		background: var(--info-tenue);
		color: var(--info-texto);
	}

	.toast :global(svg) {
		width: 0.95rem;
		height: 0.95rem;
		flex: 0 0 auto;
	}

	@keyframes entrar {
		from {
			opacity: 0;
			transform: translate(-50%, -6px);
		}
		to {
			opacity: 1;
			transform: translate(-50%, 0);
		}
	}
</style>
