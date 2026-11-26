<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { slide } from 'svelte/transition';
	import { page } from '$app/state';
	import { iconos } from '#lib/componentes/iconos.ts';
	import ChipSelect from '#lib/componentes/ChipSelect.svelte';
	import ConversacionTicket from '#lib/componentes/ConversacionTicket.svelte';
	import CompositorTicket from '#lib/componentes/CompositorTicket.svelte';
	import { notificar } from '#lib/componentes/notificaciones.svelte.ts';
	import { confirmar } from '#lib/componentes/confirmacion.svelte.ts';
	import { formatearFecha, formatearFechaHora } from '#lib/servicios/fechas.ts';
	import { iniciales } from '#lib/servicios/sesion.ts';
	import { guardarPreferencia, leerPreferencia } from '#lib/servicios/preferencias-locales.ts';
	import {
		ErrorApiTickets,
		actualizarTicket,
		agregarParticipante,
		buscarServiciosTickets,
		crearTicket,
		enviarCorreoTicket,
		enviarMensaje,
		listarCatalogosTickets,
		listarCuentasGmailTickets,
		listarTickets,
		obtenerTicket,
		quitarParticipante,
		type ActualizarTicketDatos,
		type CatalogosTickets,
		type EstadoTicket,
		type GmailCuentaEnvio,
		type MensajeTicket,
		type MensajeTicketDatos,
		type NuevoTicketDatos,
		type ParticipanteTicket,
		type PrioridadTicket,
		type ServicioBuscadoTicket,
		type TicketDetalle,
		type TicketResumen,
		type TipoOrigenTicket
	} from '#lib/servicios-datos-api/index.ts';

	/**
	 * Pantalla: Centro de tickets.
	 *
	 * Conversación tipo chat, lista filtrable, contexto del servicio, auditoría
	 * y correo. La autorización real la aplica la API; esta pantalla solo evita
	 * ofrecer acciones que el backend va a rechazar.
	 */

	const ESTADOS: Record<EstadoTicket, { etiqueta: string; clase: string }> = {
		NUEVO: { etiqueta: 'Nuevo', clase: 'nuevo' },
		ABIERTO: { etiqueta: 'Abierto', clase: 'abierto' },
		EN_PROCESO: { etiqueta: 'En proceso', clase: 'proceso' },
		ESPERANDO_RESPUESTA: { etiqueta: 'Esperando respuesta', clase: 'esperando' },
		RESUELTO: { etiqueta: 'Resuelto', clase: 'resuelto' },
		CERRADO: { etiqueta: 'Cerrado', clase: 'cerrado' },
		CANCELADO: { etiqueta: 'Cancelado', clase: 'cancelado' }
	};

	const PRIORIDADES: Record<PrioridadTicket, { etiqueta: string; clase: string }> = {
		BAJA: { etiqueta: 'Baja', clase: 'baja' },
		NORMAL: { etiqueta: 'Normal', clase: 'normal' },
		ALTA: { etiqueta: 'Alta', clase: 'alta' },
		URGENTE: { etiqueta: 'Urgente', clase: 'urgente' }
	};

	const ETIQUETAS_EVENTO: Record<string, string> = {
		CREACION: 'creó el ticket',
		ESTADO: 'cambió el estado',
		PRIORIDAD: 'cambió la prioridad',
		AREA_RESPONSABLE: 'cambió el área responsable',
		ASIGNACION: 'reasignó el ticket',
		TITULO: 'cambió el título',
		FECHA_LIMITE: 'actualizó la fecha límite',
		RELACION: 'relacionó el ticket',
		RESPUESTA: 'publicó una respuesta',
		VALIDACION: 'validó la solución',
		CORREO_ENVIADO: 'envió un correo',
		CORREO_RECIBIDO: 'recibió un correo',
		AREA_INVOLUCRADA: 'agregó un área involucrada',
		USUARIO_INVOLUCRADO: 'agregó un usuario involucrado',
		PARTICIPANTE_QUITADO: 'quitó un participante'
	};

	const usuario = $derived(page.data.usuario);
	const usuarioId = $derived(usuario?.id ?? '');
	const permisosApp = $derived(page.data.permisos ?? []);

	let tickets = $state<TicketResumen[]>([]);
	let catalogos = $state<CatalogosTickets>({ areas: [], usuarios: [], categorias: [] });
	let seleccionadoId = $state<number | null>(null);
	let detalle = $state<TicketDetalle | null>(null);
	let cargando = $state(true);
	let cargandoDetalle = $state(false);
	let error = $state('');
	let errorDetalle = $state('');
	let ultimaActualizacion = $state<Date | null>(null);

	let busqueda = $state('');
	let filtroEstado = $state('activos');
	let filtroPrioridad = $state('');
	let filtroArea = $state('');
	let filtroOrigen = $state('');
	let soloNoLeidas = $state(false);
	/** Modo extendido: sin filtros visibles y con el chat más alto al abrir un ticket. */
	let extenderChat = $state(false);
	let tab = $state<'conversacion' | 'contexto' | 'auditoria' | 'correo'>('conversacion');

	let detalleScroll = $state<HTMLDivElement>();

	let menuAbierto = $state(false);
	let conflicto = $state<Record<string, unknown> | null>(null);

	let modalNuevo = $state(false);
	let errorNuevo = $state('');
	let guardandoNuevo = $state(false);
	interface MencionNueva {
		tipo: 'AREA' | 'USUARIO';
		id: number | string;
		nombre: string;
		areaId: number | null;
		areaNombre: string | null;
	}
	let mencionesRef = $state<HTMLDivElement>();
	let menciones = $state<MencionNueva[]>([]);
	let menuMencionesAbierto = $state(false);
	let menuMencionesPos = $state({ top: 0, left: 0 });
	let menuMencionesIndice = $state(0);
	let consultaMencion = $state('');
	let rangoMencion: Range | null = null;
	let servicioMenuAbierto = $state(false);
	let servicioMenuPos = $state({ top: 0, left: 0, width: 0 });
	let servicioInputRef = $state<HTMLInputElement>();
	let timerBusquedaServicio: ReturnType<typeof setTimeout> | undefined;
	let fechaModo = $state<'ninguna' | 'preset' | 'personalizado'>('ninguna');
	let fechaDias = $state<number | null>(null);
	const DIAS_PRESET = [1, 3, 7];

	let nuevo = $state({
		tipoOrigen: 'INTERNO' as TipoOrigenTicket,
		titulo: '',
		descripcion: '',
		categoriaId: null as number | null,
		prioridad: 'NORMAL' as PrioridadTicket,
		areaResponsableId: null as number | null,
		usuarioAsignadoId: null as string | null,
		areaSolicitanteId: null as number | null,
		fechaLimite: '',
		servicioId: null as number | null,
		periodoCobranzaId: null as number | null,
		referenciaTexto: '',
		areasInvolucradas: [] as number[],
		usuariosInvolucrados: [] as string[]
	});
	let busquedaServicio = $state('');
	let serviciosEncontrados = $state<ServicioBuscadoTicket[]>([]);
	let servicioSeleccionado = $state<ServicioBuscadoTicket | null>(null);
	let buscandoServicio = $state(false);

	let cuentasGmail = $state<GmailCuentaEnvio[]>([]);

	let modalResolver = $state(false);
	let resolucionTexto = $state('');
	let modalCierre = $state(false);
	let modoCierre = $state<'CERRAR' | 'CANCELAR'>('CERRAR');
	let motivoCierre = $state('');
	let modalEspera = $state(false);
	let esperaAreaId = $state('');
	let esperaUsuarioId = $state('');
	let esperaDetalle = $state('');
	let modalFecha = $state(false);
	let fechaTexto = $state('');
	let motivoFecha = $state('');
	let guardandoDetalle = $state(false);

	// Correo saliente del ticket (pestaña "Correo").
	let correoAbierto = $state(false);
	let correoPara = $state('');
	let correoAsunto = $state('');
	let correoCuerpo = $state('');
	let enviandoCorreo = $state(false);

	function mostrarAviso(texto: string) {
		notificar(texto);
	}

	function textoError(error: unknown): string {
		if (error instanceof ErrorApiTickets) return error.message;
		if (error instanceof Error) return error.message;
		return 'No se pudo completar la operación';
	}

	interface OpcionMencionNueva extends MencionNueva {
		miembros: number;
	}

	const opcionesMencionTicket = $derived.by(() => {
		const consulta = normalizar(consultaMencion);
		const lista: OpcionMencionNueva[] = [
			...catalogos.areas.map((area) => ({
				tipo: 'AREA' as const,
				id: area.id,
				nombre: area.nombre,
				areaId: area.id,
				areaNombre: area.nombre,
				miembros: catalogos.usuarios.filter((u) => u.areaId === area.id).length
			})),
			...catalogos.usuarios.map((usuarioOpcion) => ({
				tipo: 'USUARIO' as const,
				id: usuarioOpcion.id,
				nombre: usuarioOpcion.nombre,
				areaId: usuarioOpcion.areaId,
				areaNombre: usuarioOpcion.areaNombre,
				miembros: 0
			}))
		];
		return lista
			.filter(
				(opcion) =>
					!menciones.some(
						(mention) => mention.tipo === opcion.tipo && String(mention.id) === String(opcion.id)
					)
			)
			.filter(
				(opcion) =>
					!consulta ||
					normalizar(opcion.nombre).includes(consulta) ||
					(opcion.tipo === 'USUARIO' && normalizar(opcion.areaNombre ?? '').includes(consulta))
			)
			.slice(0, 24);
	});

	function normalizar(valor: string): string {
		return valor
			.normalize('NFD')
			.replace(/\p{Diacritic}/gu, '')
			.toLowerCase()
			.replace(/[^a-z0-9]/g, '');
	}

	function avatarClase(id: string | null | undefined): string {
		const clases = ['indigo', 'teal', 'ambar', 'violeta', 'rosa', 'cian', 'gris'];
		let hash = 0;
		for (const caracter of id ?? '') hash = (hash * 31 + caracter.charCodeAt(0)) % 997;
		return clases[hash % clases.length];
	}

	function inicialesDe(nombre: string | null | undefined): string {
		return iniciales({ name: nombre ?? '' });
	}

	function fechaDia(iso: string): string {
		return formatearFechaHora(iso).split(' ')[0] ?? '';
	}

	function hora(iso: string): string {
		return formatearFechaHora(iso).split(' ')[1] ?? '';
	}

	function fechaLocalInput(iso: string | null): string {
		if (!iso) return '';
		const fecha = new Date(iso);
		if (Number.isNaN(fecha.getTime())) return '';
		const partes = new Intl.DateTimeFormat('en-CA', {
			timeZone: 'America/Montevideo',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			hour12: false
		}).formatToParts(fecha);
		const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
			partes.find((parte) => parte.type === tipo)?.value ?? '';
		return `${valor('year')}-${valor('month')}-${valor('day')}T${valor('hour')}:${valor('minute')}`;
	}

	function fechaMontevideoAISO(valor: string): string | null {
		if (!valor) return null;
		const fecha = new Date(`${valor}:00-03:00`);
		return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString();
	}

	function estadoPlazo(ticket: TicketResumen): { clase: string; texto: string; restante: string } {
		if (!ticket.fechaLimite) return { clase: 'sin', texto: 'Sin fecha límite', restante: '' };
		const fecha = new Date(ticket.fechaLimite);
		const diferencia = fecha.getTime() - Date.now();
		if (diferencia < 0) {
			return {
				clase: 'vencido',
				texto: 'Vencido',
				restante: formatearFechaHora(ticket.fechaLimite)
			};
		}
		const hoy = fechaDia(new Date().toISOString());
		if (fechaDia(ticket.fechaLimite) === hoy) {
			return { clase: 'hoy', texto: 'Vence hoy', restante: formatearFechaHora(ticket.fechaLimite) };
		}
		const dias = Math.ceil(diferencia / 86400000);
		return {
			clase: 'ok',
			texto: dias <= 1 ? 'Vence mañana' : `Vence en ${dias} días`,
			restante: formatearFechaHora(ticket.fechaLimite)
		};
	}

	function participantesActivos(ticket: TicketDetalle | TicketResumen): ParticipanteTicket[] {
		return ticket.participantes.filter((p) => p.activo);
	}

	function areasInvolucradas(ticket: TicketDetalle | TicketResumen): ParticipanteTicket[] {
		return participantesActivos(ticket).filter((p) => p.tipo === 'AREA' && p.origen === 'MENCION');
	}

	function usuariosInvolucrados(ticket: TicketDetalle | TicketResumen): ParticipanteTicket[] {
		return participantesActivos(ticket).filter((p) => p.tipo === 'USUARIO' && p.origen === 'MENCION');
	}

	function puedeAbrirModulo(clave: string): boolean {
		return Boolean(page.data.admin) || permisosApp.includes(clave);
	}

	function rangoOrden(ticket: TicketResumen): number {
		const vencido = ticket.fechaLimite && new Date(ticket.fechaLimite).getTime() < Date.now();
		if (ticket.prioridad === 'URGENTE' && vencido) return 0;
		if (vencido) return 1;
		if (ticket.prioridad === 'URGENTE') return 2;
		if (ticket.estado === 'NUEVO' && !ticket.usuarioAsignado) return 3;
		if (ticket.nuevasRespuestas > 0) return 4;
		if (
			ticket.fechaLimite &&
			new Date(ticket.fechaLimite).getTime() - Date.now() < 2 * 86400000
		) {
			return 5;
		}
		return 6;
	}

	const ticketsFiltrados = $derived.by(() => {
		const texto = normalizar(busqueda);
		const lista = tickets.filter((ticket) => {
			if (filtroEstado === 'activos') {
				if (['CERRADO', 'CANCELADO', 'RESUELTO'].includes(ticket.estado)) return false;
			} else if (filtroEstado && ticket.estado !== filtroEstado) return false;
			if (filtroPrioridad && ticket.prioridad !== filtroPrioridad) return false;
			if (filtroArea && String(ticket.areaResponsable.id) !== filtroArea) return false;
			if (filtroOrigen && ticket.tipoOrigen !== filtroOrigen) return false;
			if (soloNoLeidas && ticket.nuevasRespuestas === 0) return false;

			if (texto) {
				const contenido = [
					ticket.codigo,
					ticket.titulo,
					ticket.servicio?.nombre ?? '',
					ticket.servicio?.numeracion ?? '',
					ticket.usuarioAsignado?.nombre ?? '',
					ticket.areaResponsable.nombre,
					...ticket.participantes.map((p) => p.nombre)
				].join(' ');
				if (!normalizar(contenido).includes(texto)) return false;
			}
			return true;
		});

		return lista.sort(
			(a, b) =>
				rangoOrden(a) - rangoOrden(b) ||
				new Date(b.fechaActualizacion).getTime() - new Date(a.fechaActualizacion).getTime()
		);
	});

	const hayFiltros = $derived(
		Boolean(
			busqueda ||
				(filtroEstado && filtroEstado !== 'activos') ||
				filtroPrioridad ||
				filtroArea ||
				filtroOrigen ||
				soloNoLeidas
		)
	);

	async function cargarLista(silencioso = false) {
		if (!silencioso) cargando = true;
		try {
			tickets = await listarTickets();
			error = '';
			if (!seleccionadoId && !extenderChat && tickets.length > 0) {
				await tick();
				const primero = ticketsFiltrados[0] ?? tickets[0];
				await seleccionarTicket(primero.id);
			} else if (seleccionadoId && !tickets.some((t) => t.id === seleccionadoId)) {
				seleccionadoId = null;
				detalle = null;
				if (!extenderChat && tickets.length > 0) await seleccionarTicket(tickets[0].id);
			}
			ultimaActualizacion = new Date();
		} catch (e) {
			if (!silencioso) error = textoError(e);
		} finally {
			cargando = false;
		}
	}

	async function cargarDetalle(id: number, silencioso = false) {
		if (!silencioso) cargandoDetalle = true;
		try {
			const ticket = await obtenerTicket(id);
			detalle = ticket;
			seleccionadoId = ticket.id;
			errorDetalle = '';
			if (tab === 'conversacion') {
				await tick();
				scrollAlFinal();
			}
		} catch (e) {
			if (!silencioso) errorDetalle = textoError(e);
		} finally {
			if (!silencioso) cargandoDetalle = false;
		}
	}

	/**
	 * "Extender chat": al encenderlo se cierra el ticket abierto para que la
	 * lista y el chat arranquen sin selección y los filtros sigan visibles.
	 */
	function cambiarExtenderChat(activo: boolean) {
		extenderChat = activo;
		void guardarPreferencia('extender-chat', String(activo));
		if (activo) {
			seleccionadoId = null;
			detalle = null;
			errorDetalle = '';
		}
	}

	async function seleccionarTicket(id: number) {
		// Volver a tocar el ticket abierto lo cierra: los filtros reaparecen.
		if (id === seleccionadoId && detalle?.id === id) {
			seleccionadoId = null;
			detalle = null;
			return;
		}

		seleccionadoId = id;
		tab = 'conversacion';
		conflicto = null;
		await cargarDetalle(id);
		if (!detalle) return;
		await tick();
		scrollAlFinal();
	}

	async function refrescarSilencioso() {
		if (document.hidden) return;
		try {
			const lista = await listarTickets();
			tickets = lista;
			ultimaActualizacion = new Date();
			if (seleccionadoId) {
				const ticket = await obtenerTicket(seleccionadoId);
				if (!detalle || ticket.version !== detalle.version) {
					detalle = ticket;
					if (tab === 'conversacion') {
						await tick();
						scrollAlFinal();
					}
				}
			}
		} catch {
			// El próximo tick reintenta; no se pisa el estado visible.
		}
	}

	function scrollAlFinal() {
		if (!detalleScroll) return;
		detalleScroll.scrollTop = detalleScroll.scrollHeight;
		// En anchos chicos el detalle crece y scrollea la página, no el panel:
		// llevamos el último mensaje a la vista sin mover nada si ya se ve.
		const ultimo = detalleScroll.querySelector('.conversacion article.msg:last-of-type');
		ultimo?.scrollIntoView({ block: 'nearest' });
	}

	function aplicarTicket(ticket: TicketDetalle) {
		detalle = ticket;
		seleccionadoId = ticket.id;
		tickets = tickets.map((item) => (item.id === ticket.id ? { ...item, ...ticket } : item));
	}

	async function patchTicket(
		datos: Omit<ActualizarTicketDatos, 'version'>,
		mensajeOk: string
	): Promise<boolean> {
		if (!detalle) return false;
		guardandoDetalle = true;
		try {
			const ticket = await actualizarTicket(detalle.id, { version: detalle.version, ...datos });
			aplicarTicket(ticket);
			conflicto = null;
			mostrarAviso(mensajeOk);
			await cargarLista(true);
			return true;
		} catch (e) {
			if (e instanceof ErrorApiTickets && e.codigo === 'CONFLICTO_VERSION') {
				conflicto = e.actual ?? null;
				await cargarDetalle(detalle.id, true);
				mostrarAviso('Otro usuario actualizó el ticket. Revisá el valor más reciente.');
			} else {
				mostrarAviso(textoError(e));
			}
			return false;
		} finally {
			guardandoDetalle = false;
		}
	}

	async function cambiarEstado(valor: string) {
		if (!detalle) return;
		const estado = valor as EstadoTicket;
		if (estado === detalle.estado) return;
		if (estado === 'RESUELTO') {
			resolucionTexto = detalle.resolucion ?? '';
			modalResolver = true;
			return;
		}
		if (estado === 'CERRADO') {
			if (!detalle.permisos.cerrar) {
				mostrarAviso('Solo el creador del ticket puede cerrarlo.');
				return;
			}
			modoCierre = 'CERRAR';
			motivoCierre = detalle.motivoCierre ?? '';
			modalCierre = true;
			return;
		}
		if (estado === 'CANCELADO') {
			if (!detalle.permisos.cancelar) {
				mostrarAviso('No tenés permiso para cancelar este ticket.');
				return;
			}
			modoCierre = 'CANCELAR';
			motivoCierre = detalle.motivoCierre ?? '';
			modalCierre = true;
			return;
		}
		if (estado === 'ESPERANDO_RESPUESTA') {
			esperaAreaId = detalle.espera?.area ? String(detalle.espera.area.id) : '';
			esperaUsuarioId = detalle.espera?.usuario?.id ?? '';
			esperaDetalle = detalle.espera?.detalle ?? '';
			modalEspera = true;
			return;
		}
		await patchTicket({ estado }, `Estado actualizado a ${ESTADOS[estado].etiqueta}.`);
	}

	async function confirmarResolver() {
		if (resolucionTexto.trim().length < 3) {
			mostrarAviso('Ingresá la resolución antes de confirmar.');
			return;
		}
		const ok = await patchTicket(
			{ estado: 'RESUELTO', resolucion: resolucionTexto.trim() },
			'Ticket resuelto. Queda pendiente de validación y cierre.'
		);
		if (ok) modalResolver = false;
	}

	async function confirmarCierre() {
		if (motivoCierre.trim().length < 3) {
			mostrarAviso('Ingresá el motivo antes de confirmar.');
			return;
		}
		const estado = modoCierre === 'CERRAR' ? 'CERRADO' : 'CANCELADO';
		const ok = await patchTicket(
			{ estado, motivoCierre: motivoCierre.trim() },
			modoCierre === 'CERRAR' ? 'Ticket cerrado.' : 'Ticket cancelado.'
		);
		if (ok) modalCierre = false;
	}

	async function confirmarEspera() {
		if (!esperaAreaId && !esperaUsuarioId) {
			mostrarAviso('Indicá de qué área o usuario se espera respuesta.');
			return;
		}
		if (esperaDetalle.trim().length < 3) {
			mostrarAviso('Indicá qué se está esperando.');
			return;
		}
		const ok = await patchTicket(
			{
				estado: 'ESPERANDO_RESPUESTA',
				esperaDeAreaId: esperaAreaId ? Number(esperaAreaId) : null,
				esperaDeUsuarioId: esperaUsuarioId || null,
				esperaDetalle: esperaDetalle.trim()
			},
			'Ticket marcado como Esperando respuesta.'
		);
		if (ok) modalEspera = false;
	}

	async function confirmarFecha() {
		const iso = fechaMontevideoAISO(fechaTexto);
		const ok = await patchTicket(
			{
				fechaLimite: iso,
				motivoFechaLimite: motivoFecha.trim() || null
			},
			'Fecha límite actualizada.'
		);
		if (ok) {
			modalFecha = false;
			motivoFecha = '';
		}
	}

	async function asignarme() {
		if (!detalle) return;
		await patchTicket(
			{
				usuarioAsignadoId: usuarioId,
				...(detalle.estado === 'NUEVO' ? { estado: 'EN_PROCESO' as EstadoTicket } : {})
			},
			'El ticket quedó asignado a vos.'
		);
	}

	async function validarSolucion() {
		await patchTicket({ accion: 'VALIDAR' }, 'Solución validada. El creador puede cerrar el ticket.');
	}

	function abrirResolver() {
		if (!detalle) return;
		resolucionTexto = detalle.resolucion ?? '';
		modalResolver = true;
	}

	/** Envía desde el compositor compartido y actualiza el detalle. */
	async function enviarRespuestaChat(datos: MensajeTicketDatos) {
		if (!detalle) return;
		const resultado = await enviarMensaje(detalle.id, datos);
		aplicarTicket(resultado.ticket);
		return resultado;
	}

	/** Después de responder: bajar el scroll y refrescar la lista. */
	async function alEnviarRespuesta() {
		await tick();
		scrollAlFinal();
		await cargarLista(true);
	}

	/** Envía un correo del ticket y lo registra en su historial. */
	async function enviarCorreoDetalle() {
		if (!detalle || enviandoCorreo) return;

		const para = correoPara
			.split(/[,;\s]+/)
			.map((valor) => valor.trim())
			.filter(Boolean);

		if (para.length === 0) {
			mostrarAviso('Indicá al menos un destinatario.');
			return;
		}
		if (correoAsunto.trim().length < 3) {
			mostrarAviso('El asunto necesita al menos 3 caracteres.');
			return;
		}
		if (correoCuerpo.trim().length < 3) {
			mostrarAviso('El mensaje necesita al menos 3 caracteres.');
			return;
		}

		enviandoCorreo = true;
		try {
			// Gmail API si hay una cuenta conectada (mantiene el hilo); si no,
			// el backend usa la cuenta SMTP predeterminada.
			const ticket = await enviarCorreoTicket(detalle.id, {
				para,
				asunto: correoAsunto.trim(),
				cuerpo: correoCuerpo.trim(),
				cuentaGmailId: cuentasGmail[0]?.id,
				guardarEnHistorial: true
			});
			aplicarTicket(ticket);
			correoPara = '';
			correoAsunto = '';
			correoCuerpo = '';
			correoAbierto = false;
			mostrarAviso('Correo enviado y registrado en el historial del ticket.');
			await cargarLista(true);
		} catch (error) {
			mostrarAviso(textoError(error));
		} finally {
			enviandoCorreo = false;
		}
	}

	async function agregarParticipanteDetalle(valor: string) {
		if (!detalle || !valor) return;
		const [tipo, id] = valor.split(':');
		try {
			const ticket =
				tipo === 'AREA'
					? await agregarParticipante(detalle.id, { tipo: 'AREA', areaId: Number(id) })
					: await agregarParticipante(detalle.id, { tipo: 'USUARIO', usuarioId: id });
			aplicarTicket(ticket);
			mostrarAviso('Participante agregado. Se le otorgó acceso al ticket.');
			await cargarLista(true);
		} catch (e) {
			mostrarAviso(textoError(e));
		}
	}

	async function quitarParticipanteDetalle(participante: ParticipanteTicket) {
		if (!detalle) return;
		const confirmado = await confirmar({
			titulo: 'Quitar participante',
			mensaje: `¿Quitar a ${participante.nombre} del ticket? Se conserva el historial.`,
			tono: 'peligro',
			etiquetaConfirmar: 'Quitar'
		});
		if (!confirmado) return;
		try {
			const ticket = await quitarParticipante(detalle.id, participante.id);
			aplicarTicket(ticket);
			mostrarAviso('Participante dado de baja.');
			await cargarLista(true);
		} catch (e) {
			mostrarAviso(textoError(e));
		}
	}

	function abrirNuevo() {
		errorNuevo = '';
		menciones = [];
		menuMencionesAbierto = false;
		consultaMencion = '';
		rangoMencion = null;
		fechaModo = 'ninguna';
		fechaDias = null;
		servicioSeleccionado = null;
		serviciosEncontrados = [];
		busquedaServicio = '';
		servicioMenuAbierto = false;
		if (timerBusquedaServicio) clearTimeout(timerBusquedaServicio);
		nuevo = {
			tipoOrigen: 'INTERNO',
			titulo: '',
			descripcion: '',
			categoriaId: null,
			prioridad: 'NORMAL',
			areaResponsableId: null,
			usuarioAsignadoId: null,
			areaSolicitanteId: null,
			fechaLimite: '',
			servicioId: null,
			periodoCobranzaId: null,
			referenciaTexto: '',
			areasInvolucradas: [],
			usuariosInvolucrados: []
		};
		modalNuevo = true;
	}

	function miembrosDeArea(areaId: number): string[] {
		return catalogos.usuarios
			.filter((usuarioOpcion) => usuarioOpcion.areaId === areaId)
			.map((usuarioOpcion) => usuarioOpcion.nombre);
	}

	function crearChipMencion(opcion: OpcionMencionNueva): HTMLSpanElement {
		const chip = document.createElement('span');
		chip.className = `mencion-chip ${opcion.tipo === 'AREA' ? 'area' : 'usuario'}`;
		chip.contentEditable = 'false';
		chip.dataset.mencion = '1';
		chip.dataset.tipo = opcion.tipo;
		chip.dataset.id = String(opcion.id);
		chip.dataset.nombre = opcion.nombre;
		if (opcion.areaId !== null) chip.dataset.areaId = String(opcion.areaId);
		if (opcion.areaNombre) chip.dataset.areaNombre = opcion.areaNombre;
		if (opcion.tipo === 'AREA') {
			chip.title = `Área ${opcion.nombre} · ${miembrosDeArea(Number(opcion.id)).join(', ') || 'sin usuarios'}`;
		} else {
			chip.title = opcion.areaNombre ? `Usuario · ${opcion.areaNombre}` : 'Usuario';
		}

		const nombre = document.createElement('span');
		nombre.className = 'mencion-nombre';
		nombre.textContent = `@${opcion.nombre}`;
		chip.append(nombre);
		if (opcion.tipo === 'AREA') {
			const cuenta = document.createElement('span');
			cuenta.className = 'mencion-count';
			cuenta.textContent = String(miembrosDeArea(Number(opcion.id)).length);
			chip.append(cuenta);
		}
		const quitar = document.createElement('span');
		quitar.className = 'mencion-x';
		quitar.textContent = '×';
		quitar.title = 'Quitar mención';
		quitar.addEventListener('mousedown', (evento) => {
			evento.preventDefault();
			evento.stopPropagation();
			chip.remove();
			sincronizarMenciones();
			actualizarDescripcion();
			enfocarMenciones();
		});
		chip.append(quitar);
		return chip;
	}

	function sincronizarMenciones() {
		const chips = mencionesRef
			? [...mencionesRef.querySelectorAll<HTMLElement>('[data-mencion]')]
			: [];
		const lista: MencionNueva[] = chips.map((chip) => ({
			tipo: chip.dataset.tipo === 'AREA' ? 'AREA' : 'USUARIO',
			id: chip.dataset.tipo === 'AREA' ? Number(chip.dataset.id) : String(chip.dataset.id),
			nombre: chip.dataset.nombre ?? '',
			areaId: chip.dataset.areaId ? Number(chip.dataset.areaId) : null,
			areaNombre: chip.dataset.areaNombre ?? null
		}));
		menciones = lista;
		const areas = lista.filter((mencion) => mencion.tipo === 'AREA');
		const usuarios = lista.filter((mencion) => mencion.tipo === 'USUARIO');
		const areaResponsable = areas[0]?.areaId ?? usuarios[0]?.areaId ?? null;
		nuevo.areaResponsableId = areaResponsable ? Number(areaResponsable) : null;
		nuevo.usuarioAsignadoId = usuarios[0] ? String(usuarios[0].id) : null;
		nuevo.areasInvolucradas = areas.slice(1).map((mencion) => Number(mencion.id));
		nuevo.usuariosInvolucrados = usuarios.slice(1).map((mencion) => String(mencion.id));

		for (const chip of chips) {
			chip.classList.remove('area-responsable', 'usuario-asignado');
		}
		if (areas[0]) {
			chips
				.find((chip) => chip.dataset.tipo === 'AREA' && chip.dataset.id === String(areas[0].id))
				?.classList.add('area-responsable');
		}
		if (usuarios[0]) {
			chips
				.find(
					(chip) => chip.dataset.tipo === 'USUARIO' && chip.dataset.id === String(usuarios[0].id)
				)
				?.classList.add('usuario-asignado');
		}
	}

	function posicionarMenuMenciones(rango: Range) {
		const rect = rango.getBoundingClientRect();
		const campo = mencionesRef?.getBoundingClientRect();
		const ancho = 330;
		const alto = 300;
		let left = rect.width || rect.height ? rect.left : (campo?.left ?? 20);
		let top = rect.width || rect.height ? rect.bottom + 6 : (campo?.top ?? 20) + 30;
		if (left + ancho > window.innerWidth - 8) left = window.innerWidth - ancho - 8;
		if (top + alto > window.innerHeight - 8) {
			top = Math.max(8, (rect.top || campo?.top || 20) - alto - 6);
		}
		menuMencionesPos = { top: Math.max(8, top), left: Math.max(8, left) };
	}

	function cerrarMenuMenciones() {
		menuMencionesAbierto = false;
		consultaMencion = '';
		rangoMencion = null;
	}

	function alEscribirMenciones() {
		sincronizarMenciones();
		actualizarDescripcion();
		const seleccion = window.getSelection();
		if (!seleccion || seleccion.rangeCount === 0) return cerrarMenuMenciones();
		const rango = seleccion.getRangeAt(0);
		if (!rango.collapsed) return cerrarMenuMenciones();
		let nodo = rango.startContainer;
		let offset = rango.startOffset;
		if (nodo.nodeType !== Node.TEXT_NODE && nodo.nodeType === Node.ELEMENT_NODE) {
			const hijo = nodo.childNodes[Math.max(0, Math.min(offset, nodo.childNodes.length - 1))];
			if (hijo && hijo.nodeType === Node.TEXT_NODE) {
				nodo = hijo;
				offset = hijo.textContent?.length ?? 0;
			}
		}
		if (nodo.nodeType !== Node.TEXT_NODE) return cerrarMenuMenciones();
		const anterior = (nodo.textContent ?? '').slice(0, offset);
		const coincidencia = /(?:^|\s)@([\p{L}\p{N}_\- ]{0,40})$/u.exec(anterior);
		if (!coincidencia) return cerrarMenuMenciones();
		const consulta = coincidencia[1];
		consultaMencion = consulta.trim();
		const inicio = offset - consulta.length - 1;
		const seleccionMencion = document.createRange();
		seleccionMencion.setStart(nodo, inicio);
		seleccionMencion.setEnd(nodo, offset);
		rangoMencion = seleccionMencion.cloneRange();
		posicionarMenuMenciones(seleccionMencion);
		menuMencionesIndice = 0;
		menuMencionesAbierto = true;
	}

	function alPresionarMenciones(evento: KeyboardEvent) {
		if (!menuMencionesAbierto) {
			if (evento.key === 'Backspace') {
				// El input posterior sincroniza si el navegador borró un chip.
				queueMicrotask(sincronizarMenciones);
			}
			return;
		}
		if (evento.key === 'ArrowDown') {
			evento.preventDefault();
			menuMencionesIndice = (menuMencionesIndice + 1) % Math.max(opcionesMencionTicket.length, 1);
			return;
		}
		if (evento.key === 'ArrowUp') {
			evento.preventDefault();
			menuMencionesIndice =
				(menuMencionesIndice - 1 + Math.max(opcionesMencionTicket.length, 1)) %
				Math.max(opcionesMencionTicket.length, 1);
			return;
		}
		if (evento.key === 'Enter' || evento.key === 'Tab') {
			evento.preventDefault();
			const opcion = opcionesMencionTicket[menuMencionesIndice];
			if (opcion) insertarMencionTicket(opcion);
			return;
		}
		if (evento.key === 'Escape') {
			evento.preventDefault();
			cerrarMenuMenciones();
		}
	}

	function insertarMencionTicket(opcion: OpcionMencionNueva) {
		const seleccion = window.getSelection();
		if (!seleccion) return;
		const rango = rangoMencion ?? (seleccion.rangeCount > 0 ? seleccion.getRangeAt(0) : null);
		if (!rango) return;
		rango.deleteContents();
		const chip = crearChipMencion(opcion);
		rango.insertNode(chip);
		const espacio = document.createTextNode(' ');
		chip.after(espacio);
		const nuevoRango = document.createRange();
		nuevoRango.setStartAfter(espacio);
		nuevoRango.collapse(true);
		seleccion.removeAllRanges();
		seleccion.addRange(nuevoRango);
		cerrarMenuMenciones();
		sincronizarMenciones();
		actualizarDescripcion();
		enfocarMenciones();
	}

	function enfocarMenciones() {
		mencionesRef?.focus();
	}

	function actualizarDescripcion() {
		const raiz = mencionesRef;
		if (!raiz) {
			nuevo.descripcion = '';
			return;
		}
		let salida = '';
		const recorrer = (nodo: Node) => {
			if (nodo.nodeType === Node.TEXT_NODE) {
				salida += nodo.textContent ?? '';
				return;
			}
			if (nodo.nodeType !== Node.ELEMENT_NODE) return;
			const elemento = nodo as HTMLElement;
			if (elemento.dataset.mencion) {
				salida += `@${elemento.dataset.nombre ?? ''}`;
				return;
			}
			if (elemento.tagName === 'BR') {
				salida += '\n';
				return;
			}
			for (const hijo of elemento.childNodes) recorrer(hijo);
			if (elemento.tagName === 'DIV' || elemento.tagName === 'P') salida += '\n';
		};
		for (const hijo of raiz.childNodes) recorrer(hijo);
		nuevo.descripcion = salida.replace(/\n{3,}/g, '\n\n').trim();
	}

	function posicionarMenuServicio() {
		const rect = servicioInputRef?.getBoundingClientRect();
		if (!rect) return;
		const ancho = Math.max(rect.width, 280);
		let left = rect.left;
		let top = rect.bottom + 4;
		if (left + ancho > window.innerWidth - 8) left = window.innerWidth - ancho - 8;
		if (top + 300 > window.innerHeight - 8) top = Math.max(8, rect.top - 300 - 4);
		servicioMenuPos = { top: Math.max(8, top), left: Math.max(8, left), width: ancho };
	}

	function programarBusquedaServicio() {
		if (timerBusquedaServicio) clearTimeout(timerBusquedaServicio);
		if (busquedaServicio.trim().length < 2) {
			serviciosEncontrados = [];
			servicioMenuAbierto = false;
			return;
		}
		timerBusquedaServicio = setTimeout(() => void buscarServicio(), 250);
	}

	function aplicarFechaPreset(dias: number) {
		const fecha = new Date();
		fecha.setDate(fecha.getDate() + dias);
		fecha.setHours(18, 0, 0, 0);
		fechaModo = 'preset';
		fechaDias = dias;
		nuevo.fechaLimite = fechaLocalInput(fecha.toISOString());
	}

	function activarFechaPersonalizada() {
		fechaModo = 'personalizado';
		fechaDias = null;
	}

	function quitarFechaLimite() {
		fechaModo = 'ninguna';
		fechaDias = null;
		nuevo.fechaLimite = '';
	}

	function validarNuevo(): boolean {
		errorNuevo = '';
		if (nuevo.titulo.trim().length < 3) {
			errorNuevo = 'El título es obligatorio (mínimo 3 caracteres).';
			return false;
		}
		if (nuevo.descripcion.trim().length < 3) {
			errorNuevo = 'La descripción es obligatoria.';
			return false;
		}
		if (!nuevo.areaResponsableId) {
			errorNuevo =
				menciones.length === 0
					? 'Escribí @ y elegí al menos un área o usuario responsable.'
					: 'El usuario mencionado no tiene área. Mencioná un área responsable.';
			return false;
		}
		if (nuevo.tipoOrigen === 'SERVICIO' && !nuevo.servicioId) {
			errorNuevo = 'Un ticket vinculado a un servicio necesita un servicio.';
			return false;
		}
		return true;
	}

	async function crearNuevo() {
		if (!validarNuevo()) return;
		guardandoNuevo = true;
		errorNuevo = '';
		try {
			const datos: NuevoTicketDatos = {
				tipoOrigen: nuevo.tipoOrigen,
				titulo: nuevo.titulo.trim(),
				descripcion: nuevo.descripcion.trim(),
				categoriaId: nuevo.categoriaId,
				prioridad: nuevo.prioridad,
				areaResponsableId: nuevo.areaResponsableId!,
				usuarioAsignadoId: nuevo.usuarioAsignadoId,
				areaSolicitanteId: nuevo.areaSolicitanteId,
				fechaLimite: fechaMontevideoAISO(nuevo.fechaLimite),
				servicioId: nuevo.tipoOrigen === 'SERVICIO' ? nuevo.servicioId : null,
				periodoCobranzaId: nuevo.periodoCobranzaId,
				referenciaTexto: nuevo.referenciaTexto.trim() || null,
				areasInvolucradas: nuevo.areasInvolucradas,
				usuariosInvolucrados: nuevo.usuariosInvolucrados
			};
			const ticket = await crearTicket(datos);
			modalNuevo = false;
			aplicarTicket(ticket);
			tab = 'conversacion';
			await cargarLista(true);
			mostrarAviso(`Ticket ${ticket.codigo} creado y abierto.`);
		} catch (e) {
			errorNuevo = textoError(e);
		} finally {
			guardandoNuevo = false;
		}
	}

	async function buscarServicio() {
		if (busquedaServicio.trim().length < 2) {
			serviciosEncontrados = [];
			servicioMenuAbierto = false;
			return;
		}
		buscandoServicio = true;
		posicionarMenuServicio();
		servicioMenuAbierto = true;
		try {
			serviciosEncontrados = await buscarServiciosTickets(busquedaServicio);
			posicionarMenuServicio();
		} catch (e) {
			errorNuevo = textoError(e);
		} finally {
			buscandoServicio = false;
		}
	}

	function elegirServicio(servicio: ServicioBuscadoTicket) {
		servicioSeleccionado = servicio;
		nuevo.servicioId = servicio.id;
		servicioMenuAbierto = false;
		serviciosEncontrados = [];
		busquedaServicio = servicio.nombreFantasia ?? servicio.nombre;
	}

	function limpiarFiltros() {
		busqueda = '';
		filtroEstado = 'activos';
		filtroPrioridad = '';
		filtroArea = '';
		filtroOrigen = '';
		soloNoLeidas = false;
	}

	// --------------------------------------------------------- Enlace profundo

	function firmaEnlace(codigo: string) {
		return `${codigo}|${page.url.searchParams.get('n') ?? ''}`;
	}

	let enlaceProcesado = '';

	$effect(() => {
		const pedido = page.url.searchParams.get('ticket');
		if (!pedido || cargando) return;
		const firma = firmaEnlace(pedido);
		if (firma === enlaceProcesado) return;
		const destino = tickets.find((t) => t.codigo === pedido);
		if (!destino) return;
		enlaceProcesado = firma;
		if (seleccionadoId !== destino.id) void seleccionarTicket(destino.id);
	});

	onMount(() => {
		(async () => {
			try {
				const [lista, catalogosCargados, gmail, preferenciaExtender] = await Promise.all([
					listarTickets(),
					listarCatalogosTickets(),
					listarCuentasGmailTickets(),
					leerPreferencia('extender-chat')
				]);
				tickets = lista;
				catalogos = catalogosCargados;
				cuentasGmail = gmail;
				extenderChat = preferenciaExtender === 'true';
				ultimaActualizacion = new Date();
				await tick();
				const pedido = page.url.searchParams.get('ticket');
				const destino = pedido ? (lista.find((t) => t.codigo === pedido) ?? null) : null;
				if (destino) {
					enlaceProcesado = firmaEnlace(pedido!);
					await seleccionarTicket(destino.id);
				} else if (!pedido && !extenderChat && lista.length > 0) {
					const primero = ticketsFiltrados[0] ?? lista[0];
					await seleccionarTicket(primero.id);
				}
			} catch (e) {
				error = textoError(e);
			} finally {
				cargando = false;
			}
		})();

		const intervalo = setInterval(refrescarSilencioso, 12000);
		return () => clearInterval(intervalo);
	});
