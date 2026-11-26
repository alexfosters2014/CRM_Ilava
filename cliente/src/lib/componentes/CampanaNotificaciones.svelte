<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { iconos } from '#lib/componentes/iconos.ts';
	import { formatearFechaHora } from '#lib/servicios/fechas.ts';
	import {
		listarNotificacionesGenerales,
		marcarNotificacionLeida,
		marcarTodasNotificaciones,
		type NotificacionGeneral,
		type NotificacionesGenerales
	} from '#lib/servicios-datos-api/notificaciones.ts';

	/**
	 * Capa: Componentes — Campana de notificaciones general.
	 *
	 * Único centro de avisos del área autenticada. Agrega tickets y
	 * seguimientos en una lista cronológica y navega al elemento puntual
	 * (`/tickets?ticket=…` o `/seguimientos?seg=…`).
	 */
	const INTERVALO_MS = 25_000;

	let datos = $state<NotificacionesGenerales>({ items: [], noLeidas: 0 });
	let abierto = $state(false);
	let cargando = $state(true);
	let error = $state('');
	let marcandoTodas = $state(false);
	let contenedor = $state<HTMLDivElement>();
	let intervalo: ReturnType<typeof setInterval> | undefined;

	const etiquetaTotal = $derived(datos.noLeidas > 99 ? '99+' : String(datos.noLeidas));

	async function cargar(silencioso = false) {
		if (!silencioso) cargando = true;
		try {
			datos = await listarNotificacionesGenerales();
			error = '';
		} catch (fallo) {
			if (!silencioso) {
				error =
					fallo instanceof Error ? fallo.message : 'No se pudieron cargar las notificaciones';
			}
		} finally {
			if (!silencioso) cargando = false;
		}
	}

	function alternar() {
		abierto = !abierto;
		if (abierto) void cargar(true);
	}

	function cerrar() {
		abierto = false;
	}

	async function marcarTodas() {
		if (marcandoTodas || datos.noLeidas === 0) return;
		marcandoTodas = true;
		try {
			await marcarTodasNotificaciones();
			datos = {
				noLeidas: 0,
				items: datos.items.map((item) => ({ ...item, leido: true }))
			};
			error = '';
		} catch (fallo) {
			error = fallo instanceof Error ? fallo.message : 'No se pudieron marcar las notificaciones';
		} finally {
			marcandoTodas = false;
		}
	}

	async function abrirAviso(item: NotificacionGeneral) {
		cerrar();
		if (!item.leido) {
			datos = {
				noLeidas: Math.max(0, datos.noLeidas - 1),
				items: datos.items.map((aviso) =>
					aviso.id === item.id ? { ...aviso, leido: true } : aviso
				)
			};
			marcarNotificacionLeida(item.origen, item.notificacionId).catch(() => void cargar(true));
		}
		// El parámetro `n` fuerza una navegación distinta aunque ya estemos en la
		// pantalla destino, para que el enlace profundo vuelva a seleccionar el ítem.
		const destino = new URL(item.url, window.location.origin);
		destino.searchParams.set('n', String(Date.now()));
		await goto(`${destino.pathname}${destino.search}`);
	}

	onMount(() => {
		void cargar();

		const refrescar = () => {
			if (document.hidden) return;
			void cargar(true);
		};

		intervalo = setInterval(refrescar, INTERVALO_MS);
		document.addEventListener('visibilitychange', refrescar);

		return () => {
			if (intervalo) clearInterval(intervalo);
			document.removeEventListener('visibilitychange', refrescar);
		};
	});

	$effect(() => {
		if (!abierto) return;

		const alTeclear = (evento: KeyboardEvent) => {
			if (evento.key === 'Escape') cerrar();
		};
		const alPresionarFuera = (evento: PointerEvent) => {
			if (!contenedor?.contains(evento.target as Node)) cerrar();
		};

		document.addEventListener('keydown', alTeclear);
		document.addEventListener('pointerdown', alPresionarFuera);

		return () => {
			document.removeEventListener('keydown', alTeclear);
			document.removeEventListener('pointerdown', alPresionarFuera);
		};
	});
</script>

