<script lang="ts">
	import { tick } from 'svelte';
	import { formatearFechaHora } from '#lib/servicios/fechas.ts';
	import type { PageData } from './$types';

	/**
	 * Portal público del ticket. No hay login: la autorización es el token del
	 * enlace enviado por correo. Solo se muestran los mensajes públicos.
	 */

	type MensajePortal = {
		id: number;
		autor: string;
		origen: 'EQUIPO' | 'INVITADO';
		contenido: string;
		fechaHora: string;
	};

	let { data }: { data: PageData } = $props();

	const mensajesIniciales = () => (data.mensajes ?? []) as MensajePortal[];
	let mensajes = $state<MensajePortal[]>(mensajesIniciales());
	let nombre = $state('');
	let email = $state('');
	let contenido = $state('');
	let website = $state('');
	let enviando = $state(false);
	let error = $state('');
	let aviso = $state('');
	let hilo = $state<HTMLDivElement>();

	const abierto = $derived(Boolean(data.ticket?.abierto));
	const identificado = $derived(Boolean(data.identificado));

	const ETIQUETAS: Record<string, string> = {
		NUEVO: 'Nuevo',
		ABIERTO: 'Abierto',
		EN_PROCESO: 'En proceso',
		ESPERANDO: 'Esperando información',
		RESUELTO: 'Resuelto',
		CERRADO: 'Cerrado',
		CANCELADO: 'Cancelado'
	};

	function etiquetaEstado(estado: string | undefined) {
		return estado ? (ETIQUETAS[estado] ?? estado) : '';
	}

	function iniciales(nombre: string) {
		return nombre
			.split(/\s+/)
			.filter(Boolean)
			.map((parte) => parte[0])
			.join('')
			.slice(0, 2)
			.toUpperCase();
	}

	async function responder() {
		if (enviando) return;
		error = '';
		aviso = '';
		if (!identificado && nombre.trim().length < 2) {
			error = 'Escribí tu nombre.';
			return;
		}
		if (!identificado && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
			error = 'Escribí un email válido.';
			return;
		}
		if (contenido.trim().length < 2) {
			error = 'Escribí tu respuesta.';
			return;
		}

		enviando = true;
		try {
			const respuesta = await fetch(`/api/tickets/portal/${encodeURIComponent(data.token)}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					nombre: identificado ? undefined : nombre.trim(),
					email: identificado ? undefined : email.trim(),
					contenido: contenido.trim(),
					website
				})
			});
			const datos = await respuesta.json().catch(() => ({}));
			if (!respuesta.ok) {
				error =
					datos.error === 'TICKET_CERRADO'
						? 'La conversación se cerró. Ya no se pueden enviar respuestas.'
						: datos.error === 'DEMASIADOS_ENVIOS'
							? 'Demasiados envíos seguidos. Esperá unos minutos.'
							: 'No se pudo enviar la respuesta. Intentá de nuevo.';
				return;
			}
			if (datos.mensaje) mensajes = [...mensajes, datos.mensaje as MensajePortal];
			contenido = '';
			aviso = 'Respuesta enviada. El equipo la va a ver en el ticket.';
			await tick();
			if (hilo) hilo.scrollTop = hilo.scrollHeight;
		} catch {
			error = 'No se pudo conectar con el servidor. Intentá de nuevo.';
		} finally {
			enviando = false;
		}
	}
</script>

<svelte:head>
	<title>{data.ticket?.codigo ? `Conversación ${data.ticket.codigo}` : 'Conversación'} · FacturaPro</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="portal">
	<header class="marca">
		<span class="logo">⚡</span>
		<span class="nombre">FacturaPro</span>
		<span class="separador">/</span>
		<span class="seccion">Conversación del ticket</span>
	</header>

	{#if data.error}
		<section class="card estado">
			<h1>No pudimos abrir la conversación</h1>
			<p>{data.error}</p>
		</section>
	{:else if data.ticket}
		<section class="card">
			<header class="ticket-cab">
				<div>
					<p class="kicker">CONVERSACIÓN DEL TICKET</p>
					<h1>{data.ticket.titulo}</h1>
					<p class="meta">{data.ticket.codigo} · {etiquetaEstado(data.ticket.estado)}</p>
				</div>
				<span class="chip estado {data.ticket.estado?.toLowerCase() ?? ''}">
					{etiquetaEstado(data.ticket.estado)}
				</span>
			</header>

			<div class="hilo" bind:this={hilo}>
				{#each mensajes as mensaje (mensaje.id)}
					<div class="fila" class:invitado={mensaje.origen === 'INVITADO'}>
						<span class="avatar">{iniciales(mensaje.autor)}</span>
						<article class="burbuja" class:invitado={mensaje.origen === 'INVITADO'}>
							<header>
								<strong>{mensaje.autor}</strong>
								<time>{formatearFechaHora(mensaje.fechaHora)}</time>
							</header>
							<p>{mensaje.contenido}</p>
						</article>
					</div>
				{:else}
					<p class="vacio">Todavía no hay mensajes en esta conversación.</p>
				{/each}
			</div>

			{#if abierto}
				<div class="composer">
					<p class="nota">Podés responder sin crear una cuenta.</p>
					{#if identificado}
						<p class="nota identificado">
							{#if data.nombre}
								Respondés como <strong>{data.nombre}</strong>.
							{:else}
								Respondés con el email de este enlace.
							{/if}
						</p>
					{:else}
						<div class="campos">
							<label>Tu nombre<input bind:value={nombre} maxlength="120" autocomplete="name" /></label>
							<label>Tu email<input type="email" bind:value={email} maxlength="200" autocomplete="email" /></label>
						</div>
					{/if}
					<input
						class="honeypot"
						bind:value={website}
						tabindex="-1"
						autocomplete="off"
						aria-hidden="true"
					/>
					<label>Mensaje<textarea bind:value={contenido} rows="5" maxlength="8000" placeholder="Escribí tu respuesta…"></textarea></label>
					{#if error}<p class="error">{error}</p>{/if}
					{#if aviso}<p class="aviso">{aviso}</p>{/if}
					<div class="pie">
						<span>La conversación completa queda guardada en el ticket.</span>
						<button type="button" disabled={enviando} onclick={responder}>
							{enviando ? 'Enviando…' : 'Enviar respuesta'}
						</button>
					</div>
				</div>
			{:else}
				<p class="cerrado">
					Esta conversación está cerrada. Si necesitás retomarla, contactá al equipo.
				</p>
			{/if}
		</section>
	{:else}
		<section class="card estado">
			<h1>Conversación no disponible</h1>
			<p>El enlace no es válido o venció.</p>
		</section>
	{/if}
</div>

<style>
	:global(body) {
		margin: 0;
		background: var(--superficie-suave);
		color: var(--texto);
		font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
	}

	.portal {
		min-height: 100dvh;
		padding: 1.5rem 1rem 3rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.marca {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		width: min(960px, 100%);
		color: var(--texto-suave);
		font-size: 0.75rem;
		font-weight: 700;
	}
	.logo {
		display: grid;
		place-items: center;
		width: 1.8rem;
		height: 1.8rem;
		border-radius: 0.5rem;
		background: var(--primario);
		color: var(--texto-inverso);
		font-size: 1rem;
	}
	.nombre {
		color: var(--texto);
		font-size: 0.9rem;
		font-weight: 800;
	}
	.separador {
		color: var(--texto-tenue);
	}
	.seccion {
		font-weight: 600;
	}

	.card {
		width: min(960px, 100%);
		border: 1px solid var(--borde-suave);
		border-radius: 1.1rem;
		background: var(--superficie);
		box-shadow: 0 18px 45px rgba(49, 64, 129, 0.08);
		overflow: hidden;
	}

	.ticket-cab {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		padding: 1.2rem 1.3rem 1rem;
		border-bottom: 1px solid var(--borde-suave);
		background: linear-gradient(180deg, var(--superficie-alta), var(--superficie));
	}
	.kicker {
		margin: 0;
		color: var(--texto-tenue);
		font-size: 0.58rem;
		font-weight: 850;
		letter-spacing: 0.1em;
	}
	h1 {
		margin: 0.25rem 0 0.3rem;
		color: var(--texto);
		font-size: 1.45rem;
		letter-spacing: -0.02em;
		line-height: 1.25;
	}
	.meta {
		margin: 0;
		color: var(--texto-suave);
		font-size: 0.72rem;
	}
	.chip {
		flex: 0 0 auto;
		padding: 0.25rem 0.55rem;
		border-radius: 99px;
		background: var(--superficie-suave);
		color: var(--texto-suave);
		font-size: 0.62rem;
		font-weight: 800;
		white-space: nowrap;
	}
	.chip.abierto {
		background: var(--peligro-tenue);
		color: var(--peligro-texto);
	}
	.chip.proceso {
		background: var(--alerta-tenue);
		color: var(--alerta-texto);
	}
	.chip.esperando {
		background: var(--info-tenue);
		color: var(--info-texto);
	}
	.chip.resuelto {
		background: var(--exito-tenue);
		color: var(--exito-texto);
	}

	.hilo {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		max-height: 58vh;
		overflow-y: auto;
		padding: 1.1rem 1.2rem;
		background: radial-gradient(circle at 50% 0, rgba(99, 102, 241, 0.05), transparent 45%), var(--superficie-alta);
	}
	.fila {
		display: flex;
		align-items: flex-start;
		gap: 0.55rem;
		max-width: 100%;
	}
	.fila.invitado {
		flex-direction: row-reverse;
	}
	.avatar {
		display: grid;
		place-items: center;
		flex: 0 0 auto;
		width: 2rem;
		height: 2rem;
		margin-top: 0.1rem;
		border-radius: 50%;
		background: var(--primario-tenue);
		color: var(--primario-texto);
		font-size: 0.6rem;
		font-weight: 800;
	}
	.fila.invitado .avatar {
		background: var(--primario);
		color: var(--texto-inverso);
	}
	.burbuja {
		display: grid;
		gap: 0.25rem;
		max-width: 74%;
		padding: 0.65rem 0.8rem 0.55rem;
		border: 1px solid var(--borde-suave);
		border-radius: 0.9rem;
		background: var(--superficie);
		box-shadow: 0 2px 6px rgba(30, 41, 59, 0.04);
	}
	.burbuja.invitado {
		border-color: var(--borde);
		background: var(--primario-tenue);
	}
	.burbuja header {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}
	.burbuja strong {
		color: var(--texto);
		font-size: 0.74rem;
	}
	.burbuja time {
		margin-left: auto;
		color: var(--texto-tenue);
		font-size: 0.58rem;
		white-space: nowrap;
	}
	.burbuja p {
		margin: 0;
		color: var(--texto);
		font-size: 0.84rem;
		line-height: 1.55;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.vacio {
		margin: 1rem;
		color: var(--texto-tenue);
		font-size: 0.8rem;
		text-align: center;
	}

	.composer {
		display: grid;
		gap: 0.6rem;
		padding: 1rem 1.2rem 1.2rem;
		border-top: 1px solid var(--borde-suave);
		background: var(--superficie);
	}
	.nota {
		margin: 0;
		color: var(--texto-suave);
		font-size: 0.66rem;
	}
	.nota strong {
		color: var(--texto);
	}
	.campos {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.6rem;
	}
	label {
		display: grid;
		gap: 0.25rem;
		color: var(--texto-suave);
		font-size: 0.62rem;
		font-weight: 750;
	}
	input,
	textarea {
		width: 100%;
		padding: 0.55rem 0.65rem;
		border: 1px solid var(--borde);
		border-radius: 0.6rem;
		background: var(--superficie-alta);
		color: var(--texto);
		font: inherit;
		font-size: 0.78rem;
		font-weight: 400;
	}
	input:focus,
	textarea:focus {
		outline: 2px solid var(--foco);
		outline-offset: 1px;
		background: var(--superficie);
	}
	textarea {
		min-height: 6rem;
		resize: vertical;
	}
	.honeypot {
		position: absolute;
		left: -9999px;
		width: 1px;
		height: 1px;
		opacity: 0;
	}
	.error,
	.aviso {
		margin: 0;
		font-size: 0.68rem;
	}
	.error {
		color: var(--peligro-texto);
	}
	.aviso {
		color: var(--exito-texto);
	}
	.pie {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.7rem;
	}
	.pie span {
		color: var(--texto-tenue);
		font-size: 0.6rem;
	}
	.pie button {
		padding: 0.6rem 1.1rem;
		border: 0;
		border-radius: 0.65rem;
		background: var(--primario);
		color: var(--texto-inverso);
		font: inherit;
		font-size: 0.76rem;
		font-weight: 750;
		cursor: pointer;
	}
	.pie button:disabled {
		opacity: 0.6;
		cursor: progress;
	}

	.cerrado {
		margin: 0;
		padding: 1.2rem;
		color: var(--alerta-texto);
		background: var(--alerta-tenue);
		font-size: 0.8rem;
	}

	.estado {
		padding: 2rem;
	}
	.estado h1 {
		font-size: 1.2rem;
	}
	.estado p {
		color: var(--texto-suave);
		font-size: 0.85rem;
	}

	@media (max-width: 40rem) {
		.campos {
			grid-template-columns: 1fr;
		}
		.burbuja {
			max-width: 82%;
		}
		.ticket-cab {
			flex-direction: column;
		}
		.pie {
			flex-direction: column;
			align-items: flex-start;
		}
		.pie button {
			width: 100%;
		}
	}
</style>
