<script lang="ts">
	/**
	 * Componente: ModalConfirmar.
	 *
	 * Diálogo sí/no global. Lo abre `confirmar()` desde cualquier pantalla o
	 * modal y resuelve la promesa con la decisión del usuario.
	 */
	import { tick } from 'svelte';
	import { confirmacion, responderConfirmacion } from './confirmacion.svelte.ts';
	import { iconos } from './iconos.ts';

	let botonCancelar = $state<HTMLButtonElement>();
	let botonConfirmar = $state<HTMLButtonElement>();
	let focoPrevio: HTMLElement | null = null;

	function cancelar() {
		responderConfirmacion(false);
	}

	function confirmarAccion() {
		responderConfirmacion(true);
	}

	// Foco inicial en Cancelar (opción segura) y devolución del foco al cerrar.
	$effect(() => {
		if (!confirmacion.abierto) return;
		focoPrevio = document.activeElement as HTMLElement | null;
		void tick().then(() => botonCancelar?.focus());
		return () => {
			focoPrevio?.focus?.();
			focoPrevio = null;
		};
	});

	// Escape en captura: evita que el modal de fondo (ModalPanel) también se cierre.
	$effect(() => {
		if (!confirmacion.abierto) return;
		const alTeclear = (evento: KeyboardEvent) => {
			if (evento.key === 'Escape') {
				evento.preventDefault();
				evento.stopPropagation();
				cancelar();
				return;
			}
			if (evento.key === 'Tab') {
				const activo = document.activeElement;
				if (!evento.shiftKey && activo === botonConfirmar) {
					evento.preventDefault();
					botonCancelar?.focus();
				} else if (evento.shiftKey && activo === botonCancelar) {
					evento.preventDefault();
					botonConfirmar?.focus();
				}
			}
		};
		window.addEventListener('keydown', alTeclear, true);
		return () => window.removeEventListener('keydown', alTeclear, true);
	});
</script>

{#if confirmacion.abierto}
	<div
		class="velo"
		role="presentation"
		onclick={(evento) => {
			if (evento.target === evento.currentTarget) cancelar();
		}}
		onkeydown={(evento) => {
			if (evento.key === 'Escape') cancelar();
		}}
	>
		<div
			class="dialogo"
			role="alertdialog"
			tabindex="-1"
			aria-modal="true"
			aria-labelledby="confirmar-titulo"
			aria-describedby={confirmacion.mensaje ? 'confirmar-mensaje' : undefined}
		>
			<div class="icono {confirmacion.tono ?? 'primario'}">
				{@html confirmacion.tono === 'peligro' ? iconos.alerta : iconos.info}
			</div>
			<h2 id="confirmar-titulo">{confirmacion.titulo}</h2>
			{#if confirmacion.mensaje}
				<p id="confirmar-mensaje" class="mensaje">{confirmacion.mensaje}</p>
			{/if}
			{#if confirmacion.detalle}
				<p class="detalle">{confirmacion.detalle}</p>
			{/if}
			<div class="acciones">
				<button type="button" class="btn" bind:this={botonCancelar} onclick={cancelar}>
					{confirmacion.etiquetaCancelar ?? 'Cancelar'}
				</button>
				<button
					type="button"
					class="btn confirmar {confirmacion.tono ?? 'primario'}"
					bind:this={botonConfirmar}
					onclick={confirmarAccion}
				>
					{confirmacion.etiquetaConfirmar ?? 'Confirmar'}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.velo {
		position: fixed;
		inset: 0;
		z-index: 400;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: var(--velo-modal);
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
	}

	.dialogo {
		display: grid;
		justify-items: center;
		gap: 0.45rem;
		width: min(27rem, 100%);
		padding: 1.35rem 1.4rem 1.15rem;
		border: 1px solid var(--borde);
		border-radius: 1rem;
		background: var(--modal-fondo);
		box-shadow: var(--sombra-modal);
		text-align: center;
	}

	.icono {
		display: grid;
		place-items: center;
		width: 2.6rem;
		height: 2.6rem;
		border-radius: 999px;
		background: var(--primario-tenue);
		color: var(--primario-texto);
	}

	.icono.peligro {
		background: var(--peligro-tenue);
		color: var(--peligro-texto);
	}

	.icono :global(svg) {
		width: 1.25rem;
		height: 1.25rem;
	}

	h2 {
		margin: 0.15rem 0 0;
		color: var(--texto);
		font-size: 1.02rem;
	}

	.mensaje {
		margin: 0;
		color: var(--texto-suave);
		font-size: 0.78rem;
		line-height: 1.5;
	}

	.detalle {
		margin: 0.15rem 0 0;
		padding: 0.5rem 0.7rem;
		border: 1px solid var(--borde-suave);
		border-radius: 0.6rem;
		background: var(--superficie-alta);
		color: var(--texto);
		font-size: 0.76rem;
		font-weight: 700;
		line-height: 1.45;
	}

	.acciones {
		display: flex;
		justify-content: center;
		gap: 0.5rem;
		width: 100%;
		margin-top: 0.45rem;
	}

	.btn {
		min-width: 7.5rem;
		padding: 0.55rem 0.9rem;
		border: 1px solid var(--borde);
		border-radius: 0.65rem;
		background: var(--superficie-alta);
		color: var(--texto-suave);
		font: inherit;
		font-size: 0.74rem;
		font-weight: 750;
		cursor: pointer;
	}

	.btn:hover {
		border-color: var(--borde-fuerte);
		color: var(--texto);
	}

	.btn.confirmar {
		border-color: transparent;
		background: var(--accion-gradiente);
		color: var(--texto-inverso);
		box-shadow: 0 8px 18px rgba(79, 70, 229, 0.22);
	}

	.btn.confirmar.peligro {
		background: var(--peligro);
		color: var(--texto-inverso);
		box-shadow: 0 8px 18px rgba(248, 113, 113, 0.25);
	}

	.btn.confirmar:hover {
		filter: brightness(1.06);
		color: var(--texto-inverso);
	}

	.btn:focus-visible {
		outline: 2px solid var(--foco);
		outline-offset: 2px;
	}
</style>