<div class="campana" bind:this={contenedor}>
	<button
		type="button"
		class="icono-btn"
		aria-label="Notificaciones"
		aria-haspopup="dialog"
		aria-expanded={abierto}
		title="Notificaciones"
		onclick={alternar}
	>
		{@html iconos.campana}
		{#if datos.noLeidas > 0}
			<span class="badge" aria-hidden="true">{etiquetaTotal}</span>
		{/if}
	</button>

	{#if abierto}
		<div class="popover" role="dialog" aria-label="Notificaciones generales">
			<header class="popover-cab">
				<div class="titulo">
					<strong>Notificaciones</strong>
					{#if datos.noLeidas > 0}
						<span class="contador">{datos.noLeidas} sin leer</span>
					{/if}
				</div>
				<div class="popover-acciones">
					<button
						type="button"
						class="marcar"
						disabled={marcandoTodas || datos.noLeidas === 0}
						onclick={marcarTodas}
					>
						{marcandoTodas ? 'Marcando…' : 'Marcar todas como leídas'}
					</button>
					<button type="button" class="cerrar" aria-label="Cerrar" onclick={cerrar}>
						{@html iconos.equis}
					</button>
				</div>
			</header>

			<div class="popover-cuerpo">
				{#if cargando}
					<p class="estado">Cargando notificaciones…</p>
				{:else if error}
					<div class="estado error">
						<p>{error}</p>
						<button type="button" class="reintentar" onclick={() => cargar()}>Reintentar</button>
					</div>
				{:else if datos.items.length === 0}
					<p class="estado">No hay notificaciones por ahora.</p>
				{:else}
					<ul class="lista">
						{#each datos.items as item (item.id)}
							<li>
								<button
									type="button"
									class="aviso"
									class:no-leida={!item.leido}
									onclick={() => abrirAviso(item)}
								>
									<span class="aviso-icono">
										{@html item.origen === 'TICKET' ? iconos.ticket : iconos.seguimiento}
									</span>
									<span class="aviso-texto">
										<strong>{item.titulo}</strong>
										<span class="aviso-ref">{item.codigo} · {item.referencia}</span>
										{#if item.detalle}
											<span class="aviso-detalle">{item.detalle}</span>
										{/if}
										<small>
											{item.origen === 'TICKET' ? 'Ticket' : 'Seguimiento'} ·
											{formatearFechaHora(item.creadoEn)}
										</small>
									</span>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.campana {
		position: relative;
	}

	.icono-btn {
		position: relative;
		display: grid;
		place-items: center;
		width: 2.4rem;
		height: 2.4rem;
		border: 1px solid var(--gris-200, var(--borde-suave));
		border-radius: 50%;
		background: var(--superficie);
		color: var(--gris-700, var(--texto));
		font-size: 1.15rem;
		cursor: pointer;
		transition: background 150ms ease;
	}

	.icono-btn:hover {
		background: var(--gris-100, var(--superficie-suave));
	}

	.badge {
		position: absolute;
		top: -0.3rem;
		right: -0.3rem;
		min-width: 1.15rem;
		height: 1.15rem;
		padding: 0 0.25rem;
		border-radius: 999px;
		background: var(--peligro);
		color: var(--texto-inverso);
		font-size: 0.65rem;
		font-weight: 700;
		line-height: 1.15rem;
		text-align: center;
	}

	.popover {
		position: fixed;
		top: 3.9rem;
		right: 1rem;
		z-index: 120;
		display: flex;
		flex-direction: column;
		width: min(24rem, calc(100vw - 2rem));
		max-height: min(32rem, calc(100dvh - 5rem));
		border: 1px solid var(--borde);
		border-radius: 0.85rem;
		background: var(--superficie);
		box-shadow: 0 24px 60px rgba(15, 23, 42, 0.2);
		overflow: hidden;
	}

	.popover-cab {
		position: sticky;
		top: 0;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.6rem 0.7rem;
		border-bottom: 1px solid var(--borde-suave);
		background: var(--superficie);
	}

	.titulo {
		display: flex;
		align-items: baseline;
		gap: 0.35rem;
	}

	.titulo strong {
		color: var(--texto);
		font-size: 0.76rem;
	}

	.contador {
		color: var(--primario-texto);
		font-size: 0.56rem;
		font-weight: 750;
	}

	.popover-acciones {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.marcar {
		border: 0;
		background: transparent;
		color: var(--primario-texto);
		font-size: 0.56rem;
		font-weight: 750;
		cursor: pointer;
	}

	.marcar:disabled {
		color: var(--texto-tenue);
		cursor: default;
	}

	.cerrar {
		display: grid;
		place-items: center;
		width: 1.35rem;
		height: 1.35rem;
		border: 0;
		border-radius: 0.4rem;
		background: transparent;
		color: var(--texto-tenue);
		font-size: 0.75rem;
		cursor: pointer;
	}

	.cerrar:hover {
		background: var(--superficie-suave);
		color: var(--texto);
	}

	.popover-cuerpo {
		overflow-y: auto;
	}

	.estado {
		margin: 0;
		padding: 1.4rem 1rem;
		color: var(--texto-tenue);
		font-size: 0.65rem;
		text-align: center;
	}

	.estado.error {
		display: grid;
		justify-items: center;
		gap: 0.5rem;
		color: var(--peligro-texto);
	}

	.estado.error p {
		margin: 0;
	}

	.reintentar {
		padding: 0.25rem 0.6rem;
		border: 1px solid var(--primario-borde);
		border-radius: 0.45rem;
		background: var(--primario-tenue);
		color: var(--primario-texto);
		font-size: 0.58rem;
		font-weight: 750;
		cursor: pointer;
	}

	.lista {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.aviso {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		width: 100%;
		padding: 0.55rem 0.7rem;
		border: 0;
		border-bottom: 1px solid var(--borde-suave);
		background: var(--superficie);
		text-align: left;
		cursor: pointer;
	}

	.aviso:hover {
		background: var(--superficie-alta);
	}

	.aviso.no-leida {
		background: var(--superficie-alta);
		box-shadow: inset 3px 0 0 var(--primario);
	}

	.aviso-icono {
		display: grid;
		place-items: center;
		flex: 0 0 auto;
		width: 1.7rem;
		height: 1.7rem;
		border-radius: 50%;
		background: var(--primario-tenue);
		color: var(--primario-texto);
		font-size: 0.8rem;
	}

	.aviso-texto {
		display: grid;
		gap: 0.1rem;
		min-width: 0;
		color: var(--texto);
		font-size: 0.62rem;
		line-height: 1.35;
	}

	.aviso-texto strong {
		color: var(--texto);
		font-size: 0.64rem;
	}

	.aviso-ref {
		color: var(--primario-texto);
		font-size: 0.56rem;
		font-weight: 700;
	}

	.aviso-detalle {
		color: var(--texto-suave);
		font-size: 0.6rem;
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.aviso-texto small {
		color: var(--texto-tenue);
		font-size: 0.55rem;
	}

	@media (max-width: 30rem) {
		.popover {
			right: 0.5rem;
			left: 0.5rem;
			width: auto;
		}
	}
</style>
