<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { slide } from 'svelte/transition';
	import { page } from '$app/state';
	import { iconos } from '#lib/componentes/iconos.ts';
	import ChipSelect from '#lib/componentes/ChipSelect.svelte';
	import { formatearFecha, formatearFechaHora, formatearHora, hoyIso } from '#lib/servicios/fechas.ts';
	import { type Usuario } from '#lib/servicios/sesion.ts';
	import { formatearTelefonoUy } from '#lib/servicios/telefonos.ts';
	import { guardarPreferencia, leerPreferencia } from '#lib/servicios/preferencias-locales.ts';
	import ConversacionTicket from '#lib/componentes/ConversacionTicket.svelte';
	import CompositorTicket from '#lib/componentes/CompositorTicket.svelte';
	import { notificar } from '#lib/componentes/notificaciones.svelte.ts';
	import { confirmar } from '#lib/componentes/confirmacion.svelte.ts';
	import {
		ErrorApiSeguimientos,
		actualizarPromesa,
		actualizarSeguimiento,
		actualizarTarea,
		agregarFacturas,
		buscarServiciosSeguimiento,
		comprobantesDeServicio,
		crearPromesa,
		crearSeguimiento,
		crearTarea,
		crearTicketSeguimiento,
		desvincularMensajeWhatsApp,
		enviarCorreoSeguimiento,
		enviarWhatsAppSeguimiento,
		listarCatalogosSeguimientos,
		listarCorreosSinVincular,
		listarCuentasGmailSeguimiento,
		listarEmailsServicioSeguimiento,
		listarSeguimientos,
		obtenerEstadoWhatsAppSeguimientos,
		obtenerSeguimiento,
		obtenerTicketVinculado,
		registrarAvance,
		responderTicketVinculado,
		retirarFactura,
		verificarWhatsAppSeguimiento,
		vincularCorreo,
		type CanalAvance,
		type CatalogosSeguimientos,
		type ComprobanteServicio,
		type CorreoSinVincular,
		type EstadoSeguimiento,
		type GmailCuentaEnvio,
		type MensajeTicketDatos,
		type PrioridadSeguimiento,
		type SeguimientoDetalle,
		type SeguimientoEvento,
		type SeguimientoFactura,
		type SeguimientoPromesa,
		type SeguimientoResumen,
		type SeguimientoTarea,
		type SeguimientoTicket,
		type ServicioBuscadoSeguimiento,
		type TipoAccion
	} from '#lib/servicios-datos-api/index.ts';

	/**
	 * Pantalla: Centro de seguimiento de cobranza.
	 *
	 * Dos columnas: servicios en seguimiento (izquierda) y caso seleccionado
	 * (derecha). El historial unifica todos los canales; los tickets son un
	 * módulo aparte y acá solo se referencian.
	 *
	 * La autorización real la aplica la API. Esta pantalla oculta acciones que
	 * el backend va a rechazar.
	 */

	const ESTADOS: Record<EstadoSeguimiento, { etiqueta: string; clase: string }> = {
		EN_SEGUIMIENTO: { etiqueta: 'En seguimiento', clase: 'seguimiento' },
		ESPERANDO_CLIENTE: { etiqueta: 'Esperando respuesta', clase: 'esperando' },
		PROMESA_PAGO: { etiqueta: 'Promesa de pago', clase: 'promesa' },
		BLOQUEADO_TICKET: { etiqueta: 'Bloqueado por ticket', clase: 'bloqueado' },
		PAUSADO: { etiqueta: 'Pausado', clase: 'pausado' },
		CERRADO_PAGADO: { etiqueta: 'Cerrado · pagado', clase: 'cerrado' },
		CERRADO_ACUERDO: { etiqueta: 'Cerrado · acuerdo cumplido', clase: 'cerrado' },
		CERRADO_LEGAL: { etiqueta: 'Cerrado · derivado a legal', clase: 'legal' },
		CERRADO_INCOBRABLE: { etiqueta: 'Cerrado · incobrable', clase: 'incobrable' }
	};

	const PRIORIDADES: Record<PrioridadSeguimiento, { etiqueta: string; clase: string }> = {
		BAJA: { etiqueta: 'Baja', clase: 'baja' },
		NORMAL: { etiqueta: 'Normal', clase: 'normal' },
		ALTA: { etiqueta: 'Alta', clase: 'alta' },
		URGENTE: { etiqueta: 'Urgente', clase: 'urgente' }
	};

	const CANALES: { valor: CanalAvance; etiqueta: string; icono: string }[] = [
		{ valor: 'NOTA', etiqueta: 'Nota interna', icono: 'candado' },
		{ valor: 'CORREO', etiqueta: 'Correo (envía)', icono: 'correo' },
		{ valor: 'CORREO_MANUAL', etiqueta: 'Correo manual', icono: 'correo' },
		{ valor: 'WHATSAPP', etiqueta: 'WhatsApp (envía)', icono: 'telefono' },
		{ valor: 'WHATSAPP_MANUAL', etiqueta: 'WhatsApp manual', icono: 'telefono' },
		{ valor: 'TELEFONO', etiqueta: 'Teléfono', icono: 'telefono' },
		{ valor: 'REUNION', etiqueta: 'Reunión', icono: 'usuarios' },
		{ valor: 'OTRO', etiqueta: 'Otro', icono: 'puntos' }
	];

	const TIPOS_ACCION: { valor: TipoAccion; etiqueta: string }[] = [
		{ valor: 'CORREO', etiqueta: 'Contactar por correo' },
		{ valor: 'WHATSAPP', etiqueta: 'Contactar por WhatsApp' },
		{ valor: 'LLAMADA', etiqueta: 'Llamar' },
		{ valor: 'CONFIRMAR_PAGO', etiqueta: 'Confirmar fecha de pago' },
		{ valor: 'VALIDAR_COMPROBANTE', etiqueta: 'Validar comprobante' },
		{ valor: 'VERIFICAR_ACREDITACION', etiqueta: 'Verificar acreditación' },
		{ valor: 'REVISAR_TICKET', etiqueta: 'Revisar ticket vinculado' },
		{ valor: 'OTRA', etiqueta: 'Otra acción' }
	];

	const ETIQUETAS_TAREA: Record<string, string> = Object.fromEntries(
		TIPOS_ACCION.map((tipo) => [tipo.valor, tipo.etiqueta])
	);

	const ETIQUETAS_EVENTO: Record<string, string> = {
		CREACION: 'Abrió el seguimiento',
		ESTADO: 'Cambió el estado',
		PRIORIDAD: 'Cambió la prioridad',
		RESPONSABLE: 'Reasignó el responsable',
		TAREA: 'Próxima gestión',
		PROMESA: 'Promesa de pago',
		TICKET: 'Ticket vinculado',
		FACTURA: 'Facturas del seguimiento',
		CIERRE: 'Cerró el seguimiento',
		SISTEMA: 'Evento del sistema'
	};

	const ESTADOS_TICKET: Record<string, { etiqueta: string; clase: string }> = {
		NUEVO: { etiqueta: 'Nuevo', clase: 'nuevo' },
		ABIERTO: { etiqueta: 'Abierto', clase: 'abierto' },
		EN_PROCESO: { etiqueta: 'En proceso', clase: 'proceso' },
		ESPERANDO_RESPUESTA: { etiqueta: 'Esperando respuesta', clase: 'esperando' },
		RESUELTO: { etiqueta: 'Resuelto', clase: 'resuelto' },
		CERRADO: { etiqueta: 'Cerrado', clase: 'cerrado' },
		CANCELADO: { etiqueta: 'Cancelado', clase: 'cancelado' }
	};

	const PRIORIDADES_TICKET: Record<string, { etiqueta: string; clase: string }> = {
		BAJA: { etiqueta: 'Baja', clase: 'baja' },
		NORMAL: { etiqueta: 'Normal', clase: 'normal' },
		ALTA: { etiqueta: 'Alta', clase: 'alta' },
		URGENTE: { etiqueta: 'Urgente', clase: 'urgente' }
	};

	function etiquetaTicketEstado(estado: string): string {
		return ESTADOS_TICKET[estado]?.etiqueta ?? estado;
	}

	function claseTicketEstado(estado: string): string {
		return ESTADOS_TICKET[estado]?.clase ?? '';
	}

	function etiquetaTicketPrioridad(prioridad: string): string {
		return PRIORIDADES_TICKET[prioridad]?.etiqueta ?? prioridad;
	}

	const usuario = $derived(page.data.usuario as Usuario | null);

	let lista = $state<SeguimientoResumen[]>([]);
	let catalogos = $state<CatalogosSeguimientos>({
		areas: [],
		usuarios: [],
		puedeCrearTicket: false,
		areaUsuario: null
	});
	let correosPendientes = $state<CorreoSinVincular[]>([]);
	let cuentasGmail = $state<GmailCuentaEnvio[]>([]);

	let seleccionadoId = $state<number | null>(null);
	let detalle = $state<SeguimientoDetalle | null>(null);
	let cargando = $state(true);
	let cargandoDetalle = $state(false);
	let error = $state('');
	let errorDetalle = $state('');
	let ultimaActualizacion = $state<Date | null>(null);

	// Filtros (se mantienen al entrar y salir de un caso durante la sesión).
	let busqueda = $state('');
	let filtroEstado = $state('');
	let filtroResponsable = $state('');
	let filtroCanal = $state('');
	let filtroPrioridad = $state('');
	let filtroTicket = $state('');
	let filtroProxima = $state('');
	let filtroMoneda = $state('');
	let soloNoLeidos = $state(false);
	/** Modo extendido: sin filtros visibles y con el historial más alto al abrir un caso. */
	let extenderChat = $state(false);
	let verCerrados = $state(false);

	let tab = $state<'historial' | 'facturas' | 'tickets'>('historial');
	let conflicto = $state(false);

	// Compositor.
	let canal = $state<CanalAvance>('NOTA');
	let texto = $state('');
	let contacto = $state('');
	/** Dirección de los canales manuales (solo registran). */
	let direccionManual = $state<'SALIENTE' | 'ENTRANTE'>('SALIENTE');
	const canalManual = $derived(canal === 'CORREO_MANUAL' || canal === 'WHATSAPP_MANUAL');
	let enviando = $state(false);
	let zonaHistorial = $state<HTMLDivElement>();
	let detalleScroll = $state<HTMLDivElement>();

	// Modales.
	let modalNuevo = $state(false);
	let pasoNuevo = $state(1);
	let busquedaServicio = $state('');
	let resultadosServicios = $state<ServicioBuscadoSeguimiento[]>([]);
	let buscandoServicios = $state(false);
	let servicioElegido = $state<ServicioBuscadoSeguimiento | null>(null);
	let comprobantesServicio = $state<ComprobanteServicio[]>([]);
	let cargandoComprobantes = $state(false);
	let seleccionComprobantes = $state<number[]>([]);
	let nuevoTitulo = $state('');
	let nuevoTelefono = $state('');
	let nuevoMotivo = $state('');
	let nuevoEstado = $state<EstadoSeguimiento>('EN_SEGUIMIENTO');
	let nuevoPrioridad = $state<PrioridadSeguimiento>('NORMAL');
	let nuevoResponsable = $state('');
	let nuevaNota = $state('');
	let nuevoObservadores = $state<string[]>([]);
	let nuevoProximaTipo = $state<TipoAccion>('CORREO');
	let nuevoProximaFecha = $state('');
	let nuevoProximaNota = $state('');
	let guardandoNuevo = $state(false);

	let modalEstado = $state(false);
	let estadoElegido = $state<EstadoSeguimiento>('EN_SEGUIMIENTO');
	let motivoEstado = $state('');

	let modalPromesa = $state(false);
	let promesaFecha = $state('');
	let promesaImporte = $state('');
	let promesaMoneda = $state<'UYU' | 'USD'>('UYU');
	let promesaMedio = $state('');
	let promesaContacto = $state('');
	let promesaObservaciones = $state('');
	let promesaFacturas = $state<string[]>([]);

	let modalTarea = $state(false);
	let tareaTipo = $state<TipoAccion>('LLAMADA');
	let tareaTitulo = $state('');
	let tareaFecha = $state('');
	let tareaResponsable = $state('');
	let tareaRecordatorio = $state('60');
	let tareaNota = $state('');

	let modalTareaAccion = $state(false);
	let tareaObjetivo = $state<SeguimientoTarea | null>(null);
	let tareaAccion = $state<'COMPLETAR' | 'REPROGRAMAR' | 'CANCELAR' | 'TRANSFERIR'>('COMPLETAR');
	let tareaResultado = $state('');
	let tareaNuevaFecha = $state('');
	let tareaMotivo = $state('');
	let tareaNuevoResponsable = $state('');

	let modalCorreo = $state(false);
	let correoPara = $state('');
	let correoCc = $state('');
	let correoAsunto = $state('');
	let correoCuerpo = $state('');
	let correoDireccion = $state<'SALIENTE' | 'ENTRANTE'>('SALIENTE');
	let correoEstado = $state<'REGISTRADO' | 'ENVIADO' | 'RECIBIDO'>('REGISTRADO');
	let correoFacturas = $state<number[]>([]);
	let correoCuentaGmail = $state<number | null>(null);

	let modalWhatsapp = $state(false);
	let verificandoWhatsApp = $state(false);
	let enviandoWhatsApp = $state(false);
	let whatsappConectado = $state(false);
	let whatsappNumero = $state('');
	let whatsappTexto = $state('');
	let whatsappAbierto = $state(false);

	let modalTicket = $state(false);
	let ticketTitulo = $state('');
	let ticketDescripcion = $state('');
	let ticketArea = $state('');
	let ticketPrioridad = $state<'BAJA' | 'NORMAL' | 'ALTA' | 'URGENTE'>('NORMAL');
	let ticketAsignado = $state('');
	let ticketBloqueante = $state(false);
	let ticketMotivoBloqueo = $state('');
	let ticketFacturas = $state<number[]>([]);

	let modalVerTicket = $state(false);
	let ticketVisto = $state<Awaited<ReturnType<typeof obtenerTicketVinculado>> | null>(null);
	let cargandoTicket = $state(false);
	let conversacionTicket = $state<HTMLDivElement>();

	let modalFacturas = $state(false);
	let comprobantesDisponibles = $state<ComprobanteServicio[]>([]);
	let facturasElegidas = $state<number[]>([]);
	let cargandoDisponibles = $state(false);

	let modalRetirar = $state(false);
	let facturaObjetivo = $state<SeguimientoFactura | null>(null);
	let motivoRetiro = $state('');

	let modalBandeja = $state(false);

	let promesaObjetivo = $state<SeguimientoPromesa | null>(null);
	let modalPromesaResultado = $state(false);
	let promesaResultado = $state('CUMPLIDA');
	let promesaDetalle = $state('');

	const filtrados = $derived.by(() => {
		const termino = normalizar(busqueda);
		const listaFiltrada = lista.filter((item) => {
			if (termino) {
				const heno = normalizar(
					[
						item.codigo,
						item.titulo,
						item.servicio.nombre,
						item.servicio.nombreFantasia,
						item.servicio.numeracion,
						item.responsable.nombre,
						item.responsable.email,
						item.facturas.numeros.join(' ')
					].join(' ')
				);
				if (!heno.includes(termino)) return false;
			}
			if (filtroEstado && item.estado !== filtroEstado) return false;
			if (filtroResponsable && item.responsable.id !== filtroResponsable) return false;
			if (filtroCanal && item.ultimoCanal !== filtroCanal) return false;
			if (filtroPrioridad && item.prioridad !== filtroPrioridad) return false;
			if (soloNoLeidos && item.noLeidos === 0) return false;
			if (filtroTicket === 'con' && item.tickets.abiertos === 0) return false;
			if (filtroTicket === 'bloqueante' && item.tickets.bloqueantes === 0) return false;
			if (filtroMoneda === 'UYU' && Number(item.saldos.UYU) <= 0) return false;
			if (filtroMoneda === 'USD' && Number(item.saldos.USD) <= 0) return false;
			if (filtroProxima) {
				const proxima = item.proximaGestion;
				if (filtroProxima === 'sin' && proxima) return false;
				if (filtroProxima === 'vencida' && proxima?.estado !== 'VENCIDA') return false;
				if (filtroProxima === 'hoy' && !esHoy(proxima?.fechaHora)) return false;
				if (filtroProxima === '7dias' && !enProximosDias(proxima?.fechaHora, 7)) return false;
			}
			return true;
		});

		return listaFiltrada.sort((a, b) => rangoUrgencia(a) - rangoUrgencia(b) || compararFecha(b.ultimaActividad, a.ultimaActividad));
	});

	const seleccionado = $derived(
		detalle && detalle.id === seleccionadoId
			? detalle
			: (lista.find((item) => item.id === seleccionadoId) ?? null)
	);
	const esDetalle = $derived(Boolean(detalle && detalle.id === seleccionadoId));
	const puedeEditar = $derived(esDetalle ? Boolean(detalle?.permisos.editar) : false);
	const hermanos = $derived(
		detalle
			? lista.filter(
					(item) => item.servicio.id === detalle!.servicio.id && item.id !== detalle!.id
				)
			: []
	);
	const promesaVigente = $derived(
		esDetalle
			? (detalle?.promesas.find((promesa) =>
					['VIGENTE', 'INCUMPLIDA', 'REPROGRAMADA'].includes(promesa.estado)
				) ?? null)
			: null
	);
	const facturasActivas = $derived(
		esDetalle ? (detalle?.facturasDetalle.filter((factura) => factura.activa) ?? []) : []
	);
	const facturasVencidas = $derived(facturasActivas.filter((factura) => factura.vencida));
	const saldoUYU = $derived(
		facturasActivas.filter((f) => f.moneda !== 'USD').reduce((total, f) => total + Number(f.saldo), 0)
	);
	const saldoUSD = $derived(
		facturasActivas.filter((f) => f.moneda === 'USD').reduce((total, f) => total + Number(f.saldo), 0)
	);

	function normalizar(valor: string): string {
		return valor
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.trim();
	}

	function inicialesDe(nombre: string): string {
		const partes = nombre.split(/\s+/).filter(Boolean);
		if (partes.length === 0) return '?';
		if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
		return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
	}

	function dinero(valor: string | number, moneda = 'UYU'): string {
		const numero = Number(valor);
		if (!Number.isFinite(numero)) return '—';
		return new Intl.NumberFormat('es-UY', {
			style: 'currency',
			currency: moneda === 'USD' ? 'USD' : 'UYU',
			currencyDisplay: 'narrowSymbol',
			minimumFractionDigits: 2
		}).format(numero);
	}

	function numero(valor: string | number): string {
		return new Intl.NumberFormat('es-UY', { maximumFractionDigits: 0 }).format(Number(valor));
	}

	function compararFecha(a: string, b: string): number {
		return new Date(a).getTime() - new Date(b).getTime();
	}

	function esHoy(fecha: string | null | undefined): boolean {
		if (!fecha) return false;
		return fecha.slice(0, 10) === hoyIso();
	}

	function enProximosDias(fecha: string | null | undefined, dias: number): boolean {
		if (!fecha) return false;
		const objetivo = new Date(fecha).getTime();
		const ahora = Date.now();
		return objetivo >= ahora && objetivo <= ahora + dias * 86400000;
	}

	function rangoUrgencia(item: SeguimientoResumen): number {
		const proxima = item.proximaGestion;
		if (proxima?.estado === 'VENCIDA') return 0;
		if (item.promesa?.estado === 'INCUMPLIDA') return 1;
		if (item.promesa && esHoy(item.promesa.fechaPrometida)) return 2;
		if (item.tickets.bloqueantes > 0) return 3;
		if (proxima && esHoy(proxima.fechaHora)) return 4;
		if (item.facturas.vencidas > 0) return 5;
		return 6;
	}

	function claseChip(estado: EstadoSeguimiento): string {
		return ESTADOS[estado]?.clase ?? 'seguimiento';
	}

	function iconoCanal(canalEvento: string | null): string {
		switch (canalEvento) {
			case 'CORREO':
			case 'CORREO_MANUAL':
				return 'correo';
			case 'WHATSAPP':
			case 'WHATSAPP_MANUAL':
			case 'TELEFONO':
				return 'telefono';
			case 'REUNION':
				return 'usuarios';
			case 'NOTA':
				return 'candado';
			default:
				return 'centro';
		}
	}

	function etiquetaCanal(canalEvento: string | null): string {
		return CANALES.find((item) => item.valor === canalEvento)?.etiqueta ?? 'Sistema';
	}

	function etiquetaEntrega(valor: string | null): string {
		const etiquetas: Record<string, string> = {
			REGISTRADO: 'Registrado manualmente',
			ENVIADO: 'Enviado',
			RECIBIDO: 'Recibido',
			FALLIDO: 'Fallido'
		};
		return valor ? (etiquetas[valor] ?? valor) : '';
	}

	function aIsoLocal(fechaLiteral: string): string | null {
		if (!fechaLiteral) return null;
		const fecha = new Date(fechaLiteral);
		if (Number.isNaN(fecha.getTime())) return null;
		return fecha.toISOString();
	}

	function paraInputFecha(iso: string | null | undefined): string {
		if (!iso) return '';
		const fecha = new Date(iso);
		if (Number.isNaN(fecha.getTime())) return '';
		const local = new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60000);
		return local.toISOString().slice(0, 16);
	}

	function agruparEventos(eventos: SeguimientoDetalle['eventos']) {
		const grupos: { fecha: string; items: typeof eventos }[] = [];
		for (const evento of eventos) {
			const clave = evento.fechaHora.slice(0, 10);
			const ultimo = grupos[grupos.length - 1];
			if (ultimo && ultimo.fecha === clave) ultimo.items.push(evento);
			else grupos.push({ fecha: clave, items: [evento] });
		}
		return grupos;
	}

	function etiquetaFechaGrupo(isoFecha: string): string {
		const fecha = new Date(`${isoFecha}T12:00:00`);
		const hoy = new Date();
		const ayer = new Date(hoy.getTime() - 86400000);
		const mismoDia = (a: Date, b: Date) =>
			a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
		if (mismoDia(fecha, hoy)) return 'Hoy';
		if (mismoDia(fecha, ayer)) return 'Ayer';
		return new Intl.DateTimeFormat('es-UY', { weekday: 'long', day: '2-digit', month: 'long' }).format(fecha);
	}

	function mostrarAviso(mensaje: string) {
		notificar(mensaje);
	}

	function aplicar(nuevo: SeguimientoDetalle) {
		detalle = nuevo;
		conflicto = false;
		lista = lista.map((item) => (item.id === nuevo.id ? { ...item, ...nuevo } : item));
		void tick().then(scrollAlFinal);
	}

	function scrollAlFinal() {
		if (tab !== 'historial' || !detalleScroll) return;
		detalleScroll.scrollTop = detalleScroll.scrollHeight;
		const ultimo = zonaHistorial?.lastElementChild as HTMLElement | null;
		ultimo?.scrollIntoView({ block: 'nearest' });
	}

	async function cargar() {
		cargando = true;
		error = '';
		try {
			const [seguimientos, catalogosApi, correos, gmail] = await Promise.all([
				listarSeguimientos(verCerrados),
				listarCatalogosSeguimientos(),
				listarCorreosSinVincular(),
				listarCuentasGmailSeguimiento()
			]);
			lista = seguimientos;
			catalogos = catalogosApi;
			correosPendientes = correos;
			cuentasGmail = gmail;
			ultimaActualizacion = new Date();
			const pedido = Number(page.url.searchParams.get('seg') ?? 0);
			if (pedido > 0 && seguimientos.some((item) => item.id === pedido)) {
				enlaceProcesado = firmaEnlace(pedido);
				await seleccionar(pedido);
			} else if (!seleccionadoId && !extenderChat && seguimientos.length > 0) {
				await seleccionar(seguimientos[0].id);
			}
		} catch (fallo) {
			error = fallo instanceof Error ? fallo.message : 'No se pudieron cargar los seguimientos';
		} finally {
			cargando = false;
		}
	}

	/**
	 * "Extender chat": al encenderlo se cierra el caso abierto para que la lista
	 * y el historial arranquen sin selección y los filtros sigan visibles.
	 */
	function cambiarExtenderChat(activo: boolean) {
		extenderChat = activo;
		void guardarPreferencia('extender-chat', String(activo));
		if (activo) {
			seleccionadoId = null;
			detalle = null;
		}
	}

	async function seleccionar(id: number, forzar = false) {
		// Volver a tocar el caso abierto lo cierra: los filtros reaparecen.
		if (!forzar && seleccionadoId === id && detalle?.id === id) {
			seleccionadoId = null;
			detalle = null;
			return;
		}

		seleccionadoId = id;
		tab = 'historial';
		cargandoDetalle = true;
		errorDetalle = '';
		try {
			const nuevo = await obtenerSeguimiento(id);
			detalle = nuevo;
			lista = lista.map((item) => (item.id === nuevo.id ? { ...item, ...nuevo, noLeidos: 0 } : item));
			await tick();
			scrollAlFinal();
		} catch (fallo) {
			errorDetalle = fallo instanceof Error ? fallo.message : 'No se pudo abrir el seguimiento';
			detalle = null;
		} finally {
			cargandoDetalle = false;
		}
	}

	async function refrescarSilencioso() {
		if (document.hidden) return;
		try {
			const [seguimientos, correos] = await Promise.all([
				listarSeguimientos(verCerrados),
				listarCorreosSinVincular()
			]);
			lista = seguimientos;
			correosPendientes = correos;
			ultimaActualizacion = new Date();
			if (seleccionadoId && !cargandoDetalle) {
				const nuevo = await obtenerSeguimiento(seleccionadoId);
				if (!detalle || nuevo.version !== detalle.version) {
					detalle = nuevo;
					await tick();
					scrollAlFinal();
				}
			}
			// El modal del ticket abierto también se mantiene al día.
			if (modalVerTicket && ticketVisto && detalle) {
				const actualizado = await obtenerTicketVinculado(detalle.id, ticketVisto.id).catch(
					() => null
				);
				if (actualizado) {
					ticketVisto = { ...actualizado, bloqueante: ticketVisto.bloqueante };
				}
			}
		} catch {
			// El refresco silencioso no interrumpe la pantalla.
		}
	}

	async function ejecutar(accion: () => Promise<SeguimientoDetalle>, mensaje: string) {
		if (enviando) return;
		enviando = true;
		try {
			const nuevo = await accion();
			aplicar(nuevo);
			mostrarAviso(mensaje);
			return true;
		} catch (fallo) {
			if (fallo instanceof ErrorApiSeguimientos) {
				if (fallo.codigo === 'CONFLICTO_VERSION') {
					conflicto = true;
					mostrarAviso('Otro usuario modificó el caso. Revisá y recargá.');
				} else {
					mostrarAviso(fallo.message);
				}
			} else {
				mostrarAviso('No se pudo completar la operación');
			}
			return false;
		} finally {
			enviando = false;
		}
	}

	// ------------------------------------------------------------ Filtros

	function limpiarFiltros() {
		busqueda = '';
		filtroEstado = '';
		filtroResponsable = '';
		filtroCanal = '';
		filtroPrioridad = '';
		filtroTicket = '';
		filtroProxima = '';
		filtroMoneda = '';
		soloNoLeidos = false;
	}

	async function alternarCerrados() {
		verCerrados = !verCerrados;
		seleccionadoId = null;
		detalle = null;
		await cargar();
	}

	// ------------------------------------------------------------- Cambios

	async function cambiarPrioridad(valor: string) {
		if (!detalle || !puedeEditar || valor === detalle.prioridad) return;
		await ejecutar(
			() =>
				actualizarSeguimiento(detalle!.id, {
					version: detalle!.version,
					prioridad: valor
				}),
			'Prioridad actualizada'
		);
	}

	async function cambiarResponsable(valor: string) {
		if (!detalle || !puedeEditar || valor === detalle.responsable.id) return;
		await ejecutar(
			() =>
				actualizarSeguimiento(detalle!.id, {
					version: detalle!.version,
					responsableUsuarioId: valor
				}),
			'Responsable reasignado'
		);
	}

	async function solicitarEstado(valor: string, select?: HTMLSelectElement) {
		const nuevoEstado = valor as EstadoSeguimiento;
		if (!detalle || !puedeEditar || nuevoEstado === detalle.estado) return;
		estadoElegido = nuevoEstado;
		motivoEstado = '';
		if (nuevoEstado === 'PROMESA_PAGO') {
			if (select) select.value = detalle.estado;
			abrirPromesa();
			return;
		}
		if (nuevoEstado === 'BLOQUEADO_TICKET') {
			if (select) select.value = detalle.estado;
			abrirTicket();
			return;
		}
		modalEstado = true;
	}

	async function confirmarEstado() {
		if (!detalle) return;
		const cerrando = estadoElegido.startsWith('CERRADO');
		if (cerrando && motivoEstado.trim().length < 3) {
			mostrarAviso('Indicá el motivo del cierre');
			return;
		}
		const ok = await ejecutar(
			() =>
				actualizarSeguimiento(detalle!.id, {
					version: detalle!.version,
					estado: estadoElegido,
					motivoCierre: cerrando ? motivoEstado : null
				}),
			'Estado actualizado'
		);
		if (ok) {
			modalEstado = false;
			motivoEstado = '';
		}
	}

	async function reabrir() {
		if (!detalle) return;
		await ejecutar(
			() =>
				actualizarSeguimiento(detalle!.id, {
					version: detalle!.version,
					estado: 'EN_SEGUIMIENTO',
					motivoCierre: null
				}),
			'Seguimiento reabierto'
		);
	}

	async function registrar() {
		if (!detalle || !texto.trim()) return;
		const manual = canal === 'CORREO_MANUAL' || canal === 'WHATSAPP_MANUAL';
		const direccion = manual
			? direccionManual
			: canal === 'WHATSAPP' || canal === 'CORREO'
				? 'SALIENTE'
				: 'INTERNA';
		const contactoEvento =
			contacto.trim() ||
			(canal === 'WHATSAPP_MANUAL' ? (detalle.telefonoWhatsapp ?? undefined) : undefined);
		const ok = await ejecutar(
			() =>
				registrarAvance(detalle!.id, {
					canal,
					direccion,
					contenido: texto.trim(),
					contacto: contactoEvento,
					estadoEntrega: manual ? 'REGISTRADO' : undefined,
					resultado: canal === 'TELEFONO' || canal === 'REUNION' ? texto.trim() : undefined
				}),
			manual ? 'Gestión manual registrada' : 'Avance registrado'
		);
		if (ok) {
			texto = '';
			contacto = '';
			direccionManual = 'SALIENTE';
			canal = 'NOTA';
		}
	}

	// -------------------------------------------------------------- Correo

	async function abrirCorreo(prellenarFacturas: SeguimientoFactura[] = []) {
		if (!detalle) return;
		correoPara = '';
		correoCc = '';
		correoAsunto = `Estado de cuenta – ${detalle.servicio.nombre} [${detalle.codigo}]`;
		correoCuerpo = texto;
		correoDireccion = 'SALIENTE';
		correoEstado = 'REGISTRADO';
		correoFacturas = prellenarFacturas.map((factura) => factura.id);
		correoCuentaGmail = cuentasGmail[0]?.id ?? null;
		modalCorreo = true;

		// Correo automático: destinatarios por defecto = mails registrados del
		// servicio (los que reciben cobranza). Se pueden editar.
		try {
			const emails = await listarEmailsServicioSeguimiento(detalle.servicio.id);
			const destinatarios = emails
				.filter((item) => item.uso !== 'FACTURACION')
				.map((item) => item.email);
			if (destinatarios.length > 0 && !correoPara.trim()) {
				correoPara = destinatarios.join(', ');
			}
		} catch {
			// Sin mails registrados: el usuario los escribe a mano.
		}
	}

	async function enviarCorreoReal() {
		if (!detalle) return;
		if (!correoCuentaGmail) {
			mostrarAviso('Elegí una cuenta Gmail conectada');
			return;
		}
		const para = correoPara
			.split(/[,;]/)
			.map((valor) => valor.trim())
			.filter(Boolean);
		if (para.length === 0) {
			mostrarAviso('Indicá al menos un destinatario');
			return;
		}
		if (!correoCuerpo.trim()) {
			mostrarAviso('Escribí el cuerpo del correo');
			return;
		}
		const cc = correoCc
			.split(/[,;]/)
			.map((valor) => valor.trim())
			.filter(Boolean);
		const facturasReferencia = facturasActivas
			.filter((factura) => correoFacturas.includes(factura.id))
			.map((factura) => `${factura.tipoComprobante} ${factura.serie}-${factura.numero}`);
		const ok = await ejecutar(
			() =>
				enviarCorreoSeguimiento(detalle!.id, {
					cuentaGmailId: correoCuentaGmail!,
					para,
					cc,
					asunto: correoAsunto.trim() || `Estado de cuenta – ${detalle!.servicio.nombre}`,
					cuerpo: correoCuerpo.trim(),
					facturasReferencia
				}),
			'Correo enviado por Gmail'
		);
		if (ok) {
			modalCorreo = false;
			texto = '';
		}
	}

	async function guardarCorreo() {		if (!detalle || !correoCuerpo.trim()) {
			mostrarAviso('Escribí el cuerpo del correo');
			return;
		}
		const para = correoPara
			.split(/[,;]/)
			.map((valor) => valor.trim())
			.filter(Boolean);
		const adjuntos = facturasActivas
			.filter((factura) => correoFacturas.includes(factura.id))
			.map((factura) => `${factura.tipoComprobante} ${factura.serie}-${factura.numero}`);
		let contenido = correoCuerpo.trim();
		if (adjuntos.length > 0) {
			contenido += `\n\nComprobantes incluidos: ${adjuntos.join(', ')}`;
		}
		const ok = await ejecutar(
			() =>
				registrarAvance(detalle!.id, {
					canal: 'CORREO',
					direccion: correoDireccion,
					contenido,
					contacto: para[0],
					asunto: correoAsunto,
					destinatarios: para,
					estadoEntrega: correoEstado
				}),
			correoDireccion === 'ENTRANTE' ? 'Correo recibido registrado' : 'Correo registrado'
		);
		if (ok) {
			modalCorreo = false;
			texto = '';
		}
	}

	// ------------------------------------------------------------ WhatsApp

	function abrirWhatsapp() {
		if (!detalle) return;
		whatsappTexto = texto;
		// El número del caso ya está normalizado; el modal manual lo usa como
		// destino por defecto.
		whatsappNumero = detalle.telefonoWhatsapp ?? '';
		whatsappAbierto = false;
		modalWhatsapp = true;
	}

	function abrirEnlaceWhatsapp() {
		const limpio = whatsappNumero.replace(/\D/g, '');
		if (limpio.length < 8) {
			mostrarAviso('Ingresá el número con código de país');
			return;
		}
		const url = `https://wa.me/${limpio}?text=${encodeURIComponent(whatsappTexto)}`;
		window.open(url, '_blank', 'noopener');
		whatsappAbierto = true;
	}

	async function confirmarWhatsapp() {
		if (!detalle || !whatsappTexto.trim()) return;
		const ok = await ejecutar(
			() =>
				registrarAvance(detalle!.id, {
					canal: 'WHATSAPP',
					direccion: 'SALIENTE',
					contenido: whatsappTexto.trim(),
					contacto: whatsappNumero.trim() || undefined,
					estadoEntrega: 'REGISTRADO'
				}),
			'Gestión de WhatsApp registrada'
		);
		if (ok) {
			modalWhatsapp = false;
			texto = '';
			canal = 'NOTA';
		}
	}

	async function cargarEstadoWhatsApp() {
		try {
			const estado = await obtenerEstadoWhatsAppSeguimientos();
			whatsappConectado = estado.conectado;
		} catch {
			whatsappConectado = false;
		}
	}

	async function enviarWhatsappReal() {
		if (!detalle || !texto.trim()) return;
		if (!detalle.telefonoWhatsapp) {
			mostrarAviso('El seguimiento no tiene celular de WhatsApp');
			return;
		}
		if (!whatsappConectado) {
			mostrarAviso('WhatsApp no está conectado: se registra como gestión manual');
			abrirWhatsapp();
			return;
		}
		enviandoWhatsApp = true;
		try {
			detalle = await enviarWhatsAppSeguimiento(detalle.id, texto.trim());
			texto = '';
			canal = 'NOTA';
			mostrarAviso('Mensaje enviado por WhatsApp');
		} catch (fallo) {
			mostrarAviso(fallo instanceof Error ? fallo.message : 'No se pudo enviar el mensaje');
		} finally {
			enviandoWhatsApp = false;
		}
	}

	async function desvincularWhatsapp(evento: SeguimientoEvento) {
		const mensajeId = Number(evento.metadatos?.whatsappMensajeId ?? 0);
		if (!detalle || !mensajeId) return;
		const confirmado = await confirmar({
			titulo: 'Quitar mensaje',
			mensaje:
				'¿Quitar este mensaje de este seguimiento? El mensaje original se conserva y sigue en el otro caso si corresponde.',
			tono: 'peligro',
			etiquetaConfirmar: 'Quitar'
		});
		if (!confirmado) return;
		try {
			await desvincularMensajeWhatsApp(detalle.id, mensajeId);
			detalle = await obtenerSeguimiento(detalle.id);
			mostrarAviso('Mensaje desvinculado del caso');
		} catch (fallo) {
			mostrarAviso(fallo instanceof Error ? fallo.message : 'No se pudo desvincular');
		}
	}

	async function verificarWhatsapp() {
		if (!detalle || verificandoWhatsApp) return;
		verificandoWhatsApp = true;
		try {
			const resultado = await verificarWhatsAppSeguimiento(detalle.id);
			if (!resultado.consultado) {
				mostrarAviso(resultado.motivo ?? 'No se pudo consultar WhatsApp');
			} else if (!resultado.existe) {
				detalle = { ...detalle, telefonoWhatsappVerificadoEn: null };
				mostrarAviso('El número no tiene WhatsApp');
			} else {
				detalle = { ...detalle, telefonoWhatsappVerificadoEn: resultado.verificadoEn };
				mostrarAviso('Número verificado en WhatsApp');
			}
		} catch (fallo) {
			mostrarAviso(fallo instanceof Error ? fallo.message : 'No se pudo verificar el número');
		} finally {
			verificandoWhatsApp = false;
		}
	}

	// --------------------------------------------------------------- Tarea

	function abrirTarea() {
		tareaTipo = 'LLAMADA';
		tareaTitulo = '';
		tareaFecha = paraInputFecha(new Date(Date.now() + 86400000).toISOString());
		tareaResponsable = detalle?.responsable.id ?? '';
		tareaRecordatorio = '60';
		tareaNota = '';
		modalTarea = true;
	}

	async function guardarTarea() {
		if (!detalle || !tareaTitulo.trim() || !tareaFecha) {
			mostrarAviso('Completá el título y la fecha de la gestión');
			return;
		}
		const fechaIso = aIsoLocal(tareaFecha);
		if (!fechaIso) {
			mostrarAviso('La fecha no es válida');
			return;
		}
		const ok = await ejecutar(
			() =>
				crearTarea(detalle!.id, {
					tipoAccion: tareaTipo,
					titulo: tareaTitulo.trim(),
					nota: tareaNota.trim() || null,
					fechaHora: fechaIso,
					responsableUsuarioId: tareaResponsable || undefined,
					recordatorioMinutos: Number(tareaRecordatorio),
					canalPrevisto: tareaTipo === 'LLAMADA' ? 'TELEFONO' : tareaTipo === 'WHATSAPP' ? 'WHATSAPP' : 'CORREO'
				}),
			'Próxima gestión programada'
		);
		if (ok) modalTarea = false;
	}

	function abrirAccionTarea(tarea: SeguimientoTarea) {
		tareaObjetivo = tarea;
		tareaAccion = 'COMPLETAR';
		tareaResultado = '';
		tareaNuevaFecha = paraInputFecha(tarea.fechaHora);
		tareaMotivo = '';
		tareaNuevoResponsable = tarea.responsable?.id ?? '';
		modalTareaAccion = true;
	}

	async function guardarAccionTarea() {
		if (!detalle || !tareaObjetivo) return;
		const fechaIso = aIsoLocal(tareaNuevaFecha);
		const ok = await ejecutar(
			() =>
				actualizarTarea(detalle!.id, tareaObjetivo!.id, {
					version: tareaObjetivo!.version,
					accion: tareaAccion,
					resultado: tareaResultado.trim() || undefined,
					fechaHora: fechaIso ?? undefined,
					responsableUsuarioId: tareaNuevoResponsable || undefined,
					motivo: tareaMotivo.trim() || undefined
				}),
			'Gestión actualizada'
		);
		if (ok) modalTareaAccion = false;
	}

	// -------------------------------------------------------------- Promesa

	function abrirPromesa() {
		if (!detalle) return;
		const hoy = new Date(Date.now() + 7 * 86400000);
		promesaFecha = paraInputFecha(hoy.toISOString()).slice(0, 10);
		promesaMoneda = Number(detalle.saldos.UYU) > 0 ? 'UYU' : 'USD';
		promesaImporte = promesaMoneda === 'UYU' ? detalle.saldos.UYU : detalle.saldos.USD;
		promesaMedio = '';
		promesaContacto = '';
		promesaObservaciones = '';
		promesaFacturas = facturasActivas.map((factura) => String(factura.comprobanteId));
		modalPromesa = true;
	}

	async function guardarPromesa() {
		if (!detalle || !promesaImporte || Number(promesaImporte) <= 0) {
			mostrarAviso('Ingresá el importe de la promesa');
			return;
		}
		const fecha = promesaFecha ? new Date(`${promesaFecha}T12:00:00`).toISOString() : '';
		if (!fecha) {
			mostrarAviso('Ingresá la fecha comprometida');
			return;
		}
		const ok = await ejecutar(
			() =>
				crearPromesa(detalle!.id, {
					fechaPrometida: fecha,
					importe: Number(promesaImporte),
					moneda: promesaMoneda,
					comprobanteIds: promesaFacturas.map(Number),
					medioPago: promesaMedio.trim() || undefined,
					confirmadoPorContacto: promesaContacto.trim() || undefined,
					canal: 'TELEFONO',
					observaciones: promesaObservaciones.trim() || null
				}),
			'Promesa de pago registrada'
		);
		if (ok) modalPromesa = false;
	}

	function abrirResultadoPromesa(promesa: SeguimientoPromesa) {
		promesaObjetivo = promesa;
		promesaResultado = 'CUMPLIDA';
		promesaDetalle = '';
		modalPromesaResultado = true;
	}

	async function guardarResultadoPromesa() {
		if (!detalle || !promesaObjetivo) return;
		const ok = await ejecutar(
			() =>
				actualizarPromesa(detalle!.id, promesaObjetivo!.id, {
					version: promesaObjetivo!.version,
					estado: promesaResultado,
					detalle: promesaDetalle.trim() || undefined
				}),
			'Resultado de la promesa guardado'
		);
		if (ok) modalPromesaResultado = false;
	}

	// --------------------------------------------------------------- Ticket

	function abrirTicket() {
		ticketTitulo = detalle ? `Bloqueo de cobranza · ${detalle.servicio.nombre}` : '';
		ticketDescripcion = '';
		ticketArea = catalogos.areaUsuario ? String(catalogos.areaUsuario) : '';
		ticketPrioridad = 'NORMAL';
		ticketAsignado = '';
		ticketBloqueante = false;
		ticketMotivoBloqueo = '';
		ticketFacturas = facturasActivas.map((factura) => factura.comprobanteId);
		modalTicket = true;
	}

	async function guardarTicket() {
		if (!detalle || !ticketTitulo.trim() || !ticketDescripcion.trim() || !ticketArea) {
			mostrarAviso('Completá título, descripción y área responsable');
			return;
		}
		if (ticketBloqueante && !ticketMotivoBloqueo.trim()) {
			mostrarAviso('Indicá por qué el ticket bloquea la cobranza');
			return;
		}
		try {
			enviando = true;
			const resultado = await crearTicketSeguimiento(detalle.id, {
				titulo: ticketTitulo.trim(),
				descripcion: ticketDescripcion.trim(),
				prioridad: ticketPrioridad,
				areaResponsableId: Number(ticketArea),
				usuarioAsignadoId: ticketAsignado || null,
				bloqueante: ticketBloqueante,
				motivoBloqueo: ticketBloqueante ? ticketMotivoBloqueo.trim() : null,
				facturaIds: ticketFacturas
			});
			const nuevo = await obtenerSeguimiento(detalle.id);
			aplicar(nuevo);
			mostrarAviso(`Ticket ${resultado.codigo} creado y vinculado`);
			modalTicket = false;
		} catch (fallo) {
			mostrarAviso(fallo instanceof Error ? fallo.message : 'No se pudo crear el ticket');
		} finally {
			enviando = false;
		}
	}

	async function verTicket(ticket: SeguimientoTicket) {
		if (!detalle) return;
		modalVerTicket = true;
		cargandoTicket = true;
		ticketVisto = null;
		try {
			ticketVisto = await obtenerTicketVinculado(detalle.id, ticket.id);
			await tick();
			scrollConversacionTicket();
		} catch (fallo) {
			mostrarAviso(fallo instanceof Error ? fallo.message : 'No se pudo abrir el ticket');
			modalVerTicket = false;
		} finally {
			cargandoTicket = false;
		}
	}

	function scrollConversacionTicket() {
		if (conversacionTicket) conversacionTicket.scrollTop = conversacionTicket.scrollHeight;
	}

	/** Envía la respuesta desde el compositor compartido del modal. */
	async function enviarRespuestaTicket(datos: MensajeTicketDatos) {
		if (!detalle || !ticketVisto) return;
		const resultado = await responderTicketVinculado(detalle.id, ticketVisto.id, datos);
		ticketVisto = { ...resultado.ticket, bloqueante: ticketVisto.bloqueante };
		return resultado;
	}

	async function alResponderTicket() {
		await tick();
		scrollConversacionTicket();
	}

	/** Ticket vinculado al que pertenece un evento del historial. */
	function ticketDeEvento(evento: SeguimientoEvento): SeguimientoTicket | null {
		if (!detalle || !evento.ticketId) return null;
		return detalle.ticketsDetalle.find((ticket) => ticket.id === evento.ticketId) ?? null;
	}

	/** El evento de creación no trae `tipoEvento`; los cambios del ticket sí. */
	function esTicketCreado(evento: SeguimientoEvento): boolean {
		const metadatos = evento.metadatos ?? {};
		return !('tipoEvento' in metadatos);
	}

	// ------------------------------------------------------------- Facturas

	async function abrirFacturas() {
		if (!detalle) return;
		modalFacturas = true;
		facturasElegidas = [];
		cargandoDisponibles = true;
		try {
			comprobantesDisponibles = await comprobantesDeServicio(detalle.servicio.id);
		} catch (fallo) {
			mostrarAviso(fallo instanceof Error ? fallo.message : 'No se pudieron cargar los comprobantes');
		} finally {
			cargandoDisponibles = false;
		}
	}

	async function guardarFacturas() {
		if (!detalle || facturasElegidas.length === 0) {
			mostrarAviso('Elegí al menos un comprobante');
			return;
		}
		const ok = await ejecutar(
			() => agregarFacturas(detalle!.id, facturasElegidas),
			'Comprobantes incorporados'
		);
		if (ok) modalFacturas = false;
	}

	function abrirRetirar(factura: SeguimientoFactura) {
		facturaObjetivo = factura;
		motivoRetiro = '';
		modalRetirar = true;
	}

	async function guardarRetiro() {
		if (!detalle || !facturaObjetivo) return;
		if (motivoRetiro.trim().length < 3) {
			mostrarAviso('El motivo es obligatorio');
			return;
		}
		const ok = await ejecutar(
			() => retirarFactura(detalle!.id, facturaObjetivo!.id, motivoRetiro.trim()),
			'Comprobante retirado'
		);
		if (ok) modalRetirar = false;
	}

	// --------------------------------------------------------------- Nuevo

	function abrirNuevo() {
		modalNuevo = true;
		pasoNuevo = 1;
		busquedaServicio = '';
		resultadosServicios = [];
		servicioElegido = null;
		comprobantesServicio = [];
		seleccionComprobantes = [];
		nuevoTitulo = '';
		nuevoTelefono = '';
		nuevoMotivo = '';
		nuevoEstado = 'EN_SEGUIMIENTO';
		nuevoPrioridad = 'NORMAL';
		nuevoResponsable = usuario?.id ?? '';
		nuevaNota = '';
		nuevoObservadores = [];
		nuevoProximaTipo = 'CORREO';
		nuevoProximaFecha = '';
		nuevoProximaNota = '';
	}

	async function buscarServicio() {
		if (busquedaServicio.trim().length < 2) return;
		buscandoServicios = true;
		try {
			resultadosServicios = await buscarServiciosSeguimiento(busquedaServicio.trim());
		} catch (fallo) {
			mostrarAviso(fallo instanceof Error ? fallo.message : 'No se pudo buscar');
		} finally {
			buscandoServicios = false;
		}
	}

	async function elegirServicio(servicio: ServicioBuscadoSeguimiento) {
		servicioElegido = servicio;
		cargandoComprobantes = true;
		seleccionComprobantes = [];
		try {
			comprobantesServicio = await comprobantesDeServicio(servicio.id);
			nuevoTitulo = `Cobranza ${servicio.nombreFantasia || servicio.nombre}`;
			// Snapshot del celular del servicio; queda editable para el caso.
			nuevoTelefono = formatearTelefonoUy(servicio.celular);
		} catch (fallo) {
			mostrarAviso(fallo instanceof Error ? fallo.message : 'No se pudieron cargar los comprobantes');
		} finally {
			cargandoComprobantes = false;
		}
	}

	function alternarComprobante(id: number) {
		seleccionComprobantes = seleccionComprobantes.includes(id)
			? seleccionComprobantes.filter((valor) => valor !== id)
			: [...seleccionComprobantes, id];
	}

	async function guardarNuevo() {
		if (!servicioElegido) {
			mostrarAviso('Elegí un servicio');
			return;
		}
		if (seleccionComprobantes.length === 0) {
			mostrarAviso('Elegí al menos un comprobante');
			pasoNuevo = 1;
			return;
		}
		if (nuevoTitulo.trim().length < 3) {
			mostrarAviso('Escribí un título para el seguimiento');
			return;
		}
		const proxima = aIsoLocal(nuevoProximaFecha);
		guardandoNuevo = true;
		try {
			const nuevo = await crearSeguimiento({
				servicioId: servicioElegido.id,
				titulo: nuevoTitulo.trim(),
				telefonoWhatsapp: nuevoTelefono.trim() || null,
				motivo: nuevoMotivo.trim() || null,
				estado: nuevoEstado,
				prioridad: nuevoPrioridad,
				responsableUsuarioId: nuevoResponsable || undefined,
				facturaIds: seleccionComprobantes,
				nota: nuevaNota.trim() || undefined,
				observadores: nuevoObservadores,
				proximaAccion: proxima
					? {
							tipoAccion: nuevoProximaTipo,
							titulo: nuevoProximaNota.trim() || ETIQUETAS_TAREA[nuevoProximaTipo],
							fechaHora: proxima,
							responsableUsuarioId: nuevoResponsable || undefined,
							recordatorioMinutos: 60,
							nota: nuevoProximaNota.trim() || null
						}
					: undefined
			});
			const listaNueva = await listarSeguimientos();
			lista = listaNueva;
			modalNuevo = false;
			detalle = nuevo;
			seleccionadoId = nuevo.id;
			mostrarAviso(`Seguimiento ${nuevo.codigo} creado`);
		} catch (fallo) {
			mostrarAviso(fallo instanceof Error ? fallo.message : 'No se pudo crear el seguimiento');
		} finally {
			guardandoNuevo = false;
		}
	}

	// --------------------------------------------------------- Enlace profundo

	function firmaEnlace(id: number) {
		return `${id}|${page.url.searchParams.get('n') ?? ''}`;
	}

	let enlaceProcesado = '';

	$effect(() => {
		const pedido = Number(page.url.searchParams.get('seg') ?? 0);
		if (!pedido || cargando) return;
		const firma = firmaEnlace(pedido);
		if (firma === enlaceProcesado) return;
		enlaceProcesado = firma;
		if (seleccionadoId !== pedido) void seleccionar(pedido);
	});

	async function vincularCorreoPendiente(correo: CorreoSinVincular, seguimientoId: number) {
		try {
			const nuevo = await vincularCorreo(correo.id, seguimientoId);
			correosPendientes = correosPendientes.filter((item) => item.id !== correo.id);
			aplicar(nuevo);
			modalBandeja = false;
			mostrarAviso('Correo vinculado al seguimiento');
		} catch (fallo) {
			mostrarAviso(fallo instanceof Error ? fallo.message : 'No se pudo vincular el correo');
		}
	}

	onMount(() => {
		(async () => {
			// La preferencia se lee antes de cargar para no auto-abrir un caso
			// cuando el modo extendido está activo.
			extenderChat = (await leerPreferencia('extender-chat')) === 'true';
			await cargar();
		})();
		void cargarEstadoWhatsApp();
		const intervalo = setInterval(refrescarSilencioso, 15000);
		return () => clearInterval(intervalo);
	});

	// Al elegir el canal WhatsApp se refresca el estado de la sesión: el botón
	// cambia entre envío real y registro manual.
	$effect(() => {
		if (canal === 'WHATSAPP') void cargarEstadoWhatsApp();
	});
