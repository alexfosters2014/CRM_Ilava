<script lang="ts">
	/**
	 * Componente: CompositorTicket.
	 *
	 * Compositor de respuestas de un ticket: texto, menciones @área/@usuario,
	 * "solo interno" y envío por correo a los involucrados. Es el mismo en la
	 * pantalla de Tickets y en el modal del seguimiento; el envío entra por
	 * `onEnviar` para que cada pantalla use su endpoint.
	 */
	import { nombreVisible, type Usuario } from '#lib/servicios/sesion.ts';
	import type {
		MensajeTicketDatos,
		TicketDetalle
	} from '#lib/servicios-datos-api/tickets.ts';
	import { iconos } from './iconos.ts';
	import { avatarClase, inicialesDe, normalizarBusqueda } from './chat-ticket-util.ts';

	interface AreaMencion {
		id: number;
		nombre: string;
	}

	interface UsuarioMencion {
		id: string;
		nombre: string;
		email: string;
		areaNombre?: string | null;
	}

	interface Props {
		ticket: TicketDetalle;
		usuario: Usuario | null;
		areas: AreaMencion[];
		usuarios: UsuarioMencion[];
		/** Cuenta Gmail usada para el envío por correo (la primera disponible). */
		cuentasGmail: { id: number }[];
		onEnviar: (datos: MensajeTicketDatos) => Promise<{ correoError?: string | null } | void>;
		onAviso: (mensaje: string) => void;
		/** Se llama después de un envío exitoso (refrescar lista o detalle). */
		onEnviado?: () => void | Promise<void>;
	}

	let {
		ticket,
		usuario,
		areas,
		usuarios,
		cuentasGmail,
		onEnviar,
		onAviso,
		onEnviado
	}: Props = $props();

	let respuesta = $state('');
	let enviarPorCorreo = $state(true);
	let soloInterno = $state(false);
	let enviando = $state(false);
	let mencionAbierta = $state(false);
	let mencionFiltro = $state('');
	let mencionIndice = $state(0);
	let textoRespuesta = $state<HTMLTextAreaElement>();

	const usuarioNombre = $derived(nombreVisible(usuario));
	const puedeResponder = $derived(ticket.permisos.responder);

	const opcionesMencion = $derived.by(() => {
		const filtro = normalizarBusqueda(mencionFiltro);
		const areasFiltradas = areas
			.filter((area) => !filtro || normalizarBusqueda(area.nombre).includes(filtro))
			.slice(0, 5);
		const usuariosFiltrados = usuarios
			.filter(
				(persona) =>
					!filtro ||
					normalizarBusqueda(persona.nombre).includes(filtro) ||
					normalizarBusqueda(persona.email.split('@')[0]).includes(filtro)
			)
			.slice(0, 6);
		return { areas: areasFiltradas, usuarios: usuariosFiltrados };
	});

	function alEscribirRespuesta() {
		const coincidencia = respuesta.match(/(?:^|\s)@([\p{L}\p{N}_]*)$/u);
		mencionFiltro = coincidencia?.[1] ?? '';
		mencionAbierta = Boolean(coincidencia);
		mencionIndice = 0;
	}

	const opcionesPlanas = $derived.by(() => [
		...opcionesMencion.areas.map((area) => ({
			tipo: 'AREA' as const,
			id: area.id as number | string,
			nombre: area.nombre,
			areaNombre: null as string | null
		})),
		...opcionesMencion.usuarios.map((persona) => ({
			tipo: 'USUARIO' as const,
			id: persona.id as number | string,
			nombre: persona.nombre,
			areaNombre: persona.areaNombre ?? null
		}))
	]);

	function indiceOpcion(tipo: 'AREA' | 'USUARIO', id: number | string) {
		return opcionesPlanas.findIndex((opcion) => opcion.tipo === tipo && opcion.id === id);
	}

	function elegirMencion(opcion: { tipo: 'AREA' | 'USUARIO'; nombre: string }) {
		insertarMencion(
			opcion.tipo === 'AREA' ? `@${opcion.nombre}` : `@${opcion.nombre.replace(/\s+/g, '')}`
		);
	}

	function insertarMencion(texto: string) {
		const coincidencia = respuesta.match(/(?:^|\s)@([\p{L}\p{N}_]*)$/u);
		if (coincidencia) {
			const inicio = respuesta.length - coincidencia[1].length - 1;
			respuesta = respuesta.slice(0, inicio) + texto + ' ';
		} else {
			respuesta += texto + ' ';
		}
		mencionAbierta = false;
		textoRespuesta?.focus();
	}

	function alTeclearRespuesta(evento: KeyboardEvent) {
		if (mencionAbierta) {
			const total = Math.max(opcionesPlanas.length, 1);
			if (evento.key === 'ArrowDown') {
				evento.preventDefault();
				mencionIndice = (mencionIndice + 1) % total;
				return;
			}
			if (evento.key === 'ArrowUp') {
				evento.preventDefault();
				mencionIndice = (mencionIndice - 1 + total) % total;
				return;
			}
			if (evento.key === 'Enter') {
				evento.preventDefault();
				const opcion = opcionesPlanas[mencionIndice];
				if (opcion) elegirMencion(opcion);
				return;
			}
		}
		if (evento.key === 'Escape') {
			mencionAbierta = false;
			return;
		}
		if (evento.key === 'Enter' && !evento.shiftKey) {
			evento.preventDefault();
			void enviar();
		}
	}

	async function enviar() {
		if (enviando || !puedeResponder) return;
		if (!respuesta.trim()) {
			onAviso('Escribí una respuesta antes de enviar.');
			textoRespuesta?.focus();
			return;
		}

		enviando = true;
		const eraSoloInterno = soloInterno;
		const eraCorreo = enviarPorCorreo && ticket.permisos.enviarCorreo;
		try {
			const resultado = await onEnviar({
				contenido: respuesta.trim(),
				enviarCorreo: eraCorreo && !eraSoloInterno,
				paraInvolucrados: eraCorreo && !eraSoloInterno,
				soloInterno: eraSoloInterno,
				cuentaGmailId: eraCorreo && !eraSoloInterno ? (cuentasGmail[0]?.id ?? undefined) : undefined
			});
			respuesta = '';
			mencionAbierta = false;
			if (eraSoloInterno) {
				soloInterno = false;
				onAviso('Respuesta interna publicada. No se envió por correo ni al portal.');
			} else if (eraCorreo) {
				onAviso(
					resultado && resultado.correoError
						? `Respuesta guardada. El correo no se pudo enviar: ${resultado.correoError}`
						: 'Respuesta enviada por correo a todos los involucrados.'
				);
			} else {
				onAviso('Respuesta publicada.');
			}
			await onEnviado?.();
		} catch (fallo) {
			onAviso(fallo instanceof Error ? fallo.message : 'No se pudo enviar la respuesta');
		} finally {
			enviando = false;
		}
	}

	function alCambiarSoloInterno() {
		enviarPorCorreo = !soloInterno;
	}