</script>

<svelte:head>
	<title>Centro de tickets · FacturaPro</title>
</svelte:head>

<div class="pantalla-tickets">
	<header class="cabecera-pagina">
		<div>
			<h1>Centro de tickets</h1>
			<p class="bajada">Coordina solicitudes entre áreas y usuarios con trazabilidad completa.</p>
		</div>
		<div class="acciones-pagina">
			<span class="live" title="Actualización automática cada 12 segundos">
				<i></i>
				{#if ultimaActualizacion}
					Actualizado {hora(ultimaActualizacion.toISOString())}
				{:else}
					Conectando…
				{/if}
			</span>

			<label class="check-inline" title="Oculta la barra de filtros y le da más alto al chat">
				<input
					type="checkbox"
					checked={extenderChat}
					onchange={(evento) => cambiarExtenderChat(evento.currentTarget.checked)}
				/>
				Extender chat
			</label>

			<button type="button" class="btn primario" onclick={abrirNuevo}>
				{@html iconos.agregar}
				Nuevo ticket
			</button>
		</div>
	</header>

	<div class="filtros-caja">
		{#if !extenderChat}
			<div class="filtros" transition:slide={{ duration: 220 }}>
				<div class="filtros-fila">
					<label class="buscador">
						{@html iconos.buscar}
						<input
							type="search"
							bind:value={busqueda}
							placeholder="Buscar por ID, título, servicio, cliente o usuario…"
							autocomplete="off"
						/>
					</label>
					<ChipSelect tamano="normal" etiqueta="Estado" valor={filtroEstado} placeholder="Todos los activos" opciones={[{ valor: 'activos', etiqueta: 'Todos los activos' }, { valor: '', etiqueta: 'Todos' }, ...Object.entries(ESTADOS).map(([clave, estado]) => ({ valor: clave, etiqueta: estado.etiqueta }))]} onchange={(valor) => (filtroEstado = valor)} ariaLabel="Filtrar por estado" />
					<ChipSelect tamano="normal" etiqueta="Prioridad" valor={filtroPrioridad} placeholder="Todas" opciones={[{ valor: '', etiqueta: 'Todas' }, ...Object.entries(PRIORIDADES).map(([clave, prioridad]) => ({ valor: clave, etiqueta: prioridad.etiqueta }))]} onchange={(valor) => (filtroPrioridad = valor)} ariaLabel="Filtrar por prioridad" />
					<ChipSelect tamano="normal" etiqueta="Área" valor={filtroArea} placeholder="Todas" opciones={[{ valor: '', etiqueta: 'Todas' }, ...catalogos.areas.map((area) => ({ valor: String(area.id), etiqueta: area.nombre }))]} onchange={(valor) => (filtroArea = valor)} ariaLabel="Filtrar por área" />
					<div class="filtro-origen">
						<ChipSelect tamano="normal" etiqueta="Origen" valor={filtroOrigen} placeholder="Todos" opciones={[{ valor: '', etiqueta: 'Todos' }, { valor: 'SERVICIO', etiqueta: 'Vinculado a servicio' }, { valor: 'INTERNO', etiqueta: 'Interno' }]} onchange={(valor) => (filtroOrigen = valor)} ariaLabel="Filtrar por origen" />
					</div>
					<label class="check-inline" title="Con respuestas sin leer">
						<input type="checkbox" bind:checked={soloNoLeidas} />
						Sin leer
					</label>
					<button type="button" class="limpiar" onclick={limpiarFiltros}>Limpiar filtros</button>
				</div>
			</div>
		{/if}
	</div>

	<div class="workspace">
		<section class="columna lista-col" aria-label="Lista de tickets">
			<div class="lista-cab">
				<span>
					<strong>{ticketsFiltrados.length}</strong>
					{ticketsFiltrados.length === 1 ? 'ticket' : 'tickets'}
					· {hayFiltros ? 'filtros activos' : 'prioridad y vencimiento'}
				</span>
				<span class="orden">{@html iconos.orden} Orden</span>
			</div>
			<div class="lista-scroll">
				{#if cargando}
					{#each [1, 2, 3, 4] as esqueleto}
						<div class="esqueleto-card">
							<span class="esqueleto linea corta"></span>
							<span class="esqueleto linea alta"></span>
							<span class="esqueleto linea media"></span>
							<span class="esqueleto chips"></span>
						</div>
					{/each}
				{:else if error}
					<div class="estado-vacio error">
						<span class="icono-grande">{@html iconos.alerta}</span>
						<strong>No pudimos cargar los tickets</strong>
						<p>{error}</p>
						<button type="button" class="btn" onclick={() => cargarLista()}>Reintentar</button>
					</div>
				{:else if ticketsFiltrados.length === 0}
					<div class="estado-vacio">
						<span class="icono-grande">{@html iconos.ticket}</span>
						<strong>{tickets.length === 0 ? 'Todavía no hay tickets' : 'No hay coincidencias'}</strong>
						<p>
							{tickets.length === 0
								? 'Creá el primer ticket para coordinar una gestión interna o vincularlo a un servicio.'
								: 'Probá con otro filtro o limpiá los filtros para ver todos los tickets.'}
						</p>
						{#if tickets.length === 0}
							<button type="button" class="btn primario" onclick={abrirNuevo}>Nuevo ticket</button>
						{:else}
							<button type="button" class="btn" onclick={limpiarFiltros}>Limpiar filtros</button>
						{/if}
					</div>
				{:else}
					{#each ticketsFiltrados as ticket (ticket.id)}
						{@const plazo = estadoPlazo(ticket)}
						<button
							type="button"
							class="ticket-card"
							class:seleccionado={seleccionadoId === ticket.id}
							class:vencido={plazo.clase === 'vencido'}
							onclick={() => seleccionarTicket(ticket.id)}
						>
							<div class="tc-top">
								<span class="tc-id">{ticket.codigo}</span>
								<span class="chip estado {ESTADOS[ticket.estado].clase}">
									{#if ticket.estado === 'RESUELTO'}{@html iconos.tilda}{:else}<span class="punto"></span>{/if}
									{ESTADOS[ticket.estado].etiqueta}
								</span>
								<span class="chip origen {ticket.tipoOrigen === 'SERVICIO' ? 'servicio' : 'interno'}">
									{ticket.tipoOrigen === 'SERVICIO' ? 'Servicio' : 'Interno'}
								</span>
								<span class="mini-avatares">
									{#each participantesActivos(ticket).slice(0, 4) as participante}
										{#if participante.tipo === 'AREA'}
											<span class="area-avatar" title={`Área ${participante.nombre}`}>
												{@html iconos.edificio}
											</span>
										{:else}
											<span class="avatar sm {avatarClase(participante.usuarioId)}" title={participante.nombre}>
												{inicialesDe(participante.nombre)}
											</span>
										{/if}
									{/each}
								</span>
							</div>
							<h3>{ticket.titulo}</h3>
							<p class="tc-referencia">
								{#if ticket.servicio}
									<span class="tc-ref-texto">
										{@html iconos.servicio}
										<span class="tc-ref-label">{ticket.servicio.cliente} · {ticket.servicio.nombre}</span>
									</span>
								{:else}
									<span class="tc-ref-texto">
										{@html iconos.etiqueta}
										<span class="tc-ref-label">{ticket.categoria?.nombre ?? 'Ticket interno'}</span>
									</span>
								{/if}
								<span class="chip prioridad {PRIORIDADES[ticket.prioridad].clase}">
									{#if ticket.prioridad === 'URGENTE'}{@html iconos.alerta}{/if}
									{PRIORIDADES[ticket.prioridad].etiqueta}
								</span>
							</p>
						</button>
					{/each}
				{/if}
			</div>
		</section>

		<section class="columna detalle-col" aria-label="Detalle del ticket">
			{#if cargandoDetalle}
				<div class="detalle-esqueleto">
					<span class="esqueleto linea corta"></span>
					<span class="esqueleto linea alta"></span>
					<span class="esqueleto linea media"></span>
					<span class="esqueleto bloque"></span>
					<span class="esqueleto bloque chico"></span>
				</div>
			{:else if errorDetalle}
				<div class="estado-vacio error">
					<span class="icono-grande">{@html iconos.alerta}</span>
					<strong>No pudimos abrir el ticket</strong>
					<p>{errorDetalle}</p>
					{#if seleccionadoId}
						<button type="button" class="btn" onclick={() => cargarDetalle(seleccionadoId!)}>
							Reintentar
						</button>
					{/if}
				</div>
			{:else if !detalle}
				<div class="estado-vacio detalle-vacio">
					<span class="icono-grande">{@html iconos.ticket}</span>
					<strong>Seleccioná un ticket</strong>
					<p>Elegí un ticket de la lista para ver su contexto, conversación y auditoría.</p>
					<button type="button" class="btn" onclick={abrirNuevo}>Crear un ticket nuevo</button>
				</div>
			{:else}
				<div class="detalle-scroll" bind:this={detalleScroll}>
					<header class="detalle-cabecera">
						<div class="detalle-sup">
							<div class="detalle-titulo">
								<div class="detalle-id">
									<span class="id">{detalle.codigo}</span>
									<button
										type="button"
										class="mini-btn"
										title="Copiar identificador"
										aria-label="Copiar identificador"
										onclick={() => {
											navigator.clipboard
												?.writeText(detalle!.codigo)
												.then(() => mostrarAviso('Identificador copiado.'))
												.catch(() => mostrarAviso(detalle!.codigo));
										}}
									>
										{@html iconos.copiar}
									</button>
									<span class="tipo">
										{detalle.tipoOrigen === 'SERVICIO' ? 'Ticket vinculado a servicio' : 'Ticket interno'}
									</span>
								</div>
								<h2>{detalle.titulo}</h2>
								<div class="detalle-meta">
									<span>Creado por <b>{detalle.creadoPor.nombre}</b> · {formatearFechaHora(detalle.fechaCreacion)}</span>
									<span class="sep">|</span>
									<span>Última actualización <b>{formatearFechaHora(detalle.fechaActualizacion)}</b></span>
								</div>
							</div>
							<div class="detalle-acciones-cab">
								<div class="menu-wrap">
									<button
										type="button"
										class="icono-btn chico"
										aria-label="Más acciones"
										title="Más acciones"
										onclick={() => (menuAbierto = !menuAbierto)}
									>
										{@html iconos.puntos}
									</button>
									{#if menuAbierto}
										<div class="menu-flotante">
											<button type="button" onclick={() => { menuAbierto = false; tab = 'auditoria'; }}>
												{@html iconos.escudo} Ver auditoría
											</button>
											{#if detalle.permisos.validar}
												<button type="button" onclick={() => { menuAbierto = false; validarSolucion(); }}>
													{@html iconos.checkCirculo} Validar solución
												</button>
											{/if}
											{#if detalle.permisos.resolver}
												<button type="button" onclick={() => { menuAbierto = false; abrirResolver(); }}>
													{@html iconos.tilda} Marcar resuelto…
												</button>
											{/if}
											{#if detalle.permisos.cerrar}
												<button type="button" onclick={() => { menuAbierto = false; modoCierre = 'CERRAR'; motivoCierre = ''; modalCierre = true; }}>
													{@html iconos.candado} Cerrar ticket…
												</button>
											{/if}
											{#if detalle.permisos.cancelar}
												<button type="button" class="peligro" onclick={() => { menuAbierto = false; modoCierre = 'CANCELAR'; motivoCierre = ''; modalCierre = true; }}>
													{@html iconos.equis} Cancelar ticket…
												</button>
											{/if}
										</div>
									{/if}
								</div>
							</div>
						</div>
						<div class="detalle-chips">
							<span class="chip estado {ESTADOS[detalle.estado].clase}">
								{#if detalle.estado === 'RESUELTO'}{@html iconos.tilda}{:else}<span class="punto"></span>{/if}
								{ESTADOS[detalle.estado].etiqueta}
							</span>
							<span class="chip prioridad {PRIORIDADES[detalle.prioridad].clase}">
								{PRIORIDADES[detalle.prioridad].etiqueta}
							</span>
							<span class="chip origen {detalle.tipoOrigen === 'SERVICIO' ? 'servicio' : 'interno'}">
								{detalle.tipoOrigen === 'SERVICIO' ? 'Vinculado a servicio' : 'Interno'}
							</span>
							{#if detalle.fechaLimite}
								<span class="chip plazo {estadoPlazo(detalle).clase}">
									{@html iconos.reloj} {estadoPlazo(detalle).texto}
								</span>
							{:else}
								<span class="chip plazo sin">Sin fecha límite</span>
							{/if}
						</div>
					</header>

					<div class="acciones-ticket">
						<label class="campo-inline">
							<span>Estado</span>
							<select
								value={detalle.estado}
								disabled={guardandoDetalle || !detalle.permisos.cambiarEstado}
								onchange={(evento) => {
									const valor = evento.currentTarget.value;
									evento.currentTarget.value = detalle!.estado;
									cambiarEstado(valor);
								}}
							>
								{#each Object.entries(ESTADOS) as [clave, estado]}
									<option value={clave}>{estado.etiqueta}</option>
								{/each}
							</select>
						</label>
						<label class="campo-inline">
							<span>Prioridad</span>
							<select
								value={detalle.prioridad}
								disabled={guardandoDetalle || !detalle.permisos.cambiarPrioridad}
								onchange={(evento) => {
									const valor = evento.currentTarget.value as PrioridadTicket;
									patchTicket({ prioridad: valor }, `Prioridad ${PRIORIDADES[valor].etiqueta}.`);
								}}
							>
								{#each Object.entries(PRIORIDADES) as [clave, prioridad]}
									<option value={clave}>{prioridad.etiqueta}</option>
								{/each}
							</select>
						</label>
						<label class="campo-inline">
							<span>Área</span>
							<select
								value={String(detalle.areaResponsable.id)}
								disabled={guardandoDetalle || !detalle.permisos.cambiarArea}
								onchange={(evento) => {
									const areaId = Number(evento.currentTarget.value);
									patchTicket({ areaResponsableId: areaId }, 'Área responsable actualizada.');
								}}
							>
								{#each catalogos.areas as area}
									<option value={String(area.id)}>{area.nombre}</option>
								{/each}
							</select>
						</label>
						<label class="campo-inline">
							<span>Asignado</span>
							<select
								value={detalle.usuarioAsignado?.id ?? ''}
								disabled={guardandoDetalle || !detalle.permisos.asignar}
								onchange={(evento) => {
									const valor = evento.currentTarget.value;
									patchTicket(
										{ usuarioAsignadoId: valor || null },
										valor ? 'Usuario asignado actualizado.' : 'Ticket sin usuario asignado.'
									);
								}}
							>
								<option value="">Sin asignar</option>
								{#each catalogos.usuarios as usuarioOpcion}
									<option value={usuarioOpcion.id}>{usuarioOpcion.nombre}</option>
								{/each}
							</select>
						</label>
						<button
							type="button"
							class="btn suave"
							disabled={guardandoDetalle ||
								!detalle.permisos.asignar ||
								detalle.usuarioAsignado?.id === usuarioId}
							onclick={asignarme}
						>
							{@html iconos.usuario}
							Asignarme
						</button>
						{#if detalle.permisos.validar}
							<button type="button" class="btn" disabled={guardandoDetalle} onclick={validarSolucion}>
								{@html iconos.checkCirculo}
								Validar
							</button>
						{/if}
					</div>

					{#if conflicto}
						<div class="conflicto">
							{@html iconos.alerta}
							<div>
								<strong>Otro usuario actualizó el ticket.</strong>
								Se muestra la versión más reciente; revisá antes de volver a guardar.
								<button type="button" class="btn chico" onclick={() => (conflicto = null)}>Entendido</button>
							</div>
						</div>
					{/if}

					<div class="aviso-plazo {estadoPlazo(detalle).clase}">
						{@html iconos.reloj}
						{#if detalle.fechaLimite}
							<span>
								<b>{formatearFechaHora(detalle.fechaLimite)}</b>
								· {estadoPlazo(detalle).texto}.
								{#if detalle.fechaLimite && new Date(detalle.fechaLimite).getTime() < Date.now()}
									Cambiar una fecha vencida exige motivo.
								{/if}
							</span>
						{:else}
							<span><b>Sin fecha límite.</b> La define el creador según la urgencia.</span>
						{/if}
						{#if detalle.permisos.fechaLimite}
							<button
								type="button"
								class="btn chico"
								onclick={() => {
									fechaTexto = fechaLocalInput(detalle!.fechaLimite);
									motivoFecha = '';
									modalFecha = true;
								}}
							>
								{detalle.fechaLimite ? 'Cambiar fecha' : 'Definir fecha'}
							</button>
						{/if}
					</div>

					{#if detalle.espera}
						<div class="aviso-info">
							{@html iconos.arroba}
							<span>
								Se espera respuesta de
								<b>{detalle.espera.area?.nombre ?? detalle.espera.usuario?.nombre ?? 'un área'}</b>
								{#if detalle.espera.detalle}· {detalle.espera.detalle}{/if}
							</span>
						</div>
					{/if}

					<nav class="tabs-detalle" aria-label="Secciones del ticket">
						<button type="button" class="tab-btn" class:activa={tab === 'conversacion'} onclick={() => (tab = 'conversacion')}>
							Conversación <span class="n">{detalle.mensajes.length}</span>
						</button>
						<button type="button" class="tab-btn" class:activa={tab === 'contexto'} onclick={() => (tab = 'contexto')}>
							Contexto
						</button>
						<button type="button" class="tab-btn" class:activa={tab === 'auditoria'} onclick={() => (tab = 'auditoria')}>
							Auditoría
						</button>
						<button type="button" class="tab-btn" class:activa={tab === 'correo'} onclick={() => (tab = 'correo')}>
							Correo <span class="n">{detalle.correos.length}</span>
						</button>
					</nav>

					{#if tab === 'conversacion'}
						<ConversacionTicket mensajes={detalle.mensajes} usuarioId={usuarioId}>
							{#snippet children()}
							{#if detalle && detalle.estado === 'RESUELTO' && detalle.resolucion}
								<div class="resolucion-bloque">
									{@html iconos.checkCirculo}
									<div>
										<strong>Resolución registrada</strong>
										<p>{detalle.resolucion}</p>
										{#if detalle.validadoEn}
											<small>Validada por {detalle.validadoPor?.nombre ?? 'un participante'} · {formatearFechaHora(detalle.validadoEn)}</small>
										{/if}
										<div class="acciones-resolucion">
											{#if detalle.permisos.validar && !detalle.validadoEn}
												<button type="button" class="btn chico primario" onclick={validarSolucion}>
													Validar solución
												</button>
											{/if}
											{#if detalle.permisos.cerrar}
												<button
													type="button"
													class="btn chico"
													onclick={() => {
														modoCierre = 'CERRAR';
														motivoCierre = detalle!.resolucion ?? '';
														modalCierre = true;
													}}
												>
													Cerrar ticket
												</button>
											{:else}
												<span class="texto-suave">El cierre lo realiza el creador del ticket.</span>
											{/if}
										</div>
									</div>
								</div>
							{/if}
							{/snippet}
						</ConversacionTicket>
					{:else if tab === 'contexto'}
						<div class="contexto-panel">
							{#if detalle.servicio}
								<article class="referencia">
									<div class="referencia-cab">
										<span>{@html iconos.servicio} Servicio relacionado</span>
										<span class="vence">El vínculo se conserva si el seguimiento se cierra</span>
									</div>
									<div class="referencia-cuerpo">
										<div>
											<span class="ref-label">Cliente</span>
											<div class="ref-cliente">{detalle.servicio.cliente}</div>
											<div class="ref-servicio">
												<b>Servicio #{detalle.servicio.id}</b>
												· {detalle.servicio.nombre}
												{#if detalle.servicio.numeracion}· {detalle.servicio.numeracion}{/if}
											</div>
											{#if detalle.facturas.length > 0}
												<div class="ref-chips">
													{#each detalle.facturas as factura}
														<span class="chip">
															<b>{factura.serie}-{factura.numero}</b> · {factura.moneda} {factura.saldoPendiente}
														</span>
													{/each}
												</div>
											{/if}
											<div class="ref-acciones">
												{#if puedeAbrirModulo('servicios')}
													<a class="btn chico" href="/servicios">{@html iconos.exterior} Abrir servicio</a>
												{:else}
													<span class="texto-suave">Sin acceso al módulo Servicios.</span>
												{/if}
												{#if puedeAbrirModulo('cobranza') && !detalle.seguimiento && !detalle.periodo}
													<a class="btn chico" href="/cobranza">{@html iconos.flecha} Abrir seguimiento</a>
												{/if}
											</div>
										</div>
										<div class="ref-seguimiento">
											<span class="ref-label">Seguimiento de cobranza</span>
											{#if detalle.seguimiento}
												<div class="seg-linea">
													{detalle.seguimiento.codigo}
													<span class="chip plazo"><span class="punto"></span>Vinculado</span>
												</div>
												<a class="btn chico" href={`/seguimientos?seg=${detalle.seguimiento.id}`}>{@html iconos.flecha} Abrir caso</a>
											{:else if detalle.periodo}
												<div class="seg-linea">
													{detalle.periodo.periodo}
													<span class="chip plazo"><span class="punto"></span>Vinculado</span>
												</div>
												{#if puedeAbrirModulo('cobranza')}
													<a class="btn chico" href="/cobranza">{@html iconos.flecha} Abrir seguimiento</a>
												{/if}
											{:else}
												<div class="seg-linea">Sin seguimiento asociado</div>
											{/if}
											<div class="ref-nota">
												El ticket conserva la referencia aunque la cobranza se cierre.
											</div>
										</div>
									</div>
								</article>
							{:else}
								<article class="referencia interna">
									<div class="referencia-cab">
										<span>{@html iconos.etiqueta} Ticket interno</span>
										<span class="vence">Sin cliente ni servicio</span>
									</div>
									<div class="ref-interno-grid">
										<div>
											<span class="ref-label">Categoría</span>
											<span class="valor">{detalle.categoria?.nombre ?? 'Sin categoría'}</span>
										</div>
										<div>
											<span class="ref-label">Área solicitante</span>
											<span class="valor">{detalle.areaSolicitante?.nombre ?? 'Sin área'}</span>
										</div>
										<div>
											<span class="ref-label">Referencia</span>
											<span class="valor">{detalle.referenciaTexto ?? 'Sin referencia escrita'}</span>
										</div>
									</div>
								</article>
							{/if}

							<section class="participantes">
								<div class="part-cab">
									<strong>Participantes y responsabilidad</strong>
									<span>Una sola área responsable · las menciones no reasignan</span>
								</div>
								<div class="part-grid">
									<div class="part-item">
										<div class="part-label">{@html iconos.corona} Área responsable</div>
										<div class="part-valor">
											<span class="chip area">{@html iconos.edificio} {detalle.areaResponsable.nombre}</span>
											<span class="tag-responsable">Responsable</span>
										</div>
									</div>
									<div class="part-item">
										<div class="part-label">{@html iconos.usuario} Usuario asignado</div>
										<div class="part-valor">
											{#if detalle.usuarioAsignado}
												<span class="avatar sm {avatarClase(detalle.usuarioAsignado.id)}">
													{inicialesDe(detalle.usuarioAsignado.nombre)}
												</span>
												{detalle.usuarioAsignado.nombre}
											{:else}
												<span class="sin-asignar">Sin asignar</span>
											{/if}
										</div>
									</div>
									<div class="part-item">
										<div class="part-label">{@html iconos.usuarios} Áreas involucradas</div>
										<div class="part-valor">
											{#each areasInvolucradas(detalle) as participante}
												<span class="chip area">
													@{participante.nombre}
													{#if detalle.permisos.agregarParticipantes}
														<button type="button" class="chip-x" title="Quitar área" onclick={() => quitarParticipanteDetalle(participante)}>×</button>
													{/if}
												</span>
											{:else}
												<span class="texto-suave">Sin áreas involucradas</span>
											{/each}
										</div>
									</div>
									<div class="part-item">
										<div class="part-label">{@html iconos.arroba} Usuarios involucrados</div>
										<div class="part-valor">
											{#each usuariosInvolucrados(detalle) as participante}
												<span class="chip usuario">
													<span class="avatar sm {avatarClase(participante.usuarioId)}">{inicialesDe(participante.nombre)}</span>
													@{participante.nombre}
													{#if detalle.permisos.agregarParticipantes}
														<button type="button" class="chip-x" title="Quitar usuario" onclick={() => quitarParticipanteDetalle(participante)}>×</button>
													{/if}
												</span>
											{:else}
												<span class="texto-suave">Sin usuarios involucrados</span>
											{/each}
										</div>
									</div>
								</div>
								{#if detalle.permisos.agregarParticipantes}
									<div class="mention-add">
										{@html iconos.arroba}
										<select
											value=""
											onchange={(evento) => {
												const valor = evento.currentTarget.value;
												evento.currentTarget.value = '';
												agregarParticipanteDetalle(valor);
											}}
										>
											<option value="">Mencionar un área o usuario…</option>
											<optgroup label="Áreas">
												{#each catalogos.areas as area}
													<option value={`AREA:${area.id}`}>{area.nombre}</option>
												{/each}
											</optgroup>
											<optgroup label="Usuarios">
												{#each catalogos.usuarios as usuarioOpcion}
													<option value={`USUARIO:${usuarioOpcion.id}`}>
														{usuarioOpcion.nombre}{usuarioOpcion.areaNombre ? ` · ${usuarioOpcion.areaNombre}` : ''}
													</option>
												{/each}
											</optgroup>
										</select>
										<span class="legal">Da acceso y notifica · no cambia al responsable</span>
									</div>
								{/if}
							</section>

							{#if detalle.ticketRelacionado}
								<article class="referencia relacionada">
									<div class="referencia-cab">
										<span>{@html iconos.enlace} Ticket relacionado</span>
										<span class="vence">{detalle.tipoRelacion ?? 'Relacionado'}</span>
									</div>
									<div class="relacion-cuerpo">
										<button type="button" class="relacion-link" onclick={() => seleccionarTicket(detalle!.ticketRelacionado!.id)}>
											{detalle.ticketRelacionado.codigo} · {detalle.ticketRelacionado.titulo}
										</button>
									</div>
								</article>
							{/if}
						</div>
					{:else if tab === 'auditoria'}
						<div class="auditoria">
							<div class="audit-cab">
								<strong>Auditoría completa</strong>
								<span>Todo cambio queda registrado con usuario, fecha y hora</span>
							</div>
							<table class="tabla-audit">
								<thead>
									<tr><th>Fecha y hora</th><th>Usuario</th><th>Evento</th><th>Antes</th><th>Después</th></tr>
								</thead>
								<tbody>
									{#each detalle.eventos as evento (evento.id)}
										<tr>
											<td>{formatearFechaHora(evento.fechaHora)}</td>
											<td><b>{evento.usuarioNombre ?? 'Sistema'}</b></td>
											<td>{ETIQUETAS_EVENTO[evento.tipoEvento] ?? evento.tipoEvento}</td>
											<td class="antes">{evento.valorAnterior ?? '—'}</td>
											<td class="despues">{evento.valorNuevo ?? '—'}</td>
										</tr>
									{/each}
								</tbody>
							</table>
							<div class="audit-nota">
								<b>No se borra nada en silencio.</b> Los mensajes no se eliminan desde la interfaz.
								Los cambios de estado, prioridad, área, asignación y fecha límite quedan auditados.
							</div>
						</div>
					{:else if tab === 'correo'}
						<div class="correo-panel">
							<div class="correo-conexion">
								<span class="icono-correo">{@html iconos.correo}</span>
								<div>
									<b>Correo del ticket</b>
									<span>Los envíos guardan el hilo y el Message-ID para localizar la cadena.</span>
								</div>
							</div>
							<div class="correo-acciones">
								<button
									type="button"
									class="btn suave chico"
									disabled={!detalle.permisos.enviarCorreo}
									onclick={() => (correoAbierto = !correoAbierto)}
								>
									{correoAbierto ? 'Cancelar' : 'Redactar correo'}
								</button>
								{#if !detalle.permisos.enviarCorreo}
									<span class="correo-nota">El ticket está cerrado: no admite correos.</span>
								{/if}
							</div>

							{#if correoAbierto}
								<div class="correo-form">
									<label class="campo">
										<span>Para (separados por coma)</span>
										<input bind:value={correoPara} placeholder="cliente@ejemplo.com" autocomplete="off" />
									</label>
									<label class="campo">
										<span>Asunto</span>
										<input bind:value={correoAsunto} maxlength="250" />
									</label>
									<label class="campo">
										<span>Mensaje</span>
										<textarea bind:value={correoCuerpo} rows="5"></textarea>
									</label>
									<div class="correo-form-acciones">
										<button
											type="button"
											class="btn primario chico"
											onclick={enviarCorreoDetalle}
											disabled={enviandoCorreo}
										>
											{enviandoCorreo ? 'Enviando…' : 'Enviar correo'}
										</button>
									</div>
								</div>
							{/if}

							{#if detalle.correos.length === 0}
								<div class="estado-vacio compacto">
									<span class="icono-grande">{@html iconos.correo}</span>
									<strong>Sin correos todavía</strong>
									<p>Redactá el primer correo. Las respuestas se incorporan al historial cuando el conector de Gmail esté configurado.</p>
								</div>
							{:else}
								<div class="correo-lista">
									{#each detalle.correos as correo (correo.id)}
										<div class="correo-item">
											<span class="correo-dir" class:entrada={correo.direccion === 'ENTRANTE'}>
												{#if correo.direccion === 'ENTRANTE'}{@html iconos.responder}{:else}{@html iconos.enviar}{/if}
											</span>
											<div>
												<div class="asunto">{correo.asunto ?? '(Sin asunto)'}</div>
												<div class="detalle">
													{#if correo.direccion === 'ENTRANTE'}De{:else}Para{/if}
													{correo.direccion === 'ENTRANTE' ? correo.de : correo.para}
													{#if correo.threadId} · hilo {correo.threadId}{/if}
												</div>
											</div>
											<span class="fecha">{formatearFechaHora(correo.fecha)}</span>
										</div>
									{/each}
								</div>
							{/if}
							<div class="audit-nota">
								La ingesta automática de respuestas de Gmail requiere configurar el conector
								(<code>/api/webhooks/tickets/[id]/correo</code>) y su secreto compartido.
								Mientras tanto, los correos salientes quedan registrados con fecha, hora y Message-ID.
							</div>
						</div>
					{/if}
				</div>

				{#if tab === 'conversacion'}
					{#key detalle.id}
						<CompositorTicket
							ticket={detalle}
							{usuario}
							areas={catalogos.areas}
							usuarios={catalogos.usuarios}
							{cuentasGmail}
							onEnviar={enviarRespuestaChat}
							onAviso={mostrarAviso}
							onEnviado={alEnviarRespuesta}
						/>
					{/key}
				{/if}
			{/if}
		</section>
	</div>
</div>

<!-- ================================================== Modal nuevo ticket -->
{#if modalNuevo}
	<div
		class="overlay"
		role="dialog" tabindex="-1"
		aria-modal="true"
		aria-label="Nuevo ticket"
		onclick={(evento) => {
			if (evento.target === evento.currentTarget) modalNuevo = false;
		}}
		onkeydown={(evento) => {
			if (evento.key === 'Escape') modalNuevo = false;
		}}
	>
		<div class="modal ancho modal-ticket">
			<header class="modal-cab">
				<div>
					<p class="kicker">NUEVO TICKET</p>
					<h2>Crear ticket</h2>
					<p>Completá la información en una sola pantalla. Los campos con * son obligatorios.</p>
				</div>
				<button type="button" class="cerrar-modal" aria-label="Cerrar" onclick={() => (modalNuevo = false)}>
					{@html iconos.equis}
				</button>
			</header>

			<div class="crear-ticket">
				<div class="crear-principal">
					<section class="bloque">
						<div class="bloque-cab">
							<h3>Tipo de ticket</h3>
							<span class="pista">Define el contexto</span>
						</div>
						<div class="tipo-grid compacta">
							<button
								type="button"
								class="tipo-card"
								class:seleccionado={nuevo.tipoOrigen === 'SERVICIO'}
								onclick={() => (nuevo.tipoOrigen = 'SERVICIO')}
							>
								<span class="icono">{@html iconos.servicio}</span>
								<b>Vinculado a un servicio</b>
								<span>Conserva cliente, seguimiento y facturas de referencia.</span>
							</button>
							<button
								type="button"
								class="tipo-card interno"
								class:seleccionado={nuevo.tipoOrigen === 'INTERNO'}
								onclick={() => {
									nuevo.tipoOrigen = 'INTERNO';
									servicioMenuAbierto = false;
								}}
							>
								<span class="icono">{@html iconos.etiqueta}</span>
								<b>Interno</b>
								<span>Consultas, autorizaciones o coordinación entre áreas.</span>
							</button>
						</div>

						{#if nuevo.tipoOrigen === 'SERVICIO'}
							<div class="buscar-servicio">
								<input
									bind:this={servicioInputRef}
									bind:value={busquedaServicio}
									placeholder="Escribí el nombre, código o RUT del servicio…"
									oninput={programarBusquedaServicio}
									onfocus={() => {
										if (serviciosEncontrados.length > 0) {
											posicionarMenuServicio();
											servicioMenuAbierto = true;
										}
									}}
									onblur={() => setTimeout(() => (servicioMenuAbierto = false), 150)}
									onkeydown={(evento) => {
										if (evento.key === 'Enter') {
											evento.preventDefault();
											buscarServicio();
										}
									}}
								/>
								<button type="button" class="btn" disabled={buscandoServicio} onclick={buscarServicio}>
									{@html iconos.buscar}
									{buscandoServicio ? 'Buscando…' : 'Buscar'}
								</button>
							</div>
							{#if servicioSeleccionado}
								<div class="servicio-elegido">
									<span class="icono">{@html iconos.servicio}</span>
									<div>
										<b>{servicioSeleccionado.cliente}</b>
										<span>
											{servicioSeleccionado.nombreFantasia ?? servicioSeleccionado.nombre}
											{servicioSeleccionado.numeracion ? `· ${servicioSeleccionado.numeracion}` : ''}
										</span>
									</div>
									<button
										type="button"
										class="btn chico"
										onclick={() => {
											servicioSeleccionado = null;
											nuevo.servicioId = null;
											busquedaServicio = '';
										}}
									>
										Cambiar
									</button>
								</div>
							{:else}
								<p class="pista">
									Mientras escribís se filtran los servicios; elegí uno del listado o usá Buscar.
								</p>
							{/if}
						{:else}
							<div class="form-grid">
								<label class="campo">
									<span>Área solicitante</span>
									<select
										value={nuevo.areaSolicitanteId ?? ''}
										onchange={(evento) =>
											(nuevo.areaSolicitanteId = evento.currentTarget.value
												? Number(evento.currentTarget.value)
												: null)}
									>
										<option value="">Sin área solicitante</option>
										{#each catalogos.areas as area}
											<option value={area.id}>{area.nombre}</option>
										{/each}
									</select>
								</label>
								<label class="campo">
									<span>Proceso o asunto</span>
									<input
										bind:value={nuevo.referenciaTexto}
										maxlength="2000"
										placeholder="Ej.: Parametrización de plazo de pago"
									/>
								</label>
							</div>
						{/if}
					</section>

					<section class="bloque">
						<div class="bloque-cab">
							<h3>Información principal</h3>
							<span class="pista">Obligatorios *</span>
						</div>
						<div class="form-grid">
							<label class="campo full">
								<span>Título *</span>
								<input bind:value={nuevo.titulo} maxlength="200" placeholder="Ej.: Revisar diferencia de saldo" />
							</label>
							<div class="campo full">
								<span id="mensaje-ticket-label">Mensaje *</span>
								<div
									class="menciones-campo mensaje-campo"
									bind:this={mencionesRef}
									contenteditable="true"
									role="textbox"
									tabindex="0"
									aria-multiline="true"
									aria-labelledby="mensaje-ticket-label"
									data-placeholder="Escribí el mensaje… usá @ para mencionar"
									oninput={alEscribirMenciones}
									onkeydown={alPresionarMenciones}
									onblur={() => setTimeout(cerrarMenuMenciones, 150)}
								></div>
								<small>
									Escribí @ para mencionar áreas o usuarios. La primera área es la responsable; el
									primer usuario, el asignado.
								</small>
							</div>
						</div>
					</section>
				</div>

				<aside class="crear-lateral">
					<section class="bloque">
						<div class="bloque-cab">
							<h3>Clasificación y responsable</h3>
							<span class="pista">Asignación</span>
						</div>
						<div class="form-grid lateral">
							<label class="campo">
								<span>Categoría</span>
								<select
									value={nuevo.categoriaId ?? ''}
									onchange={(evento) =>
										(nuevo.categoriaId = evento.currentTarget.value
											? Number(evento.currentTarget.value)
											: null)}
								>
									<option value="">Sin categoría</option>
									{#each catalogos.categorias as categoria}
										<option value={categoria.id}>{categoria.nombre}</option>
									{/each}
								</select>
							</label>
							<label class="campo">
								<span>Prioridad</span>
								<select
									value={nuevo.prioridad}
									onchange={(evento) =>
										(nuevo.prioridad = evento.currentTarget.value as PrioridadTicket)}
								>
									{#each Object.entries(PRIORIDADES) as [clave, prioridad]}
										<option value={clave}>{prioridad.etiqueta}</option>
									{/each}
								</select>
							</label>
							</div>
					</section>

					<section class="bloque">
						<div class="bloque-cab">
							<h3>Fecha límite</h3>
							<span class="pista">Opcional</span>
						</div>
						<div class="fecha-presets">
							{#each DIAS_PRESET as dias}
								<button
									type="button"
									class="fecha-btn"
									class:activo={fechaModo === 'preset' && fechaDias === dias}
									onclick={() => aplicarFechaPreset(dias)}
								>
									{dias} día{dias === 1 ? '' : 's'}
								</button>
							{/each}
						</div>
						<button
							type="button"
							class="fecha-btn personalizado"
							class:activo={fechaModo === 'personalizado'}
							onclick={activarFechaPersonalizada}
						>
							Personalizado
						</button>
						{#if fechaModo === 'personalizado'}
							<input type="datetime-local" bind:value={nuevo.fechaLimite} aria-label="Fecha límite personalizada" />
						{:else if fechaModo === 'preset'}
							<small>Vence {formatearFechaHora(fechaMontevideoAISO(nuevo.fechaLimite) ?? '')}</small>
						{:else}
							<small>Sin fecha por defecto; elegí un plazo o personalizá.</small>
						{/if}
						{#if fechaModo !== 'ninguna'}
							<button type="button" class="limpiar-fecha" onclick={quitarFechaLimite}>Quitar fecha</button>
						{/if}
					</section>

					<div class="mini-resumen">
						<span>Tipo</span>
						<b>{nuevo.tipoOrigen === 'SERVICIO' ? (servicioSeleccionado?.cliente ?? 'Servicio sin elegir') : 'Interno'}</b>
						<span>Responsable</span>
						<b>
							{catalogos.areas.find((a) => a.id === nuevo.areaResponsableId)?.nombre ?? 'Sin área'}
							{nuevo.usuarioAsignadoId
								? ` · ${catalogos.usuarios.find((u) => u.id === nuevo.usuarioAsignadoId)?.nombre ?? ''}`
								: ''}
						</b>
						<span>Prioridad</span>
						<b>{PRIORIDADES[nuevo.prioridad].etiqueta}</b>
					</div>
				</aside>
			</div>

			{#if servicioMenuAbierto}
				<div
					class="servicio-menu"
					style={`top:${servicioMenuPos.top}px; left:${servicioMenuPos.left}px; width:${servicioMenuPos.width}px;`}
					role="listbox"
					aria-label="Servicios encontrados"
				>
					{#if buscandoServicio}
						<p class="mencion-vacio">Buscando servicios…</p>
					{:else if serviciosEncontrados.length === 0}
						<p class="mencion-vacio">Sin coincidencias. Probá con otro nombre o RUT.</p>
					{:else}
						{#each serviciosEncontrados as servicio}
							<button
								type="button"
								class="servicio-op"
								onmousedown={(evento) => evento.preventDefault()}
								onclick={() => elegirServicio(servicio)}
							>
								<strong>{servicio.cliente}</strong>
								<span>
									{servicio.nombreFantasia ?? servicio.nombre}
									{servicio.numeracion ? `· ${servicio.numeracion}` : ''}
								</span>
							</button>
						{/each}
					{/if}
				</div>
			{/if}

			{#if menuMencionesAbierto}
				<div
					class="mencion-menu"
					style={`top:${menuMencionesPos.top}px; left:${menuMencionesPos.left}px;`}
					role="listbox"
					aria-label="Mencionar área o usuario"
				>
					{#if opcionesMencionTicket.length === 0}
						<p class="mencion-vacio">Sin coincidencias. Probá con otro nombre.</p>
					{:else}
						{#if opcionesMencionTicket.some((opcion) => opcion.tipo === 'AREA')}
							<div class="mencion-grupo">
								<span class="mencion-grupo-titulo">Áreas</span>
								{#each opcionesMencionTicket.filter((opcion) => opcion.tipo === 'AREA') as opcion}
									<button
										type="button"
										class="mencion-op"
										class:activa={menuMencionesIndice === opcionesMencionTicket.indexOf(opcion)}
										onmousedown={(evento) => evento.preventDefault()}
										onclick={() => insertarMencionTicket(opcion)}
									>
										<span class="mencion-icono">{@html iconos.edificio}</span>
										<span class="mencion-texto">
											<b>{opcion.nombre}</b>
											<small>{opcion.miembros} usuario{opcion.miembros === 1 ? '' : 's'}</small>
										</span>
									</button>
								{/each}
							</div>
						{/if}
						{#if opcionesMencionTicket.some((opcion) => opcion.tipo === 'USUARIO')}
							<div class="mencion-grupo">
								<span class="mencion-grupo-titulo">Usuarios</span>
								{#each opcionesMencionTicket.filter((opcion) => opcion.tipo === 'USUARIO') as opcion}
									<button
										type="button"
										class="mencion-op"
										class:activa={menuMencionesIndice === opcionesMencionTicket.indexOf(opcion)}
										onmousedown={(evento) => evento.preventDefault()}
										onclick={() => insertarMencionTicket(opcion)}
									>
										<span class="mencion-icono usuario">{@html iconos.usuario}</span>
										<span class="mencion-texto">
											<b>{opcion.nombre}</b>
											<small>{opcion.areaNombre ?? 'Sin área'}</small>
										</span>
									</button>
								{/each}
							</div>
						{/if}
					{/if}
					<div class="mencion-pie">↑↓ mover · Enter elegir · Esc cerrar</div>
				</div>
			{/if}

			{#if errorNuevo}
				<div class="aviso error error-ticket">{@html iconos.alerta} <span>{errorNuevo}</span></div>
			{/if}

			<footer class="modal-pie">
				<span class="nota-pie">Se crea con código continuo y se abre en el Centro de tickets.</span>
				<div class="acciones-wizard">
					<button type="button" class="btn" onclick={() => (modalNuevo = false)}>Cancelar</button>
					<button type="button" class="btn primario" disabled={guardandoNuevo} onclick={crearNuevo}>
						{@html iconos.tilda}
						{guardandoNuevo ? 'Creando…' : 'Crear ticket'}
					</button>
				</div>
			</footer>
		</div>
	</div>
{/if}

<!-- ==================================================== Modal resolver -->
{#if modalResolver}
	<div class="overlay" role="dialog" tabindex="-1" aria-modal="true" aria-label="Marcar resuelto">
		<div class="modal chico">
			<header class="modal-cab">
				<div>
					<p class="kicker">CAMBIO DE ESTADO</p>
					<h2>Marcar como resuelto</h2>
					<p>La resolución es obligatoria. Luego cualquier involucrado puede validarla y el creador cerrarla.</p>
				</div>
				<button type="button" class="cerrar-modal" aria-label="Cerrar" onclick={() => (modalResolver = false)}>
					{@html iconos.equis}
				</button>
			</header>
			<div class="modal-cuerpo">
				<label class="campo">
					<span>Resolución *</span>
					<textarea bind:value={resolucionTexto} rows="4" placeholder="Describí qué se hizo y cómo se validó…"></textarea>
				</label>
				<div class="aviso info">
					{@html iconos.info}
					<span>Cualquier usuario involucrado puede validar. Solo el creador puede cerrar definitivamente.</span>
				</div>
			</div>
			<footer class="modal-pie">
				<button type="button" class="btn" onclick={() => (modalResolver = false)}>Cancelar</button>
				<button type="button" class="btn primario" disabled={guardandoDetalle} onclick={confirmarResolver}>Confirmar resolución</button>
			</footer>
		</div>
	</div>
{/if}

<!-- ================================================= Modal cerrar/cancelar -->
{#if modalCierre}
	<div class="overlay" role="dialog" tabindex="-1" aria-modal="true" aria-label="Cerrar ticket">
		<div class="modal chico">
			<header class="modal-cab">
				<div>
					<p class="kicker">{modoCierre === 'CERRAR' ? 'CIERRE DEFINITIVO' : 'CANCELACIÓN'}</p>
					<h2>{modoCierre === 'CERRAR' ? 'Cerrar ticket' : 'Cancelar ticket'}</h2>
					<p>{modoCierre === 'CERRAR' ? 'El cierre requiere un resumen final. Solo el creador puede hacerlo.' : 'La cancelación requiere motivo. El historial queda disponible.'}</p>
				</div>
				<button type="button" class="cerrar-modal" aria-label="Cerrar" onclick={() => (modalCierre = false)}>
					{@html iconos.equis}
				</button>
			</header>
			<div class="modal-cuerpo">
				<label class="campo">
					<span>{modoCierre === 'CERRAR' ? 'Resumen final *' : 'Motivo *'}</span>
					<textarea bind:value={motivoCierre} rows="4" placeholder="Escribí el motivo…"></textarea>
				</label>
			</div>
			<footer class="modal-pie">
				<button type="button" class="btn" onclick={() => (modalCierre = false)}>Cancelar</button>
				<button type="button" class="btn primario" disabled={guardandoDetalle} onclick={confirmarCierre}>
					{modoCierre === 'CERRAR' ? 'Cerrar ticket' : 'Cancelar ticket'}
				</button>
			</footer>
		</div>
	</div>
{/if}

<!-- ===================================================== Modal espera -->
{#if modalEspera}
	<div class="overlay" role="dialog" tabindex="-1" aria-modal="true" aria-label="Esperando respuesta">
		<div class="modal chico">
			<header class="modal-cab">
				<div>
					<p class="kicker">CAMBIO DE ESTADO</p>
					<h2>Esperando respuesta</h2>
					<p>Indicá de quién se espera y qué se necesita para continuar.</p>
				</div>
				<button type="button" class="cerrar-modal" aria-label="Cerrar" onclick={() => (modalEspera = false)}>
					{@html iconos.equis}
				</button>
			</header>
			<div class="modal-cuerpo">
				<div class="form-grid">
					<label class="campo">
						<span>Área</span>
						<select bind:value={esperaAreaId}>
							<option value="">Sin área</option>
							{#each catalogos.areas as area}
								<option value={String(area.id)}>{area.nombre}</option>
							{/each}
						</select>
					</label>
					<label class="campo">
						<span>Usuario</span>
						<select bind:value={esperaUsuarioId}>
							<option value="">Sin usuario</option>
							{#each catalogos.usuarios as usuarioOpcion}
								<option value={usuarioOpcion.id}>{usuarioOpcion.nombre}</option>
							{/each}
						</select>
					</label>
				</div>
				<label class="campo">
					<span>¿Qué se espera? *</span>
					<textarea bind:value={esperaDetalle} rows="3" placeholder="Ej.: Confirmación del ajuste contable…"></textarea>
				</label>
			</div>
			<footer class="modal-pie">
				<button type="button" class="btn" onclick={() => (modalEspera = false)}>Cancelar</button>
				<button type="button" class="btn primario" disabled={guardandoDetalle} onclick={confirmarEspera}>Confirmar</button>
			</footer>
		</div>
	</div>
{/if}

<!-- ===================================================== Modal fecha -->
{#if modalFecha}
	<div class="overlay" role="dialog" tabindex="-1" aria-modal="true" aria-label="Fecha límite">
		<div class="modal chico">
			<header class="modal-cab">
				<div>
					<p class="kicker">FECHA LÍMITE</p>
					<h2>Actualizar fecha límite</h2>
					<p>Si la fecha actual ya venció, el motivo es obligatorio.</p>
				</div>
				<button type="button" class="cerrar-modal" aria-label="Cerrar" onclick={() => (modalFecha = false)}>
					{@html iconos.equis}
				</button>
			</header>
			<div class="modal-cuerpo">
				<label class="campo">
					<span>Fecha y hora</span>
					<input type="datetime-local" bind:value={fechaTexto} />
				</label>
				<label class="campo">
					<span>Motivo</span>
					<textarea bind:value={motivoFecha} rows="2" placeholder="Opcional si la fecha no venció…"></textarea>
				</label>
			</div>
			<footer class="modal-pie">
				<button type="button" class="btn" onclick={() => (modalFecha = false)}>Cancelar</button>
				<button type="button" class="btn primario" disabled={guardandoDetalle} onclick={confirmarFecha}>Guardar fecha</button>
			</footer>
		</div>
	</div>
{/if}

<style>
	.pantalla-tickets {
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
		height: calc(100dvh - 3.75rem - 4.25rem);
		min-height: 34rem;
		overflow: hidden;
	}

	/* Modo extendido: la barra sale del flujo con un barrido suave. */

	button { font: inherit; }
	.btn,
	.icono-btn,
	.ticket-card,
	.tipo-card,
	.mencion-op,
	.chip-x,
	.limpiar {
		cursor: pointer;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.38rem;
		min-height: 2.05rem;
		padding: 0.42rem 0.68rem;
		border: 1px solid var(--gris-200, var(--borde));
		border-radius: 0.62rem;
		background: var(--superficie);
		color: var(--texto-suave);
		font-size: 0.71rem;
		font-weight: 750;
		text-decoration: none;
		white-space: nowrap;
		transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
	}
	.btn:hover { background: var(--superficie-alta); border-color: var(--borde-fuerte); color: var(--indigo-700, var(--primario-texto)); }
	.btn:disabled { opacity: 0.5; cursor: not-allowed; }
	.btn.primario {
		border-color: transparent;
		background: var(--accion-gradiente);
		color: var(--texto-inverso);
		box-shadow: 0 8px 18px rgba(79, 70, 229, 0.22);
	}
	.btn.primario:hover { background: var(--accion-gradiente); color: var(--texto-inverso); }
	.btn.suave { border-color: var(--primario-borde); background: var(--primario-tenue); color: var(--primario-texto); }
	.btn.chico { min-height: 1.7rem; padding: 0.26rem 0.48rem; font-size: 0.65rem; border-radius: 0.5rem; }
	.btn :global(svg) { width: 1em; height: 1em; }

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

	.icono-btn {
		position: relative;
		display: grid;
		place-items: center;
		width: 2.3rem;
		height: 2.3rem;
		border: 1px solid var(--gris-200, var(--borde-suave));
		border-radius: 50%;
		background: var(--superficie);
		color: var(--texto);
		font-size: 1.05rem;
	}
	.icono-btn:hover { background: var(--superficie-alta); border-color: var(--borde); }
	.icono-btn.chico { width: 2rem; height: 2rem; }

	.cabecera-pagina { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
	.kicker { margin: 0.35rem 0 0; color: var(--texto-suave); font-size: 0.62rem; font-weight: 850; letter-spacing: 0.13em; }
	h1 { margin: 0.12rem 0 0.18rem; color: var(--texto); font-size: 1.85rem; letter-spacing: -0.03em; }
	.bajada { color: var(--texto-suave); font-size: 0.76rem; }
	.acciones-pagina { display: flex; align-items: center; gap: 0.55rem; padding-top: 0.2rem; }
	.live {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.36rem 0.55rem;
		border: 1px solid var(--exito-borde);
		border-radius: 99px;
		background: var(--exito-tenue);
		color: var(--exito-texto);
		font-size: 0.63rem;
		font-weight: 800;
		white-space: nowrap;
	}
	.live i { width: 0.42rem; height: 0.42rem; border-radius: 50%; background: var(--exito); box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.18); }

	.filtros { display: grid; gap: 0.4rem; padding: 0.55rem 0.65rem; border: 1px solid var(--borde); border-radius: 0.85rem; background: var(--superficie); box-shadow: 0 8px 22px rgba(49, 64, 129, 0.06); }
	.filtros-fila { display: flex; align-items: flex-end; gap: 0.4rem; flex-wrap: wrap; }
	.buscador { position: relative; flex: 1 1 8rem; min-width: 7rem; }
	.buscador :global(svg) { position: absolute; left: 0.6rem; top: 50%; width: 0.95rem; height: 0.95rem; color: var(--texto-tenue); transform: translateY(-50%); }
	.buscador input { width: 100%; height: 2.05rem; padding: 0 0.65rem 0 1.95rem; border: 1px solid var(--borde); border-radius: 0.55rem; background: var(--superficie-alta); color: var(--texto); font-size: 0.7rem; }
	.buscador input:focus { outline: 2px solid var(--foco); outline-offset: 1px; background: var(--superficie); }
	.filtro-origen { display: contents; }
	.check-inline { display: inline-flex; align-items: center; gap: 0.3rem; color: var(--texto-suave); font-size: 0.63rem; font-weight: 650; white-space: nowrap; cursor: pointer; }
	.check-inline input { width: 0.9rem; height: 0.9rem; accent-color: var(--foco); }
	.check-inline input:disabled { opacity: 0.45; cursor: not-allowed; }
	.limpiar { margin-left: auto; padding: 0.2rem 0.35rem; border: 0; background: transparent; color: var(--primario-texto); font-size: 0.63rem; font-weight: 750; }
	.limpiar:hover { text-decoration: underline; }

	.workspace { display: grid; grid-template-columns: minmax(20rem, 27rem) minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); gap: 0.7rem; flex: 1; min-height: 0; }
	.columna { display: flex; flex-direction: column; min-height: 0; overflow: hidden; border: 1px solid var(--borde); border-radius: 1rem; background: var(--superficie); box-shadow: 0 12px 30px rgba(49, 64, 129, 0.08); }
	.lista-cab { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.55rem 0.7rem; border-bottom: 1px solid var(--borde-suave); background: var(--superficie-alta); color: var(--texto-suave); font-size: 0.61rem; }
	.lista-cab strong { color: var(--texto); font-size: 0.7rem; }
	.orden { display: inline-flex; align-items: center; gap: 0.25rem; color: var(--texto-tenue); font-size: 0.58rem; }
	.orden :global(svg) { width: 0.8rem; height: 0.8rem; }
	.lista-scroll { display: flex; flex-direction: column; gap: 0.4rem; flex: 1; min-height: 0; padding: 0.5rem; overflow-y: auto; }
	.ticket-card { position: relative; display: block; width: 100%; padding: 0.6rem 0.6rem 0.5rem 0.75rem; border: 1px solid var(--borde-suave); border-radius: 0.7rem; background: var(--superficie); color: var(--texto); text-align: left; transition: background 130ms ease, border-color 130ms ease, box-shadow 130ms ease; }
	.ticket-card:hover { background: var(--superficie-alta); border-color: var(--primario-borde); }
	.ticket-card.seleccionado { border-color: var(--primario); background: var(--superficie-alta); box-shadow: 0 0 0 1px var(--primario), 0 8px 18px rgba(79, 70, 229, 0.1); }
	.ticket-card.seleccionado::before { content: ''; position: absolute; left: -1px; top: 0.5rem; bottom: 0.5rem; width: 3px; border-radius: 0 3px 3px 0; background: var(--primario); }
	.ticket-card.vencido:not(.seleccionado) { border-left: 3px solid var(--peligro); }
	.tc-top { display: flex; align-items: center; gap: 0.25rem; flex-wrap: wrap; }
	.tc-id { color: var(--primario-texto); font-size: 0.6rem; font-weight: 850; letter-spacing: 0.02em; }
	.ticket-card.vencido .tc-id { color: var(--peligro-texto); }
	.ticket-card h3 { margin: 0.13rem 0 0.2rem; color: var(--texto); font-size: 0.82rem; font-weight: 750; line-height: 1.3; }
	.tc-referencia { display: flex; align-items: center; gap: 0.35rem; margin: 0; color: var(--texto-suave); font-size: 0.59rem; line-height: 1.25; }
	.tc-ref-texto { display: flex; align-items: center; gap: 0.25rem; flex: 1; min-width: 0; }
	.tc-ref-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.tc-ref-texto :global(svg) { width: 0.75rem; height: 0.75rem; color: var(--texto-tenue); flex: 0 0 auto; }
	.tc-referencia .chip.prioridad { margin-left: auto; flex: 0 0 auto; }
	.mini-avatares { display: inline-flex; align-items: center; margin-left: auto; padding-left: 0.4rem; }
	.mini-avatares .avatar { margin-left: -0.3rem; border: 2px solid var(--superficie); }
	.area-avatar { display: inline-grid; place-items: center; width: 1.35rem; height: 1.35rem; margin-left: -0.3rem; border: 2px solid var(--superficie); border-radius: 50%; background: var(--primario-tenue); color: var(--primario-texto); }
	.area-avatar :global(svg) { width: 0.68rem; height: 0.68rem; }
	.ticket-card.seleccionado .mini-avatares .avatar,
	.ticket-card.seleccionado .area-avatar { border-color: var(--superficie-alta); }

	.chip { display: inline-flex; align-items: center; gap: 0.2rem; padding: 0.12rem 0.36rem; border-radius: 99px; background: var(--superficie-suave); color: var(--texto-suave); font-size: 0.53rem; font-weight: 800; white-space: nowrap; }
	.chip :global(svg) { width: 0.65rem; height: 0.65rem; }
	.chip .punto { width: 0.32rem; height: 0.32rem; border-radius: 50%; background: currentColor; }
	.chip.estado.nuevo { background: var(--primario-tenue); color: var(--primario-texto); }
	.chip.estado.abierto { background: var(--peligro-tenue); color: var(--peligro-texto); }
	.chip.estado.proceso { background: var(--alerta-tenue); color: var(--alerta-texto); }
	.chip.estado.esperando { background: var(--info-tenue); color: var(--info-texto); }
	.chip.estado.resuelto { background: var(--exito-tenue); color: var(--exito-texto); }
	.chip.estado.cerrado { background: var(--superficie-suave); color: var(--texto-suave); }
	.chip.estado.cancelado { background: var(--peligro-tenue); color: var(--peligro-texto); }
	.chip.prioridad.baja { background: var(--superficie-suave); color: var(--texto-suave); }
	.chip.prioridad.normal { background: var(--primario-tenue); color: var(--primario-texto); }
	.chip.prioridad.alta { background: var(--alerta-tenue); color: var(--alerta-texto); }
	.chip.prioridad.urgente { background: var(--peligro-tenue); color: var(--peligro-texto); }
	.chip.origen.servicio { background: var(--primario-tenue); color: var(--primario-texto); }
	.chip.origen.interno { background: var(--primario-tenue); color: var(--primario-texto); }
	.chip.plazo { background: var(--alerta-tenue); color: var(--alerta-texto); }
	.chip.plazo.hoy { background: var(--peligro-tenue); color: var(--peligro-texto); }
	.chip.plazo.vencido { background: var(--peligro-tenue); color: var(--peligro-texto); }
	.chip.plazo.sin { background: var(--superficie-suave); color: var(--texto-suave); }
	.chip.area { border: 1px solid var(--primario-borde); background: var(--primario-tenue); color: var(--primario-texto); }
	.chip.usuario { padding: 0.1rem 0.3rem 0.1rem 0.1rem; border: 1px solid var(--borde-suave); background: var(--superficie); color: var(--texto); font-weight: 700; }
	.chip.usuario .avatar { width: 1.1rem; height: 1.1rem; font-size: 0.44rem; }
	.chip-x { margin-left: 0.1rem; padding: 0; border: 0; background: transparent; color: currentColor; font-size: 0.7rem; line-height: 1; }
	.tc-nuevas { padding: 0.1rem 0.34rem; border-radius: 99px; background: var(--primario); color: var(--texto-inverso); font-size: 0.53rem; font-weight: 800; }

	.esqueleto-card { display: grid; gap: 0.35rem; padding: 0.55rem; border: 1px solid var(--borde-suave); border-radius: 0.7rem; }
	.esqueleto { position: relative; display: block; overflow: hidden; height: 0.5rem; border-radius: 0.4rem; background: var(--superficie-suave); }
	.esqueleto::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, var(--superficie-panel), transparent); transform: translateX(-100%); animation: brillo 1.4s infinite; }
	.esqueleto.corta { width: 36%; }
	.esqueleto.media { width: 68%; }
	.esqueleto.alta { height: 0.68rem; }
	.esqueleto.chips { width: 55%; height: 1rem; border-radius: 99px; }
	.esqueleto.bloque { height: 4rem; }
	.esqueleto.bloque.chico { height: 2.5rem; }
	@keyframes brillo { to { transform: translateX(100%); } }

	.estado-vacio { display: grid; place-items: center; gap: 0.3rem; padding: 2rem 1rem; color: var(--texto-suave); text-align: center; }
	.estado-vacio.compacto { padding: 1.2rem 1rem; }
	.estado-vacio .icono-grande { display: grid; place-items: center; width: 3rem; height: 3rem; border-radius: 50%; background: var(--primario-tenue); color: var(--primario-texto); }
	.estado-vacio .icono-grande :global(svg) { width: 1.4rem; height: 1.4rem; }
	.estado-vacio strong { color: var(--texto); font-size: 0.78rem; }
	.estado-vacio p { max-width: 22rem; margin: 0; font-size: 0.63rem; line-height: 1.45; }
	.estado-vacio.error .icono-grande { background: var(--peligro-tenue); color: var(--peligro-texto); }
	.detalle-vacio { min-height: 20rem; }

	.detalle-col { position: relative; }
	.detalle-scroll { flex: 1; min-height: 0; overflow-y: auto; padding-bottom: 6.25rem; }
	.detalle-esqueleto { display: grid; gap: 0.6rem; padding: 1rem; }
	.detalle-cabecera { padding: 0.85rem 1rem 0.65rem; border-bottom: 1px solid var(--borde-suave); background: var(--superficie); }
	.detalle-sup { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.7rem; }
	.detalle-titulo { min-width: 0; }
	.detalle-id { display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap; }
	.detalle-id .id { color: var(--primario-texto); font-size: 0.7rem; font-weight: 850; letter-spacing: 0.03em; }
	.detalle-id .tipo { color: var(--texto-tenue); font-size: 0.6rem; font-weight: 700; }
	.mini-btn { display: grid; place-items: center; width: 1.3rem; height: 1.3rem; border: 0; border-radius: 0.35rem; background: transparent; color: var(--texto-tenue); }
	.mini-btn:hover { background: var(--superficie-suave); color: var(--primario-texto); }
	.mini-btn :global(svg) { width: 0.8rem; height: 0.8rem; }
	.detalle-cabecera h2 { margin: 0.3rem 0; color: var(--texto); font-size: 1.35rem; line-height: 1.25; letter-spacing: -0.02em; overflow-wrap: anywhere; }
	.detalle-meta { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; color: var(--texto-suave); font-size: 0.63rem; }
	.detalle-meta b { color: var(--texto-suave); font-weight: 750; }
	.detalle-meta .sep { color: var(--texto-tenue); }
	.detalle-acciones-cab { display: flex; align-items: center; gap: 0.3rem; flex: 0 0 auto; }
	.detalle-chips { display: flex; align-items: center; gap: 0.28rem; flex-wrap: wrap; margin-top: 0.4rem; }
	.menu-wrap { position: relative; }
	.menu-flotante { position: absolute; right: 0; top: calc(100% + 0.3rem); z-index: 40; display: grid; width: 14rem; padding: 0.3rem; border: 1px solid var(--borde); border-radius: 0.65rem; background: var(--superficie); box-shadow: 0 18px 40px rgba(15, 23, 42, 0.18); }
	.menu-flotante button { display: flex; align-items: center; gap: 0.4rem; width: 100%; padding: 0.4rem 0.45rem; border: 0; border-radius: 0.4rem; background: transparent; color: var(--texto); font-size: 0.67rem; text-align: left; }
	.menu-flotante button:hover { background: var(--superficie-alta); color: var(--primario-texto); }
	.menu-flotante button.peligro { color: var(--peligro-texto); }
	.menu-flotante button.peligro:hover { background: var(--peligro-tenue); }
	.menu-flotante :global(svg) { width: 0.85rem; height: 0.85rem; }

	.acciones-ticket { display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap; padding: 0.45rem 0.8rem; border-bottom: 1px solid var(--borde-suave); background: var(--superficie-alta); }
	.campo-inline { display: inline-flex; align-items: center; gap: 0.25rem; height: 1.85rem; padding: 0 0.35rem; border: 1px solid var(--borde); border-radius: 0.5rem; background: var(--superficie); }
	.campo-inline > span { color: var(--texto-tenue); font-size: 0.52rem; font-weight: 850; letter-spacing: 0.04em; text-transform: uppercase; }
	.campo-inline select { max-width: 8.5rem; border: 0; background: transparent; color: var(--texto); font-size: 0.65rem; font-weight: 750; outline: none; }
	.aviso-plazo { display: flex; align-items: center; gap: 0.4rem; margin: 0.5rem 0.8rem 0; padding: 0.4rem 0.55rem; border: 1px solid var(--alerta-borde); border-radius: 0.55rem; background: var(--alerta-tenue); color: var(--alerta-texto); font-size: 0.65rem; font-weight: 650; }
	.aviso-plazo > :global(svg) { width: 0.95rem; height: 0.95rem; flex: 0 0 auto; }
	.aviso-plazo.vencido { border-color: var(--peligro-borde); background: var(--peligro-tenue); color: var(--peligro-texto); }
	.aviso-plazo.ok { border-color: var(--exito-borde); background: var(--exito-tenue); color: var(--exito-texto); }
	.aviso-plazo.sin { border-color: var(--borde-suave); background: var(--superficie-alta); color: var(--texto-suave); }
	.aviso-plazo .btn { margin-left: auto; }
	.aviso-info { display: flex; align-items: flex-start; gap: 0.4rem; margin: 0.45rem 0.8rem 0; padding: 0.4rem 0.55rem; border: 1px solid var(--primario-borde); border-radius: 0.55rem; background: var(--primario-tenue); color: var(--primario-texto); font-size: 0.64rem; }
	.aviso-info :global(svg) { width: 0.9rem; height: 0.9rem; margin-top: 0.05rem; flex: 0 0 auto; }
	.conflicto { display: flex; align-items: flex-start; gap: 0.45rem; margin: 0.5rem 0.8rem 0; padding: 0.5rem 0.6rem; border: 1px solid var(--peligro-borde); border-radius: 0.55rem; background: var(--peligro-tenue); color: var(--peligro-texto); font-size: 0.64rem; line-height: 1.4; }
	.conflicto :global(svg) { width: 0.95rem; height: 0.95rem; margin-top: 0.05rem; flex: 0 0 auto; }
	.conflicto .btn { margin-top: 0.3rem; }

	.tabs-detalle { display: flex; align-items: center; gap: 0.12rem; margin: 0.55rem 0.8rem 0; padding: 0.18rem; border: 1px solid var(--borde-suave); border-radius: 0.55rem; background: var(--superficie-alta); }
	.tab-btn { display: inline-flex; align-items: center; gap: 0.28rem; padding: 0.32rem 0.55rem; border: 0; border-radius: 0.42rem; background: transparent; color: var(--texto-suave); font-size: 0.64rem; font-weight: 750; }
	.tab-btn:hover { color: var(--primario-texto); }
	.tab-btn.activa { background: var(--superficie); color: var(--primario-texto); box-shadow: 0 2px 6px rgba(15, 23, 42, 0.08); }
	.tab-btn .n { padding: 0 0.25rem; border-radius: 99px; background: var(--superficie-suave); color: var(--texto-suave); font-size: 0.53rem; font-weight: 800; }
	.tab-btn.activa .n { background: var(--primario-tenue); color: var(--primario-texto); }

	.resolucion-bloque { display: flex; align-items: flex-start; gap: 0.5rem; margin: 0.4rem 0 0.2rem; padding: 0.55rem 0.65rem; border: 1px solid var(--exito-borde); border-radius: 0.65rem; background: var(--exito-tenue); color: var(--exito-texto); font-size: 0.67rem; line-height: 1.45; }
	.resolucion-bloque > :global(svg) { width: 1rem; height: 1rem; margin-top: 0.05rem; flex: 0 0 auto; }
	.resolucion-bloque strong { display: block; font-size: 0.65rem; }
	.resolucion-bloque p { margin: 0.15rem 0; }
	.resolucion-bloque small { color: var(--exito-texto); font-size: 0.55rem; }
	.acciones-resolucion { display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap; margin-top: 0.35rem; }
	.texto-suave { color: var(--texto-tenue); font-size: 0.58rem; }

	.mencion-grupo { padding: 0.25rem 0; }
	.mencion-grupo + .mencion-grupo { border-top: 1px solid var(--borde-suave); }
	.mencion-op { display: flex; align-items: center; gap: 0.35rem; width: 100%; padding: 0.32rem 0.55rem; border: 0; background: transparent; color: var(--texto); font-size: 0.66rem; text-align: left; }
	.mencion-op:hover { background: var(--primario-tenue); color: var(--primario-texto); }
	.mencion-vacio { margin: 0; padding: 0.6rem; color: var(--texto-tenue); font-size: 0.6rem; text-align: center; }
	.menciones-campo {
		min-height: 3.1rem;
		max-height: 8rem;
		overflow: auto;
		padding: 0.5rem 0.55rem;
		border: 1px solid var(--borde);
		border-radius: 0.55rem;
		background: var(--superficie);
		color: var(--texto);
		font-size: 0.72rem;
		line-height: 1.9;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.menciones-campo:focus { outline: 2px solid var(--foco); outline-offset: 1px; }
	.menciones-campo:empty::before { content: attr(data-placeholder); color: var(--texto-tenue); }
	.mensaje-campo { min-height: 6rem; max-height: 12rem; }
	.servicio-menu {
		position: fixed;
		z-index: 140;
		max-height: 17rem;
		overflow: auto;
		border: 1px solid var(--borde);
		border-radius: 0.7rem;
		background: var(--superficie);
		box-shadow: 0 22px 55px rgba(15, 23, 42, 0.2);
	}
	.servicio-op {
		display: grid;
		gap: 0.1rem;
		width: 100%;
		padding: 0.45rem 0.6rem;
		border: 0;
		border-bottom: 1px solid var(--borde-suave);
		background: transparent;
		text-align: left;
	}
	.servicio-op:last-child { border-bottom: 0; }
	.servicio-op:hover { background: var(--primario-tenue); }
	.servicio-op strong { color: var(--texto); font-size: 0.68rem; }
	.servicio-op span { color: var(--texto-suave); font-size: 0.6rem; }	.mencion-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.18rem;
		margin: 0 0.12rem;
		padding: 0.08rem 0.35rem;
		border-radius: 999px;
		background: var(--primario-tenue);
		color: var(--primario-texto);
		font-size: 0.64rem;
		font-weight: 800;
		line-height: 1.5;
		vertical-align: baseline;
		user-select: none;
	}
	.mencion-chip.area { background: var(--info-tenue); color: var(--info-texto); }
	:global(.mencion-chip .mencion-count) {
		display: inline-grid;
		place-items: center;
		min-width: 1rem;
		height: 1rem;
		padding: 0 0.2rem;
		border-radius: 999px;
		background: rgba(7, 89, 133, 0.15);
		font-size: 0.52rem;
	}
	:global(.mencion-chip .mencion-x) { padding: 0 0.1rem; cursor: pointer; font-weight: 900; opacity: 0.55; }
	:global(.mencion-chip .mencion-x:hover) { color: var(--peligro-texto); opacity: 1; }
	.mencion-chip.area-responsable { box-shadow: inset 0 0 0 1px #0369a1; }
	.mencion-chip.usuario-asignado { box-shadow: inset 0 0 0 1px #4338ca; }
	.mencion-chip.area-responsable::after,
	.mencion-chip.usuario-asignado::after {
		margin-left: 0.2rem;
		font-size: 0.45rem;
		font-weight: 850;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		opacity: 0.75;
	}
	.mencion-chip.area-responsable::after { content: 'área resp.'; }
	.mencion-chip.usuario-asignado::after { content: 'asignado'; }
	.mencion-menu {
		position: fixed;
		z-index: 140;
		width: 20.5rem;
		max-height: 19rem;
		overflow: auto;
		border: 1px solid var(--borde);
		border-radius: 0.7rem;
		background: var(--superficie);
		box-shadow: 0 22px 55px rgba(15, 23, 42, 0.2);
	}
	.mencion-grupo-titulo {
		display: block;
		padding: 0.15rem 0.55rem;
		color: var(--texto-tenue);
		font-size: 0.5rem;
		font-weight: 850;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}
	.mencion-icono {
		display: grid;
		place-items: center;
		flex: 0 0 auto;
		width: 1.4rem;
		height: 1.4rem;
		border-radius: 0.4rem;
		background: var(--primario-tenue);
		color: var(--primario-texto);
		font-size: 0.75rem;
	}
	.mencion-icono.usuario { background: var(--primario-tenue); color: var(--primario-texto); }
	.mencion-texto { display: grid; gap: 0.02rem; min-width: 0; text-align: left; line-height: 1.2; }
	.mencion-texto b { color: var(--texto); font-size: 0.66rem; overflow: hidden; text-overflow: ellipsis; }
	.mencion-texto small { color: var(--texto-suave); font-size: 0.54rem; }
	.mencion-op.activa { background: var(--primario-tenue); }
	.mencion-pie { padding: 0.35rem 0.55rem; border-top: 1px solid var(--borde-suave); color: var(--texto-tenue); font-size: 0.52rem; text-align: center; }
	.fecha-presets { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.35rem; }
	.fecha-btn {
		padding: 0.45rem 0.4rem;
		border: 1px solid var(--borde);
		border-radius: 0.5rem;
		background: var(--superficie);
		color: var(--texto-suave);
		font-size: 0.66rem;
		font-weight: 750;
	}
	.fecha-btn:hover { border-color: var(--primario-borde); background: var(--superficie-alta); color: var(--primario-texto); }
	.fecha-btn.activo { border-color: var(--primario); background: var(--primario-tenue); color: var(--primario-texto); box-shadow: inset 0 0 0 1px var(--primario); }
	.fecha-btn.personalizado { width: 100%; margin-top: 0.35rem; }
	.limpiar-fecha { justify-self: start; padding: 0.1rem 0; border: 0; background: transparent; color: var(--peligro-texto); font-size: 0.58rem; font-weight: 750; }
	.contexto-panel { padding-bottom: 0.5rem; }
	.referencia { margin: 0.5rem 0.8rem 0; border: 1px solid var(--primario-borde); border-radius: 0.75rem; background: linear-gradient(120deg, var(--superficie-alta), var(--superficie-alta)); overflow: hidden; }
	.referencia.interna { border-color: var(--primario-borde); background: linear-gradient(120deg, var(--superficie-alta), var(--primario-tenue)); }
	.referencia.relacionada { border-color: var(--borde-suave); background: var(--superficie); }
	.referencia-cab { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.38rem 0.65rem; border-bottom: 1px solid var(--borde); color: var(--texto-suave); font-size: 0.55rem; font-weight: 850; letter-spacing: 0.07em; text-transform: uppercase; }
	.referencia-cab span { display: inline-flex; align-items: center; gap: 0.25rem; }
	.referencia-cab :global(svg) { width: 0.8rem; height: 0.8rem; color: var(--primario-texto); }
	.referencia-cab .vence { color: var(--texto-tenue); font-size: 0.54rem; font-weight: 650; letter-spacing: 0; text-transform: none; }
	.referencia-cuerpo { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr); gap: 0.65rem; padding: 0.55rem 0.65rem; }
	.ref-label { display: block; margin-bottom: 0.12rem; color: var(--texto-tenue); font-size: 0.53rem; font-weight: 850; letter-spacing: 0.06em; text-transform: uppercase; }
	.ref-cliente { color: var(--texto); font-size: 0.78rem; font-weight: 800; }
	.ref-servicio { color: var(--texto); font-size: 0.66rem; }
	.ref-servicio b { color: var(--primario-texto); }
	.ref-chips { display: flex; flex-wrap: wrap; gap: 0.22rem; margin-top: 0.3rem; }
	.ref-chips .chip { border: 1px solid var(--borde-suave); background: var(--superficie); color: var(--texto-suave); }
	.ref-acciones { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-top: 0.4rem; }
	.ref-seguimiento { padding-left: 0.6rem; border-left: 1px dashed var(--primario-borde); }
	.seg-linea { display: flex; align-items: center; gap: 0.3rem; color: var(--texto); font-size: 0.66rem; font-weight: 750; }
	.ref-nota { margin-top: 0.3rem; color: var(--texto-tenue); font-size: 0.55rem; line-height: 1.35; }
	.ref-interno-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.55rem; padding: 0.55rem 0.65rem; }
	.ref-interno-grid .valor { color: var(--texto); font-size: 0.68rem; font-weight: 700; }
	.relacion-cuerpo { padding: 0.55rem 0.65rem; }
	.relacion-link { border: 0; background: transparent; color: var(--primario-texto); font-size: 0.68rem; font-weight: 750; text-align: left; }
	.relacion-link:hover { text-decoration: underline; }

	.participantes { margin: 0.5rem 0.8rem 0; padding: 0.55rem 0.65rem; border: 1px solid var(--borde-suave); border-radius: 0.75rem; background: var(--superficie); }
	.part-cab { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.4rem; }
	.part-cab strong { color: var(--texto); font-size: 0.66rem; }
	.part-cab span { color: var(--texto-tenue); font-size: 0.56rem; }
	.part-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0.5rem 0.8rem; }
	.part-label { display: flex; align-items: center; gap: 0.22rem; margin-bottom: 0.14rem; color: var(--texto-tenue); font-size: 0.52rem; font-weight: 850; letter-spacing: 0.05em; text-transform: uppercase; }
	.part-label :global(svg) { width: 0.7rem; height: 0.7rem; color: var(--primario-texto); }
	.part-valor { display: flex; align-items: center; gap: 0.32rem; flex-wrap: wrap; color: var(--texto); font-size: 0.7rem; font-weight: 750; }
	.tag-responsable { padding: 0.04rem 0.28rem; border: 1px solid var(--primario-borde); border-radius: 99px; background: var(--superficie); color: var(--primario-texto); font-size: 0.48rem; font-weight: 850; letter-spacing: 0.03em; text-transform: uppercase; }
	.mention-add { display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap; margin-top: 0.45rem; padding-top: 0.4rem; border-top: 1px dashed var(--borde-suave); }
	.mention-add :global(svg) { width: 0.9rem; height: 0.9rem; color: var(--primario-texto); }
	.mention-add select { flex: 1; min-width: 12rem; height: 1.8rem; padding: 0 0.45rem; border: 1px solid var(--borde); border-radius: 0.45rem; background: var(--superficie-alta); color: var(--texto); font-size: 0.65rem; }
	.mention-add .legal { color: var(--texto-tenue); font-size: 0.53rem; }

	.auditoria { padding: 0.55rem 0.8rem 0.8rem; }
	.audit-cab { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.45rem; }
	.audit-cab strong { color: var(--texto); font-size: 0.66rem; }
	.audit-cab span { color: var(--texto-tenue); font-size: 0.56rem; }
	.tabla-audit { width: 100%; border-collapse: collapse; font-size: 0.59rem; }
	.tabla-audit th { padding: 0.32rem 0.35rem; background: var(--primario-tenue); color: var(--primario-texto); font-size: 0.52rem; font-weight: 850; text-align: left; text-transform: uppercase; letter-spacing: 0.04em; }
	.tabla-audit td { padding: 0.34rem 0.35rem; border-bottom: 1px solid var(--borde-suave); color: var(--texto-suave); vertical-align: top; }
	.tabla-audit td b { color: var(--texto); }
	.tabla-audit .antes { color: var(--peligro-texto); text-decoration: line-through; }
	.tabla-audit .despues { color: var(--exito-texto); font-weight: 750; }
	.audit-nota { margin-top: 0.45rem; padding: 0.4rem 0.5rem; border: 1px solid var(--borde-suave); border-radius: 0.5rem; background: var(--superficie-alta); color: var(--texto-suave); font-size: 0.58rem; line-height: 1.4; }

	.correo-panel { padding: 0.55rem 0.8rem 0.8rem; }
	.correo-conexion { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.6rem; border: 1px solid var(--info-borde); border-radius: 0.65rem; background: var(--info-tenue); }
	.correo-conexion .icono-correo { display: grid; place-items: center; width: 1.9rem; height: 1.9rem; border-radius: 0.5rem; background: var(--superficie); color: var(--info-texto); }
	.correo-conexion .icono-correo :global(svg) { width: 1rem; height: 1rem; }
	.correo-conexion b { display: block; color: var(--info-texto); font-size: 0.66rem; }
	.correo-conexion span { color: var(--info-texto); font-size: 0.58rem; }
	.correo-conexion .btn { margin-left: auto; }
	.correo-lista { margin-top: 0.45rem; }
	.correo-acciones { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.5rem; }
	.correo-nota { color: var(--texto-tenue); font-size: 0.56rem; }
	.correo-form { display: grid; gap: 0.5rem; margin-top: 0.6rem; padding: 0.6rem; border: 1px solid var(--borde-suave); border-radius: 0.65rem; background: var(--superficie); }
	.correo-form-acciones { display: flex; justify-content: flex-end; }	.correo-item { display: grid; grid-template-columns: 1.6rem minmax(0, 1fr) auto; gap: 0.4rem; align-items: start; padding: 0.45rem 0.1rem; border-bottom: 1px solid var(--borde-suave); }
	.correo-dir { display: grid; place-items: center; width: 1.55rem; height: 1.55rem; border-radius: 50%; background: var(--info-tenue); color: var(--info-texto); }
	.correo-dir.entrada { background: var(--exito-tenue); color: var(--exito-texto); }
	.correo-dir :global(svg) { width: 0.75rem; height: 0.75rem; }
	.correo-item .asunto { color: var(--texto); font-size: 0.64rem; font-weight: 750; }
	.correo-item .detalle { color: var(--texto-suave); font-size: 0.56rem; line-height: 1.4; }
	.correo-item .fecha { color: var(--texto-tenue); font-size: 0.53rem; white-space: nowrap; }

	/* Modales */
	.overlay { position: fixed; inset: 0; z-index: 200; display: flex; align-items: center; justify-content: center; padding: 1.2rem; background: var(--velo-modal); backdrop-filter: blur(3px); }
	.modal { display: flex; flex-direction: column; width: min(880px, 95vw); max-height: 92vh; overflow: hidden; border-radius: 1rem; background: var(--modal-fondo); box-shadow: var(--sombra-modal); }
	.modal.ancho { width: min(1080px, 96vw); }
	.modal-ticket { width: min(1120px, 97vw); }
	.crear-ticket {
		display: grid;
		grid-template-columns: minmax(0, 1.6fr) minmax(19rem, 1fr);
		gap: 0.75rem;
		flex: 1;
		min-height: 0;
		padding: 0.8rem 1rem;
		overflow: auto;
	}
	.crear-principal,
	.crear-lateral { display: grid; gap: 0.7rem; align-content: start; min-width: 0; }
	.bloque {
		display: grid;
		gap: 0.5rem;
		padding: 0.7rem 0.8rem;
		border: 1px solid var(--borde-suave);
		border-radius: 0.75rem;
		background: var(--superficie-alta);
	}
	.bloque-cab { display: flex; align-items: baseline; justify-content: space-between; gap: 0.5rem; }
	.bloque h3 { margin: 0; color: var(--texto); font-size: 0.78rem; }
	.pista { color: var(--texto-tenue); font-size: 0.55rem; font-weight: 650; line-height: 1.35; }
	.tipo-grid.compacta .tipo-card { padding: 0.5rem 0.55rem; }
	.tipo-grid.compacta .tipo-card b { font-size: 0.68rem; }
	.tipo-grid.compacta .tipo-card span { font-size: 0.56rem; }
	.form-grid.lateral { gap: 0.5rem; }
	.bloque .campo { margin-bottom: 0; }
	.mini-resumen {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.25rem 0.5rem;
		padding: 0.55rem 0.7rem;
		border: 1px dashed var(--primario-borde);
		border-radius: 0.6rem;
		background: var(--primario-tenue);
	}
	.mini-resumen span {
		color: var(--texto-suave);
		font-size: 0.53rem;
		font-weight: 850;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.mini-resumen b { color: var(--primario-texto); font-size: 0.66rem; overflow-wrap: anywhere; }
	.error-ticket { margin: 0 1rem 0.6rem; }
	.nota-pie { margin-right: auto; color: var(--texto-tenue); font-size: 0.6rem; }
	.modal.chico { width: min(560px, 94vw); }
	.modal-cab { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.8rem; padding: 0.8rem 1rem; border-bottom: 1px solid var(--borde-suave); background: var(--superficie-alta); }
	.modal-cab .kicker { margin-top: 0; }
	.modal-cab h2 { margin: 0.12rem 0; color: var(--texto); font-size: 1.02rem; }
	.modal-cab p { margin: 0; color: var(--texto-suave); font-size: 0.64rem; line-height: 1.4; }
	.cerrar-modal { display: grid; place-items: center; flex: 0 0 auto; width: 1.9rem; height: 1.9rem; border: 1px solid var(--borde-suave); border-radius: 50%; background: var(--superficie); color: var(--texto-suave); }
	.cerrar-modal:hover { background: var(--superficie-alta); color: var(--peligro-texto); }
	.cerrar-modal :global(svg) { width: 0.9rem; height: 0.9rem; }
	.modal-cuerpo { flex: 1; min-height: 0; padding: 0.8rem 1rem; overflow: auto; }
	.modal-pie { display: flex; align-items: center; justify-content: flex-end; gap: 0.4rem; padding: 0.55rem 1rem; border-top: 1px solid var(--borde-suave); background: var(--superficie-alta); }
	.acciones-wizard { display: flex; gap: 0.35rem; }
	.tipo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.55rem; }
	.tipo-card { display: grid; gap: 0.22rem; padding: 0.65rem; border: 1px solid var(--borde); border-radius: 0.65rem; background: var(--superficie); text-align: left; }
	.tipo-card:hover { border-color: var(--primario-borde); background: var(--superficie-alta); }
	.tipo-card.seleccionado { border-color: var(--primario); background: var(--primario-tenue); box-shadow: 0 0 0 1px var(--primario); }
	.tipo-card .icono { display: grid; place-items: center; width: 1.9rem; height: 1.9rem; border-radius: 0.5rem; background: var(--primario-tenue); color: var(--primario-texto); }
	.tipo-card.interno .icono { background: var(--primario-tenue); color: var(--primario-texto); }
	.tipo-card .icono :global(svg) { width: 1rem; height: 1rem; }
	.tipo-card b { color: var(--texto); font-size: 0.7rem; }
	.tipo-card span { color: var(--texto-suave); font-size: 0.6rem; line-height: 1.35; }
	.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.55rem; }
	.form-grid .full { grid-column: 1 / -1; }
	.campo { display: grid; gap: 1px; margin-bottom: 0.5rem; }
	.campo > span { color: var(--texto-suave); font-size: 0.6rem; font-weight: 800; letter-spacing: 0.07em; text-transform: uppercase; }
	.campo input,
	.campo select,
	.campo textarea { width: 100%; border: 1px solid var(--borde); border-radius: 0.7rem; background: var(--superficie); padding: 0.5rem 0.65rem; color: var(--texto); font-size: 0.7rem; }
	.campo select { min-height: 2.5rem; appearance: none; padding-right: 2rem; background-image: var(--chevron-select); background-repeat: no-repeat; background-position: right 0.7rem center; background-size: 0.65rem; }
	.campo textarea { resize: vertical; line-height: 1.45; }
	.campo input:focus,
	.campo select:focus,
	.campo textarea:focus { outline: 2px solid var(--foco); outline-offset: 1px; background: var(--superficie); }
	.bloque small { color: var(--texto-tenue); font-size: 0.53rem; line-height: 1.35; }
	.buscar-servicio { display: flex; gap: 0.35rem; }
	.buscar-servicio input { flex: 1; height: 2rem; padding: 0 0.5rem; border: 1px solid var(--borde); border-radius: 0.5rem; background: var(--superficie-alta); font-size: 0.68rem; }
	.resultados-servicio { display: grid; gap: 0.25rem; margin-top: 0.4rem; max-height: 10rem; overflow: auto; }
	.servicio-elegido { display: flex; align-items: center; gap: 0.45rem; margin-top: 0.45rem; padding: 0.5rem 0.55rem; border: 1px solid var(--primario-borde); border-radius: 0.55rem; background: var(--primario-tenue); }
	.servicio-elegido .icono { display: grid; place-items: center; width: 1.9rem; height: 1.9rem; border-radius: 0.45rem; background: var(--superficie); color: var(--primario-texto); }
	.servicio-elegido b { display: block; color: var(--texto); font-size: 0.68rem; }
	.servicio-elegido span { color: var(--texto-suave); font-size: 0.58rem; }
	.servicio-elegido .btn { margin-left: auto; }
	.aviso { display: flex; align-items: flex-start; gap: 0.35rem; margin-top: 0.5rem; padding: 0.45rem 0.55rem; border: 1px solid var(--alerta-borde); border-radius: 0.5rem; background: var(--alerta-tenue); color: var(--alerta-texto); font-size: 0.6rem; line-height: 1.4; }
	.aviso :global(svg) { width: 0.85rem; height: 0.85rem; margin-top: 0.05rem; flex: 0 0 auto; }
	.aviso.info { border-color: var(--primario-borde); background: var(--primario-tenue); color: var(--primario-texto); }
	.aviso.error { border-color: var(--peligro-borde); background: var(--peligro-tenue); color: var(--peligro-texto); }


	@media (max-width: 1100px) {
		.workspace { grid-template-columns: minmax(17rem, 21rem) minmax(0, 1fr); }
		.filtro-origen { display: none; }
		.live { display: none; }
		.referencia-cuerpo { grid-template-columns: 1fr; }
		.ref-seguimiento { padding-left: 0; border-left: 0; border-top: 1px dashed var(--primario-borde); padding-top: 0.4rem; }
		.part-grid { grid-template-columns: 1fr; }
		.detalle-meta { display: none; }
		.acciones-ticket {
			display: grid;
			grid-template-columns: 1.05fr 0.8fr 1fr 1.2fr auto;
			gap: 0.2rem;
			align-items: center;
			padding-left: 0.45rem;
			padding-right: 0.45rem;
		}
		.campo-inline { width: 100%; min-width: 0; height: 1.8rem; padding: 0 0.2rem; gap: 0.15rem; }
		.campo-inline > span { display: none; }
		.campo-inline select { width: 100%; max-width: none; font-size: 0.62rem; }
		.acciones-ticket .btn { min-height: 1.8rem; padding: 0.3rem 0.4rem; }
	}
	@media (max-width: 900px) {
		.pantalla-tickets { height: auto; min-height: 0; overflow: visible; }
		.workspace { grid-template-columns: 1fr; grid-template-rows: auto; }
		.lista-col { max-height: 28rem; }
		.detalle-col { min-height: 38rem; }
		.form-grid, .tipo-grid, .involucrados-grid { grid-template-columns: 1fr; }
		.crear-ticket { grid-template-columns: 1fr; }
	}
	@media (max-height: 760px) {
		.pantalla-tickets { gap: 0.45rem; }
		.bajada { display: none; }
		.detalle-cabecera h2 { font-size: 1rem; }
	}
	.detalle-titulo { flex: 1; }
</style>