</script>

<svelte:head>
	<title>Centro de seguimiento · FacturaPro</title>
</svelte:head>

<div class="pantalla-seguimientos">
	<header class="cabecera-pagina">
		<div>
			<h1>Centro de seguimiento</h1>
		</div>
		<div class="acciones-cabecera">
			<span class="live" title="Actualización automática cada 15 segundos">
				<i></i> En vivo · {ultimaActualizacion ? formatearHora(ultimaActualizacion) : '—'}
			</span>
			{#if correosPendientes.length > 0}
				<button type="button" class="btn correo-pendiente" onclick={() => (modalBandeja = true)} title="Correos sin vincular">
					{@html iconos.correo} {correosPendientes.length} sin vincular
				</button>
			{/if}
			<label class="check-inline" title="Oculta la barra de filtros y le da más alto al historial">
				<input
					type="checkbox"
					checked={extenderChat}
					onchange={(evento) => cambiarExtenderChat(evento.currentTarget.checked)}
				/>
				Extender chat
			</label>
			<button type="button" class="btn primary cta" onclick={abrirNuevo}>
				{@html iconos.agregar} Nuevo seguimiento
			</button>
		</div>
	</header>

	<div class="filtros-caja">
		{#if !extenderChat}
			<div class="filtros" transition:slide={{ duration: 220 }}>
				<div class="filtros-fila">
					<label class="buscador">
						{@html iconos.buscar}
						<input type="search" bind:value={busqueda} placeholder="Cliente, servicio, RUT/CI, SEG, factura o responsable…" />
					</label>
					<ChipSelect tamano="normal" etiqueta="Estado" valor={filtroEstado} placeholder="Todos" opciones={[{ valor: '', etiqueta: 'Todos' }, ...Object.entries(ESTADOS).map(([valor, config]) => ({ valor, etiqueta: config.etiqueta }))]} onchange={(valor) => (filtroEstado = valor)} ariaLabel="Filtrar por estado" />
					<ChipSelect tamano="normal" etiqueta="Responsable" valor={filtroResponsable} placeholder="Todos" opciones={[{ valor: '', etiqueta: 'Todos' }, ...catalogos.usuarios.map((persona) => ({ valor: String(persona.id), etiqueta: persona.nombre }))]} onchange={(valor) => (filtroResponsable = valor)} ariaLabel="Filtrar por responsable" />
					<ChipSelect tamano="normal" etiqueta="Canal" valor={filtroCanal} placeholder="Todos" opciones={[{ valor: '', etiqueta: 'Todos' }, ...CANALES.map((opcion) => ({ valor: opcion.valor, etiqueta: opcion.etiqueta }))]} onchange={(valor) => (filtroCanal = valor)} ariaLabel="Filtrar por canal" />
					<ChipSelect tamano="normal" etiqueta="Prioridad" valor={filtroPrioridad} placeholder="Todas" opciones={[{ valor: '', etiqueta: 'Todas' }, ...Object.entries(PRIORIDADES).map(([valor, config]) => ({ valor, etiqueta: config.etiqueta }))]} onchange={(valor) => (filtroPrioridad = valor)} ariaLabel="Filtrar por prioridad" />
					<button type="button" class="limpiar" onclick={limpiarFiltros}>Limpiar filtros</button>
				</div>
				<div class="filtros-fila secundaria">
					<ChipSelect tamano="normal" etiqueta="Ticket" valor={filtroTicket} placeholder="Todos" opciones={[{ valor: '', etiqueta: 'Todos' }, { valor: 'con', etiqueta: 'Con ticket abierto' }, { valor: 'bloqueante', etiqueta: 'Bloqueante' }]} onchange={(valor) => (filtroTicket = valor)} ariaLabel="Filtrar por ticket" />
					<ChipSelect tamano="normal" etiqueta="Próxima acción" valor={filtroProxima} placeholder="Todas" opciones={[{ valor: '', etiqueta: 'Todas' }, { valor: 'vencida', etiqueta: 'Vencida' }, { valor: 'hoy', etiqueta: 'Hoy' }, { valor: '7dias', etiqueta: 'Próximos 7 días' }, { valor: 'sin', etiqueta: 'Sin programar' }]} onchange={(valor) => (filtroProxima = valor)} ariaLabel="Filtrar por próxima acción" />
					<ChipSelect tamano="normal" etiqueta="Moneda" valor={filtroMoneda} placeholder="Todas" opciones={[{ valor: '', etiqueta: 'Todas' }, { valor: 'UYU', etiqueta: 'Con saldo UYU' }, { valor: 'USD', etiqueta: 'Con saldo USD' }]} onchange={(valor) => (filtroMoneda = valor)} ariaLabel="Filtrar por moneda" />
					<label class="check-inline"><input type="checkbox" bind:checked={soloNoLeidos} /> Con respuestas nuevas</label>
					<span class="resultado-filtro">{filtrados.length} de {lista.length} casos</span>
				</div>
			</div>
		{/if}
	</div>

	{#if conflicto}
		<div class="aviso conflicto">
			<strong>Otro usuario modificó este caso.</strong> Se muestra la versión más reciente al recargar.
			<button type="button" class="btn sm" onclick={() => { conflicto = false; seleccionadoId && seleccionar(seleccionadoId, true); }}>Recargar</button>
		</div>
	{/if}

	<div class="workspace">
		<!-- ------------------------------------------------------ Panel izquierdo -->
		<section class="columna lista-col" aria-label="Servicios en seguimiento">
			<div class="lista-cab">
				<span><strong>{filtrados.length}</strong> {verCerrados ? (filtrados.length === 1 ? 'caso' : 'casos') : filtrados.length === 1 ? 'seguimiento activo' : 'seguimientos activos'}</span>
				<button type="button" class="historial-btn" onclick={alternarCerrados}>{verCerrados ? 'Ver activos' : 'Ver historial'}</button>
				<span class="orden" title="Ordenados por urgencia">Urgencia y última actividad</span>
			</div>
			<div class="lista-scroll">
				{#if cargando}
					{#each [1, 2, 3, 4] as esqueleto (esqueleto)}
						<div class="tarjeta esqueleto">
							<div class="linea w40"></div>
							<div class="linea w80"></div>
							<div class="linea w60"></div>
						</div>
					{/each}
				{:else if error}
					<div class="estado-vacio">
						{@html iconos.alerta}
						<strong>No se pudieron cargar los seguimientos</strong>
						<p>{error}</p>
						<button type="button" class="btn sm" onclick={cargar}>Reintentar</button>
					</div>
				{:else if lista.length === 0}
					<div class="estado-vacio">
						{@html iconos.seguimiento}
						<strong>No hay seguimientos activos</strong>
						<p>Creá uno desde la cartera de Cobranza o desde este botón.</p>
						<button type="button" class="btn sm primary" onclick={abrirNuevo}>Nuevo seguimiento</button>
					</div>
				{:else if filtrados.length === 0}
					<div class="estado-vacio">
						{@html iconos.buscar}
						<strong>No encontramos seguimientos con estos filtros</strong>
						<button type="button" class="btn sm" onclick={limpiarFiltros}>Limpiar filtros</button>
					</div>
				{:else}
					{#each filtrados as item (item.id)}
						<button type="button" class="tarjeta-caso" class:sel={item.id === seleccionadoId} onclick={() => seleccionar(item.id)}>
							<div class="tc-top">
								<span class="avatar">{inicialesDe(item.servicio.nombreFantasia || item.servicio.nombre)}</span>
								<div class="tc-identidad">
									<strong>{item.servicio.nombreFantasia || item.servicio.nombre}</strong>
									<small>{item.servicio.nombre} · {item.codigo}</small>
								</div>
								{#if item.noLeidos > 0}<span class="punto-nuevo" title={`${item.noLeidos} eventos nuevos`}></span>{/if}
								<span class="chip estado {claseChip(item.estado)} tc-estado">{ESTADOS[item.estado].etiqueta}</span>
							</div>
							<p class="tc-titulo">{item.titulo}</p>
						</button>
					{/each}
				{/if}
			</div>
		</section>

		<!-- ----------------------------------------------------- Panel derecho -->
		<section class="columna detalle-col" aria-label="Detalle del seguimiento">
			{#if !seleccionadoId}
				<div class="estado-vacio grande">
					{@html iconos.seguimiento}
					<strong>Ningún seguimiento seleccionado</strong>
					<p>Elegí un caso del panel izquierdo para ver su historial, facturas y próximas gestiones.</p>
				</div>
			{:else if cargandoDetalle && !esDetalle}
				<div class="detalle-cargando">
					<div class="linea w30"></div>
					<div class="linea w60"></div>
					<div class="linea w90"></div>
					<div class="linea w90"></div>
				</div>
			{:else if errorDetalle}
				<div class="estado-vacio grande">
					{@html iconos.alerta}
					<strong>No se pudo abrir el seguimiento</strong>
					<p>{errorDetalle}</p>
					<button type="button" class="btn sm" onclick={() => seleccionadoId && seleccionar(seleccionadoId, true)}>Reintentar</button>
				</div>
			{:else if detalle && esDetalle}
				<div class="detalle-scroll" bind:this={detalleScroll}>
					<header class="detalle-cabecera">
						<span class="avatar grande">{inicialesDe(detalle.servicio.nombreFantasia || detalle.servicio.nombre)}</span>
						<div class="dc-identidad">
							<div class="dc-linea">
								<h2>{detalle.servicio.nombreFantasia || detalle.servicio.nombre}</h2>
								<span class="chip codigo">{detalle.codigo}</span>
								{#if detalle.fechaCierre}<span class="chip cerrado">Cerrado</span>{/if}
							</div>
							<p class="dc-cliente">
								{detalle.servicio.nombre}
								{#if detalle.servicio.numeracion}· {detalle.servicio.numeracion}{/if}
								· Área {detalle.area.nombre}
								{#if detalle.telefonoWhatsapp}
									· <span class="telefono-wa" class:verificado={Boolean(detalle.telefonoWhatsappVerificadoEn)} title={detalle.telefonoWhatsappVerificadoEn ? 'Número verificado en WhatsApp' : 'Número sin verificar'}>
										{formatearTelefonoUy(detalle.telefonoWhatsapp)}
									</span>
									{#if puedeEditar}
										<button
											type="button"
											class="btn sm verificar-wa"
											disabled={verificandoWhatsApp}
											onclick={verificarWhatsapp}
										>
											{verificandoWhatsApp ? 'Verificando…' : detalle.telefonoWhatsappVerificadoEn ? 'Reverificar' : 'Verificar WhatsApp'}
										</button>
									{/if}
								{:else if puedeEditar}
									<span class="telefono-wa sin-numero">Sin celular de WhatsApp</span>
								{/if}
							</p>
							<p class="dc-titulo">{detalle.titulo}</p>
							{#if detalle.motivo}<p class="dc-motivo">{detalle.motivo}</p>{/if}
						</div>
						<div class="dc-acciones">
							<label class="control-mini">
								<span>Estado</span>
								<select value={detalle.estado} disabled={!puedeEditar} onchange={(evento) => { const el = evento.currentTarget as HTMLSelectElement; solicitarEstado(el.value, el); }}>
									{#each Object.entries(ESTADOS) as [valor, config] (valor)}
										<option value={valor}>{config.etiqueta}</option>
									{/each}
								</select>
							</label>
							<label class="control-mini">
								<span>Prioridad</span>
								<select value={detalle.prioridad} disabled={!puedeEditar} onchange={(evento) => cambiarPrioridad((evento.currentTarget as HTMLSelectElement).value)}>
									{#each Object.entries(PRIORIDADES) as [valor, config] (valor)}
										<option value={valor}>{config.etiqueta}</option>
									{/each}
								</select>
							</label>
							<label class="control-mini responsable">
								<span>Responsable</span>
								<select value={detalle.responsable.id} disabled={!puedeEditar} onchange={(evento) => cambiarResponsable((evento.currentTarget as HTMLSelectElement).value)}>
									{#each catalogos.usuarios as persona (persona.id)}
										<option value={persona.id}>{persona.nombre}</option>
									{/each}
								</select>
							</label>
							{#if detalle.estado.startsWith('CERRADO') && detalle.permisos.reabrir}
								<button type="button" class="btn sm" onclick={reabrir}>{@html iconos.recargar} Reabrir</button>
							{/if}
						</div>
					</header>

					{#if hermanos.length > 0}
						<div class="selector-casos">
							<span class="rotulo">Este servicio tiene {hermanos.length + 1} seguimientos activos</span>
							<div class="selector-lista">
								<button type="button" class="selector-item activa" aria-current="true">
									<strong>{detalle.codigo}</strong>
									<span>{detalle.titulo}</span>
									<small>{ESTADOS[detalle.estado].etiqueta}</small>
								</button>
								{#each hermanos as otro (otro.id)}
									<button type="button" class="selector-item" onclick={() => seleccionar(otro.id)} title={`Abrir ${otro.codigo}`}>
										<strong>{otro.codigo}</strong>
										<span>{otro.titulo}</span>
										<small>{ESTADOS[otro.estado].etiqueta}</small>
									</button>
								{/each}
							</div>
							<p>Los historiales son independientes: no se mezclan eventos entre casos del mismo servicio.</p>
						</div>
					{/if}

					<div class="resumen-grid">
						<div class="mini-card saldo">
							<span class="rotulo">Saldo asociado</span>
							<div class="montos">
								<strong>{dinero(saldoUYU)}</strong>
								{#if saldoUSD > 0}<strong>{dinero(saldoUSD, 'USD')}</strong>{/if}
							</div>
							{#if detalle.saldos.equivalenteUYU}
								<small>≈ {dinero(detalle.saldos.equivalenteUYU)} · TC {detalle.saldos.cotizacion}</small>
							{:else}
								<small>Sin tipo de cambio definido</small>
							{/if}
						</div>
						<div class="mini-card">
							<span class="rotulo">Facturas</span>
							<strong>{facturasActivas.length}</strong>
							<small>{facturasVencidas.length} vencidas · mayor atraso {detalle.facturas.mayorAtraso} días</small>
						</div>
						<div class="mini-card" class:destacada={promesaVigente?.estado === 'VIGENTE'}>
							<span class="rotulo">Promesa vigente</span>
							{#if promesaVigente}
								<strong>{dinero(promesaVigente.importe, promesaVigente.moneda)}</strong>
								<small>{formatearFecha(promesaVigente.fechaPrometida)} · {promesaVigente.estado === 'INCUMPLIDA' ? 'incumplida' : promesaVigente.medioPago || 'sin medio'}</small>
							{:else}
								<strong class="sin-dato">—</strong>
								<small>Sin promesa registrada</small>
							{/if}
						</div>
						<div class="mini-card">
							<span class="rotulo">Último contacto</span>
							<strong class="fecha">{detalle.ultimoContactoEn ? formatearFechaHora(detalle.ultimoContactoEn) : 'Sin contacto'}</strong>
							<small>{detalle.ultimoCanal ? etiquetaCanal(detalle.ultimoCanal) : '—'}</small>
						</div>
						<div class="mini-card">
							<span class="rotulo">Canal preferido</span>
							<strong class="fecha">{detalle.canalPreferido ? etiquetaCanal(detalle.canalPreferido) : 'Sin definir'}</strong>
							<small>{detalle.observadores.length} observador(es)</small>
						</div>
					</div>

					{#if detalle.proximaGestion}
						<div class="banda-proxima" class:vencida={detalle.proximaGestion.estado === 'VENCIDA'}>
							<div class="bp-icono">{@html iconos.reloj}</div>
							<div class="bp-texto">
								<span>Próxima gestión {detalle.proximaGestion.estado === 'VENCIDA' ? '· vencida' : ''}</span>
								<strong>{detalle.proximaGestion.titulo}</strong>
								<small>{formatearFechaHora(detalle.proximaGestion.fechaHora)} · {detalle.proximaGestion.responsable?.nombre ?? 'Sin responsable'} · {ETIQUETAS_TAREA[detalle.proximaGestion.tipoAccion]}</small>
							</div>
							{#if puedeEditar && !detalle.fechaCierre}
								<div class="bp-acciones">
									<button type="button" class="btn sm" onclick={() => abrirAccionTarea(detalle!.proximaGestion!)}>Gestionar</button>
								</div>
							{/if}
						</div>
					{/if}

					<nav class="tabs">
						<button type="button" class:activa={tab === 'historial'} onclick={() => (tab = 'historial')}>
							Historial <span class="n">{detalle.eventos.length}</span>
						</button>
						<button type="button" class:activa={tab === 'facturas'} onclick={() => (tab = 'facturas')}>
							Facturas <span class="n">{facturasActivas.length}</span>
						</button>
						<button type="button" class:activa={tab === 'tickets'} onclick={() => (tab = 'tickets')}>
							Tickets <span class="n">{detalle.ticketsDetalle.length}</span>
						</button>
					</nav>

					{#if tab === 'historial'}
						<div class="historial" bind:this={zonaHistorial}>
							{#if detalle.eventos.length === 0}
								<div class="estado-vacio">
									{@html iconos.correo}
									<strong>Este seguimiento todavía no tiene conversación</strong>
									<p>Registrá el primer avance desde el compositor.</p>
								</div>
							{:else}
								{#each agruparEventos(detalle.eventos) as grupo (grupo.fecha)}
									<div class="separador-fecha"><span>{etiquetaFechaGrupo(grupo.fecha)}</span></div>
									{#each grupo.items as evento (evento.id)}
										{#if evento.tipo === 'TICKET'}
											{@const ticketEvento = ticketDeEvento(evento)}
											{#if esTicketCreado(evento)}
												<div class="fila-ticket">
													<span class="icono-canal">{@html iconos.ticket}</span>
													<article class="burbuja-ticket">
														<header>
															<div class="bt-quien">
																<strong>{ticketEvento?.codigo ?? 'Ticket'}</strong>
																<small>Ticket vinculado</small>
															</div>
															<time>{formatearHora(evento.fechaHora)}</time>
														</header>
														<p class="bt-titulo">{ticketEvento?.titulo ?? evento.contenido}</p>
														{#if ticketEvento}
															<div class="bt-chips">
																<span class="chip estado-ticket {claseTicketEstado(ticketEvento.estado)}">{etiquetaTicketEstado(ticketEvento.estado)}</span>
																<span class="chip prioridad {PRIORIDADES_TICKET[ticketEvento.prioridad]?.clase ?? 'normal'}">{etiquetaTicketPrioridad(ticketEvento.prioridad)}</span>
																{#if ticketEvento.bloqueante}<span class="chip alerta">Bloqueante</span>{/if}
															</div>
														{/if}
														<footer>
															<small>{evento.autor?.nombre ?? evento.autorNombre ?? 'Sistema'}</small>
															{#if ticketEvento}
																<button type="button" class="enlace-ticket" onclick={() => verTicket(ticketEvento)}>Ver ticket</button>
															{/if}
														</footer>
													</article>
												</div>
											{:else}
												<div class="evento-ticket">
													{@html iconos.ticket}
													<span><strong>Ticket</strong> {evento.contenido}</span>
													<time>{formatearHora(evento.fechaHora)}</time>
													{#if ticketEvento}
														<button type="button" class="enlace-ticket" onclick={() => verTicket(ticketEvento)}>Ver</button>
													{/if}
												</div>
											{/if}
										{:else if ['ESTADO', 'PRIORIDAD', 'RESPONSABLE', 'FACTURA', 'CIERRE', 'CREACION', 'SISTEMA'].includes(evento.tipo) || evento.canal === 'SISTEMA'}
											<div class="evento-sistema">
												<span class="linea"></span>
												<span class="texto">
													<strong>{evento.autor?.nombre ?? evento.autorNombre ?? 'Sistema'}</strong>
													{evento.contenido}
													<time>{formatearHora(evento.fechaHora)}</time>
												</span>
												<span class="linea"></span>
											</div>
										{:else}
											<div class="fila-mensaje" class:propia={evento.direccion === 'SALIENTE'} class:nota={evento.canal === 'NOTA'}>
												<span class="icono-canal">{@html iconos[iconoCanal(evento.canal)] ?? iconos.centro}</span>
												<article class="burbuja" class:propia={evento.direccion === 'SALIENTE'} class:entrante={evento.direccion === 'ENTRANTE'} class:nota={evento.canal === 'NOTA'}>
													<header>
														<div class="quien">
															<strong>{evento.direccion === 'ENTRANTE' ? evento.contacto || evento.autor?.nombre || 'Cliente' : evento.autor?.nombre ?? evento.autorNombre ?? 'Sistema'}</strong>
															<small>
																{etiquetaCanal(evento.canal)}
																{#if evento.direccion === 'ENTRANTE'} · entrante{:else if evento.direccion === 'SALIENTE'} · saliente{/if}
																{#if evento.visibleCliente} · visible al cliente{:else if evento.canal === 'NOTA'} · solo interno{/if}
															</small>
														</div>
														<time>{formatearFechaHora(evento.fechaHora)}</time>
													</header>
													<p class="contenido">{evento.contenido}</p>
													<footer>
														{#if evento.estadoEntrega}<span class="entrega">{etiquetaEntrega(evento.estadoEntrega)}</span>{/if}
														{#if evento.metadatos?.destinatarios && Array.isArray(evento.metadatos.destinatarios)}
															<span title="Destinatarios">{@html iconos.correo} {(evento.metadatos.destinatarios as string[]).join(', ')}</span>
														{/if}
														{#if evento.contacto}<span>{@html iconos.telefono} {evento.contacto}</span>{/if}
														{#if evento.editado}<span class="editado">editado</span>{/if}
														{#if evento.canal === 'WHATSAPP' && evento.metadatos?.whatsappMensajeId && puedeEditar}
															<button type="button" class="desvincular" title="Quitar este mensaje de este caso" onclick={() => desvincularWhatsapp(evento)}>Quitar</button>
														{/if}
													</footer>
												</article>
											</div>
										{/if}
									{/each}
								{/each}
							{/if}
						</div>

					{:else if tab === 'facturas'}
						<div class="facturas-panel">
							<div class="facturas-cab">
								<div class="facturas-totales">
									<span><small>Total original</small><strong>{dinero(facturasActivas.filter((f) => f.moneda !== 'USD').reduce((t, f) => t + Number(f.importe), 0))}{facturasActivas.some((f) => f.moneda === 'USD') ? ` + ${dinero(facturasActivas.filter((f) => f.moneda === 'USD').reduce((t, f) => t + Number(f.importe), 0), 'USD')}` : ''}</strong></span>
									<span><small>Saldo actual</small><strong>{dinero(saldoUYU)}{saldoUSD > 0 ? ` + ${dinero(saldoUSD, 'USD')}` : ''}</strong></span>
									<span><small>Vencido</small><strong class="texto-alerta">{dinero(facturasVencidas.filter((f) => f.moneda !== 'USD').reduce((t, f) => t + Number(f.saldo), 0))}{facturasVencidas.some((f) => f.moneda === 'USD') ? ` + ${dinero(facturasVencidas.filter((f) => f.moneda === 'USD').reduce((t, f) => t + Number(f.saldo), 0), 'USD')}` : ''}</strong></span>
									<span><small>Mayor atraso</small><strong>{detalle.facturas.mayorAtraso} días</strong></span>
								</div>
								{#if puedeEditar}
									<div class="facturas-acciones">
										<button type="button" class="btn sm" onclick={abrirFacturas}>{@html iconos.agregar} Agregar facturas</button>
										<button type="button" class="btn sm" disabled={facturasVencidas.length === 0} onclick={() => abrirCorreo(facturasVencidas)}>{@html iconos.correo} Enviar vencidas</button>
										{#if facturasActivas.length > 0 && facturasActivas.every((f) => Number(f.saldo) <= 0)}
											<button type="button" class="btn sm primary" onclick={() => { estadoElegido = 'CERRADO_PAGADO'; motivoEstado = 'Todas las facturas quedaron pagadas.'; modalEstado = true; }}>Sugerir cierre</button>
										{/if}
									</div>
								{/if}
							</div>

							{#if facturasActivas.length === 0}
								<div class="estado-vacio">
									{@html iconos.factura}
									<strong>Sin facturas asociadas</strong>
									<p>El seguimiento se creó sin comprobantes activos.</p>
									{#if puedeEditar}<button type="button" class="btn sm" onclick={abrirFacturas}>Agregar facturas</button>{/if}
								</div>
							{:else}
								<div class="tabla-scroll">
									<table>
										<thead>
											<tr>
												<th><input type="checkbox" aria-label="Seleccionar todas" onchange={(e) => { const marcado = (e.currentTarget as HTMLInputElement).checked; const ids = facturasActivas.map((f) => f.id); correoFacturas = marcado ? ids : []; }} /></th>
												<th>Emisión</th>
												<th>Vencimiento</th>
												<th>Comprobante</th>
												<th class="numero">Importe</th>
												<th class="numero">Saldo</th>
												<th class="numero">Aging</th>
												<th>Estado</th>
												<th>Acciones</th>
											</tr>
										</thead>
										<tbody>
											{#each facturasActivas as factura (factura.id)}
												<tr class:vencida={factura.vencida}>
													<td><input type="checkbox" checked={correoFacturas.includes(factura.id)} onchange={(e) => { correoFacturas = (e.currentTarget as HTMLInputElement).checked ? [...correoFacturas, factura.id] : correoFacturas.filter((id) => id !== factura.id); }} /></td>
													<td>{formatearFecha(factura.fechaEmision)}</td>
													<td>{factura.fechaVencimiento ? formatearFecha(factura.fechaVencimiento) : '—'}<small>{factura.plazoDias} días</small></td>
													<td><strong>{factura.tipoComprobante} {factura.serie}-{factura.numero}</strong><small>período {factura.periodo}</small></td>
													<td class="numero">{dinero(factura.importe, factura.moneda)}</td>
													<td class="numero"><strong>{dinero(factura.saldo, factura.moneda)}</strong></td>
													<td class="numero">{factura.diasAging}</td>
													<td><span class="chip factura-estado {factura.estado.toLowerCase()}">{factura.estado === 'PENDIENTE' ? 'Pendiente' : factura.estado === 'PARCIAL' ? 'Parcial' : factura.estado === 'PAGADA' ? 'Pagada' : 'Anulada'}</span></td>
													<td class="acciones-fila">
														{#if puedeEditar}<button type="button" class="btn-icono" title="Retirar del seguimiento" onclick={() => abrirRetirar(factura)}>{@html iconos.equis}</button>{/if}
														<button type="button" class="btn-icono" title="Registrar correo con esta factura" onclick={() => abrirCorreo([factura])}>{@html iconos.correo}</button>
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
								<p class="nota-pie">Los saldos se recalculan contra la última cartera importada. Las facturas pagadas se conservan con saldo cero. Para el PDF, usá el envío de estado de cuenta desde Cobranza.</p>
							{/if}
						</div>
					{:else}
						<div class="tickets-panel">
							{#if detalle.ticketsDetalle.length === 0}
								<div class="estado-vacio">
									{@html iconos.ticket}
									<strong>Sin tickets vinculados</strong>
									<p>Creá uno desde el compositor del historial y queda asociado a este caso.</p>
									{#if detalle.permisos.crearTicket}
										<button type="button" class="btn sm" onclick={abrirTicket}>Crear ticket</button>
									{/if}
								</div>
							{:else}
								<ul class="tickets-lista">
									{#each detalle.ticketsDetalle as ticket (ticket.id)}
										<li class="ticket-item" class:bloqueante={ticket.bloqueante}>
											<div class="ti-cab">
												<strong>{ticket.codigo}</strong>
												<span class="chip estado-ticket {claseTicketEstado(ticket.estado)}">{etiquetaTicketEstado(ticket.estado)}</span>
												<span class="chip prioridad {PRIORIDADES_TICKET[ticket.prioridad]?.clase ?? 'normal'}">{etiquetaTicketPrioridad(ticket.prioridad)}</span>
												{#if ticket.bloqueante}<span class="chip alerta">Bloqueante</span>{/if}
											</div>
											<p class="ti-titulo">{ticket.titulo}</p>
											<div class="ti-meta">
												<span>{ticket.areaResponsable?.nombre ?? 'Sin área'}</span>
												<span>{ticket.usuarioAsignado?.nombre ?? 'Sin asignar'}</span>
												<span>Creado {formatearFechaHora(ticket.fechaCreacion)}</span>
											</div>
											<div class="ti-acciones">
												<button type="button" class="btn sm" onclick={() => verTicket(ticket)}>Ver y responder</button>
												<a class="btn sm" href={`/tickets?ticket=${ticket.codigo}`}>Abrir en Centro de tickets</a>
											</div>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					{/if}
				</div>
				{#if tab === 'historial'}
					{#if detalle.permisos.editar && !detalle.fechaCierre}
						<div class="compositor">
							{#if canal === 'TELEFONO' || canal === 'WHATSAPP' || canal === 'WHATSAPP_MANUAL' || canal === 'CORREO_MANUAL' || canal === 'REUNION' || canal === 'OTRO'}
								<div class="comp-fila">
									<input class="contacto" bind:value={contacto} placeholder="Contacto / interlocutor (opcional)" />
								</div>
							{/if}
							{#if canalManual}
								<div class="comp-fila comp-direccion">
									<span class="nota-mini">
										{canal === 'CORREO_MANUAL' ? 'Correo manual' : 'WhatsApp manual'} · solo registra, no envía
									</span>
									<label><input type="radio" bind:group={direccionManual} value="SALIENTE" /> Enviado</label>
									<label><input type="radio" bind:group={direccionManual} value="ENTRANTE" /> Recibido</label>
								</div>
							{/if}
							<textarea
								bind:value={texto}
								rows="2"
								placeholder="Escriba un avance o mensaje…"
								onkeydown={(evento) => {
									if ((evento.ctrlKey || evento.metaKey) && evento.key === 'Enter') {
										evento.preventDefault();
										if (canal === 'CORREO') abrirCorreo();
										else if (canal === 'WHATSAPP') void enviarWhatsappReal();
										else registrar();
									}
								}}
							></textarea>
							<div class="comp-acciones">
								<button type="button" class="btn sm" onclick={abrirTarea}>{@html iconos.calendario} Programar gestión</button>
								<button type="button" class="btn sm" disabled={!detalle.permisos.crearTicket} title={detalle.permisos.crearTicket ? 'Crear ticket vinculado' : 'Necesitás la pantalla de Tickets'} onclick={abrirTicket}>{@html iconos.ticket} Crear ticket</button>
								<label class="canal-select">
									{@html iconos[iconoCanal(canal)] ?? iconos.centro}
									<select bind:value={canal}>
										{#each CANALES as opcion (opcion.valor)}<option value={opcion.valor}>{opcion.etiqueta}</option>{/each}
									</select>
								</label>
								<span class="hint">@usuario para mencionar · Ctrl+Enter para registrar</span>
								<span class="separador"></span>
								{#if canal === 'CORREO'}
									<button type="button" class="btn primary" disabled={enviando || !texto.trim()} onclick={() => abrirCorreo()}>{@html iconos.correo} Enviar correo</button>
								{:else if canal === 'WHATSAPP'}
									{#if whatsappConectado && detalle.telefonoWhatsapp}
										<button type="button" class="btn primary" disabled={enviandoWhatsApp || !texto.trim()} onclick={enviarWhatsappReal}>
											{@html iconos.telefono} {enviandoWhatsApp ? 'Enviando…' : 'Enviar por WhatsApp'}
										</button>
									{:else}
										<button type="button" class="btn primary" disabled={!texto.trim()} onclick={abrirWhatsapp}>
											{@html iconos.telefono} Abrir WhatsApp (manual)
										</button>
									{/if}
								{:else}
									<button type="button" class="btn primary" disabled={enviando || !texto.trim()} onclick={registrar}>
										{canal === 'NOTA'
											? 'Registrar nota'
											: canal === 'TELEFONO'
												? 'Registrar llamada'
												: canal === 'REUNION'
													? 'Registrar reunión'
													: canal === 'CORREO_MANUAL'
														? 'Registrar correo manual'
														: canal === 'WHATSAPP_MANUAL'
															? 'Registrar WhatsApp manual'
															: 'Registrar avance'}
									</button>
								{/if}
							</div>
						</div>
					{:else}
						<div class="solo-lectura">
							{@html iconos.candado}
							{#if detalle.fechaCierre}
								El seguimiento está cerrado. Reabrilo desde la cabecera para registrar nuevos movimientos.
							{:else}
								Estás como observador: podés consultar el caso, pero no editarlo.
							{/if}
						</div>
					{/if}
				{/if}
			{/if}
		</section>
	</div>
</div>

<!-- ============================================================== Modales -->
{#if modalNuevo}
	<div class="velo" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) modalNuevo = false; }}>
		<div class="modal ancho" role="dialog" aria-modal="true" aria-label="Nuevo seguimiento">
			<header class="modal-cab">
				<div>
					<span class="kicker">ALTA DE CASO</span>
					<h3>Nuevo seguimiento</h3>
				</div>
				<button type="button" class="cerrar" onclick={() => (modalNuevo = false)} aria-label="Cerrar">{@html iconos.equis}</button>
			</header>
			<div class="modal-cuerpo">
				<div class="pasos">
					<span class:activo={pasoNuevo === 1}>1 · Servicio y facturas</span>
					<span class:activo={pasoNuevo === 2}>2 · Datos del caso</span>
				</div>

				{#if pasoNuevo === 1}
					{#if !servicioElegido}
						<div class="buscador-servicio">
							<input bind:value={busquedaServicio} placeholder="Buscar servicio por nombre, fantasía o RUT/CI…" onkeydown={(e) => e.key === 'Enter' && buscarServicio()} />
							<button type="button" class="btn primary" onclick={buscarServicio} disabled={buscandoServicios}>{buscandoServicios ? 'Buscando…' : 'Buscar'}</button>
						</div>
						{#if resultadosServicios.length > 0}
							<ul class="resultados">
								{#each resultadosServicios as servicio (servicio.id)}
									<li>
										<button type="button" onclick={() => elegirServicio(servicio)}>
											<span>
												<strong>{servicio.nombreFantasia || servicio.nombre}</strong>
												<small>{servicio.nombre} · {servicio.numeracion ?? 'sin RUT'} · {dinero(servicio.deudaUYU)}{Number(servicio.deudaUSD) > 0 ? ` + ${dinero(servicio.deudaUSD, 'USD')}` : ''}</small>
											</span>
											{#if servicio.seguimientosActivos.length > 0}
												<span class="chip aviso-suave">{servicio.seguimientosActivos.length} activo(s)</span>
											{/if}
										</button>
									</li>
								{/each}
							</ul>
						{:else if busquedaServicio.trim().length >= 2 && !buscandoServicios}
							<p class="nota">Sin resultados. Probá con otra parte del nombre.</p>
						{/if}
					{:else}
						<div class="servicio-elegido">
							<div>
								<strong>{servicioElegido.nombreFantasia || servicioElegido.nombre}</strong>
								<small>{servicioElegido.nombre} · {servicioElegido.numeracion ?? 'sin RUT'}</small>
							</div>
							<button type="button" class="btn sm" onclick={() => { servicioElegido = null; comprobantesServicio = []; seleccionComprobantes = []; }}>Cambiar</button>
						</div>

						{#if servicioElegido.seguimientosActivos.length > 0}
							<div class="aviso info">
								<strong>Ya hay seguimientos activos para este servicio.</strong>
								<ul>
									{#each servicioElegido.seguimientosActivos as activo (activo.id)}
										<li>{activo.codigo} · {activo.titulo} · {ESTADOS[activo.estado]?.etiqueta ?? activo.estado}</li>
									{/each}
								</ul>
								<p>Podés crear otro caso con estas facturas o abrir uno existente desde el panel izquierdo.</p>
							</div>
						{/if}

						{#if cargandoComprobantes}
							<p class="nota">Cargando comprobantes…</p>
						{:else if comprobantesServicio.length === 0}
							<p class="nota">El servicio no tiene comprobantes pendientes en la última cartera.</p>
						{:else}
							<div class="tabla-scroll corta">
								<table>
									<thead><tr><th></th><th>Comprobante</th><th>Vencimiento</th><th class="numero">Saldo</th><th>Aging</th></tr></thead>
									<tbody>
										{#each comprobantesServicio as comprobante (comprobante.id)}
											<tr>
												<td><input type="checkbox" checked={seleccionComprobantes.includes(comprobante.id)} onchange={() => alternarComprobante(comprobante.id)} /></td>
												<td><strong>{comprobante.tipoComprobante} {comprobante.serie}-{comprobante.numero}</strong></td>
												<td>{comprobante.fechaVencimiento ? formatearFecha(comprobante.fechaVencimiento) : '—'}</td>
												<td class="numero">{dinero(comprobante.saldo, comprobante.moneda)}</td>
												<td>{comprobante.diasAging}</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
							<div class="seleccion-totales">
								<span>{seleccionComprobantes.length} seleccionado(s)</span>
								<strong>{dinero(comprobantesServicio.filter((c) => seleccionComprobantes.includes(c.id) && c.moneda === 'UYU').reduce((t, c) => t + Number(c.saldo), 0))}
								{#if comprobantesServicio.some((c) => seleccionComprobantes.includes(c.id) && c.moneda === 'USD')}
									+ {dinero(comprobantesServicio.filter((c) => seleccionComprobantes.includes(c.id) && c.moneda === 'USD').reduce((t, c) => t + Number(c.saldo), 0), 'USD')}
								{/if}</strong>
							</div>
						{/if}
					{/if}
				{:else}
					<div class="form-grid">
						<label class="span-2">Título del caso
							<input bind:value={nuevoTitulo} maxlength="200" placeholder="Ej.: Cobranza facturas impagas" />
						</label>
						<label class="span-2">Motivo u objetivo
							<textarea bind:value={nuevoMotivo} rows="2" placeholder="Contexto del caso, acuerdo previo, etc."></textarea>
						</label>
						<label>Estado inicial
							<select bind:value={nuevoEstado}>
								{#each Object.entries(ESTADOS).filter(([valor]) => !valor.startsWith('CERRADO')) as [valor, config] (valor)}
									<option value={valor}>{config.etiqueta}</option>
								{/each}
							</select>
						</label>
						<label>Prioridad
							<select bind:value={nuevoPrioridad}>
								{#each Object.entries(PRIORIDADES) as [valor, config] (valor)}<option value={valor}>{config.etiqueta}</option>{/each}
							</select>
						</label>
						<label>Responsable
							<select bind:value={nuevoResponsable}>
								{#each catalogos.usuarios as persona (persona.id)}<option value={persona.id}>{persona.nombre}</option>{/each}
							</select>
						</label>
						<label class="span-2">Celular WhatsApp del caso
							<input bind:value={nuevoTelefono} placeholder="099 123 456" inputmode="tel" />
							<small>Se copia del servicio. Es el número con el que se asocian las respuestas al caso.</small>
						</label>
						<label>Observadores (solo lectura)
							<select multiple bind:value={nuevoObservadores} class="multiple">
								{#each catalogos.usuarios as persona (persona.id)}<option value={persona.id}>{persona.nombre}{persona.areaNombre ? ` · ${persona.areaNombre}` : ''}</option>{/each}
							</select>
						</label>
						<label class="span-2">Primera nota (opcional)
							<textarea bind:value={nuevaNota} rows="2"></textarea>
						</label>
						<div class="span-2 separador-form">
							<strong>Próxima gestión (opcional)</strong>
						</div>
						<label>Tipo de acción
							<select bind:value={nuevoProximaTipo}>
								{#each TIPOS_ACCION as tipo (tipo.valor)}<option value={tipo.valor}>{tipo.etiqueta}</option>{/each}
							</select>
						</label>
						<label>Fecha y hora
							<input type="datetime-local" bind:value={nuevoProximaFecha} />
						</label>
						<label class="span-2">Nota de la gestión
							<input bind:value={nuevoProximaNota} placeholder="Objetivo del contacto" />
						</label>
					</div>
				{/if}
			</div>
			<footer class="modal-pie">
				<button type="button" class="btn" onclick={() => (modalNuevo = false)}>Cancelar</button>
				{#if pasoNuevo === 1}
					<button type="button" class="btn primary" disabled={!servicioElegido || seleccionComprobantes.length === 0} onclick={() => (pasoNuevo = 2)}>Continuar</button>
				{:else}
					<button type="button" class="btn" onclick={() => (pasoNuevo = 1)}>Volver</button>
					<button type="button" class="btn primary" disabled={guardandoNuevo} onclick={guardarNuevo}>{guardandoNuevo ? 'Creando…' : 'Crear seguimiento'}</button>
				{/if}
			</footer>
		</div>
	</div>
{/if}

{#if modalEstado}
	<div class="velo" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) modalEstado = false; }}>
		<div class="modal" role="dialog" aria-modal="true">
			<header class="modal-cab">
				<div><span class="kicker">CAMBIO DE ESTADO</span><h3>{ESTADOS[estadoElegido].etiqueta}</h3></div>
				<button type="button" class="cerrar" onclick={() => (modalEstado = false)} aria-label="Cerrar">{@html iconos.equis}</button>
			</header>
			<div class="modal-cuerpo">
				{#if estadoElegido.startsWith('CERRADO')}
					<label class="campo">Motivo del cierre (obligatorio)
						<textarea bind:value={motivoEstado} rows="3" placeholder="Ej.: saldo cancelado con transferencia del 12/11"></textarea>
					</label>
					<p class="nota">El cierre se rechaza si hay tickets bloqueantes abiertos o gestiones pendientes.</p>
				{:else}
					<p class="nota">El cambio genera un evento automático en el historial con usuario, fecha y hora.</p>
				{/if}
			</div>
			<footer class="modal-pie">
				<button type="button" class="btn" onclick={() => (modalEstado = false)}>Cancelar</button>
				<button type="button" class="btn primary" disabled={enviando} onclick={confirmarEstado}>Confirmar</button>
			</footer>
		</div>
	</div>
{/if}

{#if modalPromesa}
	<div class="velo" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) modalPromesa = false; }}>
		<div class="modal" role="dialog" aria-modal="true">
			<header class="modal-cab">
				<div><span class="kicker">COMPROMISO DEL CLIENTE</span><h3>Registrar promesa de pago</h3></div>
				<button type="button" class="cerrar" onclick={() => (modalPromesa = false)} aria-label="Cerrar">{@html iconos.equis}</button>
			</header>
			<div class="modal-cuerpo form-grid">
				<label>Fecha comprometida<input type="date" bind:value={promesaFecha} /></label>
				<label>Importe<input type="number" min="0" step="0.01" bind:value={promesaImporte} /></label>
				<label>Moneda<select bind:value={promesaMoneda}><option value="UYU">UYU</option><option value="USD">USD</option></select></label>
				<label>Medio de pago<input bind:value={promesaMedio} placeholder="Transferencia, cheque, efectivo…" /></label>
				<label>Confirmó por parte del cliente<input bind:value={promesaContacto} /></label>
				<label class="span-2">Observaciones<textarea bind:value={promesaObservaciones} rows="2"></textarea></label>
				<label class="span-2">Facturas que cubriría
					<select multiple bind:value={promesaFacturas} class="multiple">
						{#each facturasActivas as factura (factura.id)}
							<option value={factura.comprobanteId}>{factura.tipoComprobante} {factura.serie}-{factura.numero} · {dinero(factura.saldo, factura.moneda)}</option>
						{/each}
					</select>
				</label>
			</div>
			<footer class="modal-pie">
				<button type="button" class="btn" onclick={() => (modalPromesa = false)}>Cancelar</button>
				<button type="button" class="btn primary" disabled={enviando} onclick={guardarPromesa}>Registrar promesa</button>
			</footer>
		</div>
	</div>
{/if}

{#if modalTarea}
	<div class="velo" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) modalTarea = false; }}>
		<div class="modal" role="dialog" aria-modal="true">
			<header class="modal-cab">
				<div><span class="kicker">PRÓXIMA GESTIÓN</span><h3>Programar tarea</h3></div>
				<button type="button" class="cerrar" onclick={() => (modalTarea = false)} aria-label="Cerrar">{@html iconos.equis}</button>
			</header>
			<div class="modal-cuerpo form-grid">
				<label>Tipo de acción
					<select bind:value={tareaTipo}>
						{#each TIPOS_ACCION as tipo (tipo.valor)}<option value={tipo.valor}>{tipo.etiqueta}</option>{/each}
					</select>
				</label>
				<label>Título<input bind:value={tareaTitulo} placeholder="Ej.: Llamar para confirmar pago" /></label>
				<label>Fecha y hora<input type="datetime-local" bind:value={tareaFecha} /></label>
				<label>Responsable
					<select bind:value={tareaResponsable}>
						{#each catalogos.usuarios as persona (persona.id)}<option value={persona.id}>{persona.nombre}</option>{/each}
					</select>
				</label>
				<label>Recordatorio
					<select bind:value={tareaRecordatorio}>
						<option value={0}>En el momento</option>
						<option value={15}>15 minutos antes</option>
						<option value={60}>1 hora antes</option>
						<option value={1440}>1 día antes</option>
					</select>
				</label>
				<label class="span-2">Nota u objetivo<textarea bind:value={tareaNota} rows="2"></textarea></label>
			</div>
			<footer class="modal-pie">
				<button type="button" class="btn" onclick={() => (modalTarea = false)}>Cancelar</button>
				<button type="button" class="btn primary" disabled={enviando} onclick={guardarTarea}>Programar</button>
			</footer>
		</div>
	</div>
{/if}

{#if modalTareaAccion && tareaObjetivo}
	<div class="velo" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) modalTareaAccion = false; }}>
		<div class="modal" role="dialog" aria-modal="true">
			<header class="modal-cab">
				<div><span class="kicker">GESTIÓN PROGRAMADA</span><h3>{tareaObjetivo.titulo}</h3></div>
				<button type="button" class="cerrar" onclick={() => (modalTareaAccion = false)} aria-label="Cerrar">{@html iconos.equis}</button>
			</header>
			<div class="modal-cuerpo">
				<div class="opciones-accion">
					{#each [['COMPLETAR', 'Completar'], ['REPROGRAMAR', 'Reprogramar'], ['TRANSFERIR', 'Transferir'], ['CANCELAR', 'Cancelar']] as [valor, etiqueta] (valor)}
						<button type="button" class:activa={tareaAccion === valor} onclick={() => (tareaAccion = valor as typeof tareaAccion)}>{etiqueta}</button>
					{/each}
				</div>
				{#if tareaAccion === 'COMPLETAR'}
					<label class="campo">Resultado<textarea bind:value={tareaResultado} rows="3" placeholder="Qué respondió el cliente, qué se acordó…"></textarea></label>
				{:else if tareaAccion === 'REPROGRAMAR'}
					<label class="campo">Nueva fecha y hora<input type="datetime-local" bind:value={tareaNuevaFecha} /></label>
					<label class="campo">Motivo<input bind:value={tareaMotivo} /></label>
				{:else if tareaAccion === 'TRANSFERIR'}
					<label class="campo">Nuevo responsable
						<select bind:value={tareaNuevoResponsable}>
							{#each catalogos.usuarios as persona (persona.id)}<option value={persona.id}>{persona.nombre}</option>{/each}
						</select>
					</label>
				{:else}
					<label class="campo">Motivo de cancelación<textarea bind:value={tareaMotivo} rows="2"></textarea></label>
				{/if}
			</div>
			<footer class="modal-pie">
				<button type="button" class="btn" onclick={() => (modalTareaAccion = false)}>Cerrar</button>
				<button type="button" class="btn primary" disabled={enviando} onclick={guardarAccionTarea}>Confirmar</button>
			</footer>
		</div>
	</div>
{/if}

{#if modalCorreo}
	<div class="velo" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) modalCorreo = false; }}>
		<div class="modal ancho" role="dialog" aria-modal="true">
			<header class="modal-cab">
				<div><span class="kicker">CANAL CORREO</span><h3>Registrar correo</h3></div>
				<button type="button" class="cerrar" onclick={() => (modalCorreo = false)} aria-label="Cerrar">{@html iconos.equis}</button>
			</header>
			<div class="modal-cuerpo form-grid">
				{#if cuentasGmail.length > 0}
					<label class="span-2">Cuenta Gmail (envío real con hilo)
						<select bind:value={correoCuentaGmail}>
							{#each cuentasGmail as cuenta (cuenta.id)}
								<option value={cuenta.id}>{cuenta.email}</option>
							{/each}
						</select>
					</label>
				{:else}
					<div class="span-2 aviso info">
						No hay cuentas Gmail conectadas. El correo se registrará en el historial sin enviarse;
						el envío real sigue disponible desde Cobranza. Conectá Gmail en Configuración › Correo.
					</div>
				{/if}
				<label>Dirección
					<select bind:value={correoDireccion}>
						<option value="SALIENTE">Saliente (lo enviamos)</option>
						<option value="ENTRANTE">Entrante (respuesta del cliente)</option>
					</select>
				</label>
				<label>Estado
					<select bind:value={correoEstado}>
						<option value="REGISTRADO">Registrado</option>
						<option value="ENVIADO">Enviado</option>
						<option value="RECIBIDO">Recibido</option>
					</select>
				</label>
				<label class="span-2">Para (separados por coma)<input bind:value={correoPara} /></label>
				<label class="span-2">CC<input bind:value={correoCc} /></label>
				<label class="span-2">Asunto<input bind:value={correoAsunto} /></label>
				<label class="span-2">Cuerpo<textarea bind:value={correoCuerpo} rows="6"></textarea></label>
			</div>
			<footer class="modal-pie">
				<button type="button" class="btn" onclick={() => (modalCorreo = false)}>Cancelar</button>
				{#if correoDireccion === 'SALIENTE' && cuentasGmail.length > 0}
					<button type="button" class="btn" disabled={enviando} onclick={guardarCorreo}>Solo registrar</button>
					<button type="button" class="btn primary" disabled={enviando || !correoCuentaGmail} onclick={enviarCorreoReal}>
						{enviando ? 'Enviando…' : 'Enviar por Gmail'}
					</button>
				{:else}
					<button type="button" class="btn primary" disabled={enviando} onclick={guardarCorreo}>
						{correoDireccion === 'ENTRANTE' ? 'Registrar recibido' : 'Registrar en historial'}
					</button>
				{/if}
			</footer>
		</div>
	</div>
{/if}

{#if modalWhatsapp}
	<div class="velo" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) modalWhatsapp = false; }}>
		<div class="modal" role="dialog" aria-modal="true">
			<header class="modal-cab">
				<div><span class="kicker">CANAL WHATSAPP · MANUAL</span><h3>Preparar conversación</h3></div>
				<button type="button" class="cerrar" onclick={() => (modalWhatsapp = false)} aria-label="Cerrar">{@html iconos.equis}</button>
			</header>
			<div class="modal-cuerpo form-grid">
				<label class="span-2">Número con código de país<input bind:value={whatsappNumero} placeholder="Ej.: 59891234567" /></label>
				<label class="span-2">Mensaje preparado<textarea bind:value={whatsappTexto} rows="4"></textarea></label>
				<p class="nota span-2">Se abre WhatsApp o WhatsApp Web con el texto cargado. La aplicación no envía, no lee ni verifica la entrega: el registro queda como gestión manual.</p>
				{#if whatsappAbierto}
					<div class="span-2 confirmacion-wa">
						<strong>¿Se envió el mensaje?</strong>
						<div>
							<button type="button" class="btn sm primary" disabled={enviando} onclick={confirmarWhatsapp}>Sí, registrar gestión</button>
							<button type="button" class="btn sm" onclick={() => (modalWhatsapp = false)}>No se envió</button>
							<button type="button" class="btn sm" onclick={() => { whatsappAbierto = false; modalWhatsapp = false; }}>Editar registro</button>
						</div>
					</div>
				{/if}
			</div>
			<footer class="modal-pie">
				<button type="button" class="btn" onclick={() => (modalWhatsapp = false)}>Cancelar</button>
				<button type="button" class="btn primary" onclick={abrirEnlaceWhatsapp} disabled={!whatsappTexto.trim()}>Abrir WhatsApp</button>
			</footer>
		</div>
	</div>
{/if}

{#if modalTicket}
	<div class="velo" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) modalTicket = false; }}>
		<div class="modal ancho" role="dialog" aria-modal="true">
			<header class="modal-cab">
				<div><span class="kicker">MÓDULO TRANSVERSAL</span><h3>Crear ticket vinculado</h3></div>
				<button type="button" class="cerrar" onclick={() => (modalTicket = false)} aria-label="Cerrar">{@html iconos.equis}</button>
			</header>
			<div class="modal-cuerpo form-grid">
				<div class="span-2 aviso info">El ticket conserva su conversación y estados en el Centro de tickets. Desde acá se transfieren servicio, seguimiento y facturas como referencia.</div>
				<label class="span-2">Título<input bind:value={ticketTitulo} /></label>
				<label class="span-2">Descripción<textarea bind:value={ticketDescripcion} rows="4" placeholder="Qué se necesita resolver y por qué bloquea la cobranza"></textarea></label>
				<label>Área responsable
					<select bind:value={ticketArea}>
						<option value="">Elegir…</option>
						{#each catalogos.areas as area (area.id)}<option value={area.id}>{area.nombre}</option>{/each}
					</select>
				</label>
				<label>Prioridad
					<select bind:value={ticketPrioridad}>
						<option value="BAJA">Baja</option><option value="NORMAL">Normal</option><option value="ALTA">Alta</option><option value="URGENTE">Urgente</option>
					</select>
				</label>
				<label class="span-2">Asignar a (opcional)
					<select bind:value={ticketAsignado}>
						<option value="">Sin asignar</option>
						{#each catalogos.usuarios as persona (persona.id)}<option value={persona.id}>{persona.nombre}</option>{/each}
					</select>
				</label>
				<label class="check-inline span-2"><input type="checkbox" bind:checked={ticketBloqueante} /> Este ticket bloquea la cobranza</label>
				{#if ticketBloqueante}
					<label class="span-2">Motivo del bloqueo<input bind:value={ticketMotivoBloqueo} placeholder="Ej.: falta confirmar la nota de crédito" /></label>
				{/if}
			</div>
			<footer class="modal-pie">
				<button type="button" class="btn" onclick={() => (modalTicket = false)}>Cancelar</button>
				<button type="button" class="btn primary" disabled={enviando} onclick={guardarTicket}>Crear y vincular</button>
			</footer>
		</div>
	</div>
{/if}

{#if modalVerTicket}
	<div class="velo" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) modalVerTicket = false; }}>
		<div class="modal ancho ticket-modal" role="dialog" aria-modal="true">
			<header class="modal-cab">
				<div>
					<span class="kicker">TICKET VINCULADO</span>
					<h3>{ticketVisto?.codigo ?? 'Cargando…'}{ticketVisto ? ` · ${ticketVisto.titulo}` : ''}</h3>
				</div>
				<button type="button" class="cerrar" onclick={() => (modalVerTicket = false)} aria-label="Cerrar">{@html iconos.equis}</button>
			</header>
			<div class="modal-cuerpo">
				{#if cargandoTicket}
					<p class="nota">Cargando ticket…</p>
				{:else if ticketVisto}
					<div class="tv-ficha">
						<div class="tv-chips">
							<span class="chip estado-ticket {claseTicketEstado(ticketVisto.estado)}">{etiquetaTicketEstado(ticketVisto.estado)}</span>
							<span class="chip prioridad {PRIORIDADES_TICKET[ticketVisto.prioridad]?.clase ?? 'normal'}">{etiquetaTicketPrioridad(ticketVisto.prioridad)}</span>
							{#if ticketVisto.bloqueante}<span class="chip alerta">Bloqueante</span>{/if}
						</div>
						<p class="tv-descripcion">{ticketVisto.descripcion}</p>
						<div class="tv-meta">
							<span><b>Área</b> {ticketVisto.areaResponsable?.nombre ?? 'Sin área'}</span>
							<span><b>Asignado</b> {ticketVisto.usuarioAsignado?.nombre ?? 'Sin asignar'}</span>
							<span><b>Creado</b> {formatearFechaHora(ticketVisto.fechaCreacion)}</span>
							<a class="enlace-ticket" href={`/tickets?ticket=${ticketVisto.codigo}`}>Abrir en Centro de tickets</a>
						</div>
					</div>
					<div class="tv-conversacion" bind:this={conversacionTicket}>
						<ConversacionTicket mensajes={ticketVisto.mensajes} usuarioId={usuario?.id ?? ''} />
					</div>
				{/if}
			</div>
			{#if ticketVisto}
				<CompositorTicket
					ticket={ticketVisto}
					{usuario}
					areas={catalogos.areas}
					usuarios={catalogos.usuarios}
					{cuentasGmail}
					onEnviar={enviarRespuestaTicket}
					onAviso={mostrarAviso}
					onEnviado={alResponderTicket}
				/>
			{/if}
		</div>
	</div>
{/if}

{#if modalFacturas}
	<div class="velo" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) modalFacturas = false; }}>
		<div class="modal ancho" role="dialog" aria-modal="true">
			<header class="modal-cab">
				<div><span class="kicker">FACTURAS DEL SERVICIO</span><h3>Agregar comprobantes</h3></div>
				<button type="button" class="cerrar" onclick={() => (modalFacturas = false)} aria-label="Cerrar">{@html iconos.equis}</button>
			</header>
			<div class="modal-cuerpo">
				{#if cargandoDisponibles}
					<p class="nota">Cargando cartera del servicio…</p>
				{:else if comprobantesDisponibles.length === 0}
					<p class="nota">No hay comprobantes pendientes para este servicio.</p>
				{:else}
					<div class="tabla-scroll corta">
						<table>
							<thead><tr><th></th><th>Comprobante</th><th>Vencimiento</th><th class="numero">Saldo</th><th></th></tr></thead>
							<tbody>
								{#each comprobantesDisponibles as comprobante (comprobante.id)}
									<tr>
										<td><input type="checkbox" checked={facturasElegidas.includes(comprobante.id)} onchange={(e) => { facturasElegidas = (e.currentTarget as HTMLInputElement).checked ? [...facturasElegidas, comprobante.id] : facturasElegidas.filter((id) => id !== comprobante.id); }} /></td>
										<td><strong>{comprobante.tipoComprobante} {comprobante.serie}-{comprobante.numero}</strong></td>
										<td>{comprobante.fechaVencimiento ? formatearFecha(comprobante.fechaVencimiento) : '—'}</td>
										<td class="numero">{dinero(comprobante.saldo, comprobante.moneda)}</td>
										<td>{#if facturasActivas.some((f) => f.comprobanteId === comprobante.id)}<span class="chip">Ya incluida</span>{/if}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
			<footer class="modal-pie">
				<button type="button" class="btn" onclick={() => (modalFacturas = false)}>Cancelar</button>
				<button type="button" class="btn primary" disabled={facturasElegidas.length === 0 || enviando} onclick={guardarFacturas}>Agregar {facturasElegidas.length}</button>
			</footer>
		</div>
	</div>
{/if}

{#if modalRetirar && facturaObjetivo}
	<div class="velo" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) modalRetirar = false; }}>
		<div class="modal" role="dialog" aria-modal="true">
			<header class="modal-cab">
				<div><span class="kicker">RETIRO LÓGICO</span><h3>Retirar comprobante</h3></div>
				<button type="button" class="cerrar" onclick={() => (modalRetirar = false)} aria-label="Cerrar">{@html iconos.equis}</button>
			</header>
			<div class="modal-cuerpo">
				<p class="nota">{facturaObjetivo.tipoComprobante} {facturaObjetivo.serie}-{facturaObjetivo.numero} queda fuera del caso, pero conserva su historial.</p>
				<label class="campo">Motivo (obligatorio)<textarea bind:value={motivoRetiro} rows="3"></textarea></label>
			</div>
			<footer class="modal-pie">
				<button type="button" class="btn" onclick={() => (modalRetirar = false)}>Cancelar</button>
				<button type="button" class="btn danger" disabled={enviando} onclick={guardarRetiro}>Retirar</button>
			</footer>
		</div>
	</div>
{/if}

{#if modalPromesaResultado && promesaObjetivo}
	<div class="velo" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) modalPromesaResultado = false; }}>
		<div class="modal" role="dialog" aria-modal="true">
			<header class="modal-cab">
				<div><span class="kicker">RESULTADO MANUAL</span><h3>Promesa de {dinero(promesaObjetivo.importe, promesaObjetivo.moneda)}</h3></div>
				<button type="button" class="cerrar" onclick={() => (modalPromesaResultado = false)} aria-label="Cerrar">{@html iconos.equis}</button>
			</header>
			<div class="modal-cuerpo">
				<label class="campo">Resultado
					<select bind:value={promesaResultado}>
						<option value="CUMPLIDA">Cumplida total</option>
						<option value="CUMPLIDA_PARCIAL">Cumplida parcial</option>
						<option value="INCUMPLIDA">Incumplida</option>
						<option value="REPROGRAMADA">Reprogramada</option>
						<option value="CANCELADA">Cancelada</option>
					</select>
				</label>
				<label class="campo">Detalle<textarea bind:value={promesaDetalle} rows="2"></textarea></label>
				<p class="nota">La confirmación es manual y queda auditada con tu usuario, fecha y hora.</p>
			</div>
			<footer class="modal-pie">
				<button type="button" class="btn" onclick={() => (modalPromesaResultado = false)}>Cancelar</button>
				<button type="button" class="btn primary" disabled={enviando} onclick={guardarResultadoPromesa}>Guardar resultado</button>
			</footer>
		</div>
	</div>
{/if}

{#if modalBandeja}
	<div class="velo" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) modalBandeja = false; }}>
		<div class="modal ancho" role="dialog" aria-modal="true">
			<header class="modal-cab">
				<div><span class="kicker">BANDEJA DE EXCEPCIONES</span><h3>Correos sin vincular</h3></div>
				<button type="button" class="cerrar" onclick={() => (modalBandeja = false)} aria-label="Cerrar">{@html iconos.equis}</button>
			</header>
			<div class="modal-cuerpo">
				<p class="nota">Ningún correo se asocia automáticamente sin coincidencia segura de hilo, encabezados o identificador. La vinculación manual queda auditada.</p>
				{#if correosPendientes.length === 0}
					<p class="nota">No hay correos pendientes.</p>
				{:else}
					<ul class="correos-pendientes">
						{#each correosPendientes as correo (correo.id)}
							<li>
								<div>
									<strong>{correo.asunto || '(sin asunto)'}</strong>
									<small>{correo.de ?? '—'} · {formatearFechaHora(correo.fechaHora)} {correo.servicio ? `· ${correo.servicio.nombre}` : ''}</small>
									<p>{correo.cuerpo?.slice(0, 180) ?? ''}</p>
								</div>
								<label>Vincular a
									<select onchange={(e) => { const valor = Number((e.currentTarget as HTMLSelectElement).value); if (valor) vincularCorreoPendiente(correo, valor); }}>
										<option value="">Elegir seguimiento…</option>
										{#each lista as item (item.id)}<option value={item.id}>{item.codigo} · {item.servicio.nombre}</option>{/each}
									</select>
								</label>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
			<footer class="modal-pie"><button type="button" class="btn" onclick={() => (modalBandeja = false)}>Cerrar</button></footer>
		</div>
	</div>
{/if}

<style>
	.pantalla-seguimientos {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		height: calc(100dvh - 3.75rem - 4.25rem);
		min-height: 34rem;
		overflow: hidden;
	}

	/* Modo extendido: la barra sale del flujo con un barrido suave. */

	.cabecera-pagina {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.kicker {
		margin-top: 0.35rem;
		color: var(--texto-suave);
		font-size: 0.62rem;
		font-weight: 850;
		letter-spacing: 0.13em;
	}

	.cabecera-pagina h1 {
		margin: 0;
		color: var(--texto);
		font-size: 1.85rem;
		letter-spacing: -0.03em;
	}

	.acciones-cabecera {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.live {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.38rem 0.6rem;
		border: 1px solid var(--exito-borde);
		border-radius: 99px;
		background: var(--exito-tenue);
		color: var(--exito-texto);
		font-size: 0.65rem;
		font-weight: 800;
		white-space: nowrap;
	}
	.live i {
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 50%;
		background: var(--exito);
		box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.2);
	}

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		min-height: 2.05rem;
		padding: 0.42rem 0.7rem;
		border: 1px solid var(--borde);
		border-radius: 0.62rem;
		background: var(--superficie);
		color: var(--texto-suave);
		font-size: 0.7rem;
		font-weight: 750;
		white-space: nowrap;
	}
	.btn:hover:not(:disabled) { background: var(--superficie-alta); border-color: var(--borde-fuerte); color: var(--primario-texto); }
	.btn:disabled { opacity: 0.45; cursor: not-allowed; }
	.btn.primary {
		border-color: transparent;
		background: var(--accion-gradiente);
		color: var(--texto-inverso);
		box-shadow: 0 8px 18px rgba(79, 70, 229, 0.22);
	}
	.btn.primary:hover:not(:disabled) { background: var(--accion-gradiente); color: var(--texto-inverso); }
	.btn.danger { border-color: var(--peligro-borde); color: var(--peligro-texto); }
	.btn.danger:hover { background: var(--peligro-tenue); }
	.btn.sm { min-height: 1.7rem; padding: 0.26rem 0.5rem; font-size: 0.64rem; border-radius: 0.5rem; }
	.cta { min-height: 2.35rem; font-size: 0.74rem; }
	.correo-pendiente { border-color: var(--alerta-borde); background: var(--alerta-tenue); color: var(--alerta-texto); }

	.filtros {
		display: grid;
		gap: 0.4rem;
		padding: 0.55rem 0.65rem;
		border: 1px solid var(--borde);
		border-radius: 0.85rem;
		background: var(--superficie);
		box-shadow: 0 12px 30px rgba(49, 64, 129, 0.07);
	}
	.filtros-fila { display: flex; align-items: flex-end; gap: 0.4rem; flex-wrap: wrap; }
	.buscador { position: relative; flex: 1 1 13rem; min-width: 10rem; }
	.buscador :global(svg) {
		position: absolute;
		left: 0.6rem;
		top: 50%;
		color: var(--texto-tenue);
		font-size: 0.95rem;
		transform: translateY(-50%);
	}
	.buscador input {
		width: 100%;
		height: 2.05rem;
		padding: 0 0.65rem 0 2rem;
		border: 1px solid var(--borde);
		border-radius: 0.55rem;
		background: var(--superficie-alta);
		font-size: 0.72rem;
	}
	.buscador input:focus { outline: 2px solid var(--foco); outline-offset: 1px; background: var(--superficie); }

	.filtros-fila.secundaria { padding-top: 0.35rem; border-top: 1px dashed var(--borde-suave); }
	.check-inline { display: inline-flex; align-items: center; gap: 0.35rem; color: var(--texto-suave); font-size: 0.66rem; font-weight: 650; }
	.check-inline input { width: 0.9rem; height: 0.9rem; accent-color: var(--foco); }
	.limpiar { margin-left: auto; border: 0; background: transparent; color: var(--primario-texto); font-size: 0.65rem; font-weight: 750; }
	.limpiar:hover { text-decoration: underline; }
	.resultado-filtro { margin-left: auto; color: var(--texto-tenue); font-size: 0.62rem; font-weight: 700; }

	.aviso {
		padding: 0.55rem 0.7rem;
		border-radius: 0.6rem;
		font-size: 0.72rem;
	}
	.aviso.conflicto { display: flex; align-items: center; gap: 0.6rem; border: 1px solid var(--alerta-borde); background: var(--alerta-tenue); color: var(--alerta-texto); }
	.aviso.info { border: 1px solid var(--info-borde); background: var(--info-tenue); color: var(--info-texto); font-size: 0.68rem; }
	.aviso.info ul { margin: 0.3rem 0; padding-left: 1.1rem; }

	.workspace {
		display: grid;
		grid-template-columns: minmax(20rem, 26rem) minmax(0, 1fr);
		gap: 0.7rem;
		min-height: 0;
		flex: 1;
	}

	.columna {
		display: flex;
		flex-direction: column;
		min-height: 0;
		border: 1px solid var(--borde);
		border-radius: 0.95rem;
		background: var(--superficie);
		box-shadow: 0 12px 30px rgba(49, 64, 129, 0.07);
		overflow: hidden;
	}

	.lista-cab {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.6rem 0.75rem;
		border-bottom: 1px solid var(--borde-suave);
		color: var(--texto-suave);
		font-size: 0.66rem;
	}
	.lista-cab strong { color: var(--texto); }
	.historial-btn {
		margin-left: auto;
		padding: 0.15rem 0.4rem;
		border: 1px solid var(--primario-borde);
		border-radius: 0.4rem;
		background: var(--primario-tenue);
		color: var(--primario-texto);
		font-size: 0.58rem;
		font-weight: 800;
		white-space: nowrap;
	}
	.historial-btn:hover { background: var(--primario-tenue); }
	.orden { color: var(--texto-tenue); font-size: 0.6rem; font-weight: 700; }

	.lista-scroll { display: grid; align-content: start; gap: 0.45rem; padding: 0.55rem; overflow-y: auto; flex: 1; }

	.tarjeta-caso {
		display: grid;
		gap: 0.3rem;
		padding: 0.55rem 0.6rem;
		border: 1px solid var(--borde-suave);
		border-left: 3px solid transparent;
		border-radius: 0.75rem;
		background: var(--superficie);
		text-align: left;
		transition: border-color 120ms ease, background 120ms ease, box-shadow 120ms ease;
	}
	.tarjeta-caso:hover { background: var(--superficie-alta); border-color: var(--borde-fuerte); }
	.tarjeta-caso.sel {
		border-color: var(--primario);
		border-left-color: var(--primario);
		background: var(--superficie-alta);
		box-shadow: inset 0 0 0 1px var(--primario-borde);
	}
	.tc-top { display: flex; align-items: center; gap: 0.5rem; }
	.avatar {
		display: grid;
		place-items: center;
		flex: 0 0 auto;
		width: 2rem;
		height: 2rem;
		border-radius: 0.55rem;
		background: var(--primario-tenue);
		color: var(--primario-texto);
		font-size: 0.68rem;
		font-weight: 850;
	}
	.avatar.grande { width: 2.6rem; height: 2.6rem; border-radius: 0.7rem; font-size: 0.85rem; }
	.tc-identidad { display: grid; line-height: 1.2; min-width: 0; }
	.tc-identidad strong { color: var(--texto); font-size: 0.78rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.tc-identidad small { color: var(--texto-suave); font-size: 0.6rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.punto-nuevo { width: 0.5rem; height: 0.5rem; border-radius: 50%; background: var(--info); box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15); }
	.tc-estado { margin-left: auto; }

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		padding: 0.14rem 0.4rem;
		border-radius: 99px;
		background: var(--primario-tenue);
		color: var(--primario-texto);
		font-size: 0.57rem;
		font-weight: 800;
		letter-spacing: 0.01em;
		white-space: nowrap;
	}
	.chip.estado { background: var(--primario-tenue); color: var(--primario-texto); }
	.chip.estado.seguimiento { background: var(--primario-tenue); color: var(--primario-texto); }
	.chip.estado.esperando { background: var(--alerta-tenue); color: var(--alerta-texto); }
	.chip.estado.promesa { background: var(--exito-tenue); color: var(--exito-texto); }
	.chip.estado.bloqueado { background: var(--peligro-tenue); color: var(--peligro-texto); }
	.chip.estado.pausado { background: var(--superficie-suave); color: var(--texto-suave); }
	.chip.estado.cerrado { background: var(--superficie-suave); color: var(--texto); }
	.chip.estado.legal { background: var(--primario-tenue); color: var(--primario-texto); }
	.chip.estado.incobrable { background: var(--peligro-tenue); color: var(--peligro-texto); }
	.chip.alerta { background: var(--peligro-tenue); color: var(--peligro-texto); }
	.chip.promesa { background: var(--exito-tenue); color: var(--exito-texto); }
	.chip.ticket { background: var(--info-tenue); color: var(--info-texto); }
	.chip.bloqueado { background: var(--peligro-tenue); color: var(--peligro-texto); }
	.chip.prioridad { background: var(--superficie-suave); color: var(--texto-suave); }
	.chip.prioridad.alta { background: var(--alerta-tenue); color: var(--alerta-texto); }
	.chip.prioridad.urgente { background: var(--peligro-tenue); color: var(--peligro-texto); }
	.chip.codigo { background: var(--primario-tenue); color: var(--primario-texto); font-family: ui-monospace, monospace; }
	.chip.cerrado { background: var(--superficie-suave); color: var(--texto); }
	.chip.aviso-suave { margin-left: auto; background: var(--alerta-tenue); color: var(--alerta-texto); }
	.chip.factura-estado.pendiente { background: var(--primario-tenue); color: var(--primario-texto); }
	.chip.factura-estado.parcial { background: var(--alerta-tenue); color: var(--alerta-texto); }
	.chip.factura-estado.pagada { background: var(--exito-tenue); color: var(--exito-texto); }
	.chip.factura-estado.anulada { background: var(--superficie-suave); color: var(--texto-suave); }

	.tc-titulo { color: var(--texto-suave); font-size: 0.68rem; line-height: 1.3; }

	.esqueleto { display: grid; gap: 0.45rem; padding: 0.8rem; border: 1px solid var(--borde-suave); border-radius: 0.75rem; }
	.linea { height: 0.55rem; border-radius: 99px; background: linear-gradient(90deg, var(--superficie-suave), var(--superficie-alta), var(--superficie-suave)); background-size: 200% 100%; animation: brillo 1.3s infinite linear; }
	.linea.w30 { width: 30%; } .linea.w40 { width: 40%; } .linea.w60 { width: 60%; } .linea.w80 { width: 80%; } .linea.w90 { width: 90%; }
	@keyframes brillo { to { background-position: -200% 0; } }

	.estado-vacio {
		display: grid;
		place-items: center;
		gap: 0.35rem;
		padding: 1.6rem 1rem;
		color: var(--texto-suave);
		text-align: center;
	}
	.estado-vacio :global(svg) { width: 1.6rem; height: 1.6rem; color: var(--texto-tenue); }
	.estado-vacio strong { color: var(--texto); font-size: 0.78rem; }
	.estado-vacio p { max-width: 22rem; font-size: 0.68rem; }
	.estado-vacio.grande { flex: 1; }

	.detalle-col { position: relative; }
	.detalle-scroll { display: flex; flex-direction: column; gap: 0.6rem; min-height: 0; flex: 1; overflow-y: auto; padding: 0.7rem 0.8rem 0.6rem; }
	.detalle-cargando { display: grid; gap: 0.7rem; padding: 1.2rem; }

	.detalle-cabecera { display: flex; align-items: flex-start; gap: 0.7rem; }
	.dc-identidad { display: grid; gap: 0.12rem; min-width: 0; flex: 1; }
	.dc-linea { display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap; }
	.dc-linea h2 { margin: 0; color: var(--texto); font-size: 1.08rem; letter-spacing: -0.02em; }
	.dc-cliente { color: var(--texto-suave); font-size: 0.68rem; }
	.telefono-wa { display: inline-flex; align-items: center; gap: .2rem; color: var(--texto); font-weight: 750; }
	.telefono-wa.verificado::after { content: '✓'; color: var(--exito-texto); font-size: .7rem; }
	.telefono-wa.sin-numero { color: var(--texto-suave); font-weight: 600; }
	.verificar-wa { margin-left: .3rem; padding-block: .15rem; font-size: .62rem; }
	.desvincular { margin-left: auto; border: 0; background: transparent; color: var(--texto-suave); font: inherit; font-size: .6rem; font-weight: 700; text-decoration: underline; cursor: pointer; }
	.desvincular:hover { color: var(--peligro-texto, #f87171); }
	.dc-titulo { color: var(--texto); font-size: 0.76rem; font-weight: 700; }
	.dc-motivo { color: var(--texto-suave); font-size: 0.66rem; }
	.dc-acciones { display: flex; align-items: flex-end; gap: 0.4rem; flex-wrap: wrap; justify-content: flex-end; }
	.control-mini { display: grid; gap: 0.15rem; }
	.control-mini span { color: var(--texto-tenue); font-size: 0.53rem; font-weight: 850; letter-spacing: 0.05em; text-transform: uppercase; }
	.control-mini select {
		height: 1.9rem;
		max-width: 10.5rem;
		border: 1px solid var(--borde);
		border-radius: 0.5rem;
		background: var(--superficie-alta);
		color: var(--texto);
		font-size: 0.66rem;
		font-weight: 700;
		padding: 0 0.4rem;
	}
	.control-mini.responsable select { max-width: 11.5rem; }

	.selector-casos {
		display: grid;
		gap: 0.3rem;
		padding: 0.45rem 0.55rem;
		border: 1px solid var(--borde-suave);
		border-radius: 0.6rem;
		background: var(--superficie-alta);
	}
	.selector-casos .rotulo { color: var(--texto-suave); font-size: 0.55rem; font-weight: 850; letter-spacing: 0.05em; text-transform: uppercase; }
	.selector-lista { display: flex; gap: 0.3rem; flex-wrap: wrap; }
	.selector-item {
		display: grid;
		gap: 0.05rem;
		padding: 0.3rem 0.45rem;
		border: 1px solid var(--borde-suave);
		border-radius: 0.45rem;
		background: var(--superficie);
		text-align: left;
	}
	.selector-item:hover { border-color: var(--primario-borde); background: var(--superficie-alta); }
	.selector-item.activa { border-color: var(--primario); background: var(--primario-tenue); box-shadow: inset 0 0 0 1px var(--primario-borde); }
	.selector-item strong { color: var(--primario-texto); font-size: 0.58rem; font-family: ui-monospace, monospace; }
	.selector-item span { color: var(--texto); font-size: 0.63rem; }
	.selector-item small { color: var(--texto-suave); font-size: 0.53rem; }
	.selector-casos p { color: var(--texto-tenue); font-size: 0.55rem; }

	.resumen-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 0.45rem; }	.mini-card {
		display: grid;
		gap: 0.1rem;
		padding: 0.5rem 0.55rem;
		border: 1px solid var(--borde-suave);
		border-radius: 0.65rem;
		background: var(--superficie-alta);
		min-width: 0;
	}
	.mini-card .rotulo { color: var(--texto-tenue); font-size: 0.52rem; font-weight: 850; letter-spacing: 0.05em; text-transform: uppercase; }
	.mini-card strong { color: var(--texto); font-size: 0.82rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.mini-card strong.fecha { font-size: 0.7rem; }
	.mini-card small { color: var(--texto-suave); font-size: 0.57rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.mini-card.destacada { border-color: var(--exito-borde); background: var(--exito-tenue); }
	.mini-card .sin-dato { color: var(--texto-tenue); }
	.montos { display: flex; gap: 0.35rem; flex-wrap: wrap; }
	.texto-alerta { color: var(--peligro-texto); font-weight: 800; }

	.banda-proxima {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.5rem 0.65rem;
		border: 1px solid var(--primario-borde);
		border-left: 3px solid var(--primario);
		border-radius: 0.65rem;
		background: var(--superficie-alta);
	}
	.banda-proxima.vencida { border-color: var(--peligro-borde); border-left-color: var(--peligro); background: var(--peligro-tenue); }
	.bp-icono { display: grid; place-items: center; width: 1.9rem; height: 1.9rem; border-radius: 0.5rem; background: var(--primario-tenue); color: var(--primario-texto); }
	.banda-proxima.vencida .bp-icono { background: var(--peligro-tenue); color: var(--peligro-texto); }
	.bp-texto { display: grid; gap: 0.05rem; line-height: 1.2; flex: 1; min-width: 0; }
	.bp-texto span { color: var(--texto-suave); font-size: 0.54rem; font-weight: 850; letter-spacing: 0.06em; text-transform: uppercase; }
	.bp-texto strong { color: var(--texto); font-size: 0.74rem; }
	.bp-texto small { color: var(--texto-suave); font-size: 0.6rem; }
	.bp-acciones { display: flex; gap: 0.3rem; }

	.chip.estado-ticket { background: var(--superficie-suave); color: var(--texto); }
	.chip.estado-ticket.nuevo { background: var(--primario-tenue); color: var(--primario-texto); }
	.chip.estado-ticket.abierto { background: var(--info-tenue); color: var(--info-texto); }
	.chip.estado-ticket.proceso { background: var(--primario-tenue); color: var(--primario-texto); }
	.chip.estado-ticket.esperando { background: var(--alerta-tenue); color: var(--alerta-texto); }
	.chip.estado-ticket.resuelto { background: var(--exito-tenue); color: var(--exito-texto); }
	.chip.estado-ticket.cerrado,
	.chip.estado-ticket.cancelado { background: var(--superficie-suave); color: var(--texto-suave); }

	.tabs { display: flex; gap: 0.15rem; padding: 0.15rem; border: 1px solid var(--borde-suave); border-radius: 0.6rem; background: var(--superficie-alta); }
	.tabs button {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.3rem 0.65rem;
		border: 0;
		border-radius: 0.45rem;
		background: transparent;
		color: var(--texto-suave);
		font-size: 0.68rem;
		font-weight: 750;
	}
	.tabs button.activa { background: var(--superficie); color: var(--primario-texto); box-shadow: 0 2px 8px rgba(49, 64, 129, 0.1); }
	.tabs .n { display: inline-grid; place-items: center; min-width: 1.1rem; height: 1.1rem; padding: 0 0.22rem; border-radius: 99px; background: var(--primario-tenue); color: var(--primario-texto); font-size: 0.55rem; }

	.historial { display: grid; align-content: start; gap: 0.6rem; padding: 0.75rem; min-height: 6rem; border: 1px solid var(--borde-suave); border-radius: 0.9rem; background: var(--superficie-alta); }

	.separador-fecha { display: grid; place-items: center; margin: 0.35rem 0 0.1rem; }
	.separador-fecha span { padding: 0.1rem 0.5rem; border-radius: 99px; background: var(--superficie-suave); color: var(--texto-suave); font-size: 0.55rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; }

	.evento-sistema { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 0.5rem; color: var(--texto-suave); font-size: 0.62rem; text-align: center; }
	.evento-sistema .linea { height: 1px; background: var(--superficie-suave); }
	.evento-sistema .texto { display: inline-flex; align-items: center; gap: 0.3rem; flex-wrap: wrap; justify-content: center; }
	.evento-sistema strong { color: var(--texto-suave); }
	.evento-sistema time { color: var(--texto-tenue); }

	.evento-ticket { display: flex; align-items: center; gap: 0.4rem; padding: 0.4rem 0.6rem; border: 1px dashed var(--info-borde); border-radius: 0.55rem; background: var(--info-tenue); color: var(--info-texto); font-size: 0.64rem; }
	.evento-ticket time { margin-left: auto; color: var(--texto-suave); }

	.fila-mensaje { display: flex; align-items: flex-start; gap: 0.55rem; }
	.fila-mensaje.propia { flex-direction: row-reverse; }
	.fila-mensaje > .icono-canal { display: grid; place-items: center; flex: 0 0 auto; width: 2rem; height: 2rem; margin-top: 0.1rem; border-radius: 50%; background: var(--primario-tenue); color: var(--primario-texto); font-size: 0.9rem; box-shadow: 0 2px 5px rgba(15, 23, 42, 0.08); }
	.fila-mensaje.propia > .icono-canal { background: var(--primario); color: var(--texto-inverso); }
	.fila-mensaje.nota > .icono-canal { background: var(--alerta-tenue); color: var(--alerta-texto); }
	.burbuja {
		display: grid;
		gap: 0.3rem;
		min-width: 0;
		max-width: 74%;
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--borde-suave);
		border-radius: 0.9rem;
		background: var(--superficie);
		box-shadow: 0 2px 6px rgba(30, 41, 59, 0.04);
	}
	.burbuja header { display: flex; align-items: center; gap: 0.4rem; }
	.burbuja .quien { display: grid; line-height: 1.15; min-width: 0; }
	.burbuja .quien strong { color: var(--texto); font-size: 0.74rem; }
	.burbuja .quien small { color: var(--texto-suave); font-size: 0.6rem; }
	.burbuja time { margin-left: auto; color: var(--texto-tenue); font-size: 0.57rem; white-space: nowrap; }
	.burbuja .contenido { color: var(--texto); font-size: 0.82rem; line-height: 1.55; white-space: pre-wrap; }
	.burbuja footer { display: flex; gap: 0.5rem; flex-wrap: wrap; color: var(--texto-tenue); font-size: 0.57rem; }
	.burbuja footer span { display: inline-flex; align-items: center; gap: 0.2rem; }
	.burbuja.propia { border-color: var(--borde); background: var(--primario-tenue); }
	.burbuja.nota { background: var(--alerta-tenue); border-color: var(--alerta-borde); max-width: 80%; }
	.burbuja .entrega { color: var(--texto-suave); font-style: italic; }

	.compositor {
		display: grid;
		gap: 0.35rem;
		flex: 0 0 auto;
		padding: 0.55rem 0.8rem 0.65rem;
		border-top: 1px solid var(--borde-suave);
		background: var(--superficie);
	}
	.comp-fila { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
	.comp-direccion { color: var(--texto-suave); font-size: 0.66rem; }
	.comp-direccion label { display: inline-flex; align-items: center; gap: 0.25rem; font-weight: 700; color: var(--texto); cursor: pointer; }
	.comp-direccion input { accent-color: var(--foco); }
	.nota-mini { font-size: 0.62rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
	.canal-select { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0 0.45rem; height: 1.9rem; border: 1px solid var(--borde); border-radius: 0.5rem; background: var(--superficie-alta); color: var(--primario-texto); }
	.canal-select select { border: 0; background: transparent; font-size: 0.66rem; font-weight: 750; color: var(--texto); outline: none; }
	.contacto { height: 1.9rem; min-width: 11rem; border: 1px solid var(--borde); border-radius: 0.5rem; background: var(--superficie-alta); padding: 0 0.5rem; font-size: 0.68rem; }
	.comp-acciones .hint { margin-left: 0.15rem; color: var(--texto-tenue); font-size: 0.56rem; }
	.compositor textarea {
		width: 100%;
		min-height: 2.8rem;
		max-height: 9rem;
		padding: 0.6rem 0.7rem;
		border: 1px solid var(--borde);
		border-radius: 0.75rem;
		background: var(--superficie);
		font-size: 0.76rem;
		line-height: 1.45;
		resize: vertical;
	}
	.compositor textarea:focus { outline: 2px solid var(--foco); outline-offset: 1px; }
	.comp-acciones { display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap; }
	.comp-acciones .separador { flex: 1; }
	.comp-acciones .btn:last-child { min-width: 8.5rem; }
	.solo-lectura { display: flex; align-items: center; gap: 0.4rem; flex: 0 0 auto; margin: 0; padding: 0.7rem 0.8rem; border-top: 1px solid var(--borde-suave); background: var(--superficie-alta); color: var(--texto-suave); font-size: 0.68rem; }

	.facturas-panel { display: grid; gap: 0.5rem; }
	.facturas-cab { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; flex-wrap: wrap; }
	.facturas-totales { display: flex; gap: 0.9rem; flex-wrap: wrap; }
	.facturas-totales span { display: grid; line-height: 1.15; }
	.facturas-totales small { color: var(--texto-tenue); font-size: 0.53rem; font-weight: 850; text-transform: uppercase; letter-spacing: 0.05em; }
	.facturas-totales strong { color: var(--texto); font-size: 0.78rem; }
	.facturas-acciones { display: flex; gap: 0.3rem; flex-wrap: wrap; }
	.tabla-scroll { overflow: auto; border: 1px solid var(--borde-suave); border-radius: 0.6rem; }
	.tabla-scroll.corta { max-height: 18rem; }
	table { width: 100%; border-collapse: collapse; font-size: 0.66rem; }
	th, td { padding: 0.4rem 0.45rem; border-bottom: 1px solid var(--borde-suave); text-align: left; white-space: nowrap; }
	th { background: var(--superficie-alta); color: var(--texto-suave); font-size: 0.55rem; text-transform: uppercase; letter-spacing: 0.04em; }
	tbody tr.vencida { background: var(--peligro-tenue); }
	td small { display: block; color: var(--texto-tenue); font-size: 0.55rem; }
	.numero { text-align: right; }
	.acciones-fila { display: flex; gap: 0.15rem; }
	.btn-icono { display: grid; place-items: center; width: 1.6rem; height: 1.6rem; border: 1px solid var(--borde-suave); border-radius: 0.4rem; background: var(--superficie); color: var(--texto-suave); font-size: 0.75rem; }
	.btn-icono:hover { border-color: var(--primario-borde); background: var(--primario-tenue); color: var(--primario-texto); }
	.nota-pie { color: var(--texto-tenue); font-size: 0.58rem; }

	.velo {
		position: fixed;
		inset: 0;
		z-index: 80;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: var(--velo-modal);
		backdrop-filter: blur(2px);
	}
	.modal {
		display: flex;
		flex-direction: column;
		width: min(34rem, 100%);
		max-height: 92vh;
		border-radius: 0.95rem;
		background: var(--modal-fondo);
		box-shadow: var(--sombra-modal);
		overflow: hidden;
	}
	.modal.ancho { width: min(48rem, 100%); }
	.modal-cab { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.6rem; padding: 0.8rem 0.9rem 0.6rem; border-bottom: 1px solid var(--borde-suave); }
	.modal-cab h3 { margin: 0.1rem 0 0; color: var(--texto); font-size: 1rem; }
	.cerrar { display: grid; place-items: center; width: 1.9rem; height: 1.9rem; border: 1px solid var(--borde-suave); border-radius: 0.5rem; background: var(--superficie); color: var(--texto-suave); }
	.cerrar:hover { background: var(--superficie-alta); }
	.modal-cuerpo { display: grid; gap: 0.55rem; padding: 0.8rem 0.9rem; overflow-y: auto; }
	.modal-pie { display: flex; justify-content: flex-end; gap: 0.4rem; padding: 0.65rem 0.9rem; border-top: 1px solid var(--borde-suave); background: var(--superficie-alta); }

	.pasos { display: flex; gap: 0.4rem; color: var(--texto-tenue); font-size: 0.62rem; font-weight: 750; }
	.pasos span { padding: 0.2rem 0.45rem; border-radius: 99px; background: var(--superficie-suave); }
	.pasos span.activo { background: var(--primario-tenue); color: var(--primario-texto); }

	.buscador-servicio { display: flex; gap: 0.4rem; }
	.buscador-servicio input { flex: 1; height: 2.1rem; padding: 0 0.6rem; border: 1px solid var(--borde); border-radius: 0.55rem; background: var(--superficie-alta); font-size: 0.72rem; }
	.resultados { display: grid; gap: 0.25rem; margin: 0; padding: 0; list-style: none; max-height: 16rem; overflow: auto; }
	.resultados button { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; width: 100%; padding: 0.45rem 0.55rem; border: 1px solid var(--borde-suave); border-radius: 0.55rem; background: var(--superficie); text-align: left; }
	.resultados button:hover { border-color: var(--primario-borde); background: var(--superficie-alta); }
	.resultados strong { display: block; color: var(--texto); font-size: 0.72rem; }
	.resultados small { color: var(--texto-suave); font-size: 0.6rem; }
	.servicio-elegido { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; padding: 0.55rem 0.65rem; border: 1px solid var(--primario-borde); border-radius: 0.6rem; background: var(--superficie-alta); }
	.servicio-elegido strong { display: block; color: var(--texto); font-size: 0.78rem; }
	.servicio-elegido small { color: var(--texto-suave); font-size: 0.62rem; }
	.seleccion-totales { display: flex; justify-content: space-between; color: var(--texto-suave); font-size: 0.66rem; }
	.seleccion-totales strong { color: var(--texto); }

	.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.55rem; }
	.form-grid .span-2 { grid-column: span 2; }
	.form-grid label, .campo { display: grid; gap: 1px; color: var(--texto-suave); font-size: 0.6rem; font-weight: 800; letter-spacing: 0.07em; text-transform: uppercase; }
	.form-grid input, .form-grid select, .form-grid textarea, .campo input, .campo select, .campo textarea {
		width: 100%;
		padding: 0.5rem 0.65rem;
		border: 1px solid var(--borde);
		border-radius: 0.7rem;
		background: var(--superficie);
		color: var(--texto);
		font-size: 0.72rem;
		font-weight: 500;
		letter-spacing: 0;
		text-transform: none;
	}
	.form-grid select, .campo select { min-height: 2.5rem; appearance: none; padding-right: 2rem; background-image: var(--chevron-select); background-repeat: no-repeat; background-position: right 0.7rem center; background-size: 0.65rem; }
	.form-grid input:focus, .form-grid select:focus, .form-grid textarea:focus, .campo input:focus, .campo select:focus, .campo textarea:focus { outline: 2px solid var(--foco); outline-offset: 1px; background: var(--superficie); }
	.multiple { min-height: 5.2rem; }
	.separador-form { padding-top: 0.35rem; border-top: 1px dashed var(--borde-suave); color: var(--primario-texto); font-size: 0.65rem; }
	.nota { color: var(--texto-suave); font-size: 0.66rem; }
	.opciones-accion { display: flex; gap: 0.25rem; }
	.opciones-accion button { flex: 1; padding: 0.35rem; border: 1px solid var(--borde); border-radius: 0.45rem; background: var(--superficie-alta); color: var(--texto-suave); font-size: 0.64rem; font-weight: 750; }
	.opciones-accion button.activa { border-color: var(--primario-borde); background: var(--primario-tenue); color: var(--primario-texto); }
	.confirmacion-wa { display: grid; gap: 0.4rem; padding: 0.55rem; border: 1px solid var(--exito-borde); border-radius: 0.55rem; background: var(--exito-tenue); }
	.confirmacion-wa strong { color: var(--exito-texto); font-size: 0.72rem; }
	.confirmacion-wa div { display: flex; gap: 0.3rem; flex-wrap: wrap; }
	.tv-chips { display: flex; gap: 0.3rem; flex-wrap: wrap; }
	.correos-pendientes { display: grid; gap: 0.4rem; margin: 0; padding: 0; list-style: none; }
	.correos-pendientes li { display: grid; gap: 0.35rem; padding: 0.55rem; border: 1px solid var(--borde-suave); border-radius: 0.55rem; }
	.correos-pendientes strong { color: var(--texto); font-size: 0.72rem; }
	.correos-pendientes small { color: var(--texto-suave); font-size: 0.6rem; }
	.correos-pendientes p { color: var(--texto-suave); font-size: 0.64rem; }
	.correos-pendientes label { display: flex; align-items: center; gap: 0.4rem; color: var(--texto-suave); font-size: 0.6rem; font-weight: 750; }
	.correos-pendientes select { height: 1.8rem; border: 1px solid var(--borde); border-radius: 0.45rem; background: var(--superficie-alta); font-size: 0.66rem; }

	@media (max-width: 1200px) {
		.resumen-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
	}
	@media (max-width: 900px) {
		.workspace { grid-template-columns: 1fr; }
		.detalle-col { min-height: 30rem; }
		.resumen-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	}

	/* ------------------------------------------------- Ticket vinculado */
	.fila-ticket { display: flex; align-items: flex-start; gap: 0.55rem; }
	.fila-ticket > .icono-canal { display: grid; place-items: center; flex: 0 0 auto; width: 2rem; height: 2rem; margin-top: 0.1rem; border-radius: 50%; background: var(--info-tenue); color: var(--info-texto); font-size: 0.9rem; }
	.burbuja-ticket { display: grid; gap: 0.35rem; min-width: 0; width: 100%; max-width: 74%; padding: 0.6rem 0.75rem; border: 1px solid var(--info-borde); border-left: 3px solid var(--info); border-radius: 0.9rem; background: var(--info-tenue); }
	.burbuja-ticket header { display: flex; align-items: center; gap: 0.4rem; }
	.burbuja-ticket .bt-quien { display: flex; align-items: baseline; gap: 0.4rem; min-width: 0; }
	.burbuja-ticket .bt-quien strong { color: var(--info-texto); font-size: 0.74rem; }
	.burbuja-ticket .bt-quien small { color: var(--texto-suave); font-size: 0.58rem; text-transform: uppercase; letter-spacing: 0.05em; }
	.burbuja-ticket time { margin-left: auto; color: var(--texto-tenue); font-size: 0.57rem; white-space: nowrap; }
	.burbuja-ticket .bt-titulo { margin: 0; color: var(--texto); font-size: 0.8rem; font-weight: 600; line-height: 1.35; }
	.burbuja-ticket .bt-chips { display: flex; gap: 0.3rem; flex-wrap: wrap; }
	.burbuja-ticket footer { display: flex; align-items: center; gap: 0.5rem; }
	.burbuja-ticket footer small { color: var(--texto-tenue); font-size: 0.57rem; }
	.enlace-ticket { padding: 0; border: 0; background: transparent; color: var(--info-texto); font: inherit; font-size: 0.62rem; font-weight: 800; text-decoration: underline; cursor: pointer; }
	.enlace-ticket:hover { color: var(--primario-texto); }
	.burbuja-ticket footer .enlace-ticket,
	.evento-ticket .enlace-ticket { margin-left: auto; }

	/* ------------------------------------------------- Pestaña Tickets */
	.tickets-panel { display: grid; gap: 0.55rem; }
	.tickets-lista { display: grid; gap: 0.5rem; margin: 0; padding: 0; list-style: none; }
	.ticket-item { display: grid; gap: 0.35rem; padding: 0.6rem 0.7rem; border: 1px solid var(--borde-suave); border-left: 3px solid var(--info); border-radius: 0.7rem; background: var(--superficie); }
	.ticket-item.bloqueante { border-left-color: var(--alerta); }
	.ti-cab { display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap; }
	.ti-cab strong { color: var(--texto); font-size: 0.75rem; }
	.ti-titulo { margin: 0; color: var(--texto); font-size: 0.74rem; line-height: 1.35; }
	.ti-meta { display: flex; gap: 0.75rem; flex-wrap: wrap; color: var(--texto-suave); font-size: 0.6rem; }
	.ti-acciones { display: flex; gap: 0.4rem; flex-wrap: wrap; }

	/* ------------------------------------------------- Modal del ticket */
	.ticket-modal .modal-cab h3 { max-width: 34rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.tv-ficha { display: grid; gap: 0.4rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--borde-suave); }
	.tv-descripcion { margin: 0; color: var(--texto); font-size: 0.72rem; line-height: 1.45; white-space: pre-wrap; }
	.tv-meta { display: flex; gap: 0.75rem; flex-wrap: wrap; color: var(--texto-suave); font-size: 0.6rem; }
	.tv-meta b { margin-right: 0.2rem; color: var(--texto-tenue); font-size: 0.53rem; font-weight: 850; letter-spacing: 0.04em; text-transform: uppercase; }
	.tv-conversacion { max-height: min(24rem, 45vh); overflow-y: auto; border: 1px solid var(--borde-suave); border-radius: 0.75rem; }
	.ticket-modal .modal-cuerpo { flex: 1; min-height: 0; }
</style>