</script>

{#if puedeResponder}
	<div class="composer">
		<div class="composer-cab">
			<b>Responder como {usuarioNombre}</b>
			{#if usuario?.area}<span class="msg-area">{usuario.area.nombre}</span>{/if}
		</div>
		<textarea
			bind:this={textoRespuesta}
			bind:value={respuesta}
			oninput={alEscribirRespuesta}
			onkeydown={alTeclearRespuesta}
			rows="2"
			placeholder="Escribí una respuesta… Usá @ para mencionar un área o usuario."
		></textarea>

		{#if mencionAbierta}
			<div class="mencion-pop">
				<header>Mencionar <span><kbd>↑</kbd> <kbd>↓</kbd> <kbd>Enter</kbd></span></header>
				{#if opcionesMencion.areas.length === 0 && opcionesMencion.usuarios.length === 0}
					<p class="mencion-vacio">No hay áreas ni usuarios activos que coincidan.</p>
				{:else}
					{#if opcionesMencion.areas.length > 0}
						<div class="mencion-grupo">
							<span class="mencion-titulo">Áreas</span>
							{#each opcionesMencion.areas as area (area.id)}
								<button
									type="button"
									class="mencion-op"
									class:activa={mencionIndice === indiceOpcion('AREA', area.id)}
									onclick={() => elegirMencion({ tipo: 'AREA', nombre: area.nombre })}
								>
									<span class="simbolo">@</span>
									<span class="nombre">{area.nombre}</span>
								</button>
							{/each}
						</div>
					{/if}
					{#if opcionesMencion.usuarios.length > 0}
						<div class="mencion-grupo">
							<span class="mencion-titulo">Usuarios</span>
							{#each opcionesMencion.usuarios as persona (persona.id)}
								<button
									type="button"
									class="mencion-op"
									class:activa={mencionIndice === indiceOpcion('USUARIO', persona.id)}
									onclick={() => elegirMencion({ tipo: 'USUARIO', nombre: persona.nombre })}
								>
									<span class="avatar sm {avatarClase(persona.id)}">{inicialesDe(persona.nombre)}</span>
									<span class="nombre">{persona.nombre}</span>
									<span class="sub">{persona.areaNombre ?? ''}</span>
								</button>
							{/each}
						</div>
					{/if}
				{/if}
			</div>
		{/if}

		<div class="composer-pie">
			<button
				type="button"
				class="btn chico"
				title="Mencionar"
				onclick={() => {
					respuesta += '@';
					mencionAbierta = true;
					mencionFiltro = '';
					textoRespuesta?.focus();
				}}
			>
				{@html iconos.arroba}
			</button>
			<label class="check-inline" title="No se muestra en el portal ni se envía por correo">
				<input type="checkbox" bind:checked={soloInterno} onchange={alCambiarSoloInterno} />
				Solo interno
			</label>
			{#if ticket.permisos.enviarCorreo}
				<label class="check-inline" title="Por defecto se envía por correo a todos los involucrados. Destildá para notificar solo en la campana.">
					<input type="checkbox" bind:checked={enviarPorCorreo} disabled={soloInterno} />
					Correo a involucrados
				</label>
			{/if}
			<span class="hint"><kbd>Enter</kbd> envía · <kbd>Shift</kbd>+<kbd>Enter</kbd> salto de línea</span>
			<span class="crecimiento"></span>
			<button
				type="button"
				class="btn primario"
				disabled={enviando || !respuesta.trim()}
				onclick={enviar}
			>
				{@html iconos.enviar}
				{enviando ? 'Enviando…' : 'Responder'}
			</button>
		</div>
	</div>
{:else}
	<div class="bloqueado">
		{@html iconos.candado}
		<span>
			{#if ticket.estado === 'CERRADO'}
				<b>Ticket cerrado.</b> No admite respuestas; creá un ticket nuevo con referencia si necesitás continuar.
			{:else if ticket.estado === 'CANCELADO'}
				<b>Ticket cancelado.</b> El historial queda disponible en modo lectura.
			{:else}
				<b>Sin permiso para responder.</b> El historial queda disponible en modo lectura.
			{/if}
		</span>
	</div>
{/if}

<style>
	.composer { position: relative; flex: 0 0 auto; padding: 0.45rem 0.7rem 0.5rem; border-top: 1px solid var(--borde-suave); background: var(--superficie); box-shadow: 0 -8px 20px rgba(49, 64, 129, 0.04); }
	.composer-cab { display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap; margin-bottom: 0.25rem; color: var(--texto-suave); font-size: 0.58rem; }
	.composer-cab b { color: var(--texto); font-size: 0.64rem; }
	.msg-area { padding: 0; border-radius: 0; background: transparent; color: var(--texto-suave); font-size: 0.63rem; font-weight: 600; }
	.composer textarea { display: block; width: 100%; min-height: 2.8rem; max-height: 9rem; padding: 0.6rem 0.75rem; border: 1px solid var(--borde); border-radius: 0.9rem; background: var(--superficie); color: var(--texto); font-size: 0.76rem; line-height: 1.45; resize: vertical; }
	.composer textarea:focus { outline: 2px solid var(--foco); outline-offset: 1px; }
	.composer-pie { display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap; margin-top: 0.3rem; }
	.composer-pie .hint { color: var(--texto-tenue); font-size: 0.54rem; }
	.composer-pie .hint kbd { padding: 0.02rem 0.2rem; border: 1px solid var(--borde-suave); border-radius: 0.25rem; background: var(--superficie); font-family: inherit; font-size: 0.52rem; }
	.crecimiento { flex: 1; }

	.btn { display: inline-flex; align-items: center; justify-content: center; gap: 0.38rem; min-height: 2.05rem; padding: 0.42rem 0.68rem; border: 1px solid var(--gris-200, var(--borde)); border-radius: 0.62rem; background: var(--superficie); color: var(--texto-suave); font-size: 0.71rem; font-weight: 750; text-decoration: none; white-space: nowrap; transition: background 140ms ease, border-color 140ms ease, color 140ms ease; }
	.btn:hover { background: var(--superficie-alta); border-color: var(--borde-fuerte); color: var(--indigo-700, var(--primario-texto)); }
	.btn:disabled { opacity: 0.5; cursor: not-allowed; }
	.btn.primario { border-color: transparent; background: var(--accion-gradiente); color: var(--texto-inverso); box-shadow: 0 8px 18px rgba(79, 70, 229, 0.22); }
	.btn.primario:hover { background: var(--accion-gradiente); color: var(--texto-inverso); }
	.btn.chico { min-height: 1.7rem; padding: 0.26rem 0.48rem; font-size: 0.65rem; border-radius: 0.5rem; }
	.btn :global(svg) { width: 1em; height: 1em; }

	.check-inline { display: inline-flex; align-items: center; gap: 0.3rem; color: var(--texto-suave); font-size: 0.63rem; font-weight: 650; white-space: nowrap; cursor: pointer; }
	.check-inline input { width: 0.9rem; height: 0.9rem; accent-color: var(--foco); }
	.check-inline input:disabled { opacity: 0.45; cursor: not-allowed; }

	.mencion-pop { position: absolute; bottom: calc(100% - 0.3rem); left: 0.7rem; z-index: 50; width: 20rem; max-height: 15rem; overflow: auto; border: 1px solid var(--borde); border-radius: 0.7rem; background: var(--superficie); box-shadow: 0 18px 45px rgba(15, 23, 42, 0.2); }
	.mencion-pop header { display: flex; align-items: center; justify-content: space-between; padding: 0.4rem 0.55rem; border-bottom: 1px solid var(--borde-suave); background: var(--superficie-alta); color: var(--texto-suave); font-size: 0.55rem; font-weight: 850; text-transform: uppercase; letter-spacing: 0.06em; }
	.mencion-pop header kbd { border: 1px solid var(--borde-suave); border-radius: 0.2rem; background: var(--superficie); padding: 0.02rem 0.2rem; font-family: inherit; font-size: 0.5rem; }
	.mencion-grupo { padding: 0.25rem 0; }
	.mencion-grupo + .mencion-grupo { border-top: 1px solid var(--borde-suave); }
	.mencion-titulo { display: block; padding: 0.1rem 0.55rem; color: var(--texto-tenue); font-size: 0.5rem; font-weight: 850; letter-spacing: 0.07em; text-transform: uppercase; }
	.mencion-op { display: flex; align-items: center; gap: 0.35rem; width: 100%; padding: 0.32rem 0.55rem; border: 0; background: transparent; color: var(--texto); font-size: 0.66rem; text-align: left; cursor: pointer; }
	.mencion-op:hover { background: var(--primario-tenue); color: var(--primario-texto); }
	.mencion-op.activa { background: var(--primario-tenue); color: var(--primario-texto); }
	.mencion-op .simbolo { display: grid; place-items: center; width: 1.35rem; height: 1.35rem; border-radius: 0.35rem; background: var(--primario-tenue); color: var(--primario-texto); font-size: 0.68rem; font-weight: 850; }
	.mencion-op .nombre { font-weight: 750; }
	.mencion-op .sub { margin-left: auto; color: var(--texto-tenue); font-size: 0.53rem; }
	.mencion-vacio { margin: 0; padding: 0.6rem; color: var(--texto-tenue); font-size: 0.6rem; text-align: center; }

	.avatar { display: inline-grid; place-items: center; flex: 0 0 auto; width: 2.05rem; height: 2.05rem; border-radius: 50%; background: var(--indigo-600, var(--primario)); color: var(--texto-inverso); font-size: 0.65rem; font-weight: 800; letter-spacing: 0.02em; }
	.avatar.sm { width: 1.45rem; height: 1.45rem; font-size: 0.52rem; }
	.avatar.indigo { background: var(--primario); }
	.avatar.teal { background: #0f766e; }
	.avatar.ambar { background: #b45309; }
	.avatar.violeta { background: #6d28d9; }
	.avatar.rosa { background: #be185d; }
	.avatar.cian { background: #0369a1; }
	.avatar.gris { background: #64748b; }

	.bloqueado { display: flex; align-items: center; gap: 0.4rem; margin: 0.5rem 0.8rem 0.7rem; padding: 0.55rem 0.6rem; border: 1px solid var(--borde); border-radius: 0.6rem; background: var(--superficie-suave); color: var(--texto-suave); font-size: 0.65rem; }
	.bloqueado :global(svg) { width: 1rem; height: 1rem; flex: 0 0 auto; }
</style>
