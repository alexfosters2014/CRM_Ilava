<script lang="ts">
	/**
	 * Componente: ConversacionTicket.
	 *
	 * Render de la conversación de un ticket (mensajes agrupados por autor y
	 * día). No trae contenedor con scroll: el padre decide el layout, así se
	 * usa igual en la pantalla de Tickets y en el modal del seguimiento.
	 */
	import type { Snippet } from 'svelte';
	import { formatearHora } from '#lib/servicios/fechas.ts';
	import type { MensajeTicket } from '#lib/servicios-datos-api/tickets.ts';
	import { iconos } from './iconos.ts';
	import {
		agruparMensajesChat,
		avatarClase,
		contenidoHtml,
		fechaDia,
		inicialesDe
	} from './chat-ticket-util.ts';

	interface Props {
		mensajes: MensajeTicket[];
		usuarioId: string;
		vacioTitulo?: string;
		vacioTexto?: string;
		/** Contenido extra al final del hilo (por ejemplo, la resolución). */
		children?: Snippet;
	}

	let {
		mensajes,
		usuarioId,
		vacioTitulo = 'Sin movimientos todavía',
		vacioTexto = 'La descripción inicial abre la conversación del ticket.',
		children
	}: Props = $props();

	const items = $derived(agruparMensajesChat(mensajes));
</script>

