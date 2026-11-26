<script lang="ts">
	import { Boton } from '#lib/componentes/index.ts';
	import { iconos } from '#lib/componentes/iconos.ts';
	import type { Usuario } from '#lib/servicios/sesion.ts';

	/**
	 * Capa: Pantallas — Inicio (pantalla principal tras el login).
	 *
	 * Réplica de la tarjeta de bienvenida: fondo navy tecnológico, cejilla en
	 * cian, saludo personalizado, acciones y widget de estado del sistema.
	 */
	interface Props {
		usuario: Usuario | null;
	}

	let { usuario }: Props = $props();

	// Nombre de pila para el saludo.
	let nombre = $derived(() => {
		const n = (usuario?.name ?? '').trim();
		if (n) return n.split(/\s+/)[0];
		const correo = (usuario?.email ?? '').trim();
		return correo ? correo.split('@')[0] : 'usuario';
	});
</script>

<section class="tarjeta">
	<div class="contenido">
		<p class="cejilla">Tu centro de facturación</p>

		<h1>Bienvenido de nuevo,<br />{nombre()}.</h1>

		<p class="descripcion">
			Todo está listo para que emitas, organices y supervises tus comprobantes desde un único
			espacio.
		</p>

		<div class="acciones">
			<Boton onclick={() => {}}>
				<span class="btn-con-flecha">
					Crear nueva factura
					<span class="flecha">{@html iconos.flecha}</span>
				</span>
			</Boton>
			<button type="button" class="btn-secundario">Ver guía rápida</button>
		</div>
	</div>

	<!-- Widget de estado -->
	<aside class="widget">
		<header class="widget-cab">
			<span class="widget-titulo">Sistema operativo</span>
			<span class="estado"><span class="punto"></span> Activo</span>
		</header>

		<div class="orbita" aria-hidden="true">
			<span class="anillo"></span>
			<span class="nodo"></span>
		</div>

		<p class="widget-nota">PAC conectado y listo para timbrar tus documentos.</p>
	</aside>
</section>

<style>
	.tarjeta {
		position: relative;
		display: grid;
		grid-template-columns: 1.15fr 0.85fr;
		gap: 2rem;
		align-items: center;
		padding: clamp(1.75rem, 4vw, 3rem);
		border-radius: var(--radio-lg, 1.25rem);
		/* Fondo navy tecnológico (réplica), sin asset externo. */
		background:
			radial-gradient(110% 90% at 80% 20%, rgba(34, 211, 238, 0.14), transparent 55%),
			radial-gradient(80% 70% at 8% 95%, rgba(99, 102, 241, 0.2), transparent 60%),
			linear-gradient(150deg, var(--navy-900, #050b1f), var(--navy-700, #101d4a));
		color: var(--texto-inverso);
		overflow: hidden;
		box-shadow: 0 24px 55px rgba(5, 11, 31, 0.35);
	}

	.tarjeta::before {
		content: '';
		position: absolute;
		inset: 0;
		background-image: radial-gradient(rgba(148, 163, 184, 0.12) 1px, transparent 1px);
		background-size: 28px 28px;
		opacity: 0.55;
		pointer-events: none;
	}

	.tarjeta > * {
		position: relative;
		z-index: 1;
	}

	.contenido {
		min-width: 0;
	}

	.cejilla {
		margin: 0 0 1rem;
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--cyan-400, #22d3ee);
	}

	h1 {
		margin: 0 0 1.1rem;
		font-size: clamp(2rem, 4.5vw, 3.1rem);
		line-height: 1.08;
		letter-spacing: -0.025em;
	}

	.descripcion {
		margin: 0 0 1.9rem;
		max-width: 30rem;
		color: rgba(226, 232, 240, 0.82);
		font-size: clamp(0.95rem, 1.6vw, 1.05rem);
		line-height: 1.6;
	}

	.acciones {
		display: flex;
		flex-wrap: wrap;
		gap: 0.85rem;
	}

	.btn-con-flecha {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
	}

	.flecha {
		display: grid;
		place-items: center;
		font-size: 1.05rem;
	}

	/* Botón primario: fondo claro, texto índigo (como en la maqueta). */
	.acciones :global(button[type='submit']),
	.acciones :global(button:not(.btn-secundario)) {
		background: var(--superficie);
		color: var(--indigo-700, var(--primario-texto));
		font-weight: 600;
	}

	.btn-secundario {
		padding: 0.65rem 1.25rem;
		border: 1px solid rgba(255, 255, 255, 0.28);
		border-radius: 0.5rem;
		background: rgba(255, 255, 255, 0.06);
		color: var(--texto-inverso);
		font: inherit;
		font-weight: 500;
		cursor: pointer;
		transition: background 150ms ease;
	}

	.btn-secundario:hover {
		background: rgba(255, 255, 255, 0.14);
	}

	/* Widget de estado */
	.widget {
		padding: 1.15rem;
		border-radius: 1rem;
		background: rgba(255, 255, 255, 0.07);
		border: 1px solid rgba(255, 255, 255, 0.14);
		backdrop-filter: blur(8px);
	}

	.widget-cab {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 0.9rem;
	}

	.widget-titulo {
		font-size: 0.9rem;
		font-weight: 600;
		color: rgba(226, 232, 240, 0.9);
	}

	.estado {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--verde-500, #22c55e);
	}

	.punto {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: var(--verde-500, var(--exito));
		box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.28);
	}

	/* Órbita: elipse con un nodo luminoso al centro (réplica del widget). */
	.orbita {
		position: relative;
		display: grid;
		place-items: center;
		height: clamp(7rem, 16vw, 10rem);
		border-radius: 0.7rem;
		background:
			radial-gradient(circle at 50% 50%, rgba(34, 211, 238, 0.1), transparent 70%),
			linear-gradient(160deg, rgba(6, 14, 38, 0.7), rgba(10, 20, 53, 0.5));
		overflow: hidden;
	}

	.anillo {
		position: absolute;
		width: 78%;
		height: 52%;
		border: 1.5px solid rgba(34, 211, 238, 0.55);
		border-radius: 50%;
		transform: rotate(-18deg);
	}

	.nodo {
		width: 1rem;
		height: 1rem;
		border-radius: 50%;
		background: var(--cyan-400, #22d3ee);
		box-shadow:
			0 0 12px 3px rgba(34, 211, 238, 0.75),
			0 0 26px 8px rgba(34, 211, 238, 0.35);
	}

	.widget-nota {
		margin: 0.9rem 0 0;
		font-size: 0.82rem;
		line-height: 1.5;
		color: rgba(203, 213, 225, 0.78);
	}

	@media (max-width: 60rem) {
		.tarjeta {
			grid-template-columns: 1fr;
		}

		.widget {
			order: -1;
		}
	}
</style>