<div class="conversacion">
	{#if items.length === 0}
		<div class="vacio">
			<span class="icono-grande">{@html iconos.responder}</span>
			<strong>{vacioTitulo}</strong>
			<p>{vacioTexto}</p>
		</div>
	{:else}
		{#each items as item (`m-${item.mensaje.id}`)}
			{#if item.nuevoDia}
				<div class="chat-fecha"><span>{fechaDia(item.fecha)}</span></div>
			{/if}

			{@const mensaje = item.mensaje}
			{@const propio = Boolean(usuarioId) && mensaje.autorUsuarioId === usuarioId}
			<article
				class="msg"
				class:propio
				class:inicio={item.primero}
				class:fin={item.ultimo}
				class:correo={mensaje.canal === 'CORREO'}
				class:resolucion={mensaje.tipo === 'RESOLUCION'}
			>
				<span class="avatar sm {avatarClase(mensaje.autorUsuarioId ?? mensaje.autorEmail)}">
					{inicialesDe(mensaje.autorNombre ?? mensaje.autorEmail)}
				</span>
				<div class="msg-caja">
					<div class="msg-cuerpo">
						<div class="msg-cab">
							<strong>{mensaje.autorNombre ?? 'Externo'}</strong>
							{#if mensaje.areaNombre}<span class="msg-area">{mensaje.areaNombre}</span>{/if}
							{#if !mensaje.visibleCliente}<span class="msg-interno">Solo interno</span>{/if}
							<time class="msg-hora-cab" datetime={mensaje.fechaHora}>
								{formatearHora(mensaje.fechaHora)}
							</time>
						</div>
						{@html contenidoHtml(mensaje.contenido)}
						{#if mensaje.autorEmail && !mensaje.autorUsuarioId}
							<div class="msg-remitente">De <b>{mensaje.autorEmail}</b> · incorporado al historial</div>
						{/if}
						<div class="msg-pie">
							<span class="msg-via">
								{mensaje.canal === 'CORREO'
									? 'Vía correo'
									: mensaje.canal === 'PORTAL'
										? 'Vía portal'
										: 'Vía app'}
							</span>
							<time class="msg-hora" datetime={mensaje.fechaHora}>
								{formatearHora(mensaje.fechaHora)}
							</time>
						</div>
					</div>
				</div>
			</article>
		{/each}
	{/if}

	{@render children?.()}
</div>

<style>
	.conversacion {
		padding: 0.9rem 1rem 1rem;
		background:
			radial-gradient(circle at 50% 0, rgba(99, 102, 241, 0.05), transparent 45%),
			var(--superficie-alta);
	}

	.vacio {
		display: grid;
		justify-items: center;
		gap: 0.2rem;
		padding: 1.6rem 1rem;
		text-align: center;
		color: var(--texto-suave);
	}

	.vacio .icono-grande {
		display: grid;
		place-items: center;
		width: 2.6rem;
		height: 2.6rem;
		border-radius: 0.8rem;
		background: var(--primario-tenue);
		color: var(--primario-texto);
	}

	.vacio strong {
		color: var(--texto);
		font-size: 0.82rem;
	}

	.vacio p {
		margin: 0;
		font-size: 0.68rem;
	}

	.chat-fecha { display: flex; justify-content: center; margin: 0.4rem 0 0.8rem; }
	.chat-fecha:first-child { margin-top: 0.1rem; }
	.chat-fecha span { padding: 0.18rem 0.55rem; border: 1px solid var(--borde-suave); border-radius: 99px; background: var(--superficie); color: var(--texto-tenue); font-size: 0.56rem; font-weight: 750; }

	.msg { display: flex; align-items: flex-start; gap: 0.55rem; margin-bottom: 0.7rem; max-width: 100%; }
	.msg.inicio { margin-top: 0.35rem; }
	.msg > .avatar { flex: 0 0 auto; width: 2rem; height: 2rem; margin-top: 0.1rem; font-size: 0.6rem; box-shadow: 0 2px 5px rgba(15, 23, 42, 0.08); }
	.msg.propio { flex-direction: row-reverse; }
	.msg.propio > .avatar { background: var(--primario); color: var(--texto-inverso); }
	.msg-caja { min-width: 0; max-width: 72%; }
	.msg.propio .msg-caja { max-width: 72%; }
	.msg-cab { display: flex; align-items: baseline; gap: 0.4rem; flex-wrap: wrap; margin-bottom: 0.2rem; padding: 0; }
	.msg-cab strong { color: var(--texto); font-size: 0.74rem; font-weight: 800; }
	.msg-area { padding: 0; border-radius: 0; background: transparent; color: var(--texto-suave); font-size: 0.63rem; font-weight: 600; }
	.msg-interno { padding: 0.02rem 0.3rem; border-radius: 99px; background: var(--alerta-tenue); color: var(--alerta-texto); font-size: 0.5rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.03em; }
	.msg-hora-cab { margin-left: auto; color: var(--texto-tenue); font-size: 0.57rem; white-space: nowrap; }
	.msg-cuerpo { padding: 0.65rem 0.8rem 0.5rem; border: 1px solid var(--borde-suave); border-radius: 0.9rem; background: var(--superficie); color: var(--texto); font-size: 0.82rem; line-height: 1.55; box-shadow: 0 2px 6px rgba(30, 41, 59, 0.04); overflow-wrap: anywhere; }
	.msg:not(.propio):not(.inicio) .msg-cuerpo { border-top-left-radius: 0.3rem; }
	.msg:not(.propio):not(.fin) .msg-cuerpo { border-bottom-left-radius: 0.3rem; }
	.msg-cuerpo :global(.mencion) { padding: 0.02rem 0.2rem; border-radius: 0.3rem; background: var(--primario-tenue); color: var(--primario-texto); font-weight: 750; }
	.msg.propio .msg-cuerpo { border-color: var(--borde); background: var(--primario-tenue); color: var(--texto); box-shadow: 0 2px 6px rgba(79, 70, 229, 0.06); }
	.msg.propio:not(.inicio) .msg-cuerpo { border-top-right-radius: 0.3rem; }
	.msg.propio:not(.fin) .msg-cuerpo { border-bottom-right-radius: 0.3rem; }
	.msg.propio .msg-cuerpo :global(.mencion) { background: var(--primario-tenue); color: var(--primario-texto); }
	.msg.correo:not(.propio) .msg-cuerpo { background: var(--superficie); border-color: var(--borde-suave); }
	.msg.resolucion:not(.propio) .msg-cuerpo { background: var(--exito-tenue); border-color: var(--exito-borde); }
	.msg-pie { display: flex; align-items: center; justify-content: flex-start; gap: 0.35rem; margin-top: 0.3rem; }
	.msg-via { color: var(--texto-tenue); font-size: 0.55rem; font-weight: 600; background: none; padding: 0; }
	.msg-hora { color: var(--texto-tenue); font-size: 0.55rem; line-height: 1; white-space: nowrap; }
	.msg-pie .msg-hora::before { content: '·'; margin-right: 0.3rem; color: var(--texto-tenue); }
	.msg.propio .msg-hora, .msg.propio .msg-via, .msg.propio .msg-hora-cab { color: var(--texto-suave); }
	.msg-remitente { margin-top: 0.3rem; color: var(--texto-suave); font-size: 0.56rem; }

	.avatar {
		display: inline-grid;
		place-items: center;
		flex: 0 0 auto;
		width: 2.05rem;
		height: 2.05rem;
		border-radius: 50%;
		background: var(--indigo-600, var(--primario));
		color: var(--texto-inverso);
		font-size: 0.65rem;
		font-weight: 800;
		letter-spacing: 0.02em;
	}
	.avatar.sm { width: 1.45rem; height: 1.45rem; font-size: 0.52rem; }
	.avatar.indigo { background: var(--primario); }
	.avatar.teal { background: #0f766e; }
	.avatar.ambar { background: #b45309; }
	.avatar.violeta { background: #6d28d9; }
	.avatar.rosa { background: #be185d; }
	.avatar.cian { background: #0369a1; }
	.avatar.gris { background: #64748b; }
</style>
