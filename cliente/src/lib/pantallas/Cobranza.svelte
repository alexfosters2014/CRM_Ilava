<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		alternarExclusionEnvio,
		asignarGrupoCobranza,
		agregarEmailsServicio,
		crearLoteEnvios,
		eliminarComprobanteCobranza,
		enviarCobranzaPorWhatsApp,
		enviarEstadoCuenta,
		importarCarteraDesdeArchivo,
		importarPlanillaEmails,
		listarCarteraCobranza,
		listarImportacionesEmails,
		guardarPlantillaCobranza,
		listarComprobantesEliminados,
		listarEmailsServicio,
		listarCuentasCorreoEnvio,
		listarEnviosCobranza,
		listarPlantillasCobranza,
		obtenerConfiguracionCobranza,
		obtenerEstadoWhatsAppCobranza,
		obtenerPlantillaPredeterminadaCobranza,
		guardarPlantillaPredeterminadaCobranza,
		obtenerLoteActivo,
		obtenerLoteEnvios,
		obtenerPlanillaEmails,
		quitarEmailDeLista,
		restaurarComprobanteCobranza,
		ErrorImportacionCobranza,
		ErrorImportacionEmails,
		excluirObservacionCobranza,
		crearServiciosDesdeFilas,
		listarCatalogos,
		listarExclusionesCobranza,
		listarGruposCobranza,
		crearGrupoCobranza,
		crearSeguimiento,
		listarCatalogosSeguimientos,
		listarSeguimientos,
		registrarAvance,
		type CarteraCobranza,
		type ComprobanteEliminado,
		type ConfiguracionCobranza,
		type FilaPlanillaEmails,
		type ImportacionEmails,
		type ResumenImportacionEmails,
		type EmailServicio,
		type GrupoCobranzaAdmin,
		type ModoEmails,
		type CuentaCorreo,
		type ItemLoteEnvios,
		type ResumenLoteEnvios,
		type DocumentoCartera,
		type EnvioCobranza,
		type ServicioCartera,
		type PlantillaCobranza,
		type Catalogos,
		type CatalogosSeguimientos,
		type SeguimientoResumen
	} from '#lib/servicios-datos-api/index.ts';
	import { formatearTelefonoUy } from '#lib/servicios/telefonos.ts';
	import { formatearFecha, formatearFechaHora, nombrePeriodo } from '#lib/servicios/fechas.ts';
	import { coincideEnvios, coincideTramo, totalesEnvio } from '#lib/servicios/filtros-cobranza.ts';
	import { plantillaListaComprobantes } from '#lib/servicios/plantillas-cobranza.ts';
	import { BarraLotes, Boton, CampoTexto, ChipSelect, ModalPanel } from '#lib/componentes/index.ts';
	import { iconos } from '#lib/componentes/iconos.ts';
	import { confirmar } from '#lib/componentes/confirmacion.svelte.ts';
	import {
		fechaCorteCobranza,
		claveExclusionCobranza,
		descargarPlantillaCobranza,
		descargarPlantillaServiciosFaltantes,
		leerCobranzaDesdeExcel,
		leerServiciosFaltantesDesdeExcel,
		parsearNumeroImportacion,
		validarFilasCobranzaLocal,
		type FilaCobranza,
		type ValidacionCobranza,
		type FilaServicio,
		type ResultadoServiciosFaltantes
	} from '#lib/servicios/importacion.ts';
	import { descargarPlanillaEmails, leerPlanillaEmails } from '#lib/servicios/planilla-emails.ts';

	const TRAMOS = ['A_VENCER', '1_30', '31_60', '61_90', 'MAS_90'];
	// Columnas de la cartera: solo deuda vencida. «A vencer» se informa en el
	// total equivalente para no sumar una treceava columna.
	const TRAMOS_VENCIDOS = ['1_30', '31_60', '61_90', 'MAS_90'];
	const etiquetasTramo: Record<string, string> = { A_VENCER: 'A vencer', '1_30': '1–30', '31_60': '31–60', '61_90': '61–90', MAS_90: '+90' };

	/** Texto accesible de la alerta de mora, con los días exactos. */
	function textoAlerta(servicio: ServicioCartera): string {
		const dias = servicio.diasDeudaMasAntigua ?? 0;
		const tramo =
			servicio.alertaMora === 'MOSTAZA'
				? '1 a 2 meses'
				: servicio.alertaMora === 'NARANJA'
					? '3 a 5 meses'
					: 'más de 5 meses';
		return `Deuda impaga más antigua: ${dias} día${dias === 1 ? '' : 's'} (${tramo} desde la emisión)`;
	}

	/** Icono de la alerta: reloj amarillo, círculo naranja o triángulo rojo. */
	function iconoAlerta(alerta: ServicioCartera['alertaMora']): string {
		if (alerta === 'MOSTAZA') return '/iconos/circulo-amarillo.svg';
		if (alerta === 'NARANJA') return '/iconos/circulo-naranja.svg';
		if (alerta === 'ROJO') return '/iconos/triangulo-rojo.svg';
		return '';
	}
	const columnasValidacion = [
		{ clave: 'servicio', etiqueta: 'Servicio' },
		{ clave: 'comprobante', etiqueta: 'Comp.' },
		{ clave: 'fecha', etiqueta: 'Fecha' },
		{ clave: 'moneda', etiqueta: 'Moneda' },
		{ clave: 'importe', etiqueta: 'Importe' },
		{ clave: 'saldo', etiqueta: 'Saldo' }
	] as const;

	let cartera = $state<CarteraCobranza | null>(null);
	let periodos = $state<{ periodo: string; cotizacionUsd: string }[]>([]);
	let periodo = $state('');
	let cotizacion = $state('');
	let busqueda = $state('');
	let filtroGestion = $state('TODOS');
	let filtroCliente = $state('TODOS');
	let filtroModalidad = $state('TODOS');
	let filtroTramo = $state('TODOS');
	let filtroEnvios = $state('TODOS');
	let seleccionados = $state<number[]>([]);
	let gruposCerrados = $state<string[]>([]);
	let filtroGrupoCobranza = $state('TODOS');
	let grupoAsignar = $state<number | ''>('');
	let asignandoGrupo = $state(false);
	let gruposCobranza = $state<GrupoCobranzaAdmin[]>([]);
	let cargandoGrupos = $state(false);
	let creandoGrupoCobranza = $state(false);
	let guardandoGrupoCobranza = $state(false);
	let nuevoGrupoCobranza = $state({ nombre: '', colorFondo: '#3346b8', colorTexto: '#ffffff' });
	let errorGrupoCobranza = $state('');
	let avisoGrupoCobranza = $state('');

	interface BloqueGrupo {
		clave: string;
		id: number | null;
		nombre: string;
		fondo: string;
		texto: string;
		orden: number;
		servicios: ServicioCartera[];
	}

	/** Cartera NORMAL agrupada por grupo de cobranza, con «Sin grupo» al final. */
	let bloquesGrupo = $derived.by(() => {
		const mapa = new Map<string, BloqueGrupo>();
		for (const servicio of cartera?.servicios ?? []) {
			if (!servicio.seleccionable || !visibles(servicio) || filtroGestion === 'ESPECIAL') continue;
			const clave = servicio.grupoCobranzaId ? String(servicio.grupoCobranzaId) : 'sin';
			if (!mapa.has(clave)) {
				mapa.set(clave, {
					clave,
					id: servicio.grupoCobranzaId,
					nombre: servicio.grupoCobranza ?? 'Sin grupo',
					fondo: servicio.grupoCobranzaFondo ?? '#64748b',
					texto: servicio.grupoCobranzaTexto ?? '#ffffff',
					orden: servicio.grupoCobranzaOrden ?? 0,
					servicios: []
				});
			}
			mapa.get(clave)!.servicios.push(servicio);
		}
		return [...mapa.values()].sort((a, b) => {
			if (a.id === null) return 1;
			if (b.id === null) return -1;
			return a.orden - b.orden || a.nombre.localeCompare(b.nombre);
		});
	});

	const sumaGrupo = (grupo: BloqueGrupo) => {
		let pesos = 0;
		let dolares = 0;
		let equivalente = 0;
		for (const servicio of grupo.servicios) {
			pesos += Number(total(servicio.pesos));
			dolares += Number(total(servicio.dolares));
			equivalente += Number(servicio.equivalentePesos);
		}
		return { pesos, dolares, equivalente };
	};

	function alternarBloque(grupo: BloqueGrupo) {
		if (gruposCerrados.includes(grupo.clave)) {
			gruposCerrados = gruposCerrados.filter((clave) => clave !== grupo.clave);
		} else {
			gruposCerrados = [...gruposCerrados, grupo.clave];
		}
	}

	/** Solo se pueden seleccionar servicios con al menos un mail registrado. */
	function seleccionable(servicio: ServicioCartera) {
		return servicio.destinatarios > 0;
	}

	function alternarTodosBloque(grupo: BloqueGrupo) {
		const ids = grupo.servicios.filter(seleccionable).map((servicio) => servicio.servicioId);
		if (ids.length === 0) return;
		const todos = ids.every((id) => seleccionados.includes(id));
		seleccionados = todos
			? seleccionados.filter((id) => !ids.includes(id))
			: [...new Set([...seleccionados, ...ids])];
	}

	function grupoCompleto(grupo: BloqueGrupo) {
		const elegibles = grupo.servicios.filter(seleccionable);
		return elegibles.length > 0 && elegibles.every((servicio) => seleccionados.includes(servicio.servicioId));
	}

	/** El widget sigue visible mientras el lote no termina (o por 5 minutos después). */
	let loteVigente = $derived.by(() => {
		if (!lote) return false;
		if (lote.estado !== 'COMPLETADO') return true;
		if (!lote.finalizadoEn) return false;
		return Date.now() - new Date(lote.finalizadoEn).getTime() < 5 * 60 * 1000;
	});

	/**
	 * Progreso del envío masivo para la barra del widget. Los segmentos se
	 * calculan por diferencia para que enviados + errores no dejen huecos por
	 * redondeo y nunca superen el 100%.
	 */
	let progresoLote = $derived.by(() => {
		const total = lote?.total ?? 0;
		if (total <= 0) return { enviados: 0, errores: 0, porcentaje: 0 };
		const enviados = Math.round(((lote?.enviados ?? 0) / total) * 100);
		const procesados = Math.round((((lote?.enviados ?? 0) + (lote?.errores ?? 0)) / total) * 100);
		return {
			enviados,
			errores: Math.max(0, procesados - enviados),
			porcentaje: Math.min(100, procesados)
		};
	});

	/** Progreso del último sondeo, para no recargar la cartera en cada tick. */
	let progresoAnterior = -1;
	let ultimaActualizacion = $state('');
	let copia = $state<ConfiguracionCobranza | null>(null);

	/** Estado de la copia global, mostrado como link en la barra de filtros. */
	let estadoCopia = $derived.by(() => {
		if (!copia) return { texto: 'Copia de control: verificando…', estado: 'cargando' as const };
		const cantidad = copia.copiaEmails
			.split(',')
			.map((email) => email.trim())
			.filter(Boolean).length;
		if (cantidad === 0) {
			return { texto: 'Sin correo de control configurado · Configurar', estado: 'falta' as const };
		}
		if (!copia.copiaActiva) {
			return { texto: `Copia ${copia.copiaTipo} inhabilitada · Configurar`, estado: 'inactiva' as const };
		}
		return {
			texto: `Copia ${copia.copiaTipo} habilitada · ${cantidad} correo${cantidad === 1 ? '' : 's'}`,
			estado: 'activa' as const
		};
	});

	async function cargarCopia() {
		try {
			copia = await obtenerConfiguracionCobranza();
		} catch {
			copia = null;
		}
	}

	async function refrescarLote() {
		try {
			const siguiente = await obtenerLoteActivo();
			lote = siguiente;
			if (!siguiente) return;

			const progreso = siguiente.enviados + siguiente.errores;
			if (progreso !== progresoAnterior) {
				progresoAnterior = progreso;
				// El contador de envíos por servicio viene en la cartera: se
				// recarga sin mostrar el estado de "Cargando".
				await cargar(periodo, true);
				const abierto = detalle;
				if (abierto) {
					const actualizado = cartera?.servicios.find((item) => item.servicioId === abierto.servicioId);
					if (actualizado) detalle = actualizado;
					void cargarHistorial(abierto.servicioId);
				}
			}

			if (detalleLote) detalleLote = await obtenerLoteEnvios(siguiente.id);
			ultimaActualizacion = new Date().toLocaleTimeString('es-UY');
		} catch {
			// El widget no debe romper la pantalla si falla el sondeo.
		}
	}

	async function abrirEnvioMasivo() {
		await cargarCuentasParaEnvio();
		masivo = {
			plantillaId: envioPlantillaId ?? plantillas[0]?.id ?? '',
			cuentaId: envioCuentaId ?? cuentasCorreo.find((cuenta) => cuenta.activo)?.id ?? '',
			aliasId: envioAliasId ?? ''
		};
		mostrarMasivo = true;
	}

	function esRemitenteMasivo(cuentaId: number, aliasId: number | '') {
		return masivo.cuentaId === cuentaId && masivo.aliasId === aliasId;
	}

	function elegirRemitenteMasivo(cuentaId: number, aliasId: number | '') {
		masivo.cuentaId = cuentaId;
		masivo.aliasId = aliasId;
	}

	async function confirmarEnvioMasivo() {
		if (!masivo.plantillaId || !masivo.cuentaId || !cartera) return;
		enviandoMasivo = true;
		error = '';
		try {
			const { total } = await crearLoteEnvios({
				periodo: cartera.periodo,
				servicioIds: seleccionados,
				plantillaId: Number(masivo.plantillaId),
				cuentaId: Number(masivo.cuentaId),
				aliasId: masivo.aliasId === '' ? null : Number(masivo.aliasId)
			});
			mostrarMasivo = false;
			seleccionados = [];
			mensaje = `Envío masivo en cola: ${total} mails. Podés cerrar la pestaña: el servidor continúa.`;
			progresoAnterior = -1;
			await refrescarLote();
		} catch (e) {
			error = (e as Error).message;
		} finally {
			enviandoMasivo = false;
		}
	}

	async function abrirDetalleLote() {
		if (!lote) return;
		try {
			detalleLote = await obtenerLoteEnvios(lote.id);
		} catch (e) {
			error = (e as Error).message;
		}
	}

	function inicialGrupo(nombre: string) {
		return (nombre.trim()[0] ?? '?').toUpperCase();
	}

	function cantidadEnGrupo(grupoId: number) {
		return (cartera?.servicios ?? []).filter((servicio) => servicio.grupoCobranzaId === grupoId).length;
	}

	/** Si todos los seleccionados comparten un grupo activo, se preselecciona. */
	function grupoInicialSeleccion() {
		const grupos = new Set(
			seleccionados.map(
				(id) =>
					cartera?.servicios.find((servicio) => servicio.servicioId === id)?.grupoCobranzaId ?? null
			)
		);
		if (grupos.size !== 1) return '';
		const [unico] = [...grupos];
		if (unico === null) return '';
		return gruposCobranza.some((grupo) => grupo.id === unico && grupo.activo) ? unico : '';
	}

	function reiniciarFormularioGrupo() {
		creandoGrupoCobranza = false;
		guardandoGrupoCobranza = false;
		nuevoGrupoCobranza = { nombre: '', colorFondo: '#3346b8', colorTexto: '#ffffff' };
		errorGrupoCobranza = '';
		avisoGrupoCobranza = '';
	}

	/** Abre el modal y recarga los grupos: pueden haberse creado en Configuración. */
	async function abrirModalGrupo() {
		modalGrupo = true;
		grupoAsignar = '';
		reiniciarFormularioGrupo();
		cargandoGrupos = true;
		try {
			gruposCobranza = await listarGruposCobranza();
			grupoAsignar = grupoInicialSeleccion();
		} catch (e) {
			error = (e as Error).message;
		} finally {
			cargandoGrupos = false;
		}
	}

	async function crearGrupoDesdeModal() {
		const nombre = nuevoGrupoCobranza.nombre.trim();
		if (!nombre) return;
		guardandoGrupoCobranza = true;
		errorGrupoCobranza = '';
		avisoGrupoCobranza = '';
		try {
			await crearGrupoCobranza({
				nombre,
				colorFondo: nuevoGrupoCobranza.colorFondo,
				colorTexto: nuevoGrupoCobranza.colorTexto
			});
			gruposCobranza = await listarGruposCobranza();
			const creado = gruposCobranza.find(
				(grupo) => grupo.nombre.toLowerCase() === nombre.toLowerCase()
			);
			if (creado) grupoAsignar = creado.id;
			creandoGrupoCobranza = false;
			nuevoGrupoCobranza = { nombre: '', colorFondo: '#3346b8', colorTexto: '#ffffff' };
			avisoGrupoCobranza = `Grupo «${nombre}» creado${creado ? ' y seleccionado' : ''}.`;
		} catch (e) {
			errorGrupoCobranza = (e as Error).message;
		} finally {
			guardandoGrupoCobranza = false;
		}
	}

	async function asignarGrupo() {
		if (seleccionados.length === 0) return;
		asignandoGrupo = true;
		error = '';
		try {
			const grupo = gruposCobranza.find((item) => item.id === grupoAsignar);
			const cantidad = await asignarGrupoCobranza(seleccionados, grupoAsignar === '' ? null : Number(grupoAsignar));
			mensaje = `${cantidad} servicios asignados a ${grupo ? `«${grupo.nombre}»` : 'sin grupo'}.`;
			seleccionados = [];
			await cargar(periodo);
		} catch (e) {
			error = (e as Error).message;
		} finally {
			asignandoGrupo = false;
		}
	}
	let detalle = $state<ServicioCartera | null>(null);
	// Seguimientos activos por servicio: indicador en la cartera y aviso al crear.
	let seguimientosPorServicio = $state<Record<number, SeguimientoResumen[]>>({});
	let modalSeguimiento = $state(false);
	let catalogosSeguimiento = $state<CatalogosSeguimientos | null>(null);
	let segTitulo = $state('');
	let segMotivo = $state('');
	let segEstado = $state<'EN_SEGUIMIENTO' | 'ESPERANDO_CLIENTE' | 'PAUSADO'>('EN_SEGUIMIENTO');
	let segPrioridad = $state<'BAJA' | 'NORMAL' | 'ALTA' | 'URGENTE'>('NORMAL');
	let segResponsable = $state('');
	let segProxima = $state('');
	let segNota = $state('');
	let guardandoSeguimiento = $state(false);
	let errorSeguimiento = $state('');
	let envios = $state<EnvioCobranza[]>([]);
	let cuentasCorreo = $state<CuentaCorreo[]>([]);
	let envioPlantillaId = $state<number | null>(null);
	let envioCuentaId = $state<number | null>(null);
	let envioAliasId = $state<number | null>(null);
	/** Plantilla que el detalle propone al abrirse (configuración global). */
	let plantillaPredeterminadaId = $state<number | null>(null);
	let guardandoPredeterminada = $state(false);
	/** "Enviar solo vencidos": filtra por el plazo configurado del servicio. */
	let soloVencidos = $state(false);
	let enviando = $state(false);
	let enviandoWhatsApp = $state(false);
	let whatsappConectado = $state(false);
	let errorEnvio = $state('');
	let avisoEnvio = $state('');
	let contactos = $state<EmailServicio[]>([]);
	let modoEmails = $state<ModoEmails>('VACIO');
	let nuevoContacto = $state('');
	let nuevoUso = $state<'COBRANZA' | 'COMPARTIDO'>('COBRANZA');
	let modalMails = $state(false);
	let errorMails = $state('');
	let guardandoMails = $state(false);
	/** Los mails de facturación no reciben estados de cuenta. */
	let destinatarios = $derived(contactos.filter((email) => email.uso !== 'FACTURACION'));
	// Envío masivo en segundo plano
	let lote = $state<ResumenLoteEnvios | null>(null);
	let detalleLote = $state<(ResumenLoteEnvios & { items: ItemLoteEnvios[] }) | null>(null);
	let mostrarMasivo = $state(false);
	let masivo = $state({ plantillaId: '' as number | '', cuentaId: '' as number | '', aliasId: '' as number | '' });
	let enviandoMasivo = $state(false);
	let modalGrupo = $state(false);
	let temporizadorLote: ReturnType<typeof setInterval> | undefined;
	let mostrarEliminados = $state(false);
	let eliminados = $state<ComprobanteEliminado[]>([]);
	let cargandoEliminados = $state(false);
	let archivo = $state<File | null>(null);
	let filasImportacion = $state<FilaCobranza[]>([]);
	let exclusionesLocales = $state<string[]>([]);
	let filasExcluidasExcel = $state<number[]>([]);
	let validacionesImportacion = $state<ValidacionCobranza[]>([]);
	let configuracion = $state<Catalogos | null>(null);
	let archivoServiciosFaltantes = $state<File | null>(null);
	let filasServiciosFaltantes = $state<FilaServicio[]>([]);
	let erroresServiciosFaltantes = $state<{ fila: number; mensaje: string }[]>([]);
	let creandoServicios = $state(false);
	let cargandoCatalogos = $state(false);
	// La vista útil del validador son las filas que bloquean la importación.
	let mostrarSoloErrores = $state(true);
	let mostrarImportacion = $state(false);
	let importando = $state(false);
	// Planilla de mails de cobranza (descarga + importación por Excel).
	let mostrarPlanillaEmails = $state(false);
	let planillaEmails = $state<FilaPlanillaEmails[]>([]);
	let archivoEmails = $state<File | null>(null);
	let filasEmails = $state<{ servicioId: number; emails: string }[]>([]);
	let previsualizacionEmails = $state<ResumenImportacionEmails | null>(null);
	let resultadoEmails = $state<ResumenImportacionEmails | null>(null);
	let erroresEmails = $state<{ fila: number; mensaje: string }[]>([]);
	let historialEmails = $state<ImportacionEmails[]>([]);
	let cargandoPlanilla = $state(false);
	let previsualizandoEmails = $state(false);
	let aplicandoEmails = $state(false);
	let errorEmails = $state('');
	let cargando = $state(true);
	let mensaje = $state('');
	let error = $state('');
	let plantillas = $state<PlantillaCobranza[]>([]);
	let mostrarPlantillas = $state(false);
	let modelo = $state({
		id: undefined as number | undefined,
		nombre: '',
		asunto: '',
		cuerpo: '',
		cartaHabilitada: false,
		cartaHtml: '',
		cartaFondo: null as string | null
	});
	let campoActivo = $state<'asunto' | 'cuerpo' | 'carta'>('cuerpo');
	let refAsunto = $state<HTMLInputElement | undefined>();
	let refCuerpo = $state<HTMLTextAreaElement | undefined>();
	let refCarta = $state<HTMLTextAreaElement | undefined>();

	/** Plantilla elegida para el envío individual del detalle. */
	let plantillaSeleccionada = $derived(
		plantillas.find((plantilla) => plantilla.id === envioPlantillaId) ?? null
	);
	/** Solo se puede filtrar vencidos si la plantilla lista comprobantes. */
	let plantillaPermiteSoloVencidos = $derived(
		plantillaSeleccionada ? plantillaListaComprobantes(plantillaSeleccionada) : false
	);
	let aplicarSoloVencidos = $derived(soloVencidos && plantillaPermiteSoloVencidos);
	/** Primer grupo de moneda con comprobantes (0 = UYU, 1 = USD). Ahí va el check. */
	let primerGrupoConDocs = $derived.by(() => {
		const documentos = detalle?.documentos ?? [];
		if (documentos.some((documento) => documento.moneda.toUpperCase() !== 'USD')) return 0;
		if (documentos.some((documento) => documento.moneda.toUpperCase() === 'USD')) return 1;
		return -1;
	});
	/** Valor del selector único "Enviar desde" (cuenta principal o alias). */
	let valorRemitente = $derived(
		envioAliasId ? `alias:${envioAliasId}:${envioCuentaId}` : `cuenta:${envioCuentaId}`
	);
	/** Cuenta elegida para el envío individual con la credencial rechazada. */
	let cuentaEnvioRechazada = $derived(
		cuentasCorreo.find(
			(cuenta) => cuenta.id === envioCuentaId && cuenta.credencialEstado === 'RECHAZADA'
		) ?? null
	);
	/** Cuenta elegida para el envío masivo con la credencial rechazada. */
	let cuentaMasivoRechazada = $derived(
		cuentasCorreo.find(
			(cuenta) => cuenta.id === masivo.cuentaId && cuenta.credencialEstado === 'RECHAZADA'
		) ?? null
	);

	const VARIABLES_PLANTILLA = [
		'nombre_servicio',
		'periodo',
		'total_pesos',
		'total_dolares',
		'cantidad_comprobantes',
		'cantidad_facturas',
		'estado_cuenta_general',
		'estado_cuenta_pesos',
		'estado_cuenta_dolares',
		'fecha_hoy'
	];

	/** Inserta la variable en el campo con foco, en la posición del cursor. */
	async function insertarVariable(variable: string) {
		const token = `{{${variable}}}`;
		const elemento =
			campoActivo === 'asunto' ? refAsunto : campoActivo === 'carta' ? refCarta : refCuerpo;
		const actual =
			campoActivo === 'asunto'
				? modelo.asunto
				: campoActivo === 'carta'
					? modelo.cartaHtml
					: modelo.cuerpo;
		const inicio = elemento?.selectionStart ?? actual.length;
		const fin = elemento?.selectionEnd ?? actual.length;
		const nuevo = `${actual.slice(0, inicio)}${token}${actual.slice(fin)}`;
		if (campoActivo === 'asunto') modelo.asunto = nuevo;
		else if (campoActivo === 'carta') modelo.cartaHtml = nuevo;
		else modelo.cuerpo = nuevo;
		await tick();
		elemento?.focus();
		const posicion = inicio + token.length;
		elemento?.setSelectionRange(posicion, posicion);
	}

	const hoy = () => new Date().toISOString().slice(0, 10);
	/** Cotización para la etiqueta del filtro: sin ceros de relleno. */
	const cotizacionCorta = (valor: string | number) =>
		new Intl.NumberFormat('es-UY', { maximumFractionDigits: 4 }).format(Number(valor));
	const dinero = (valor: string | number, moneda = 'UYU') =>
		new Intl.NumberFormat('es-UY', { style: 'currency', currency: moneda === 'USD' ? 'USD' : 'UYU', currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2 }).format(Number(valor));
	const total = (valores: Record<string, string>) => TRAMOS.reduce((suma, tramo) => suma + Number(valores[tramo] ?? 0), 0).toFixed(2);
	/** Deuda aún no vencida, expresada en pesos para el total equivalente. */
	const deudaAVencer = (servicio: ServicioCartera) =>
		Number(servicio.pesos.A_VENCER ?? 0) + Number(servicio.dolares.A_VENCER ?? 0) * Number(cartera?.cotizacionUsd ?? 0);
	const cotizacionNumerica = () => parsearNumeroImportacion(cotizacion);
	const cotizacionValida = () => {
		const valor = cotizacionNumerica();
		return valor !== null && valor > 0;
	};

	async function cargar(valor = periodo, silencioso = false) {
		if (!silencioso) cargando = true;
		error = '';
		try {
			const respuesta = await listarCarteraCobranza(valor || undefined);
			periodos = respuesta.periodos;
			cartera = respuesta.cartera;
			if (cartera) {
				periodo = cartera.periodo;
				cotizacion = String(cartera.cotizacionUsd);
			}
			depurarFiltros();
		} catch (e) {
			error = e instanceof Error ? e.message : 'No se pudo cargar la cartera';
		} finally {
			if (!silencioso) cargando = false;
		}
	}

	async function importar() {
		if (!archivo || !periodo || !cotizacionValida() || validacionesImportacion.length > 0) return;
		importando = true;
		mensaje = '';
		error = '';
		try {
			const resumen = await importarCarteraDesdeArchivo(archivo, periodo, cotizacionNumerica()!);
			mensaje = `Importación de ${nombrePeriodo(resumen.periodo)}: ${resumen.importadas} nuevas, ${resumen.actualizadas} actualizadas y ${resumen.retiradas} retiradas.`;
			if (resumen.errores?.length) mensaje += ` ${resumen.errores.length} filas observadas.`;
			archivo = null;
			filasImportacion = [];
			validacionesImportacion = [];
			mostrarImportacion = false;
			await cargar(periodo);
		} catch (e) {
			if (e instanceof ErrorImportacionCobranza) {
				// Aunque el backend todavía no conozca la exclusión, no se vuelve a mostrar
				// una observación que el usuario ya decidió omitir en esta sesión.
				validacionesImportacion = e.validaciones.filter((validacion) => !filasExcluidasExcel.includes(validacion.fila));
			}
			else error = e instanceof Error ? e.message : 'No se pudo importar';
		} finally {
			importando = false;
		}
	}

	function validarArchivoSeleccionado() {
		validacionesImportacion = filasImportacion.length ? validarFilasCobranzaLocal(filasImportacion, periodo) : [];
	}

	function categoriaValidacion(mensaje: string): string {
		const texto = mensaje.toLowerCase();
		if (texto.includes('servicio')) return 'servicio';
		if (texto.includes('comprobante') || texto.includes('serie') || texto.includes('número') || texto.includes('duplicado')) return 'comprobante';
		if (texto.includes('fecha') || texto.includes('corte')) return 'fecha';
		if (texto.includes('moneda')) return 'moneda';
		if (texto.includes('importe')) return 'importe';
		if (texto.includes('saldo')) return 'saldo';
		return 'general';
	}

	function errorEnCelda(fila: number, categoria: string) {
		return validacionesImportacion.some((validacion) => validacion.fila === fila && categoriaValidacion(validacion.mensaje) === categoria);
	}

	function filaExcel(indice: number) {
		return indice + 6;
	}

	function filaTieneErrores(indice: number) {
		const fila = filasImportacion[indice];
		return validacionesImportacion.some((validacion) => validacion.fila === (fila?.filaExcel ?? filaExcel(indice)));
	}

	function erroresDeFila(fila: number) {
		return validacionesImportacion.filter((validacion) => validacion.fila === fila).map((validacion) => validacion.mensaje).join(' · ');
	}

	/** Describe el documento afectado por la exclusión, tal como lo muestra la UI. */
	function describirExclusion(fila: FilaCobranza) {
		if (!fila.numero) return `todas las filas sin comprobante del servicio ${fila.contacto}`;
		const tipo = fila.tipoComprobante ?? 'Sin tipo';
		const serie = fila.serie ? `${fila.serie}-` : '';
		return `el comprobante ${tipo} ${serie}${fila.numero} del servicio ${fila.contacto}`;
	}

	async function excluirFila(indice: number) {
		const fila = filasImportacion[indice];
		if (!fila) return;
		const motivo = prompt(
			`Se omitirá en futuras importaciones ${describirExclusion(fila)}.\n\nMotivo de la exclusión:`,
			'Decisión del usuario'
		);
		if (!motivo?.trim()) return;
		try {
			await excluirObservacionCobranza(fila, motivo);
			const claveFila = claveExclusionCobranza(fila);
			exclusionesLocales = [...new Set([...exclusionesLocales, claveFila])];
			const filaReal = fila.filaExcel ?? indice + 6;
			// Se quitan todas las filas que compartan la misma regla (mismo comprobante repetido).
			const afectadas = filasImportacion.filter((otra) => claveExclusionCobranza(otra) === claveFila);
			filasExcluidasExcel = [...new Set([...filasExcluidasExcel, ...afectadas.map((otra) => otra.filaExcel ?? filaReal)])];
			filasImportacion = filasImportacion.filter((otra) => claveExclusionCobranza(otra) !== claveFila);
			validacionesImportacion = validacionesImportacion.filter((validacion) => !filasExcluidasExcel.includes(validacion.fila));
			mensaje = `Observación de la fila ${filaReal} excluida de futuras importaciones.`;
		} catch (e) {
			error = e instanceof Error ? e.message : 'No se pudo guardar la exclusión';
		}
	}

	function serviciosFaltantes() {
		return [...new Set(validacionesImportacion
			.filter((validacion) => validacion.mensaje.startsWith('Servicio no encontrado:'))
			.map((validacion) => validacion.mensaje.replace('Servicio no encontrado:', '').trim()))].sort();
	}

	async function cargarCatalogosServicios() {
		if (configuracion || cargandoCatalogos) return;
		cargandoCatalogos = true;
		try {
			configuracion = await listarCatalogos();
		} catch (e) {
			error = e instanceof Error ? e.message : 'No se pudieron cargar los catálogos';
		} finally {
			cargandoCatalogos = false;
		}
	}

	function clave(valor: string) {
		return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
	}

	function catalogosParaPlanilla() {
		if (!configuracion) return [];
		return [
			{ nombre: 'Grupo', valores: configuracion.grupos.filter((item) => item.activo).map((item) => item.nombre) },
			{ nombre: 'Tipo de gestión', valores: configuracion.tiposGestion.filter((item) => item.activo).map((item) => item.nombre) },
			{ nombre: 'Tipo de cliente', valores: configuracion.tiposCliente.filter((item) => item.activo).map((item) => item.nombre) },
			{ nombre: 'Modalidad de cobranza', valores: configuracion.modalidadesCobranza.filter((item) => item.activo).map((item) => item.nombre) },
			{ nombre: 'Gestión de facturación', valores: configuracion.tiposGestionFacturacion.filter((item) => item.activo).map((item) => item.nombre) }
		];
	}

	function descargarPlanillaFaltantes() {
		if (configuracion) descargarPlantillaServiciosFaltantes(serviciosFaltantes(), catalogosParaPlanilla());
	}

	function validarValoresCatalogo(fila: FilaServicio, indice: number) {
		const catalogos = catalogosParaPlanilla();
		const campos = [
			['Grupo', fila.grupo, catalogos[0]?.valores],
			['Tipo de gestión', fila.tipoGestion, catalogos[1]?.valores],
			['Tipo de cliente', fila.tipoCliente, catalogos[2]?.valores],
			['Modalidad de cobranza', fila.modalidadCobranza, catalogos[3]?.valores],
			['Gestión de facturación', fila.tipoGestionFacturacion, catalogos[4]?.valores]
		] as [string, string | null | undefined, string[] | undefined][];
		return campos.filter(([, valor, opciones]) => valor && opciones && !opciones.some((opcion) => clave(opcion) === clave(valor))).map(([nombre, valor]) => ({ fila: indice + 2, mensaje: `${nombre} no pertenece al catálogo activo: ${valor}` }));
	}

	async function seleccionarPlanillaServicios(evento: Event) {
		const input = evento.currentTarget as HTMLInputElement;
		archivoServiciosFaltantes = input.files?.[0] ?? null;
		filasServiciosFaltantes = [];
		erroresServiciosFaltantes = [];
		if (!archivoServiciosFaltantes) return;
		try {
			const resultado: ResultadoServiciosFaltantes = await leerServiciosFaltantesDesdeExcel(archivoServiciosFaltantes);
			const esperados = new Set(serviciosFaltantes().map(clave));
			const encontrados = new Set<string>();
			const errores = [...resultado.errores];
			resultado.filas.forEach((fila, indice) => {
				const nombre = clave(fila.contacto);
				if (!esperados.has(nombre)) errores.push({ fila: indice + 2, mensaje: `Servicio no solicitado en esta planilla: ${fila.contacto}` });
				if (encontrados.has(nombre)) errores.push({ fila: indice + 2, mensaje: `Servicio repetido: ${fila.contacto}` });
				encontrados.add(nombre);
				errores.push(...validarValoresCatalogo(fila, indice));
			});
			for (const esperado of esperados) if (!encontrados.has(esperado)) errores.push({ fila: 0, mensaje: `Falta completar el servicio: ${serviciosFaltantes().find((servicio) => clave(servicio) === esperado)}` });
			filasServiciosFaltantes = resultado.filas;
			erroresServiciosFaltantes = errores;
		} catch (e) {
			erroresServiciosFaltantes = [{ fila: 0, mensaje: e instanceof Error ? e.message : 'No se pudo leer la planilla de servicios faltantes' }];
		}
	}

	async function crearServiciosFaltantes() {
		if (erroresServiciosFaltantes.length > 0 || filasServiciosFaltantes.length === 0) return;
		creandoServicios = true;
		error = '';
		try {
			const resumen = await crearServiciosDesdeFilas(filasServiciosFaltantes);
			validacionesImportacion = validacionesImportacion.filter((validacion) => !validacion.mensaje.startsWith('Servicio no encontrado:'));
			mensaje = `${resumen.creados} servicios faltantes creados. Volvé a validar la planilla.`;
			archivoServiciosFaltantes = null;
			filasServiciosFaltantes = [];
			erroresServiciosFaltantes = [];
		} catch (e) {
			error = e instanceof Error ? e.message : 'No se pudieron crear los servicios faltantes';
		} finally {
			creandoServicios = false;
		}
	}

	async function seleccionarArchivo(evento: Event) {
		const input = evento.currentTarget as HTMLInputElement;
		archivo = input.files?.[0] ?? null;
		filasImportacion = [];
		validacionesImportacion = [];
		mostrarSoloErrores = true;
		error = '';
		if (!archivo) return;
		try {
			const filasLeidas = await leerCobranzaDesdeExcel(archivo);
			let exclusiones: Awaited<ReturnType<typeof listarExclusionesCobranza>> = [];
			try {
				exclusiones = await listarExclusionesCobranza();
			} catch {
				// La tabla de exclusiones puede no existir todavía en instalaciones antiguas.
				// No debe impedir validar/importar la planilla; solo desactiva el filtro persistente.
				mensaje = 'No se pudieron cargar las exclusiones guardadas. La planilla se validará sin ese filtro.';
			}
			const clavesExcluidas = new Set([...exclusiones.map((exclusion) => exclusion.clave), ...exclusionesLocales]);
			filasImportacion = filasLeidas.filter((fila) => !clavesExcluidas.has(claveExclusionCobranza(fila)));
			const excluidas = filasLeidas.length - filasImportacion.length;
			if (excluidas > 0) mensaje = `${excluidas} observación(es) excluida(s) automáticamente.`;
			validarArchivoSeleccionado();
		} catch (e) {
			validacionesImportacion = [{ fila: 0, mensaje: e instanceof Error ? e.message : 'No se pudo leer la planilla' }];
		}
	}

	function cambiarPeriodoImportacion(valor: string) {
		periodo = valor;
		validarArchivoSeleccionado();
	}

	function abrirImportacion() {
		mostrarImportacion = true;
		mostrarSoloErrores = true;
		error = '';
		cargarCatalogosServicios();
	}

	function alternar(id: number) {
		seleccionados = seleccionados.includes(id) ? seleccionados.filter((actual) => actual !== id) : [...seleccionados, id];
	}

	/**
	 * Filtros en cascada.
	 *
	 * Los chips se combinan entre sí (AND) y cada uno arma sus opciones con las
	 * filas que pasan TODOS los demás filtros. Así no se ofrecen combinaciones
	 * vacías: al elegir "Empresa", el tramo solo muestra los tramos de Empresa.
	 * La búsqueda queda afuera del cálculo: acota resultados, no opciones, para
	 * que un texto libre no haga desaparecer la etiqueta de un chip activo.
	 */
	type ClaveFiltro = 'gestion' | 'cliente' | 'modalidad' | 'tramo' | 'envios' | 'grupo';

	const CLAVES_FILTRO: ClaveFiltro[] = ['gestion', 'cliente', 'modalidad', 'tramo', 'envios', 'grupo'];

	function claveGrupo(servicio: ServicioCartera) {
		return servicio.grupoCobranzaId ? String(servicio.grupoCobranzaId) : 'sin';
	}

	function cumpleFiltro(servicio: ServicioCartera, clave: ClaveFiltro): boolean {
		switch (clave) {
			case 'gestion':
				return (
					filtroGestion === 'TODOS' ||
					(filtroGestion === 'NORMAL' ? servicio.seleccionable : !servicio.seleccionable)
				);
			case 'cliente':
				return filtroCliente === 'TODOS' || servicio.tipoCliente === filtroCliente;
			case 'modalidad':
				return filtroModalidad === 'TODOS' || servicio.modalidadCobranza === filtroModalidad;
			case 'tramo':
				return coincideTramo(servicio, filtroTramo);
			case 'envios':
				return coincideEnvios(servicio.envios, filtroEnvios);
			case 'grupo':
				return filtroGrupoCobranza === 'TODOS' || claveGrupo(servicio) === filtroGrupoCobranza;
		}
	}

	function coincideBusqueda(servicio: ServicioCartera) {
		if (!busqueda) return true;
		const texto = `${servicio.servicio} ${servicio.tipoCliente} ${servicio.modalidadCobranza}`.toLowerCase();
		return texto.includes(busqueda.toLowerCase());
	}

	function visibles(servicio: ServicioCartera) {
		return coincideBusqueda(servicio) && CLAVES_FILTRO.every((clave) => cumpleFiltro(servicio, clave));
	}

	/** Filas que quedan aplicando todos los filtros menos el de esa faceta. */
	function filasFaceta(clave: ClaveFiltro) {
		return (cartera?.servicios ?? []).filter((servicio) =>
			CLAVES_FILTRO.every((otra) => otra === clave || cumpleFiltro(servicio, otra))
		);
	}

	function valoresUnicos(valores: string[]) {
		return [...new Set(valores)].sort((a, b) => a.localeCompare(b, 'es'));
	}

	let opcionesGestion = $derived.by(() => {
		const filas = filasFaceta('gestion');
		const opciones = [{ valor: 'TODOS', etiqueta: 'Todas' }];
		if (filas.some((servicio) => servicio.seleccionable)) opciones.push({ valor: 'NORMAL', etiqueta: 'Normal' });
		if (filas.some((servicio) => !servicio.seleccionable)) opciones.push({ valor: 'ESPECIAL', etiqueta: 'Especiales' });
		return opciones;
	});

	let opcionesCliente = $derived([
		{ valor: 'TODOS', etiqueta: 'Todos' },
		...valoresUnicos(filasFaceta('cliente').map((servicio) => servicio.tipoCliente)).map((valor) => ({
			valor,
			etiqueta: valor
		}))
	]);

	let opcionesModalidad = $derived([
		{ valor: 'TODOS', etiqueta: 'Todos' },
		...valoresUnicos(filasFaceta('modalidad').map((servicio) => servicio.modalidadCobranza)).map((valor) => ({
			valor,
			etiqueta: valor
		}))
	]);

	let opcionesTramo = $derived.by(() => {
		const presentes = new Set(filasFaceta('tramo').map((servicio) => servicio.tramoAntiguedad));
		return [
			{ valor: 'TODOS', etiqueta: 'Todos' },
			...TRAMOS.filter((tramo) => presentes.has(tramo)).map((tramo) => ({
				valor: tramo,
				etiqueta: etiquetasTramo[tramo]
			}))
		];
	});

	let opcionesEnvios = $derived.by(() => {
		const filas = filasFaceta('envios');
		const opciones = [{ valor: 'TODOS', etiqueta: 'Todos' }];
		if (filas.some((servicio) => servicio.envios === 0)) opciones.push({ valor: '0', etiqueta: '0 envíos' });
		if (filas.some((servicio) => servicio.envios === 1)) opciones.push({ valor: '1', etiqueta: '1 envío' });
		if (filas.some((servicio) => servicio.envios === 2)) opciones.push({ valor: '2', etiqueta: '2 envíos' });
		if (filas.some((servicio) => servicio.envios === 3)) opciones.push({ valor: '3', etiqueta: '3 envíos' });
		if (filas.some((servicio) => servicio.envios >= 4)) opciones.push({ valor: 'MAS_4', etiqueta: '+4 envíos' });
		return opciones;
	});

	let opcionesGrupo = $derived.by(() => {
		const nombres = new Map<string, string>();
		for (const servicio of filasFaceta('grupo')) {
			nombres.set(claveGrupo(servicio), servicio.grupoCobranza ?? 'Sin grupo');
		}
		return [
			{ valor: 'TODOS', etiqueta: 'Todos' },
			...[...nombres.entries()]
				.sort((a, b) => a[1].localeCompare(b[1], 'es'))
				.map(([valor, etiqueta]) => ({ valor, etiqueta }))
		];
	});

	let filtrosActivos = $derived(
		(busqueda.trim() ? 1 : 0) +
			(filtroGestion !== 'TODOS' ? 1 : 0) +
			(filtroCliente !== 'TODOS' ? 1 : 0) +
			(filtroModalidad !== 'TODOS' ? 1 : 0) +
			(filtroTramo !== 'TODOS' ? 1 : 0) +
			(filtroEnvios !== 'TODOS' ? 1 : 0) +
			(filtroGrupoCobranza !== 'TODOS' ? 1 : 0)
	);

	function limpiarFiltros() {
		busqueda = '';
		filtroGestion = 'TODOS';
		filtroCliente = 'TODOS';
		filtroModalidad = 'TODOS';
		filtroTramo = 'TODOS';
		filtroEnvios = 'TODOS';
		filtroGrupoCobranza = 'TODOS';
	}

	/**
	 * Al cambiar de período cambia la cartera: si un valor elegido ya no existe
	 * en el período nuevo, se limpia para no dejar un filtro activo invisible.
	 */
	function depurarFiltros() {
		const filas = cartera?.servicios ?? [];
		if (filtroGestion !== 'TODOS') {
			const requerido = filtroGestion === 'NORMAL';
			if (!filas.some((servicio) => servicio.seleccionable === requerido)) filtroGestion = 'TODOS';
		}
		if (filtroCliente !== 'TODOS' && !filas.some((servicio) => servicio.tipoCliente === filtroCliente)) {
			filtroCliente = 'TODOS';
		}
		if (filtroModalidad !== 'TODOS' && !filas.some((servicio) => servicio.modalidadCobranza === filtroModalidad)) {
			filtroModalidad = 'TODOS';
		}
		if (filtroTramo !== 'TODOS' && !filas.some((servicio) => servicio.tramoAntiguedad === filtroTramo)) {
			filtroTramo = 'TODOS';
		}
		if (filtroEnvios !== 'TODOS' && !filas.some((servicio) => coincideEnvios(servicio.envios, filtroEnvios))) {
			filtroEnvios = 'TODOS';
		}
		if (filtroGrupoCobranza !== 'TODOS' && !filas.some((servicio) => claveGrupo(servicio) === filtroGrupoCobranza)) {
			filtroGrupoCobranza = 'TODOS';
		}
	}

	async function abrirDetalle(servicio: ServicioCartera) {
		detalle = servicio;
		errorEnvio = '';
		avisoEnvio = '';
		soloVencidos = false;
		envios = [];
		contactos = [];
		nuevoContacto = '';
		void cargarHistorial(servicio.servicioId);
		void cargarContactos(servicio.servicioId);
		void cargarCuentasParaEnvio();
		void cargarEstadoWhatsAppCobranza();
	}

	async function cargarContactos(servicioId: number) {
		try {
			const datos = await listarEmailsServicio(servicioId);
			contactos = datos.emails;
			modoEmails = datos.modo;
		} catch (e) {
			error = (e as Error).message;
		}
	}

	/** Refleja los destinatarios en el detalle y habilita/deshabilita la fila. */
	async function sincronizarDestinatarios(servicioId: number) {
		await cargarContactos(servicioId);
		if (detalle) detalle = { ...detalle, destinatarios: destinatarios.length };
		if (destinatarios.length === 0) {
			seleccionados = seleccionados.filter((id) => id !== servicioId);
		}
		// La cartera trae el estado del sobre y el checkbox de selección.
		void cargar(periodo, true);
	}

	const MAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

	function abrirRegistrarMails() {
		nuevoContacto = '';
		nuevoUso = 'COBRANZA';
		errorMails = '';
		modalMails = true;
	}

	async function registrarMails() {
		if (!detalle) return;
		const emails = nuevoContacto
			.split(/[;\n]+/)
			.map((email) => email.trim())
			.filter(Boolean);

		if (emails.length === 0) {
			errorMails = 'Ingresá al menos un mail.';
			return;
		}
		const invalidos = emails.filter((email) => !MAIL_VALIDO.test(email));
		if (invalidos.length > 0) {
			errorMails = `Revisá: ${invalidos.join(', ')} no ${invalidos.length === 1 ? 'es un mail válido' : 'son mails válidos'}.`;
			return;
		}

		guardandoMails = true;
		errorMails = '';
		try {
			const resultado = await agregarEmailsServicio(
				detalle.servicioId,
				emails.join('; '),
				nuevoUso
			);
			await sincronizarDestinatarios(detalle.servicioId);
			const partes = [
				`${resultado.agregados} mail${resultado.agregados === 1 ? '' : 's'} agregado${resultado.agregados === 1 ? '' : 's'}`
			];
			if (resultado.compartidos > 0) {
				partes.push(`${resultado.compartidos} ahora recibe también facturación`);
			}
			if (resultado.reactivados > 0) {
				partes.push(`${resultado.reactivados} reactivado${resultado.reactivados === 1 ? '' : 's'}`);
			}
			if (resultado.existentes > 0) {
				partes.push(`${resultado.existentes} ya estaba${resultado.existentes === 1 ? '' : 'n'} registrado${resultado.existentes === 1 ? '' : 's'}`);
			}
			mensaje = partes.join(' · ');
			modalMails = false;
			nuevoContacto = '';
		} catch (e) {
			errorMails = (e as Error).message;
		} finally {
			guardandoMails = false;
		}
	}

	async function quitarContacto(contacto: EmailServicio) {
		if (!detalle) return;
		const compartido = contacto.uso === 'COMPARTIDO';
		const aviso = compartido
			? `${contacto.email} también recibe facturas. ¿Sacarlo solo de cobranza? Seguirá recibiendo facturación.`
			: `¿Quitar ${contacto.email} de los destinatarios de cobranza?`;
		const confirmado = await confirmar({
			titulo: 'Quitar destinatario',
			mensaje: aviso,
			tono: 'peligro',
			etiquetaConfirmar: 'Quitar'
		});
		if (!confirmado) return;
		const servicioId = detalle.servicioId;
		try {
			const resultado = await quitarEmailDeLista(contacto.id, 'COBRANZA');
			await sincronizarDestinatarios(servicioId);
			if (!resultado.eliminado) {
				mensaje = `${contacto.email} sigue recibiendo facturación`;
			}
		} catch (e) {
			error = (e as Error).message;
		}
	}

	/** Abre la planilla de mails y trae los datos actuales + el historial. */
	async function abrirPlanillaEmails() {
		mostrarPlanillaEmails = true;
		errorEmails = '';
		erroresEmails = [];
		previsualizacionEmails = null;
		resultadoEmails = null;
		archivoEmails = null;
		filasEmails = [];
		cargandoPlanilla = true;
		try {
			const [planilla, historial] = await Promise.all([
				obtenerPlanillaEmails(),
				listarImportacionesEmails().catch(() => [] as ImportacionEmails[])
			]);
			planillaEmails = planilla;
			historialEmails = historial;
		} catch (e) {
			errorEmails = (e as Error).message;
		} finally {
			cargandoPlanilla = false;
		}
	}

	function cerrarPlanillaEmails() {
		mostrarPlanillaEmails = false;
		errorEmails = '';
		erroresEmails = [];
		previsualizacionEmails = null;
		resultadoEmails = null;
		archivoEmails = null;
		filasEmails = [];
	}

	async function descargarPlanillaMails() {
		errorEmails = '';
		try {
			if (planillaEmails.length === 0) planillaEmails = await obtenerPlanillaEmails();
			descargarPlanillaEmails(planillaEmails);
		} catch (e) {
			errorEmails = (e as Error).message;
		}
	}

	/** Pide al servidor el diff sin escribir nada. */
	async function previsualizarPlanillaEmails() {
		if (filasEmails.length === 0) return;
		previsualizandoEmails = true;
		erroresEmails = [];
		errorEmails = '';
		try {
			previsualizacionEmails = await importarPlanillaEmails(filasEmails, archivoEmails?.name ?? '', false);
		} catch (e) {
			previsualizacionEmails = null;
			if (e instanceof ErrorImportacionEmails) erroresEmails = e.errores;
			else errorEmails = (e as Error).message;
		} finally {
			previsualizandoEmails = false;
		}
	}

	async function seleccionarPlanillaEmails(evento: Event) {
		const entrada = evento.currentTarget as HTMLInputElement;
		const archivo = entrada.files?.[0];
		entrada.value = '';
		if (!archivo) return;
		archivoEmails = archivo;
		previsualizacionEmails = null;
		resultadoEmails = null;
		erroresEmails = [];
		errorEmails = '';
		try {
			const { filas, errores } = await leerPlanillaEmails(archivo);
			filasEmails = filas;
			if (errores.length > 0) {
				erroresEmails = errores;
				return;
			}
			await previsualizarPlanillaEmails();
		} catch (e) {
			erroresEmails = [{ fila: 0, mensaje: (e as Error).message }];
		}
	}

	async function aplicarPlanillaEmails() {
		if (!previsualizacionEmails || previsualizacionEmails.servicios === 0) return;
		aplicandoEmails = true;
		errorEmails = '';
		erroresEmails = [];
		try {
			const resumen = await importarPlanillaEmails(filasEmails, archivoEmails?.name ?? '', true);
			resultadoEmails = resumen;
			previsualizacionEmails = null;
			filasEmails = [];
			archivoEmails = null;
			planillaEmails = await obtenerPlanillaEmails();
			historialEmails = await listarImportacionesEmails().catch(() => historialEmails);

			const servicioAbierto = detalle?.servicioId ?? null;
			if (servicioAbierto) await cargarContactos(servicioAbierto);
			await cargar(periodo, true);
			if (servicioAbierto) {
				const actualizado = cartera?.servicios.find((item) => item.servicioId === servicioAbierto);
				if (actualizado) detalle = actualizado;
			}
			// Un servicio que quedó sin mails no puede seguir seleccionado.
			seleccionados = seleccionados.filter((id) => {
				const servicio = cartera?.servicios.find((item) => item.servicioId === id);
				return (servicio?.destinatarios ?? 0) > 0;
			});

			const partes = [
				`${resumen.agregados} alta${resumen.agregados === 1 ? '' : 's'}`,
				`${resumen.quitados} baja${resumen.quitados === 1 ? '' : 's'}`
			];
			if (resumen.retenidos > 0) {
				partes.push(`${resumen.retenidos} sigue${resumen.retenidos === 1 ? '' : 'n'} en facturación`);
			}
			mensaje = `Planilla de mails aplicada: ${partes.join(' · ')}.`;
		} catch (e) {
			if (e instanceof ErrorImportacionEmails) erroresEmails = e.errores;
			else errorEmails = (e as Error).message;
		} finally {
			aplicandoEmails = false;
		}
	}

	async function cargarHistorial(servicioId: number) {
		try {
			envios = await listarEnviosCobranza(servicioId);
		} catch (e) {
			error = (e as Error).message;
		}
	}

	async function cargarCuentasParaEnvio() {
		try {
			if (plantillas.length === 0) plantillas = await listarPlantillasCobranza();
			try {
				plantillaPredeterminadaId = await obtenerPlantillaPredeterminadaCobranza();
			} catch {
				// Sin preferencia guardada: se usa la primera plantilla activa.
			}
			cuentasCorreo = await listarCuentasCorreoEnvio();
			if (!envioPlantillaId) {
				const predeterminada = plantillas.find(
					(plantilla) => plantilla.id === plantillaPredeterminadaId && plantilla.activo
				);
				const preferida =
					predeterminada ?? plantillas.find((plantilla) => plantilla.activo) ?? plantillas[0];
				if (preferida) envioPlantillaId = preferida.id;
			}
			const predeterminada =
				cuentasCorreo.find((cuenta) => cuenta.predeterminada) ?? cuentasCorreo.find((cuenta) => cuenta.activo);
			if (!envioCuentaId && predeterminada) envioCuentaId = predeterminada.id;
		} catch (e) {
			error = (e as Error).message;
		}
	}

	/** Cambiar de modelo puede dejar "solo vencidos" sin efecto: se destilda. */
	function cambiarPlantilla(evento: Event) {
		const id = Number((evento.currentTarget as HTMLSelectElement).value) || null;
		envioPlantillaId = id;
		const plantilla = plantillas.find((item) => item.id === id);
		if (!plantilla || !plantillaListaComprobantes(plantilla)) soloVencidos = false;
	}

	/** Selector único "Enviar desde": cuenta principal o uno de sus alias. */
	function cambiarRemitente(evento: Event) {
		const [tipo, id, cuenta] = (evento.currentTarget as HTMLSelectElement).value.split(':');
		if (tipo === 'alias') {
			envioCuentaId = Number(cuenta);
			envioAliasId = Number(id);
		} else {
			envioCuentaId = Number(id);
			envioAliasId = null;
		}
	}

	async function guardarPredeterminada() {
		if (!envioPlantillaId) return;
		guardandoPredeterminada = true;
		errorEnvio = '';
		try {
			plantillaPredeterminadaId = await guardarPlantillaPredeterminadaCobranza(envioPlantillaId);
			avisoEnvio = 'Plantilla guardada como predeterminada para el envío individual.';
		} catch (e) {
			errorEnvio = (e as Error).message;
		} finally {
			guardandoPredeterminada = false;
		}
	}

	/**
	 * Totales de lo que se envía: excluye siempre la exclusión temporal y, con
	 * "solo vencidos", los comprobantes cuyo plazo todavía no venció.
	 */
	function totalesServicio(servicio: ServicioCartera) {
		return totalesEnvio(servicio.documentos, aplicarSoloVencidos, cartera?.cotizacionUsd ?? 0);
	}

	async function toggleExclusion(documento: DocumentoCartera) {
		try {
			const resultado = await alternarExclusionEnvio(documento.id, !documento.excluidoEnvio);
			if (detalle) {
				detalle = {
					...detalle,
					documentos: detalle.documentos.map((item) =>
						item.id === documento.id ? { ...item, excluidoEnvio: resultado.excluidoEnvio } : item
					)
				};
			}
		} catch (e) {
			error = (e as Error).message;
		}
	}

	async function cargarSeguimientosActivos() {
		try {
			const todos = await listarSeguimientos();
			const mapa: Record<number, SeguimientoResumen[]> = {};
			for (const seguimiento of todos) {
				(mapa[seguimiento.servicio.id] ??= []).push(seguimiento);
			}
			seguimientosPorServicio = mapa;
		} catch {
			// Sin permiso de seguimientos la cartera sigue funcionando igual.
			seguimientosPorServicio = {};
		}
	}

	function seguimientosDe(servicioId: number): SeguimientoResumen[] {
		return seguimientosPorServicio[servicioId] ?? [];
	}

	function etiquetaSeguimiento(estado: string): string {
		const etiquetas: Record<string, string> = {
			EN_SEGUIMIENTO: 'En seguimiento',
			ESPERANDO_CLIENTE: 'Esperando cliente',
			PROMESA_PAGO: 'Promesa de pago',
			BLOQUEADO_TICKET: 'Bloqueado por ticket',
			PAUSADO: 'Pausado'
		};
		return etiquetas[estado] ?? estado;
	}

	function proximaVencida(seguimiento: SeguimientoResumen): boolean {
		return seguimiento.proximaGestion?.estado === 'VENCIDA' || false;
	}

	function comprobantesParaSeguimiento(): DocumentoCartera[] {
		if (!detalle) return [];
		const documentos = detalle.documentos.filter((documento) => !documento.excluidoEnvio);
		return aplicarSoloVencidos ? documentos.filter((documento) => documento.vencida) : documentos;
	}

	async function abrirNuevoSeguimiento() {
		if (!detalle) return;
		errorSeguimiento = '';
		segTitulo = `Cobranza ${detalle.servicio}`;
		segMotivo = '';
		segEstado = 'EN_SEGUIMIENTO';
		segPrioridad = 'NORMAL';
		segResponsable = '';
		segProxima = '';
		segNota = '';
		modalSeguimiento = true;
		if (!catalogosSeguimiento) {
			try {
				catalogosSeguimiento = await listarCatalogosSeguimientos();
			} catch {
				catalogosSeguimiento = null;
			}
		}
	}

	async function guardarSeguimientoDesdeCobranza() {
		if (!detalle) return;
		const documentos = comprobantesParaSeguimiento();
		if (documentos.length === 0) {
			errorSeguimiento = 'No hay comprobantes incluidos para asociar al seguimiento.';
			return;
		}
		if (segTitulo.trim().length < 3) {
			errorSeguimiento = 'Escribí un título para el seguimiento.';
			return;
		}
		guardandoSeguimiento = true;
		errorSeguimiento = '';
		try {
			const nuevo = await crearSeguimiento({
				servicioId: detalle.servicioId,
				titulo: segTitulo.trim(),
				motivo: segMotivo.trim() || null,
				estado: segEstado,
				prioridad: segPrioridad,
				responsableUsuarioId: segResponsable || undefined,
				facturaIds: documentos.map((documento) => documento.id),
				nota: segNota.trim() || undefined,
				proximaAccion: segProxima
					? {
							tipoAccion: 'CORREO',
							titulo: 'Primer contacto del seguimiento',
							fechaHora: new Date(segProxima).toISOString(),
							recordatorioMinutos: 60,
							nota: null
						}
					: undefined
			});
			modalSeguimiento = false;
			detalle = null;
			await cargarSeguimientosActivos();
			await goto(`/seguimientos?seg=${nuevo.id}`);
		} catch (e) {
			errorSeguimiento = (e as Error).message;
		} finally {
			guardandoSeguimiento = false;
		}
	}

	/** Deja el envío real en el historial de los seguimientos que cubren esas facturas. */
	async function registrarEnvioEnSeguimientos(envio: EnvioCobranza) {
		if (!detalle) return;
		const ids = new Set(
			(envio.comprobantes ?? [])
				.filter((comprobante) => comprobante.incluido)
				.map((comprobante) => comprobante.id)
		);
		if (ids.size === 0) return;
		for (const seguimiento of seguimientosDe(detalle.servicioId)) {
			if (!seguimiento.facturas.ids.some((id) => ids.has(id))) continue;
			try {
				await registrarAvance(seguimiento.id, {
					canal: 'CORREO',
					direccion: 'SALIENTE',
					contenido: `Correo "${envio.asunto}" enviado desde ${envio.cuenta} a ${envio.destinatarios.join(', ')}. Plantilla: ${envio.plantilla}.`,
					asunto: envio.asunto,
					destinatarios: envio.destinatarios,
					estadoEntrega: envio.estado === 'ENVIADO' ? 'ENVIADO' : 'FALLIDO'
				});
			} catch {
				// El envío ya se concretó: un fallo de trazabilidad no lo revierte.
			}
		}
		await cargarSeguimientosActivos();
	}

	async function enviar() {
		if (!detalle || !envioPlantillaId || !envioCuentaId) return;
		enviando = true;
		errorEnvio = '';
		avisoEnvio = '';
		try {
			const envio = await enviarEstadoCuenta({
				servicioId: detalle.servicioId,
				periodo: cartera!.periodo,
				plantillaId: envioPlantillaId,
				cuentaId: envioCuentaId,
				aliasId: envioAliasId,
				soloVencidos: aplicarSoloVencidos
			});
			avisoEnvio = aplicarSoloVencidos
				? 'Estado de cuenta enviado solo con los comprobantes vencidos. Las exclusiones temporales volvieron a incluirse.'
				: 'Estado de cuenta enviado. Las exclusiones temporales volvieron a incluirse.';
			await registrarEnvioEnSeguimientos(envio);
			await cargarHistorial(detalle.servicioId);
			await cargar(periodo);
			const actualizado = cartera?.servicios.find((item) => item.servicioId === detalle?.servicioId);
			if (actualizado) detalle = actualizado;
		} catch (e) {
			errorEnvio = (e as Error).message;
			await cargarHistorial(detalle.servicioId);
		} finally {
			enviando = false;
		}
	}

	async function cargarEstadoWhatsAppCobranza() {
		try {
			whatsappConectado = (await obtenerEstadoWhatsAppCobranza()).conectado;
		} catch {
			whatsappConectado = false;
		}
	}

	async function enviarWhatsapp() {
		if (!detalle) return;
		if (!detalle.celular) {
			errorEnvio = 'El servicio no tiene celular de WhatsApp. Cargalo en Servicios → editar.';
			return;
		}
		if (!whatsappConectado) {
			errorEnvio = 'La sesión de WhatsApp no está conectada. Pedile al administrador que la conecte.';
			return;
		}
		const totalesModal = totalesServicio(detalle);
		const resumen =
			`UYU ${dinero(totalesModal.pesos)}` +
			(totalesModal.dolares !== 0 ? ` · USD ${dinero(totalesModal.dolares, 'USD')}` : '');
		const confirmado = await confirmar({
			titulo: 'Enviar estado de cuenta',
			mensaje: `Se enviará por WhatsApp a ${formatearTelefonoUy(detalle.celular)}. La carta se adjunta en PDF cuando está disponible.`,
			detalle: `Total a enviar: ${resumen}`,
			etiquetaConfirmar: 'Enviar por WhatsApp'
		});
		if (!confirmado) return;
		enviandoWhatsApp = true;
		errorEnvio = '';
		avisoEnvio = '';
		try {
			const resultado = await enviarCobranzaPorWhatsApp(
				detalle.servicioId,
				aplicarSoloVencidos,
				cartera?.periodo,
				{ uyu: totalesModal.pesos, usd: totalesModal.dolares },
				envioPlantillaId
			);
			const enviado =
				`UYU ${dinero(resultado.totales.uyu)}` +
				(resultado.totales.usd !== 0 ? ` · USD ${dinero(resultado.totales.usd, 'USD')}` : '');
			avisoEnvio =
				resultado.modo === 'PDF'
					? `Estado de cuenta enviado por WhatsApp con la carta en PDF. Total: ${enviado}.`
					: `Estado de cuenta enviado por WhatsApp (texto, sin PDF disponible). Total: ${enviado}.`;
		} catch (fallo) {
			errorEnvio = (fallo as Error).message;
		} finally {
			enviandoWhatsApp = false;
		}
	}

	async function restaurar(documento: DocumentoCartera) {
		try {
			await restaurarComprobanteCobranza(documento.id);
			await cargar(periodo);
			const actualizado = cartera?.servicios.find((item) => item.servicioId === detalle?.servicioId);
			if (actualizado) detalle = actualizado;
		} catch (e) {
			error = (e as Error).message;
		}
	}

	async function abrirEliminados() {
		mostrarEliminados = true;
		cargandoEliminados = true;
		error = '';
		try {
			eliminados = await listarComprobantesEliminados(periodo);
		} catch (e) {
			error = (e as Error).message;
		} finally {
			cargandoEliminados = false;
		}
	}

	async function restaurarEliminado(documento: ComprobanteEliminado) {
		try {
			await restaurarComprobanteCobranza(documento.id);
			eliminados = eliminados.filter((item) => item.id !== documento.id);
			await cargar(periodo);
			mensaje = `Comprobante ${documento.serie ? `${documento.serie}-` : ''}${documento.numero} restaurado.`;
		} catch (e) {
			error = (e as Error).message;
		}
	}

	async function eliminar(id: number) {
		const confirmado = await confirmar({
			titulo: 'Eliminar comprobante',
			mensaje:
				'¿Eliminar lógicamente este comprobante? Quedará auditado y no reaparecerá al reimportar.',
			tono: 'peligro',
			etiquetaConfirmar: 'Eliminar'
		});
		if (!confirmado) return;
		await eliminarComprobanteCobranza(id, 'Eliminado desde Cobranza');
		if (detalle) detalle = { ...detalle, documentos: detalle.documentos.filter((documento) => documento.id !== id) };
		await cargar(periodo);
	}

	onMount(() => {
		void cargar();
		// Los grupos de cobranza se usan en el filtro y en la asignación masiva.
		void cargarCatalogosServicios();
		void cargarCuentasParaEnvio();
		void cargarCopia();
		void cargarSeguimientosActivos();
		void refrescarLote();
		temporizadorLote = setInterval(() => void refrescarLote(), 1500);
		return () => {
			if (temporizadorLote) clearInterval(temporizadorLote);
		};
	});

	async function abrirPlantillas() {
		error = '';
		plantillas = await listarPlantillasCobranza();
		mostrarPlantillas = true;
		if (plantillas[0]) seleccionarPlantilla(plantillas[0]);
	}

	function seleccionarPlantilla(plantilla: PlantillaCobranza) {
		modelo = {
			id: plantilla.id,
			nombre: plantilla.nombre,
			asunto: plantilla.asunto,
			cuerpo: plantilla.cuerpo,
			cartaHabilitada: plantilla.cartaHabilitada,
			cartaHtml: plantilla.cartaHtml ?? '',
			cartaFondo: plantilla.cartaFondo ?? null
		};
	}

	/** Comprime la imagen en el navegador para no guardar archivos enormes. */
	function cargarImagen(src: string): Promise<HTMLImageElement> {
		return new Promise((resolver, rechazar) => {
			const imagen = new Image();
			imagen.onload = () => resolver(imagen);
			imagen.onerror = () => rechazar(new Error('La imagen no es válida'));
			imagen.src = src;
		});
	}

	/**
	 * Un SVG puede no traer width/height en píxeles. Se usa el viewBox (mejor
	 * para conservar la proporción) o las medidas declaradas.
	 */
	function dimensionesSvg(texto: string): { ancho: number; alto: number } | null {
		const documento = new DOMParser().parseFromString(texto, 'image/svg+xml');
		const svg = documento.documentElement;
		if (!svg || svg.nodeName.toLowerCase() !== 'svg') return null;

		const viewBox = svg.getAttribute('viewBox');
		if (viewBox) {
			const partes = viewBox.split(/[\s,]+/).map(Number);
			if (partes.length === 4 && partes[2] > 0 && partes[3] > 0) {
				return { ancho: partes[2], alto: partes[3] };
			}
		}

		const numero = (valor: string | null) => {
			const coincidencia = valor?.match(/^\s*([\d.]+)/);
			return coincidencia ? Number(coincidencia[1]) : 0;
		};
		const ancho = numero(svg.getAttribute('width'));
		const alto = numero(svg.getAttribute('height'));
		return ancho > 0 && alto > 0 ? { ancho, alto } : null;
	}

	/**
	 * Normaliza el fondo a una imagen raster para guardarlo como data URL.
	 *
	 * SVG: se rasteriza al ancho objetivo (es vectorial, se puede agrandar) y
	 * se codifica en WebP para conservar transparencia sin pesar como PNG.
	 * Raster: se achica si hace falta y va a JPEG. El SVG no se guarda crudo:
	 * así el PDF no depende de scripts ni fuentes externas del archivo.
	 */
	async function comprimirImagen(archivo: File, maxAncho = 1400, calidad = 0.82): Promise<string> {
		const esSvg = archivo.type === 'image/svg+xml' || /\.svg$/i.test(archivo.name);

		const dataUrl = await new Promise<string>((resolver, rechazar) => {
			const lector = new FileReader();
			lector.onload = () => resolver(String(lector.result));
			lector.onerror = () => rechazar(new Error('No se pudo leer la imagen'));
			lector.readAsDataURL(archivo);
		});

		const imagen = await cargarImagen(dataUrl);
		let ancho = imagen.naturalWidth || imagen.width;
		let alto = imagen.naturalHeight || imagen.height;

		if (esSvg) {
			const medidas = dimensionesSvg(await archivo.text());
			if (!medidas) {
				throw new Error(
					'El SVG no define width/height ni viewBox. Agregalos y volvé a intentar.'
				);
			}
			ancho = medidas.ancho;
			alto = medidas.alto;
		}
		if (!ancho || !alto) throw new Error('La imagen no es válida');

		const renderizar = (objetivoAncho: number, calidadSalida: number) => {
			// El SVG se rasteriza siempre al ancho objetivo; un raster nunca se
			// agranda (perdería calidad).
			const escala = esSvg ? objetivoAncho / ancho : Math.min(1, objetivoAncho / ancho);
			const lienzo = document.createElement('canvas');
			lienzo.width = Math.max(1, Math.round(ancho * escala));
			lienzo.height = Math.max(1, Math.round(alto * escala));
			const contexto = lienzo.getContext('2d');
			if (!contexto) throw new Error('No se pudo procesar la imagen');
			if (!esSvg) {
				// JPEG no guarda transparencia: fondo blanco en vez de negro.
				contexto.fillStyle = '#ffffff';
				contexto.fillRect(0, 0, lienzo.width, lienzo.height);
			}
			contexto.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);

			if (esSvg) {
				const webp = lienzo.toDataURL('image/webp', calidadSalida);
				return webp.startsWith('data:image/webp') ? webp : lienzo.toDataURL('image/png');
			}
			return lienzo.toDataURL('image/jpeg', calidadSalida);
		};

		let salida = renderizar(maxAncho, calidad);
		// El fondo viaja en el JSON de la plantilla: si quedó muy pesado se
		// reencoda más chico para no rozar el límite del cuerpo del request.
		if (salida.length > 500_000) salida = renderizar(1000, 0.72);
		return salida;
	}

	async function cargarFondo(evento: Event) {
		const entrada = evento.currentTarget as HTMLInputElement;
		const archivo = entrada.files?.[0];
		entrada.value = '';
		if (!archivo) return;
		error = '';
		try {
			modelo.cartaFondo = await comprimirImagen(archivo);
		} catch (e) {
			error = (e as Error).message;
		}
	}

	async function guardarModelo() {
		try {
			const guardada = await guardarPlantillaCobranza(modelo);
			modelo = {
				id: guardada.id,
				nombre: guardada.nombre,
				asunto: guardada.asunto,
				cuerpo: guardada.cuerpo,
				cartaHabilitada: guardada.cartaHabilitada,
				cartaHtml: guardada.cartaHtml ?? '',
				cartaFondo: guardada.cartaFondo ?? null
			};
			plantillas = await listarPlantillasCobranza();
			mensaje = 'Plantilla guardada.';
		} catch (e) {
			error = e instanceof Error ? e.message : 'No se pudo guardar la plantilla';
		}
	}
</script>

<svelte:head><title>CRM — Cobranza</title></svelte:head>

<div class="pantalla">
	<header class="cabecera">
		<div><h1>Cobranza · Estados de cuenta</h1></div>
		<div class="acciones">{#if loteVigente && lote}<button
				class="widget-envios"
				class:completado={lote.estado === 'COMPLETADO'}
				class:con-errores={lote.estado === 'COMPLETADO' && lote.errores > 0}
				onclick={abrirDetalleLote}
				title="Ver detalle del envío masivo"
				aria-label={`Ver detalle del envío masivo: ${lote.enviados + lote.errores} de ${lote.total} procesados`}
			>
				<span class="widget-linea">
					<span class="widget-sobre">{@html iconos.correo}</span>
					<b>{lote.enviados + lote.errores}/{lote.total}</b>
					<small>{lote.estado === 'COMPLETADO' ? (lote.errores > 0 ? 'con errores' : 'completado') : 'enviando'}</small>
					<span class="widget-porcentaje">{progresoLote.porcentaje}%</span>
				</span>
				<span class="widget-barra" aria-hidden="true">
					<span class="widget-barra-enviados" style={`width:${progresoLote.enviados}%`}></span>
					<span class="widget-barra-errores" style={`width:${progresoLote.errores}%`}></span>
				</span>
			</button>{/if}<button class="boton secundario" onclick={abrirImportacion}>Importar planilla</button><button class="boton secundario" onclick={abrirPlanillaEmails}>Planilla de mails</button><button class="boton secundario" onclick={abrirPlantillas}>Plantillas</button><button class="boton secundario" onclick={abrirEliminados}>Eliminados</button><a class="boton secundario" href="/configuracion">Configuración</a></div>
	</header>

	{#if mensaje}<div class="aviso ok">{mensaje}</div>{/if}
	{#if error}<div class="aviso error">{error}</div>{/if}

	<section class="panel filtros">
		<ChipSelect tamano="normal" etiqueta="Período" valor={periodo} opciones={periodos.map((item) => ({ valor: item.periodo, etiqueta: `${nombrePeriodo(item.periodo)} · USD ${cotizacionCorta(item.cotizacionUsd)}` }))} placeholder="Todos los períodos" onchange={(valor) => { periodo = valor; cargar(periodo); }} ariaLabel="Filtrar por período" />
		<CampoTexto etiqueta="Buscar" ph="Servicio o contacto" bind:valor={busqueda} />
		<ChipSelect tamano="normal" etiqueta="Gestión" valor={filtroGestion} opciones={opcionesGestion} placeholder="Todas" onchange={(valor) => (filtroGestion = valor)} ariaLabel="Filtrar por gestión" />
		<ChipSelect tamano="normal" etiqueta="Cliente" valor={filtroCliente} opciones={opcionesCliente} placeholder="Todos" onchange={(valor) => (filtroCliente = valor)} ariaLabel="Filtrar por tipo de cliente" />
		<ChipSelect tamano="normal" etiqueta="Cobranza" valor={filtroModalidad} opciones={opcionesModalidad} placeholder="Todas" onchange={(valor) => (filtroModalidad = valor)} ariaLabel="Filtrar por tipo de cobranza" />
		<ChipSelect tamano="normal" etiqueta="Tramo" valor={filtroTramo} opciones={opcionesTramo} placeholder="Todos" onchange={(valor) => (filtroTramo = valor)} ariaLabel="Filtrar por tramo de deuda (deuda más antigua del servicio)" />
		<ChipSelect tamano="normal" etiqueta="Envíos" valor={filtroEnvios} opciones={opcionesEnvios} placeholder="Todos" onchange={(valor) => (filtroEnvios = valor)} ariaLabel="Filtrar por cantidad de envíos" />
		<ChipSelect tamano="normal" etiqueta="Grupo" valor={filtroGrupoCobranza} opciones={opcionesGrupo} placeholder="Todos" onchange={(valor) => (filtroGrupoCobranza = valor)} ariaLabel="Filtrar por grupo de cobranza" />
		<button
			type="button"
			class="btn-limpiar"
			disabled={filtrosActivos === 0}
			onclick={limpiarFiltros}
			title={filtrosActivos > 0 ? `Quitar los ${filtrosActivos} filtros activos y mostrar todo` : 'No hay filtros activos'}
		>
			Limpiar{filtrosActivos > 0 ? ` (${filtrosActivos})` : ''}
		</button>
		<a
			class="estado-copia"
			class:falta={estadoCopia.estado === 'falta'}
			class:activa={estadoCopia.estado === 'activa'}
			href="/configuracion?seccion=correo"
			title="Configurar la copia global en Configuración → Correo"
		>{estadoCopia.texto}</a>
		<small class="ayuda-tramo">El tramo de deuda indica la deuda más antigua del servicio: cada servicio cae en un solo tramo.</small>
	</section>

	{#if cargando}<div class="vacio">Cargando cartera…</div>
	{:else if !cartera || cartera.servicios.length === 0}<div class="vacio"><strong>Sin cartera importada</strong><span>Seleccioná un período y cargá la planilla de pendientes.</span></div>
	{:else}
		<section class="tabla-panel">
			<div class="tabla-titulo"><div><span class="kicker">PERÍODO {nombrePeriodo(cartera.periodo)}</span><h2>Cartera NORMAL</h2></div><span class="contador">{seleccionados.length} seleccionados</span></div>

			<div class="tabla-scroll tabla-scroll-cartera"><table class="tabla-cartera"><thead>
				<tr><th class="seleccion" aria-label="Seleccionar">✓</th><th class="alerta-cab" title="Alerta de mora por antigüedad desde la emisión: mostaza 1-2 meses, naranja 3-4 meses, rojo más de 4">!</th><th colspan="2">Envíos</th><th>Servicio / contacto</th><th colspan="4">Pesos ($)</th><th colspan="4">Dólares (USD)</th><th>Equiv. $</th></tr>
				<tr class="subcab"><th></th><th></th><th></th><th></th><th></th>{#each TRAMOS_VENCIDOS as tramo}<th>{etiquetasTramo[tramo]}</th>{/each}{#each TRAMOS_VENCIDOS as tramo}<th>{etiquetasTramo[tramo]}</th>{/each}<th></th></tr>
			</thead>
				{#each bloquesGrupo as grupo (grupo.clave)}
					<tbody>
						<tr class="fila-grupo">
							<td colspan="14">
								<div class="grupo-cabecera" style="background: {grupo.fondo}; color: {grupo.texto}">
									<button type="button" class="grupo-toggle" onclick={() => alternarBloque(grupo)} aria-label={`${gruposCerrados.includes(grupo.clave) ? 'Expandir' : 'Colapsar'} grupo ${grupo.nombre}`}>
										{gruposCerrados.includes(grupo.clave) ? '▸' : '▾'}
									</button>
									<label class="grupo-check" title={grupo.servicios.every((servicio) => servicio.destinatarios === 0) ? 'Sin servicios con mail de cobranza registrado' : `Seleccionar todo ${grupo.nombre}`}>
										<input type="checkbox" checked={grupoCompleto(grupo)} disabled={grupo.servicios.every((servicio) => servicio.destinatarios === 0)} onchange={() => alternarTodosBloque(grupo)} aria-label={`Seleccionar todo ${grupo.nombre}`} />
									</label>
									<strong>{grupo.nombre}</strong>
									<span class="grupo-cantidad">{grupo.servicios.length} servicios</span>
									<span class="grupo-totales">{dinero(sumaGrupo(grupo).pesos)} · {dinero(sumaGrupo(grupo).dolares, 'USD')} · {dinero(sumaGrupo(grupo).equivalente)}</span>
								</div>
							</td>
						</tr>
						{#if !gruposCerrados.includes(grupo.clave)}
							{#each grupo.servicios as servicio (servicio.servicioId)}
								<tr
									class="fila-servicio"
									role="button"
									tabindex="0"
									aria-label={`Ver detalle de deuda de ${servicio.servicio}`}
									onclick={() => abrirDetalle(servicio)}
									onkeydown={(evento) => {
										if (evento.key === 'Enter' || evento.key === ' ') {
											evento.preventDefault();
											abrirDetalle(servicio);
										}
									}}
								>
									<td class="seleccion"><input type="checkbox" checked={seleccionados.includes(servicio.servicioId)} disabled={!seleccionable(servicio)} title={seleccionable(servicio) ? `Seleccionar ${servicio.servicio}` : 'Sin mails de cobranza registrados'} onchange={() => alternar(servicio.servicioId)} onclick={(evento) => evento.stopPropagation()} aria-label={`Seleccionar ${servicio.servicio}`} /></td>
									<td class="alerta">
										{#if servicio.alertaMora}
											<span
												class="alerta-mora {servicio.alertaMora.toLowerCase()}"
												title={textoAlerta(servicio)}
												aria-label={textoAlerta(servicio)}
												role="img"
											><img src={iconoAlerta(servicio.alertaMora)} alt="" /></span>
										{/if}
									</td>
									<td class="sobre-celda">
										{#if servicio.destinatarios === 0}
											<span class="sobre sin-destinatarios" title="Sin mails de cobranza registrados" aria-label="Sin mails de cobranza registrados">{@html iconos.correo}</span>
										{:else}
											<span class:con-envios={servicio.envios > 0} class="sobre" title={`${servicio.envios} mails enviados`}>{@html iconos.correo}</span>
										{/if}
									</td>
									<td class="envios-numero">
										{#if servicio.destinatarios > 0 && servicio.envios > 0}<b>{servicio.envios}</b>{/if}
									</td>
									<td class="servicio">
										<strong>{servicio.servicio}</strong>
										{#each seguimientosDe(servicio.servicioId).slice(0, 1) as seguimiento (seguimiento.id)}
											<div class="fila-seguimiento">
												<button
													type="button"
													class="chip-seguimiento {seguimiento.estado.toLowerCase()}"
													title={`${seguimiento.codigo} · ${etiquetaSeguimiento(seguimiento.estado)} · ${seguimiento.responsable.nombre}${seguimiento.proximaGestion ? ` · próxima ${new Date(seguimiento.proximaGestion.fechaHora).toLocaleString('es-UY')}` : ' · sin próxima gestión'}${seguimiento.tickets.bloqueantes > 0 ? ' · ticket bloqueante' : ''}`}
													onclick={(evento) => {
														evento.stopPropagation();
														goto(`/seguimientos?seg=${seguimiento.id}`);
													}}
												>
													<span class="punto-seg"></span>
													{seguimiento.codigo}
													{#if proximaVencida(seguimiento)}<span class="seg-alerta" title="Próxima gestión vencida">!</span>{/if}
													{#if seguimiento.tickets.bloqueantes > 0}<span class="seg-ticket" title="Ticket bloqueante">TCK</span>{/if}
												</button>
												{#if seguimientosDe(servicio.servicioId).length > 1}
													<span class="chip-seguimiento-mas" title={`${seguimientosDe(servicio.servicioId).length} seguimientos activos`}>+{seguimientosDe(servicio.servicioId).length - 1}</span>
												{/if}
											</div>
										{/each}
									</td>
									{#each TRAMOS_VENCIDOS as tramo}<td class="numero">{dinero(servicio.pesos[tramo] ?? '0')}</td>{/each}
									{#each TRAMOS_VENCIDOS as tramo}<td class="numero">{dinero(servicio.dolares[tramo] ?? '0', 'USD')}</td>{/each}
									<td class="numero equival"><strong>{dinero(servicio.equivalentePesos)}</strong>{#if deudaAVencer(servicio) > 0}<small title="Incluye deuda aún no vencida">incl. {dinero(deudaAVencer(servicio))} a vencer</small>{/if}</td>
								</tr>
							{/each}
						{/if}
					</tbody>
				{/each}</table></div>
		</section>

		<section class="tabla-panel especiales"><div class="tabla-titulo"><div><span class="kicker">GESTIÓN DIFERENCIADA</span><h2>Gestiones especiales</h2></div><span class="bloqueado">Envíos bloqueados</span></div><div class="tabla-scroll"><table><thead><tr><th>Gestión</th><th>Servicio</th><th>Tipo cliente</th><th>Modalidad</th><th>Saldo UYU</th><th>Saldo USD</th><th>Equiv. UYU</th><th></th></tr></thead><tbody>{#each cartera.servicios.filter((item) => !item.seleccionable && visibles(item)) as servicio}<tr><td><span class="chip">{servicio.tipoGestion}</span></td><td><strong>{servicio.servicio}</strong></td><td>{servicio.tipoCliente}</td><td>{servicio.modalidadCobranza}</td><td class="numero">{dinero(total(servicio.pesos))}</td><td class="numero">{dinero(total(servicio.dolares), 'USD')}</td><td class="numero"><strong>{dinero(servicio.equivalentePesos)}</strong></td><td><button class="ojo" title="Ver detalle" onclick={() => abrirDetalle(servicio)}>◉</button></td></tr>{/each}</tbody></table></div></section>
	{/if}
</div>

{#if mostrarImportacion}<ModalPanel titulo="Importar cartera" subtitulo="La importación es atómica: si una validación falla, no se incorpora ninguna fila." etiqueta="NUEVO CORTE" onCerrar={() => (mostrarImportacion = false)}>
	<div class="importacion-form">
		<div class="importacion-campos">
			<label>Período de la cartera <small class="periodo-nombre">{nombrePeriodo(periodo) || '—'}</small><input type="month" value={periodo} onchange={(evento) => cambiarPeriodoImportacion(evento.currentTarget.value)} /></label>
			<label>Cotización USD<input type="text" inputmode="decimal" placeholder="40,25 o 40.25" bind:value={cotizacion} aria-label="Cotización del dólar" /></label>
			<div class="corte"><span>Corte automático</span><strong>{fechaCorteCobranza(periodo) ?? 'Elegí un período'}</strong><small>Siempre corresponde al último día del mes seleccionado.</small></div>
		</div>
		<div class="importacion-origen">
			<div>
				<strong>Reporte de Zureo Go</strong>
				<p>La importación fue creada para el reporte de facturas pendientes de cobro generado por el sistema de Zureo Go.</p>
			</div>
			<button type="button" class="boton secundario" onclick={descargarPlantillaCobranza}>
				{@html iconos.descargar} Descargar plantilla
			</button>
		</div>
		<label class="archivo-campo">Planilla mensual (.xlsx o .xls)<input type="file" accept=".xlsx,.xls" onchange={seleccionarArchivo} /></label>
		{#if archivo}<div class="archivo-seleccionado"><strong>{archivo.name}</strong><span>{filasImportacion.length} filas leídas</span></div>{/if}
		<section class:sin-errores={archivo && validacionesImportacion.length === 0} class="validaciones" aria-live="polite">
			<div class="validaciones-cabecera"><strong>Validaciones</strong><span>{validacionesImportacion.length ? `${validacionesImportacion.length} observaciones` : archivo ? 'Planilla lista para importar' : 'Seleccioná una planilla'}</span></div>
			{#if !filasImportacion.length && validacionesImportacion.some((validacion) => validacion.fila === 0)}<ul>{#each validacionesImportacion.filter((validacion) => validacion.fila === 0) as validacion}<li><b>Planilla</b><span>{validacion.mensaje}</span></li>{/each}</ul>{/if}
			{#if filasImportacion.length}<div class="filtro-validaciones"><label class="check"><input type="checkbox" bind:checked={mostrarSoloErrores} /> Mostrar solo filas con errores de importación <span>({validacionesImportacion.filter((validacion) => validacion.fila > 0).length} observaciones)</span></label></div><div class="validaciones-scroll"><table class="tabla-validaciones"><thead><tr><th>Fila</th>{#each columnasValidacion as columna}<th>{columna.etiqueta}</th>{/each}<th>Detalle</th><th>Acción</th></tr></thead><tbody>{#each filasImportacion as fila, indice}{#if !mostrarSoloErrores || filaTieneErrores(indice)}<tr><td>{fila.filaExcel ?? filaExcel(indice)}</td>{#each columnasValidacion as columna}<td class:error-celda={errorEnCelda(fila.filaExcel ?? filaExcel(indice), columna.clave)}>{errorEnCelda(fila.filaExcel ?? filaExcel(indice), columna.clave) ? '✕' : '✓'}</td>{/each}<td>{erroresDeFila(fila.filaExcel ?? filaExcel(indice)) || 'Sin errores locales'}</td><td>{#if filaTieneErrores(indice)}<button class="boton excluir" type="button" onclick={() => excluirFila(indice)}>Excluir</button>{/if}</td></tr>{/if}{/each}</tbody></table></div>{#if mostrarSoloErrores && !filasImportacion.some((_, indice) => filaTieneErrores(indice))}<p>No hay filas con errores de importación.</p>{/if}{:else if validacionesImportacion.length && !validacionesImportacion.some((validacion) => validacion.fila === 0)}<ul>{#each validacionesImportacion as validacion}<li><b>{validacion.fila > 0 ? `Fila ${validacion.fila}` : 'Planilla'}</b><span>{validacion.mensaje}</span></li>{/each}</ul>{:else if archivo && !validacionesImportacion.length}<p>No se encontraron errores estructurales. Al importar también se validará que cada servicio exista en el sistema.</p>{/if}
{#if serviciosFaltantes().length}<section class="servicios-faltantes"><div class="servicios-faltantes-cabecera"><div><strong>Servicios faltantes</strong><span>{serviciosFaltantes().length} servicios no están registrados.</span></div><button class="boton secundario" type="button" disabled={!configuracion || cargandoCatalogos} onclick={descargarPlanillaFaltantes}>Descargar planilla</button></div>{#if cargandoCatalogos}<p>Cargando catálogos…</p>{:else}<label class="archivo-campo">Planilla completada de servicios faltantes<input type="file" accept=".xlsx,.xls" onchange={seleccionarPlanillaServicios} /></label>{#if archivoServiciosFaltantes}<div class="archivo-seleccionado"><strong>{archivoServiciosFaltantes.name}</strong><span>{filasServiciosFaltantes.length} filas leídas</span></div>{/if}{#if erroresServiciosFaltantes.length}<ul>{#each erroresServiciosFaltantes as validacion}<li><b>{validacion.fila > 0 ? `Fila ${validacion.fila}` : 'Planilla'}</b><span>{validacion.mensaje}</span></li>{/each}</ul>{:else if filasServiciosFaltantes.length}<p class="validacion-ok">Todas las columnas están completas y los valores pertenecen a los catálogos activos.</p>{/if}<div class="servicios-faltantes-acciones"><small>La planilla incluye ID, servicio, RUT/CI, tipo de numeración y los valores de catálogo.</small><Boton deshabilitado={creandoServicios || !filasServiciosFaltantes.length || erroresServiciosFaltantes.length > 0} onclick={crearServiciosFaltantes}>{creandoServicios ? 'Creando…' : 'Importar servicios faltantes'}</Boton></div>{/if}</section>{/if}
		</section>
		<div class="importacion-ayuda">Las filas con saldo negativo se conservan como saldo negativo. Las filas ausentes en una reimportación se retiran lógicamente.</div>
		<div class="importacion-acciones"><button class="boton secundario" onclick={() => (mostrarImportacion = false)}>Cancelar</button><Boton deshabilitado={!archivo || !periodo || !cotizacionValida() || validacionesImportacion.length > 0 || importando} onclick={importar}>{importando ? 'Importando…' : 'Validar e importar'}</Boton></div>
	</div>
</ModalPanel>{/if}

{#if mostrarPlanillaEmails}<ModalPanel titulo="Planilla de mails" subtitulo="Descargá la planilla, completá los mails y volvé a subirla. La importación es atómica." etiqueta="MAILS DE COBRANZA" onCerrar={cerrarPlanillaEmails}>
	<div class="planilla-emails">
		{#if errorEmails}<div class="aviso error">{errorEmails}</div>{/if}

		<section class="planilla-paso">
			<div>
				<h3>1. Descargá la planilla</h3>
				<p class="nota">Incluye todos los servicios con su ID y los mails de cobranza actuales. No modifiques la columna ID.</p>
			</div>
			<button type="button" class="boton" onclick={descargarPlanillaMails} disabled={cargandoPlanilla}>
				{@html iconos.descargar} {cargandoPlanilla ? 'Cargando…' : 'Descargar mails-cobranza.xlsx'}
			</button>
		</section>

		<section class="planilla-paso">
			<div>
				<h3>2. Subí la planilla completada</h3>
				<p class="nota">Celda vacía: no cambia ese servicio. Guion (-): da de baja todos sus mails de cobranza.</p>
			</div>
			<label class="archivo-campo">Planilla de mails (.xlsx o .xls)<input type="file" accept=".xlsx,.xls" onchange={seleccionarPlanillaEmails} /></label>
			{#if archivoEmails}<div class="archivo-seleccionado"><strong>{archivoEmails.name}</strong><span>{filasEmails.length} filas leídas</span></div>{/if}
			{#if previsualizandoEmails}<p class="nota">Calculando cambios…</p>{/if}
			{#if erroresEmails.length > 0}
				<ul class="errores-emails">
					{#each erroresEmails as errorFila}
						<li><b>{errorFila.fila > 0 ? `Fila ${errorFila.fila}` : 'Planilla'}</b><span>{errorFila.mensaje}</span></li>
					{/each}
				</ul>
			{/if}
		</section>

		{#if previsualizacionEmails}
			<section class="planilla-paso">
				<div>
					<h3>3. Revisá los cambios</h3>
					{#if previsualizacionEmails.servicios === 0}
						<p class="nota">La planilla no cambia ningún mail.</p>
					{:else}
						<p class="nota">{previsualizacionEmails.agregados} alta(s) · {previsualizacionEmails.reactivados} reactivado(s) · {previsualizacionEmails.compartidos} compartido(s) · {previsualizacionEmails.quitados} baja(s){#if previsualizacionEmails.retenidos > 0} · {previsualizacionEmails.retenidos} queda(n) solo en facturación{/if}</p>
					{/if}
				</div>
				{#if previsualizacionEmails.servicios > 0}
					<div class="planilla-cambios">
						{#each previsualizacionEmails.detalle as cambio (cambio.servicioId)}
							<div class="planilla-cambio">
								<strong>{cambio.servicio}</strong>
								{#if cambio.nuevos.length > 0}<small class="cambio-alta">Altas: {cambio.nuevos.join('; ')}</small>{/if}
								{#if cambio.reactivados.length > 0}<small class="cambio-alta">Reactivados: {cambio.reactivados.join('; ')}</small>{/if}
								{#if cambio.aCompartido.length > 0}<small class="cambio-compartido">Ahora también facturación: {cambio.aCompartido.join('; ')}</small>{/if}
								{#if cambio.quitados.length > 0}<small class="cambio-baja">Bajas: {cambio.quitados.join('; ')}</small>{/if}
								{#if cambio.retenidos.length > 0}<small class="cambio-retenido">Sigue en facturación: {cambio.retenidos.join('; ')}</small>{/if}
								{#if cambio.sinCambios.length > 0}<small>Sin cambios: {cambio.sinCambios.length}</small>{/if}
							</div>
						{/each}
					</div>
				{/if}
			</section>
		{/if}

		{#if resultadoEmails}
			<div class="aviso ok">Importación #{resultadoEmails.importacionId} aplicada: {resultadoEmails.agregados} alta(s), {resultadoEmails.reactivados} reactivado(s), {resultadoEmails.quitados} baja(s){#if resultadoEmails.retenidos > 0}, {resultadoEmails.retenidos} sigue(n) en facturación{/if}.</div>
		{/if}

		{#if historialEmails.length > 0}
			<details class="planilla-historial">
				<summary>Últimas importaciones</summary>
				<ul>
					{#each historialEmails as importacion}
						<li>
							<span>{formatearFechaHora(importacion.creadoEn)}</span>
							<span>{importacion.usuario ?? '—'}</span>
							<span>{importacion.archivo ?? '—'}</span>
							<strong>{importacion.totales?.agregados ?? 0} altas · {importacion.totales?.quitados ?? 0} bajas</strong>
						</li>
					{/each}
				</ul>
			</details>
		{/if}

		<div class="importacion-acciones">
			<button type="button" class="boton secundario" onclick={cerrarPlanillaEmails}>Cerrar</button>
			<button type="button" class="boton" disabled={aplicandoEmails || !previsualizacionEmails || previsualizacionEmails.servicios === 0} onclick={aplicarPlanillaEmails}>{aplicandoEmails ? 'Aplicando…' : 'Aplicar importación'}</button>
		</div>
	</div>
</ModalPanel>{/if}

{#if seleccionados.length > 0}
	<BarraLotes etiqueta={`${seleccionados.length} ${seleccionados.length === 1 ? 'servicio seleccionado' : 'servicios seleccionados'}`}>
		<button type="button" class="lote-accion" onclick={abrirEnvioMasivo}>
			<span class="lote-icono">{@html iconos.correo}</span>
			<span class="lote-etiqueta">Enviar mails</span>
		</button>
		<button type="button" class="lote-accion" onclick={abrirModalGrupo}>
			<span class="lote-icono">{@html iconos.capas}</span>
			<span class="lote-etiqueta">Asignar grupo</span>
		</button>
		<button type="button" class="lote-accion" onclick={() => (seleccionados = [])}>
			<span class="lote-icono">✕</span>
			<span class="lote-etiqueta">Limpiar</span>
		</button>
	</BarraLotes>
{/if}

{#if mostrarMasivo}<ModalPanel titulo="Enviar estados de cuenta" subtitulo={`${seleccionados.length} servicios · el envío sigue en el servidor aunque cierres la pestaña`} etiqueta="ENVÍO MASIVO" onCerrar={() => (mostrarMasivo = false)}>
	<div class="importacion-form">
		{#if error}<div class="aviso error">{error}</div>{/if}
		<div>
			<span class="grupo-rotulo">Plantilla</span>
			{#if plantillas.length === 0}
				<p class="nota">No hay plantillas de cobranza cargadas.</p>
			{:else}
				<div class="masivo-lista" role="radiogroup" aria-label="Plantilla del envío masivo">
					{#each plantillas as plantilla (plantilla.id)}
						<label class="masivo-opcion" class:seleccionado={masivo.plantillaId === plantilla.id}>
							<span class="masivo-icono">{@html iconos.factura}</span>
							<span class="grupo-texto">
								<strong>{plantilla.nombre}</strong>
								<small>{plantillaListaComprobantes(plantilla) ? 'Lista comprobantes' : 'Sin listado'}{#if !plantilla.activo} · inactiva{/if}</small>
							</span>
							<input type="radio" name="plantilla-masivo" checked={masivo.plantillaId === plantilla.id} onchange={() => (masivo.plantillaId = plantilla.id)} />
						</label>
					{/each}
				</div>
			{/if}
		</div>

		<div>
			<span class="grupo-rotulo">Cuenta y remitente</span>
			{#if cuentasCorreo.filter((cuenta) => cuenta.activo).length === 0}
				<p class="nota">No hay cuentas de correo activas. Configuralas en Configuración → Correo.</p>
			{:else}
				<div class="masivo-cuentas" role="radiogroup" aria-label="Cuenta y remitente del envío masivo">
					{#each cuentasCorreo.filter((cuenta) => cuenta.activo) as cuenta (cuenta.id)}
						<div class="masivo-cuenta">
							<div class="masivo-cuenta-cab">
								<strong>{cuenta.nombre}</strong>
								<small>{cuenta.host}</small>
								{#if cuenta.credencialEstado === 'RECHAZADA'}<span class="chip-credencial">Contraseña rechazada</span>{/if}
							</div>
							<label class="masivo-remitente" class:seleccionado={esRemitenteMasivo(cuenta.id, '')}>
								<span class="grupo-texto"><strong>{cuenta.email}</strong><small>Email de la cuenta</small></span>
								<input type="radio" name="remitente-masivo" checked={esRemitenteMasivo(cuenta.id, '')} onchange={() => elegirRemitenteMasivo(cuenta.id, '')} />
							</label>
							{#each cuenta.alias.filter((alias) => alias.activo) as alias (alias.id)}
								<label class="masivo-remitente" class:seleccionado={esRemitenteMasivo(cuenta.id, alias.id)}>
									<span class="grupo-texto"><strong>{alias.email}</strong><small>{alias.nombreVisible ?? 'Alias'}</small></span>
									<input type="radio" name="remitente-masivo" checked={esRemitenteMasivo(cuenta.id, alias.id)} onchange={() => elegirRemitenteMasivo(cuenta.id, alias.id)} />
								</label>
							{/each}
						</div>
					{/each}
				</div>
			{/if}
		</div>

		{#if cuentaMasivoRechazada}
			<div class="aviso error">La cuenta {cuentaMasivoRechazada.email} tiene la credencial rechazada. Actualizá la contraseña en Configuración → Correo o elegí otra cuenta.</div>
		{/if}

		<div class="importacion-ayuda">Los comprobantes con exclusión temporal no suman al mail y vuelven a quedar incluidos cuando sale cada envío.</div>
		<div class="importacion-acciones">
			<button type="button" class="boton secundario" onclick={() => (mostrarMasivo = false)}>Cancelar</button>
			<button type="button" class="boton" disabled={enviandoMasivo || !masivo.plantillaId || !masivo.cuentaId} onclick={confirmarEnvioMasivo}>{enviandoMasivo ? 'Encolando…' : `Enviar ${seleccionados.length} mails`}</button>
		</div>
	</div>
</ModalPanel>{/if}

{#if modalGrupo}<ModalPanel titulo="Asignar grupo de cobranza" subtitulo={`${seleccionados.length} servicios seleccionados`} etiqueta="ACCIÓN MASIVA" onCerrar={() => (modalGrupo = false)}>
	<div class="importacion-form grupo-form">
		<div>
			<span class="grupo-rotulo">Grupo</span>
			{#if cargandoGrupos}
				<p class="nota">Cargando grupos…</p>
			{:else}
				<div class="grupo-lista" role="radiogroup" aria-label="Grupo de cobranza">
					<label class="grupo-opcion" class:seleccionado={grupoAsignar === ''}>
						<span class="grupo-muestra sin-grupo">—</span>
						<span class="grupo-texto"><strong>Sin grupo</strong><small>Quita el grupo actual</small></span>
						<input type="radio" name="grupo-cobranza" value="" bind:group={grupoAsignar} />
					</label>
					{#each gruposCobranza.filter((grupo) => grupo.activo) as grupo (grupo.id)}
						<label class="grupo-opcion" class:seleccionado={grupoAsignar === grupo.id}>
							<span class="grupo-muestra" style={`background:${grupo.colorFondo};color:${grupo.colorTexto}`}>{inicialGrupo(grupo.nombre)}</span>
							<span class="grupo-texto"><strong>{grupo.nombre}</strong><small>{cantidadEnGrupo(grupo.id)} servicio{cantidadEnGrupo(grupo.id) === 1 ? '' : 's'}</small></span>
							<input type="radio" name="grupo-cobranza" value={grupo.id} bind:group={grupoAsignar} />
						</label>
					{/each}
				</div>
				{#if gruposCobranza.filter((grupo) => grupo.activo).length === 0 && !creandoGrupoCobranza}
					<p class="nota">Todavía no hay grupos de cobranza activos.</p>
				{/if}
			{/if}
		</div>

		{#if creandoGrupoCobranza}
			<section class="grupo-crear">
				<div class="grupo-crear-cabecera">
					<strong>Nuevo grupo de cobranza</strong>
					<button type="button" class="grupo-cerrar" aria-label="Cerrar creación de grupo" onclick={() => (creandoGrupoCobranza = false)}>✕</button>
				</div>
				<label>Nombre<input bind:value={nuevoGrupoCobranza.nombre} maxlength="80" placeholder="Ej. Edificios" onkeydown={(evento) => { if (evento.key === 'Enter') crearGrupoDesdeModal(); }} /></label>
				<div class="grupo-colores">
					<label>Fondo<input type="color" bind:value={nuevoGrupoCobranza.colorFondo} aria-label="Color de fondo del grupo" /></label>
					<label>Texto<input type="color" bind:value={nuevoGrupoCobranza.colorTexto} aria-label="Color del texto del grupo" /></label>
					<span class="grupo-previa" style={`background:${nuevoGrupoCobranza.colorFondo};color:${nuevoGrupoCobranza.colorTexto}`}>{nuevoGrupoCobranza.nombre.trim() || 'Vista previa'}</span>
				</div>
				{#if errorGrupoCobranza}<div class="aviso error">{errorGrupoCobranza}</div>{/if}
				<div class="grupo-crear-acciones">
					<button type="button" class="boton secundario" onclick={() => (creandoGrupoCobranza = false)}>Cancelar</button>
					<button type="button" class="boton" disabled={guardandoGrupoCobranza || !nuevoGrupoCobranza.nombre.trim()} onclick={crearGrupoDesdeModal}>{guardandoGrupoCobranza ? 'Creando…' : 'Crear y seleccionar'}</button>
				</div>
			</section>
		{:else}
			<button type="button" class="boton secundario grupo-nuevo" onclick={() => { creandoGrupoCobranza = true; errorGrupoCobranza = ''; }}>+ Nuevo grupo de cobranza</button>
		{/if}

		{#if avisoGrupoCobranza}<div class="aviso ok">{avisoGrupoCobranza}</div>{/if}

		<div class="importacion-acciones">
			<button type="button" class="boton secundario" onclick={() => (modalGrupo = false)}>Cancelar</button>
			<button type="button" class="boton" disabled={asignandoGrupo || cargandoGrupos} onclick={async () => { await asignarGrupo(); modalGrupo = false; }}>{asignandoGrupo ? 'Asignando…' : 'Asignar'}</button>
		</div>
	</div>
</ModalPanel>{/if}

{#if detalleLote}<ModalPanel titulo="Envío masivo" subtitulo={`${detalleLote.enviados + detalleLote.errores}/${detalleLote.total} procesados`} etiqueta={`LOTE ${detalleLote.id}`} onCerrar={() => (detalleLote = null)}>
	<p class="nota">Actualizado {ultimaActualizacion || '—'} · se refresca cada 1,5 s</p>
	{#if detalleLote.items.some((item) => item.errorTipo === 'AUTENTICACION')}
		<div class="aviso error">El lote se cortó porque la cuenta rechazó la autenticación. Actualizá la contraseña en Configuración → Correo y volvé a encolar los envíos.</div>
	{:else if detalleLote.items.some((item) => item.errorTipo === 'LIMITE')}
		<div class="aviso error">El proveedor limitó el envío. Esperá unos minutos antes de reintentar.</div>
	{/if}
	<div class="tabla-scroll"><table class="tabla-detalle">
		<thead><tr><th>Servicio</th><th>Estado</th><th>Detalle</th></tr></thead>
		<tbody>{#each detalleLote.items as item}
			<tr>
				<td class="comprobante">{item.servicio}</td>
				<td><span class="estado-envio" class:error-envio={item.estado === 'ERROR'}>{item.estado}{#if item.reanudado} · reanudado{/if}</span></td>
				<td class="comprobante">{item.error ?? '—'}</td>
			</tr>
		{/each}</tbody>
	</table></div>
</ModalPanel>{/if}

{#if mostrarEliminados}<ModalPanel titulo="Comprobantes eliminados" subtitulo="Dados de baja manualmente en este período. Restaurarlos los devuelve a la cartera." etiqueta={`PERÍODO ${nombrePeriodo(periodo)}`} onCerrar={() => (mostrarEliminados = false)}>
	{#if cargandoEliminados}
		<p class="nota">Cargando comprobantes eliminados…</p>
	{:else if eliminados.length === 0}
		<p class="nota">No hay comprobantes eliminados en este período.</p>
	{:else}
		<div class="tabla-scroll"><table class="tabla-detalle">
			<thead><tr><th>Servicio</th><th>Comprobante</th><th>Emisión</th><th class="numero">Saldo</th><th>Eliminado</th><th>Motivo</th><th>Acción</th></tr></thead>
			<tbody>{#each eliminados as documento}
				<tr>
					<td class="comprobante">{documento.servicio}</td>
					<td class="comprobante">{documento.tipoComprobante} {documento.serie ? `${documento.serie}-` : ''}{documento.numero}</td>
					<td>{formatearFecha(documento.fechaEmision)}</td>
					<td class="numero">{dinero(documento.saldoPendiente, documento.moneda === 'USD' ? 'USD' : 'UYU')}</td>
					<td>{formatearFechaHora(documento.eliminadoEn)}</td>
					<td class="comprobante">{documento.eliminadoMotivo ?? '—'}</td>
					<td><button type="button" class="btn-icono" title="Restaurar comprobante" aria-label={`Restaurar ${documento.numero}`} onclick={() => restaurarEliminado(documento)}>{@html iconos.recargar}</button></td>
				</tr>
			{/each}</tbody>
		</table></div>
	{/if}
</ModalPanel>{/if}

{#if detalle}
	{@const servicioDetalle = detalle}
	{@const totales = totalesServicio(servicioDetalle)}
	{#snippet cabeceraDetalle()}
		<div class="detalle-cabecera">
			<div class="detalle-identidad">
				<span class="detalle-kicker">PERÍODO {nombrePeriodo(cartera?.periodo)}</span>
				<h2 title={servicioDetalle.servicio}>{servicioDetalle.servicio}</h2>
				<div class="chips-totales" title="Solo comprobantes incluidos en el envío (saldos pendientes)">
					<span><small>Total UYU</small><strong>{dinero(totales.pesos)}</strong></span>
					<span><small>Total USD</small><strong>{dinero(totales.dolares, 'USD')}</strong></span>
					<span><small>Equivalente UYU</small><strong>{dinero(totales.equivalentePesos)}</strong></span>
				</div>
			</div>
			<div class="detalle-envio">
				<label class="control-claro">
					<span>Modelo</span>
					<div class="fila-control">
						<select class="select-modelo" value={envioPlantillaId ?? ''} onchange={cambiarPlantilla}>
							<option value="" disabled>Elegí un modelo</option>
							{#each plantillas.filter((plantilla) => plantilla.activo || plantilla.id === envioPlantillaId) as plantilla}
								<option value={plantilla.id}>{plantilla.nombre}</option>
							{/each}
						</select>
						<button
							type="button"
							class="btn-predeterminada"
							class:activa={envioPlantillaId === plantillaPredeterminadaId}
							disabled={guardandoPredeterminada || !envioPlantillaId}
							onclick={guardarPredeterminada}
							title="Dejar este modelo por defecto"
							aria-label="Dejar este modelo por defecto"
						>{@html iconos.tilda}</button>
					</div>
				</label>
				<label class="control-claro">
					<span>Enviar desde</span>
					<div class="fila-control">
						<select class="select-remitente" value={valorRemitente} onchange={cambiarRemitente}>
							{#each cuentasCorreo.filter((cuenta) => cuenta.activo) as cuenta}
								<option value={`cuenta:${cuenta.id}`}>{cuenta.email} ({cuenta.nombre})</option>
								{#each cuenta.alias.filter((alias) => alias.activo) as alias}
									<option value={`alias:${alias.id}:${cuenta.id}`}>{alias.email} ({cuenta.nombre})</option>
								{/each}
							{/each}
						</select>
						<button
							type="button"
							class="btn-enviar"
							disabled={enviando || !envioPlantillaId || !envioCuentaId || destinatarios.length === 0 || totales.cantidad === 0}
							onclick={enviar}
						>{@html iconos.correo} {enviando ? 'Enviando…' : 'Enviar'}</button>
					</div>
				</label>
				<label class="control-claro">
					<span>Seguimiento</span>
					<div class="fila-control">
						<button
							type="button"
							class="btn-seguimiento"
							onclick={abrirNuevoSeguimiento}
							title="Crear un caso de seguimiento con los comprobantes incluidos"
						>{@html iconos.seguimiento} Crear seguimiento</button>
						{#if seguimientosDe(servicioDetalle.servicioId).length > 0}
							<span class="contador-seguimientos" title="Seguimientos activos del servicio">{seguimientosDe(servicioDetalle.servicioId).length} activo{seguimientosDe(servicioDetalle.servicioId).length === 1 ? '' : 's'}</span>
						{/if}
					</div>
				</label>
				<label class="control-claro">
					<span>WhatsApp</span>
					<div class="fila-control">
						<button
							type="button"
							class="btn-enviar btn-whatsapp"
							disabled={enviandoWhatsApp || !servicioDetalle.celular || !whatsappConectado || totales.cantidad === 0}
							onclick={enviarWhatsapp}
							title={!servicioDetalle.celular
								? 'El servicio no tiene celular cargado (Servicios → editar)'
								: !whatsappConectado
									? 'La sesión de WhatsApp no está conectada'
									: 'Envía el estado de cuenta al celular del servicio'}
						>{@html iconos.telefono} {enviandoWhatsApp ? 'Enviando…' : 'Enviar'}</button>
						<small class="wa-numero">
							{servicioDetalle.celular ? formatearTelefonoUy(servicioDetalle.celular) : 'Sin celular'}
						</small>
					</div>
				</label>
			</div>
		</div>
	{/snippet}

	<ModalPanel titulo={detalle.servicio} onCerrar={() => (detalle = null)} cabecera={cabeceraDetalle} amplio>
		{#if avisoEnvio}<div class="aviso ok">{avisoEnvio}</div>{/if}
		{#if errorEnvio}<div class="aviso error">{errorEnvio}</div>{/if}
		{#if cuentasCorreo.length === 0}
			<div class="aviso error">Configurá una cuenta de correo en Configuración → Correo.</div>
		{/if}
		{#if cuentaEnvioRechazada}
			<div class="aviso error">La cuenta {cuentaEnvioRechazada.email} tiene la credencial rechazada. Actualizá la contraseña en Configuración → Correo o elegí otra cuenta.</div>
		{/if}

		<div class="destinatarios-linea">
			<span class="rotulo-mails">
				Destinatarios
				{#if destinatarios.length > 0}<span class="cuenta-destinatarios">{destinatarios.length}</span>{/if}
			</span>
			<div class="chips-mails">
				{#each destinatarios as contacto (contacto.id)}
					<span class="chip-mail" title={contacto.uso === 'COMPARTIDO' ? `${contacto.email} · también recibe facturas` : contacto.email}>
						{contacto.email}
						<button type="button" aria-label={`Quitar ${contacto.email}`} onclick={() => quitarContacto(contacto)}>×</button>
					</span>
				{/each}
				{#if destinatarios.length === 0}
					<span class="sin-mails">Sin mails de cobranza</span>
				{/if}
			</div>
			{#if modoEmails !== 'VACIO'}
				<span
					class="modo-emails"
					class:compartido={modoEmails === 'COMPARTIDO'}
					class:mixto={modoEmails === 'MIXTO'}
					title="Estos mails también reciben facturación"
				>{modoEmails === 'COMPARTIDO' ? 'También facturación' : 'Listado mixto'}</span>
			{/if}
			<button type="button" class="boton secundario btn-registrar-mails" onclick={abrirRegistrarMails}>Registrar mails</button>
		</div>

	{#each [{ moneda: 'UYU', titulo: 'Comprobantes en pesos', etiqueta: 'Pesos ($)' }, { moneda: 'USD', titulo: 'Comprobantes en dólares', etiqueta: 'Dólares (USD)' }] as grupo, indice (grupo.moneda)}
		{@const docs = servicioDetalle.documentos.filter((documento) => (documento.moneda.toUpperCase() === 'USD') === (grupo.moneda === 'USD'))}
		{#if docs.length > 0}
			{@const totalesGrupo = totalesEnvio(docs, aplicarSoloVencidos, cartera?.cotizacionUsd ?? 0)}
			<div class="grupo-estado">
			<div class="titulo-grupo">
				<h3>{grupo.titulo} <small>{docs.length} comprobante{docs.length === 1 ? '' : 's'}</small></h3>
				{#if indice === primerGrupoConDocs}
					<label
						class="check-vencidos en-tabla"
						class:sin-variable={!plantillaPermiteSoloVencidos}
						title={plantillaPermiteSoloVencidos
							? 'Envía solo los comprobantes cuyo plazo de pago ya venció'
							: 'La plantilla elegida no lista los comprobantes: usá {{estado_cuenta_general}}, {{estado_cuenta_pesos}} o {{estado_cuenta_dolares}}'}
					>
						<input type="checkbox" bind:checked={soloVencidos} disabled={!plantillaPermiteSoloVencidos} />
						<span>Enviar solo vencidos</span>
						{#if !plantillaPermiteSoloVencidos}<small>falta el listado</small>{/if}
					</label>
				{/if}
			</div>
			<div class="tabla-scroll"><table class="tabla-detalle tabla-comprobantes">
				<thead><tr><th>Emisión</th><th>Vencimiento</th><th>Plazo</th><th>Tipo / comprobante</th><th class="numero">Importe emitido</th><th class="numero">Saldo</th><th>Aging</th><th>Acciones</th></tr></thead>
				<tbody>{#each docs as documento}
					<tr
						class:excluido={documento.excluidoEnvio}
						class:no-vencida={aplicarSoloVencidos && !documento.vencida}
						title={documento.excluidoEnvio
							? 'Excluido del próximo envío: no suma al total'
							: aplicarSoloVencidos && !documento.vencida
								? `No se envía: el plazo de ${documento.plazoDias} días todavía no venció`
								: undefined}
					>
						<td>{formatearFecha(documento.fechaEmision)}</td>
						<td>{formatearFecha(documento.fechaVencimiento)}</td>
						<td class="plazo" title="Días entre la emisión y el vencimiento">{documento.plazoDias} d</td>
						<td class="comprobante"><span class="tipo-comprobante">{documento.tipoComprobante}</span> {documento.serie ? `${documento.serie}-` : ''}{documento.numero}</td>
						<td class="numero">{dinero(documento.importe, grupo.moneda)}</td>
						<td class="numero">{dinero(documento.saldoPendiente, grupo.moneda)}</td>
						<td class="aging">
							<div class="aging-linea">
								<span class="tramo">{etiquetasTramo[documento.tramo]}</span>
								<small class="mora" class:vencida={documento.vencida}>
									{documento.vencida
										? `Vencida ${documento.diasVencido} d`
										: documento.diasVencido === 0
											? 'Vence hoy'
											: `Faltan ${Math.abs(documento.diasVencido)} d`}
								</small>
							</div>
						</td>
						<td>
							<div class="acciones-comprobante">
								<button type="button" class="btn-icono" class:excluido-icono={documento.excluidoEnvio} aria-pressed={documento.excluidoEnvio} title={documento.excluidoEnvio ? 'Volver a incluir en el próximo envío' : 'Excluir del próximo envío'} aria-label={documento.excluidoEnvio ? 'Incluir en el próximo envío' : 'Excluir del próximo envío'} onclick={() => toggleExclusion(documento)}>{@html iconos.correo}</button>
								<button type="button" class="btn-icono peligro" title="Eliminar comprobante" aria-label="Eliminar comprobante" onclick={() => eliminar(documento.id)}>{@html iconos.papelera}</button>
							</div>
						</td>
					</tr>
				{/each}</tbody>
				<tfoot>
					<tr>
						<td colspan="4">Total {grupo.etiqueta}</td>
						<td class="numero">{dinero(grupo.moneda === 'USD' ? totalesGrupo.importeDolares : totalesGrupo.importePesos, grupo.moneda)}</td>
						<td class="numero">{dinero(grupo.moneda === 'USD' ? totalesGrupo.dolares : totalesGrupo.pesos, grupo.moneda)}</td>
						<td colspan="2"></td>
					</tr>
					<tr class="fila-excluidos">
						<td colspan="4">A enviar {#if aplicarSoloVencidos}(solo vencidos){:else}(sin exclusiones temporales){/if}</td>
						<td class="numero">—</td>
						<td class="numero">{dinero(grupo.moneda === 'USD' ? totalesGrupo.dolares : totalesGrupo.pesos, grupo.moneda)}</td>
						<td colspan="2"></td>
					</tr>
				</tfoot>
			</table></div>
			</div>
		{/if}
	{/each}

	<div class="grupo-estado historial-grupo">
		<h3 class="historial-titulo">Historial de envíos</h3>
		{#if envios.length === 0}
			<p class="nota">Todavía no se envió un estado de cuenta a este servicio.</p>
		{:else}
			<div class="tabla-scroll"><table class="tabla-detalle">
			<thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Plantilla</th><th>Estado</th><th class="numero">Total enviado</th></tr></thead>
			<tbody>{#each envios as envio}
				<tr>
					<td>{formatearFechaHora(envio.enviadoEn ?? envio.creadoEn)}</td>
					<td>{envio.usuario ?? '—'}</td>
					<td>{envio.plantilla ?? '—'}</td>
					<td><span class="estado-envio" class:error-envio={envio.estado === 'ERROR'}>{envio.estado}</span>{#if envio.errorTipo === 'AUTENTICACION'}<span class="chip-credencial">Credencial</span>{/if}{#if envio.error}<small>{envio.error}</small>{/if}</td>
					<td class="numero">{envio.totales ? dinero(envio.totales.equivalentePesos) : '—'}</td>
				</tr>
			{/each}</tbody>
		</table></div>
		{/if}
	</div>

	<div class="nota">Las gestiones especiales no pueden enviar comunicaciones. Los comprobantes excluidos no suman al total del envío y vuelven a incluirse cuando el correo sale.</div>
</ModalPanel>{/if}

{#if modalMails && detalle}
	<ModalPanel
		titulo="Registrar mails"
		subtitulo={`Se agregan a los destinatarios de cobranza de ${detalle.servicio}.`}
		etiqueta="DESTINATARIOS"
		onCerrar={() => (modalMails = false)}
		compacto
	>
		<div class="form-mails">
			<label>
				Mails separados por punto y coma (;)
				<textarea
					bind:value={nuevoContacto}
					rows="3"
					placeholder="luis@empresa.com; marta@empresa.com"
				></textarea>
			</label>
			{#if contactos.some((email) => email.uso === 'COMPARTIDO')}
				<label>
					Destino de los nuevos mails
					<select bind:value={nuevoUso}>
						<option value="COBRANZA">Solo cobranza</option>
						<option value="COMPARTIDO">Factura y cobranza</option>
					</select>
				</label>
			{/if}
			{#if errorMails}<div class="aviso error">{errorMails}</div>{/if}
		</div>
		{#snippet acciones()}
			<button type="button" class="boton secundario" onclick={() => (modalMails = false)}>Cancelar</button>
			<button type="button" class="boton enviar-seg" disabled={guardandoMails} onclick={registrarMails}>{guardandoMails ? 'Registrando…' : 'Registrar'}</button>
		{/snippet}
	</ModalPanel>
{/if}

{#if modalSeguimiento && detalle}
	{@const docs = comprobantesParaSeguimiento()}
	<ModalPanel
		titulo="Enviar a seguimiento"
		subtitulo="El caso conserva las facturas elegidas, su historial y próximas gestiones."
		etiqueta="CENTRO DE SEGUIMIENTO"
		onCerrar={() => (modalSeguimiento = false)}
	>
		<div class="nuevo-seg">
			<div class="seg-resumen">
				<div>
					<strong>{detalle.servicio}</strong>
					<small>{comprobantesParaSeguimiento().length} comprobante(s) incluidos{aplicarSoloVencidos ? ' · solo vencidos' : ''}</small>
				</div>
				<div class="seg-montos">
					<span><small>UYU</small><strong>{dinero(docs.filter((d) => d.moneda !== 'USD').reduce((t, d) => t + Number(d.saldoPendiente), 0))}</strong></span>
					<span><small>USD</small><strong>{dinero(docs.filter((d) => d.moneda === 'USD').reduce((t, d) => t + Number(d.saldoPendiente), 0), 'USD')}</strong></span>
				</div>
			</div>

			{#if seguimientosDe(detalle.servicioId).length > 0}
				<div class="aviso-seg info">
					<strong>Este servicio ya tiene seguimientos activos.</strong>
					<ul>
						{#each seguimientosDe(detalle.servicioId) as seguimiento (seguimiento.id)}
							<li>
								<span>{seguimiento.codigo} · {seguimiento.titulo} · {etiquetaSeguimiento(seguimiento.estado)}</span>
								<a href={`/seguimientos?seg=${seguimiento.id}`}>Abrir</a>
							</li>
						{/each}
					</ul>
					<p>Podés abrir uno existente o crear otro con las facturas seleccionadas.</p>
				</div>
			{/if}

			<div class="seg-form">
				<label class="span-2">Título del seguimiento<input bind:value={segTitulo} maxlength="200" /></label>
				<label>Estado inicial
					<select bind:value={segEstado}>
						<option value="EN_SEGUIMIENTO">En seguimiento</option>
						<option value="ESPERANDO_CLIENTE">Esperando respuesta</option>
						<option value="PAUSADO">Pausado</option>
					</select>
				</label>
				<label>Prioridad
					<select bind:value={segPrioridad}>
						<option value="BAJA">Baja</option>
						<option value="NORMAL">Normal</option>
						<option value="ALTA">Alta</option>
						<option value="URGENTE">Urgente</option>
					</select>
				</label>
				<label>Responsable
					<select bind:value={segResponsable}>
						<option value="">Yo (por defecto)</option>
						{#each catalogosSeguimiento?.usuarios ?? [] as persona (persona.id)}
							<option value={persona.id}>{persona.nombre}{persona.areaNombre ? ` · ${persona.areaNombre}` : ''}</option>
						{/each}
					</select>
				</label>
				<label>Primera próxima gestión
					<input type="datetime-local" bind:value={segProxima} />
				</label>
				<label class="span-2">Motivo u objetivo<textarea bind:value={segMotivo} rows="2"></textarea></label>
				<label class="span-2">Primera nota (opcional)<textarea bind:value={segNota} rows="2"></textarea></label>
			</div>

			{#if errorSeguimiento}<div class="aviso error">{errorSeguimiento}</div>{/if}

			<div class="seg-facturas">
				<span class="rotulo">Comprobantes asociados</span>
				<div class="seg-facturas-lista">
					{#each comprobantesParaSeguimiento() as documento (documento.id)}
						<span class="chip-doc" title={`${documento.tipoComprobante} ${documento.serie}-${documento.numero}`}>
							{documento.tipoComprobante} {documento.serie}-{documento.numero} · {dinero(documento.saldoPendiente, documento.moneda)}
						</span>
					{/each}
				</div>
			</div>
		</div>

		{#snippet acciones()}
			<button type="button" class="boton secundario" onclick={() => (modalSeguimiento = false)}>Cancelar</button>
			<button type="button" class="boton enviar-seg" disabled={guardandoSeguimiento} onclick={guardarSeguimientoDesdeCobranza}>
				{guardandoSeguimiento ? 'Creando…' : 'Crear y abrir seguimiento'}
			</button>
		{/snippet}
	</ModalPanel>
{/if}

{#if mostrarPlantillas}<ModalPanel titulo="Plantillas de cobranza" etiqueta="COMUNICACIONES" onCerrar={() => (mostrarPlantillas = false)}>
	<div class="plantilla-grid">
		<aside class="plantillas-lista">
			<Boton onclick={() => (modelo = { id: undefined, nombre: '', asunto: '', cuerpo: '', cartaHabilitada: false, cartaHtml: '', cartaFondo: null })}>＋ Nueva plantilla</Boton>
			{#each plantillas as plantilla}
				<button class:activa={modelo.id === plantilla.id} class="plantilla-item" onclick={() => seleccionarPlantilla(plantilla)}>{plantilla.nombre}</button>
			{/each}
		</aside>

		<div class="editor">
			{#if error}<div class="aviso error">{error}</div>{/if}
			<label>Nombre<input bind:value={modelo.nombre} /></label>
			<label>Asunto<input bind:this={refAsunto} onfocus={() => (campoActivo = 'asunto')} bind:value={modelo.asunto} /></label>
			<label>Cuerpo del email<textarea bind:this={refCuerpo} onfocus={() => (campoActivo = 'cuerpo')} rows="9" bind:value={modelo.cuerpo}></textarea></label>
			<label class="check"><input type="checkbox" bind:checked={modelo.cartaHabilitada} /> Adjuntar carta PDF</label>
			{#if modelo.cartaHabilitada}
				<label>Contenido HTML de la carta<textarea bind:this={refCarta} onfocus={() => (campoActivo = 'carta')} rows="7" bind:value={modelo.cartaHtml}></textarea></label>
				<label class="archivo-fondo">
					Imagen de fondo (pantalla completa)
					<input
						type="file"
						accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg"
						onchange={cargarFondo}
					/>
					<small>PNG, JPG, WebP o SVG. El SVG se convierte automáticamente para el PDF.</small>
				</label>
				{#if modelo.cartaFondo}
					<div class="fondo-preview">
						<img src={modelo.cartaFondo} alt="Fondo de la carta" />
						<button type="button" class="boton secundario" onclick={() => (modelo.cartaFondo = null)}>Quitar imagen</button>
					</div>
				{/if}
			{/if}
			<Boton onclick={guardarModelo}>Guardar plantilla</Boton>
		</div>

		<aside class="variables-panel">
			<strong>Variables</strong>
			<small>Se insertan donde está el cursor.</small>
			<div class="variables-lista">
				{#each VARIABLES_PLANTILLA as variable}
					<button type="button" class="variable-chip" onclick={() => insertarVariable(variable)}>{`{{${variable}}}`}</button>
				{/each}
			</div>
		</aside>
	</div>
</ModalPanel>{/if}

<style>
	.pantalla { padding: 10px 1.8rem 3rem; color: var(--color-texto); } .cabecera,.tabla-titulo { display:flex; justify-content:space-between; gap:1rem; align-items:center; } .cabecera h1 { margin: 0; } h1,h2,h3,p { margin:0; } h1 { margin:.25rem 0; font-size:1.55rem; } h2 { margin-top:.25rem; font-size:1.05rem; } h3 { margin:1.1rem 0 .6rem; } .kicker { color:var(--gris-500); font-size:.66rem; font-weight:800; letter-spacing:.12em; } small,.nota { color:var(--texto-suave); font-size:.78rem; } .acciones,.filtros { display:flex; gap:.55rem; align-items:center; flex-wrap:wrap; } .boton { border:1px solid var(--borde); border-radius:.7rem; padding:.62rem .8rem; font:inherit; font-size:.75rem; font-weight:750; cursor:pointer; text-decoration:none; } .secundario { background:var(--superficie-alta); color:var(--texto-suave); } .panel,.tabla-panel { margin-top:1rem; padding:1rem; border:1px solid var(--borde); border-radius:1rem; background:var(--superficie-panel); box-shadow:0 12px 30px rgba(49,64,129,.08); } label { display:grid; gap:.3rem; color:var(--texto-suave); font-size:.65rem; font-weight:800; letter-spacing:.04em; text-transform:uppercase; } input,textarea { min-width:9rem; border:1px solid var(--borde); border-radius:.6rem; padding:.58rem .65rem; background:var(--superficie-alta); color:var(--texto); font:inherit; font-size:.78rem; } input:focus,textarea:focus { outline:2px solid var(--indigo-600); outline-offset:1px; } textarea { resize:vertical; } .filtros { background:var(--tabla-gradiente); align-items:flex-end; flex-wrap:nowrap; gap:.35rem; padding-top:14px; padding-bottom:11px; } .filtros :global(.campo) { min-width:6rem; flex:1 1 7rem; max-width:13rem; } .filtros :global(.etiqueta) { color:var(--texto-inverso); font-size:.6rem; font-weight:800; letter-spacing:.07em; text-transform:uppercase; } .filtros :global(.envoltorio.normal .etiqueta), .filtros :global(.campo .etiqueta) { color: var(--texto-inverso); } .filtros :global(.campo input) { width:100%; height:2.5rem; } .filtros :global(.envoltorio.normal) { flex:0 1 auto; min-width:6rem; max-width:10.5rem; } .filtros :global(.envoltorio.normal:first-of-type) { min-width:9.5rem; max-width:12rem; } .aviso { margin-top:.8rem; padding:.7rem .9rem; border-radius:.7rem; font-size:.78rem; } .aviso.ok { border:1px solid var(--exito-borde); background:var(--exito-tenue); color:var(--exito-texto); } .aviso.error { border:1px solid var(--peligro-borde); background:var(--peligro-tenue); color:var(--peligro-texto); } .contador,.bloqueado,.chip,.tramo { display:inline-flex; padding:.3rem .55rem; border-radius:99px; background:var(--primario-tenue); color:var(--primario-texto); font-size:.7rem; font-weight:750; } .bloqueado { background:var(--alerta-tenue); color:var(--alerta-texto); } .tabla-scroll { overflow:auto; margin-top:.8rem; } table { width:100%; min-width:1120px; border-collapse:collapse; font-size:.72rem; } th,td { padding:.55rem .45rem; border-bottom:var(--tabla-linea-grosor,1px) solid var(--tabla-linea-color,var(--borde-suave)); text-align:left; white-space:nowrap; } th { background:var(--tabla-gradiente); color:var(--texto-inverso); font-size:.65rem; text-transform:uppercase; letter-spacing:.04em; } thead .subcab th { background:var(--info-tenue); color:var(--primario-texto); } tbody tr { background:var(--fila-impar-fondo,transparent); color:var(--fila-impar-texto,var(--texto)); } tbody tr:nth-child(even) { background:var(--fila-par-fondo,var(--superficie-suave)); color:var(--fila-par-texto,var(--texto)); } td small { display:block; margin-top:.18rem; } .numero { text-align:right; } .ojo { display:grid; place-items:center; width:2.15rem; height:2.15rem; border:1px solid var(--borde); border-radius:.65rem; background:transparent; color:var(--texto-suave); cursor:pointer; } .ojo:hover { background:var(--primario-tenue); border-color:var(--borde-fuerte); color:var(--primario-texto); } .especiales { background:var(--alerta-tenue); } .especiales th { background:var(--tabla-gradiente-aviso); } .vacio { display:grid; place-items:center; gap:.3rem; min-height:18rem; color:var(--gris-500); } .importacion-form { display:grid; gap:1rem; } .importacion-campos { display:grid; grid-template-columns:1fr 1fr 1.3fr; gap:.75rem; align-items:end; } .corte,.archivo-seleccionado,.importacion-ayuda { display:grid; gap:.2rem; padding:.7rem .8rem; border:1px solid var(--borde); border-radius:.65rem; background:var(--superficie-alta); color:var(--texto-suave); font-size:.75rem; } .corte span { color:var(--texto-suave); font-size:.65rem; font-weight:800; text-transform:uppercase; } .corte strong { color:var(--primario-texto); } .archivo-campo input { width:100%; } .archivo-seleccionado { display:flex; justify-content:space-between; gap:.75rem; } .archivo-seleccionado span { color:var(--texto-suave); } .validaciones { border:1px solid var(--borde); border-radius:.75rem; background:var(--superficie); overflow:hidden; } .validaciones.sin-errores { border-color:var(--exito-borde); background:var(--exito-tenue); } .validaciones-cabecera { display:flex; justify-content:space-between; gap:1rem; padding:.75rem .85rem; border-bottom:1px solid var(--borde-suave); color:var(--texto-suave); font-size:.75rem; } .validaciones-cabecera span { color:var(--texto-suave); } .validaciones ul { display:grid; gap:.45rem; max-height:12rem; margin:0; padding:.75rem .85rem .75rem 2rem; overflow:auto; color:var(--peligro-texto); font-size:.73rem; } .validaciones li { padding-left:.2rem; } .validaciones li b { margin-right:.4rem; } .validaciones p { padding:.8rem .85rem; color:var(--exito-texto); font-size:.73rem; } .importacion-ayuda { border-color:var(--alerta-borde); background:var(--alerta-tenue); color:var(--alerta-texto); } .importacion-origen { display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:.7rem .85rem; border:1px solid var(--borde); border-radius:.65rem; background:var(--superficie-alta); } .importacion-origen strong { display:block; margin-bottom:.15rem; color:var(--primario-texto); font-size:.68rem; font-weight:800; letter-spacing:.04em; text-transform:uppercase; } .importacion-origen p { color:var(--texto-suave); font-size:.73rem; line-height:1.45; } .importacion-origen .boton { display:inline-flex; align-items:center; gap:.4rem; white-space:nowrap; } .importacion-acciones { display:flex; justify-content:flex-end; gap:.6rem; } .plantilla-grid { display:grid; grid-template-columns:170px minmax(0,1fr) 195px; gap:1rem; align-items:start; } .plantilla-grid aside { display:grid; align-content:start; gap:.4rem; } .plantilla-item { border:1px solid var(--borde); border-radius:.6rem; padding:.55rem; background:var(--superficie); text-align:left; cursor:pointer; } .plantilla-item.activa { border-color:var(--primario); background:var(--primario-tenue); color:var(--primario-texto); font-weight:750; } .editor { display:grid; gap:.7rem; } .check { display:flex; align-items:center; flex-direction:row; text-transform:none; } .check input { min-width:auto; } .variables-panel { display:grid; gap:.5rem; padding:.7rem; border-radius:.6rem; background:var(--alerta-tenue); color:var(--alerta-texto); } .variables-panel strong { font-size:.72rem; text-transform:uppercase; letter-spacing:.05em; } .variables-panel small { color:var(--alerta-texto); font-size:.64rem; } .variables-lista { display:grid; gap:.3rem; } .variable-chip { border:1px solid var(--alerta-borde); border-radius:.45rem; padding:.3rem .4rem; background:var(--alerta-tenue); color:var(--alerta-texto); font:inherit; font-size:.66rem; text-align:left; cursor:pointer; } .variable-chip:hover { background:var(--alerta-tenue); border-color:var(--alerta-borde); } @media (max-width:1280px) { .filtros { flex-wrap: wrap; } } @media (max-width:760px) { .pantalla { padding:.9rem; } .cabecera { align-items:stretch; flex-direction:column; } .importacion-campos { grid-template-columns:1fr; } .importacion-origen { flex-direction:column; align-items:flex-start; } .plantilla-grid { grid-template-columns:1fr; } }
	/* Selector y alta de grupos de cobranza */
	.grupo-form { gap: .9rem; }
	.grupo-rotulo { display: block; margin-bottom: .4rem; color: var(--texto-suave); font-size: .65rem; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
	.grupo-lista { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .45rem; max-height: 16rem; overflow: auto; padding: .1rem; }
	.grupo-opcion { display: flex; align-items: center; gap: .6rem; min-width: 0; padding: .5rem .6rem; border: 1px solid var(--borde); border-radius: .65rem; background: var(--superficie-alta); color: var(--texto); font-size: .8rem; font-weight: 600; letter-spacing: 0; text-transform: none; cursor: pointer; }
	.grupo-opcion:hover { background: var(--primario-tenue); }
	.grupo-opcion.seleccionado { border-color: var(--primario); background: var(--primario-tenue); box-shadow: inset 0 0 0 1px var(--primario); }
	.grupo-opcion input[type='radio'] { width: 1rem; height: 1rem; min-width: auto; margin: 0 0 0 auto; padding: 0; border: 0; background: none; accent-color: var(--foco); }
	.grupo-muestra { display: grid; flex: 0 0 auto; place-items: center; width: 2rem; height: 2rem; border-radius: .45rem; background: var(--superficie-suave); color: var(--texto-suave); font-size: .78rem; font-weight: 800; }
	.grupo-muestra.sin-grupo { background: var(--superficie-suave); color: var(--texto-suave); }
	.grupo-texto { display: grid; gap: .05rem; min-width: 0; }
	.grupo-texto strong { overflow: hidden; font-size: .78rem; text-overflow: ellipsis; white-space: nowrap; }
	.grupo-texto small { color: var(--texto-suave); font-size: .64rem; font-weight: 500; }
	.grupo-nuevo { justify-self: start; }
	.grupo-crear { display: grid; gap: .6rem; padding: .8rem .85rem; border: 1px solid var(--primario-borde); border-radius: .7rem; background: var(--superficie-alta); }
	.grupo-crear-cabecera { display: flex; align-items: center; justify-content: space-between; gap: .5rem; }
	.grupo-crear-cabecera strong { color: var(--texto); font-size: .8rem; }
	.grupo-cerrar { border: 0; background: transparent; color: var(--texto-suave); font: inherit; font-size: .9rem; cursor: pointer; }
	.grupo-cerrar:hover { color: var(--peligro-texto); }
	.grupo-colores { display: flex; flex-wrap: wrap; align-items: flex-end; gap: .7rem; }
	.grupo-colores label { width: 4.2rem; }
	.grupo-colores input[type='color'] { width: 100%; height: 2.2rem; min-width: 0; padding: .15rem; cursor: pointer; }
	.grupo-previa { display: inline-flex; align-items: center; min-height: 2.2rem; padding: .35rem .7rem; border-radius: .55rem; font-size: .72rem; font-weight: 800; }
	.grupo-crear-acciones { display: flex; justify-content: flex-end; gap: .5rem; }
	@media (max-width: 48rem) { .grupo-lista { grid-template-columns: 1fr; } }
	/* Envío masivo: plantillas y remitentes como tarjetas */
	.masivo-lista { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .45rem; max-height: 12rem; overflow: auto; padding: .1rem; }
	.masivo-opcion { display: flex; align-items: center; gap: .6rem; min-width: 0; padding: .5rem .6rem; border: 1px solid var(--borde); border-radius: .65rem; background: var(--superficie-alta); color: var(--texto); font-size: .8rem; font-weight: 600; letter-spacing: 0; text-transform: none; cursor: pointer; }
	.masivo-opcion:hover { background: var(--primario-tenue); }
	.masivo-opcion.seleccionado { border-color: var(--primario); background: var(--primario-tenue); box-shadow: inset 0 0 0 1px var(--primario); }
	.masivo-opcion input[type='radio'] { width: 1rem; height: 1rem; min-width: auto; margin: 0 0 0 auto; padding: 0; border: 0; background: none; accent-color: var(--foco); }
	.masivo-icono { display: grid; flex: 0 0 auto; place-items: center; width: 2rem; height: 2rem; border-radius: .45rem; background: var(--primario-tenue); color: var(--primario-texto); font-size: 1rem; }
	.masivo-cuentas { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: .55rem; max-height: 16rem; overflow: auto; padding: .1rem; }
	.masivo-cuenta { display: grid; align-content: start; gap: .3rem; padding: .55rem; border: 1px solid var(--borde); border-radius: .7rem; background: var(--superficie-alta); }
	.masivo-cuenta-cab { display: grid; gap: .05rem; margin-bottom: .1rem; padding: 0 .1rem .3rem; border-bottom: 1px solid var(--borde-suave); }
	.masivo-cuenta-cab strong { color: var(--texto); font-size: .74rem; }
	.masivo-cuenta-cab small { color: var(--texto-suave); font-size: .62rem; font-weight: 500; }
	.masivo-remitente { display: flex; align-items: center; gap: .5rem; padding: .35rem .45rem; border: 1px solid transparent; border-radius: .5rem; background: var(--superficie); font-size: .74rem; font-weight: 500; letter-spacing: 0; text-transform: none; cursor: pointer; }
	.masivo-remitente:hover { background: var(--primario-tenue); }
	.masivo-remitente.seleccionado { border-color: var(--primario); background: var(--primario-tenue); box-shadow: inset 0 0 0 1px var(--primario); }
	.masivo-remitente input[type='radio'] { width: 1rem; height: 1rem; min-width: auto; margin: 0 0 0 auto; padding: 0; border: 0; background: none; accent-color: var(--foco); }
	@media (max-width: 48rem) { .masivo-lista, .masivo-cuentas { grid-template-columns: 1fr; } }
	/* Planilla de mails de cobranza */
	.planilla-emails { display: grid; gap: .85rem; }
	.planilla-paso { display: grid; gap: .55rem; padding: .85rem .95rem; border: 1px solid var(--borde); border-radius: .8rem; background: var(--superficie-alta); }
	.planilla-paso h3 { margin: 0; font-size: .9rem; color: var(--texto); }
	.planilla-paso .boton { justify-self: start; display: inline-flex; align-items: center; gap: .35rem; }
	.planilla-cambios { display: grid; gap: .5rem; max-height: 18rem; overflow: auto; padding-right: .2rem; }
	.planilla-cambio { display: grid; gap: .15rem; padding: .5rem .6rem; border: 1px solid var(--borde-suave); border-radius: .55rem; background: var(--superficie); }
	.planilla-cambio strong { font-size: .74rem; }
	.planilla-cambio small { font-size: .7rem; color: var(--texto-suave); overflow-wrap: anywhere; }
	.planilla-cambio .cambio-alta { color: var(--exito-texto); }
	.planilla-cambio .cambio-compartido { color: var(--primario-texto); }
	.planilla-cambio .cambio-baja { color: var(--peligro-texto); }
	.planilla-cambio .cambio-retenido { color: var(--alerta-texto); }
	.errores-emails { display: grid; gap: .3rem; max-height: 12rem; overflow: auto; margin: 0; padding: .6rem .8rem .6rem 1.6rem; border: 1px solid var(--peligro-borde); border-radius: .55rem; background: var(--peligro-tenue); color: var(--peligro-texto); font-size: .72rem; }
	.errores-emails li { display: grid; gap: .05rem; }
	.errores-emails span { color: var(--peligro-texto); }
	.planilla-historial { border-top: 1px solid var(--borde-suave); padding-top: .5rem; }
	.planilla-historial summary { cursor: pointer; color: var(--texto-suave); font-size: .72rem; font-weight: 800; }
	.planilla-historial ul { display: grid; gap: .3rem; margin: .5rem 0 0; padding: 0; list-style: none; max-height: 10rem; overflow: auto; }
	.planilla-historial li { display: grid; grid-template-columns: 9rem 1fr 1fr auto; gap: .5rem; align-items: center; padding: .3rem .4rem; border-radius: .4rem; background: var(--superficie-alta); color: var(--texto-suave); font-size: .68rem; }
	.planilla-historial li strong { color: var(--texto-suave); font-size: .68rem; }
	/* La cartera entra completa: 12 columnas, sin scroll horizontal por defecto. */
	.tabla-cartera { min-width: 0; --alto-cabecera: 2.1rem; --alto-banner: 3.75rem; }
	/* El contenedor no debe crear su propio scroll: el encabezado se pega al
	   viewport, debajo del banner fijo. */
	.tabla-scroll-cartera { overflow: visible; }
	.tabla-cartera thead tr:first-child th {
		position: sticky;
		top: var(--alto-banner);
		z-index: 3;
		height: var(--alto-cabecera);
		/* Sin border-box, el height no incluye el padding y la subcabecera
		   se solaparía con la primera fila. */
		box-sizing: border-box;
	}
	.tabla-cartera thead .subcab th {
		position: sticky;
		top: calc(var(--alto-banner) + var(--alto-cabecera));
		z-index: 2;
		text-align: center;
	}
	/* Columna de selección ajustada al contenido del checkbox. */
	.tabla-cartera .seleccion { width: 1%; padding: .25rem .15rem; text-align: center; white-space: nowrap; }
	.tabla-cartera input[type='checkbox'] {
		appearance: none;
		-webkit-appearance: none;
		position: relative;
		display: inline-block;
		box-sizing: border-box;
		width: 1.425rem;
		height: 1.425rem;
		min-width: 1.425rem;
		aspect-ratio: 1;
		flex: none;
		margin: 0;
		padding: 0;
		border: 1.5px solid var(--borde-fuerte);
		border-radius: .4rem;
		background: var(--superficie);
		cursor: pointer;
		vertical-align: middle;
		transition: background .15s, border-color .15s;
	}
	.tabla-cartera input[type='checkbox']:checked { background: var(--primario); border-color: var(--primario); }
	.tabla-cartera input[type='checkbox']:checked::after {
		content: '';
		position: absolute;
		left: 50%;
		top: 50%;
		width: .32rem;
		height: .62rem;
		border: solid #fff;
		border-width: 0 2px 2px 0;
		transform: translate(-50%, -60%) rotate(45deg);
	}
	.tabla-cartera input[type='checkbox']:focus-visible { outline: 2px solid var(--foco); outline-offset: 2px; }
	.tabla-cartera input[type='checkbox']:disabled { opacity: .4; cursor: not-allowed; }
	.grupo-check input:disabled { opacity: .45; cursor: not-allowed; }
	.btn-limpiar { height: 2.5rem; padding: 0 .9rem; border: 1px solid rgba(255, 255, 255, .65); border-radius: 999px; background: rgba(255, 255, 255, .14); color: var(--texto-inverso); font: inherit; font-size: .7rem; font-weight: 800; white-space: nowrap; cursor: pointer; }
	.btn-limpiar:hover:not(:disabled) { background: rgba(255, 255, 255, .26); }
	.btn-limpiar:disabled { opacity: .45; cursor: default; }
	.estado-copia { margin-left: auto; align-self: flex-end; margin-bottom: .55rem; color: #dbeafe; font-size: .68rem; font-weight: 700; text-decoration: none; border-bottom: 1px dashed rgba(255, 255, 255, .55); padding-bottom: .1rem; white-space: nowrap; }
	.ayuda-tramo { display: none; }
	.estado-copia:hover { color: var(--texto-inverso); border-bottom-color: #fff; }
	.estado-copia.falta { color: #fde68a; border-bottom-color: #fde68a; }
	.estado-copia.activa { color: #bbf7d0; border-bottom-color: #bbf7d0; }
	.tabla-cartera td.servicio { white-space: normal; min-width: 12rem; }
	.fila-servicio { cursor: pointer; }
	/* Velo translúcido: conserva el color alternado de la fila y la aclara. */
	.fila-servicio:hover { background-image: linear-gradient(var(--fila-hover-fondo, var(--primario-tenue)), var(--fila-hover-fondo, var(--primario-tenue))); }
	.fila-servicio:focus-visible { outline: 2px solid var(--foco); outline-offset: -2px; }
	.alerta-cab { width: 1.45rem; text-align: center; color: var(--texto-suave); font-weight: 900; cursor: help; }
	.alerta { width: 1.45rem; text-align: center; }
	.alerta-mora { display: inline-grid; place-items: center; width: 1.25rem; height: 1.25rem; vertical-align: middle; }
	.alerta-mora img { display: block; width: 100%; height: 100%; }
	.sobre-celda { width: 2.2rem; text-align: center; }
	.sobre-celda .sobre { display: inline-grid; place-items: center; font-size: 1rem; color: var(--texto-tenue); }
	.sobre-celda .sobre.con-envios { color: var(--primario-texto); }
	/* Sin destinatarios: sobre rojo tachado. */
	.sobre-celda .sobre.sin-destinatarios { position: relative; color: var(--peligro-texto); }
	.sobre-celda .sobre.sin-destinatarios::after {
		content: '';
		position: absolute;
		left: 8%;
		right: 8%;
		top: 50%;
		border-top: 2px solid var(--peligro);
		transform: rotate(-45deg);
	}
	.envios-numero { width: 1.8rem; text-align: center; }
	.envios-numero b { font-size: .7rem; }
	.equival small { display: block; color: var(--alerta-texto); font-size: .58rem; font-weight: 600; white-space: normal; }
	.tabla-detalle tfoot td { background: var(--primario-tenue); font-weight: 800; border-top: 2px solid var(--primario-borde); }
	h3 small { color: var(--texto-suave); font-size: .66rem; font-weight: 600; margin-left: .35rem; }
	.validaciones-scroll { max-height: 22rem; overflow: auto; }
	.excluir { padding: .35rem .55rem; border-color: var(--peligro-borde); background: var(--peligro-tenue); color: var(--peligro-texto); font-size: .68rem; }
	.filtro-validaciones { padding: .65rem .85rem; border-bottom: 1px solid var(--borde-suave); background: var(--superficie-alta); }
	.filtro-validaciones .check { display: flex; align-items: center; gap: .45rem; color: var(--texto-suave); font-size: .72rem; text-transform: none; letter-spacing: 0; }
	.filtro-validaciones .check input { min-width: auto; }
	.filtro-validaciones .check span { color: var(--texto-suave); font-weight: 400; }
	.servicios-faltantes { margin-top: 1rem; border: 1px solid var(--alerta-borde); border-radius: .75rem; background: var(--alerta-tenue); overflow: hidden; }
	.servicios-faltantes-cabecera { display: flex; justify-content: space-between; gap: 1rem; padding: .75rem .85rem; border-bottom: 1px solid var(--alerta-borde); color: var(--alerta-texto); font-size: .75rem; }
	.servicios-faltantes-cabecera div { display: grid; gap: .2rem; }
	.servicios-faltantes-cabecera span { color: var(--alerta-texto); font-size: .7rem; }
	.servicios-faltantes-acciones { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .7rem .85rem; border-top: 1px solid var(--alerta-borde); }
	.servicios-faltantes-acciones small { color: var(--alerta-texto); }
	.tabla-validaciones { min-width: 760px; margin: 0; font-size: 0.7rem; }
	.tabla-validaciones th { position: sticky; top: 0; z-index: 1; background: var(--tabla-gradiente); }
	.tabla-validaciones th,
	.tabla-validaciones td { padding: 0.42rem 0.5rem; }
	.tabla-validaciones td:not(:last-child) { text-align: center; }
	.tabla-validaciones td.error-celda { background: var(--peligro-tenue); color: var(--peligro-texto); font-weight: 800; }
	.tabla-validaciones td:not(.error-celda) { color: var(--exito-texto); }

	.validaciones-scroll { max-height: 22rem; overflow: auto; }
	.tabla-validaciones { min-width: 760px; margin: 0; font-size: 0.7rem; }
	.tabla-validaciones th { position: sticky; top: 0; z-index: 1; background: var(--tabla-gradiente); }
	.tabla-validaciones th,
	.tabla-validaciones td { padding: 0.42rem 0.5rem; }
	.tabla-validaciones td:not(:last-child) { text-align: center; }
	.tabla-validaciones td.error-celda { background: var(--peligro-tenue); color: var(--peligro-texto); font-weight: 800; }
	.tabla-detalle { min-width: 0; width: 100%; font-size: .68rem; }
	.tabla-detalle th, .tabla-detalle td { padding: .4rem .3rem; }
	.tabla-comprobantes { font-size: .64rem; }
	.tabla-comprobantes th, .tabla-comprobantes td { padding: 5px .22rem; }
	.tabla-comprobantes th { white-space: normal; font-size: .6rem; }
	.tabla-comprobantes td { white-space: nowrap; }
	.tabla-detalle td.comprobante { white-space: normal; }
	.tabla-comprobantes .btn-icono { width: 1.55rem; height: 1.55rem; font-size: .8rem; }
	.acciones-comprobante { display: flex; gap: .25rem; justify-content: flex-end; }
	.btn-icono { position: relative; display: grid; place-items: center; width: 1.9rem; height: 1.9rem; border: 1px solid var(--borde); border-radius: .5rem; background: var(--superficie); color: var(--texto-suave); cursor: pointer; font-size: .95rem; }
	.btn-icono:hover { background: var(--primario-tenue); color: var(--primario-texto); }
	.btn-icono.peligro { border-color: var(--peligro-borde); color: var(--peligro-texto); }
	.btn-icono.excluido-icono { border-color: var(--peligro-borde); background: var(--peligro-tenue); color: var(--peligro-texto); }
	.btn-icono.excluido-icono::after { content: ''; position: absolute; left: 18%; right: 18%; top: 50%; border-top: 2px solid currentColor; transform: rotate(-45deg); }
	tr.excluido td,
	tr.no-vencida td { opacity: .5; text-decoration: line-through; }
	.plazo { white-space: nowrap; color: var(--texto-suave); font-weight: 700; }
	.aging { white-space: nowrap; }
	.aging-linea { display: flex; align-items: center; gap: .25rem; }
	.mora { color: var(--exito-texto); font-size: .58rem; font-weight: 700; white-space: nowrap; }
	.mora.vencida { color: var(--alerta-texto); }
	.detalle-cabecera { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 1rem; align-items: center; padding: .65rem 3rem .65rem 1.3rem; background: var(--detalle-gradiente); color: var(--texto-inverso); }
	.detalle-identidad { display: grid; gap: .12rem; min-width: 0; }
	.detalle-kicker { color: #c7d2fe; font-size: .56rem; font-weight: 800; letter-spacing: .12em; }
	.detalle-identidad h2 { margin: 0; font-size: 1.15rem; line-height: 1.1; color: var(--texto-inverso); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.chips-totales { display: flex; flex-wrap: nowrap; gap: .35rem; margin-top: .1rem; overflow: hidden; }
	.chips-totales span { display: grid; gap: .02rem; padding: .22rem .45rem; border: 1px solid rgba(255, 255, 255, .22); border-radius: .45rem; background: rgba(255, 255, 255, .09); }
	.chips-totales small { color: #c7d2fe; font-size: .5rem; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; }
	.chips-totales strong { font-size: .72rem; color: var(--texto-inverso); }
	.check-vencidos { display: inline-flex; align-items: center; gap: .35rem; color: #e0e7ff; font-size: .72rem; font-weight: 700; cursor: pointer; }
	.check-vencidos input { flex: 0 0 auto; width: .95rem; min-width: 0; height: .95rem; accent-color: #34d399; }
	.check-vencidos small { color: var(--alerta-texto); font-size: .6rem; font-weight: 700; }
	.check-vencidos.sin-variable { opacity: .65; cursor: not-allowed; }
	.check-vencidos.en-tabla { margin: 0; color: var(--texto-suave); font-size: .7rem; }
	.check-vencidos.en-tabla small { color: var(--alerta-texto); }
	.detalle-envio { display: flex; flex-wrap: nowrap; gap: .55rem; align-items: flex-end; }
	.control-claro { display: grid; gap: .2rem; }
	.control-claro > span { color: #c7d2fe; font-size: .55rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
	.fila-control { display: flex; gap: .35rem; align-items: center; }
	.fila-control select { width: 9.5rem; min-width: 0; border: 0; border-radius: .5rem; padding: .45rem .5rem; background: var(--superficie); color: var(--texto); font: inherit; font-size: .7rem; }
	.fila-control select.select-modelo { width: 9rem; }
	.fila-control select.select-remitente { width: 11.5rem; }
	.btn-predeterminada { display: grid; place-items: center; width: 1.9rem; height: 1.9rem; border: 1px solid rgba(255, 255, 255, .4); border-radius: .5rem; background: rgba(255, 255, 255, .12); color: #a7f3d0; cursor: pointer; }
	.btn-predeterminada.activa { border-color: #34d399; background: #34d399; color: #064e3b; }
	.btn-predeterminada:disabled { opacity: .5; cursor: not-allowed; }
	.btn-enviar { display: inline-flex; align-items: center; gap: .35rem; border: 0; border-radius: .5rem; padding: .5rem .7rem; background: var(--superficie); color: var(--primario-texto); font: inherit; font-size: .72rem; font-weight: 800; white-space: nowrap; cursor: pointer; }
	.btn-whatsapp { background: #25d366; color: #062b16; }
	.wa-numero { color: var(--texto-suave); font-size: .62rem; white-space: nowrap; }
	.btn-enviar:disabled { opacity: .55; cursor: not-allowed; }
	.titulo-grupo { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin: 1.1rem 0 .6rem; }
	.titulo-grupo h3 { margin: 0; }
	@media (max-width: 48rem) {
		.detalle-cabecera { grid-template-columns: 1fr; align-items: start; }
		.detalle-envio { flex-wrap: wrap; }
	}
	.estado-envio { display: inline-flex; padding: .15rem .45rem; border-radius: 999px; background: var(--exito-tenue); color: var(--exito-texto); font-size: .62rem; font-weight: 800; }
	.chip-credencial { display: inline-flex; margin-left: .35rem; padding: .15rem .45rem; border-radius: 999px; background: var(--peligro-tenue); color: var(--peligro-texto); font-size: .58rem; font-weight: 800; letter-spacing: .03em; text-transform: uppercase; }
	.estado-envio.error-envio { background: var(--peligro-tenue); color: var(--peligro-texto); }
	.destinatarios-linea {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
		margin: 0 0 10px;
		padding: 9px 12px;
		border: 1px solid var(--borde-fuerte);
		border-radius: 12px;
		background: var(--superficie-alta);
	}
	.rotulo-mails {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		flex: 0 0 auto;
		color: var(--texto-tenue);
		font-size: .55rem;
		font-weight: 800;
		letter-spacing: .08em;
		text-transform: uppercase;
	}
	.chips-mails {
		display: flex;
		align-items: center;
		gap: 6px;
		flex: 1 1 auto;
		min-width: 0;
		overflow-x: auto;
		padding-bottom: 2px;
	}
	.chip-mail {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 3px 7px;
		border: 1px solid var(--borde);
		border-radius: 999px;
		background: var(--superficie);
		color: var(--texto-suave);
		font-size: .68rem;
		white-space: nowrap;
	}
	.chip-mail button {
		display: grid;
		place-items: center;
		width: 16px;
		height: 16px;
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: var(--texto-tenue);
		font: inherit;
		font-size: .75rem;
		line-height: 1;
		cursor: pointer;
	}
	.chip-mail button:hover { background: var(--peligro-tenue); color: var(--peligro-texto); }
	.sin-mails { color: var(--texto-tenue); font-size: .7rem; }
	.btn-registrar-mails { flex: 0 0 auto; }
	.form-mails { display: grid; gap: .75rem; }
	.form-mails label { display: grid; gap: .3rem; }
	.modo-emails { display: inline-flex; padding: .12rem .5rem; border-radius: 999px; font-size: .6rem; font-weight: 800; }
	.modo-emails.compartido { background: var(--primario-tenue); color: var(--primario-texto); }
	.modo-emails.mixto { background: var(--alerta-tenue); color: var(--alerta-texto); }
	.form-mails select { border: 1px solid var(--borde); border-radius: .6rem; padding: .5rem .65rem; background: var(--superficie); color: var(--texto); font: inherit; font-size: .78rem; }
	.periodo-nombre { color: var(--alerta-texto); font-size: .62rem; font-weight: 700; text-transform: none; letter-spacing: 0; }
	.archivo-fondo input { width: 100%; }
	.fondo-preview { display: flex; align-items: center; gap: .6rem; padding: .5rem; border: 1px solid var(--borde-suave); border-radius: .55rem; background: var(--superficie); }
	.fondo-preview img { max-height: 96px; max-width: 60%; border-radius: .4rem; border: 1px solid var(--borde-suave); object-fit: cover; }
	.cuenta-destinatarios { display: inline-flex; margin-left: .35rem; padding: .1rem .45rem; border-radius: 999px; background: var(--primario-tenue); color: var(--primario-texto); font-size: .62rem; font-weight: 800; }
	.fila-grupo td { padding: 0; border-bottom: 0; }
	.grupo-cabecera { display: flex; align-items: center; gap: .6rem; padding: .45rem .6rem; font-size: .72rem; }
	.grupo-toggle { border: 1px solid rgba(255, 255, 255, .45); border-radius: .4rem; background: transparent; color: inherit; width: 1.5rem; height: 1.5rem; cursor: pointer; line-height: 1; }
	.grupo-toggle:hover { background: rgba(255, 255, 255, .16); }
	.grupo-cabecera strong { font-size: .78rem; }
	.grupo-cantidad { font-size: .66rem; opacity: .9; }
	.grupo-totales { margin-left: auto; font-weight: 700; font-size: .7rem; white-space: nowrap; }
	.grupo-check { display: inline-flex; align-items: center; }
	.grupo-check input { width: 1.15rem; height: 1.15rem; min-width: 1.15rem; accent-color: #fff; }
	.widget-envios { display: inline-flex; flex-direction: column; gap: .34rem; width: 15rem; padding: .45rem .75rem .55rem; border: 1px solid var(--primario-borde); border-radius: .7rem; background: var(--primario-tenue); color: var(--primario-texto); font: inherit; font-size: .72rem; font-weight: 750; text-align: left; cursor: pointer; }
	.widget-envios:hover { background: var(--primario-tenue); }
	.widget-envios:focus-visible { outline: 2px solid var(--foco); outline-offset: 2px; }
	.widget-linea { display: flex; align-items: center; gap: .38rem; width: 100%; min-width: 0; }
	.widget-envios b { font-size: .76rem; font-variant-numeric: tabular-nums; }
	.widget-envios small { color: var(--primario-texto); font-size: .62rem; text-transform: uppercase; letter-spacing: .04em; }
	.widget-porcentaje { margin-left: auto; padding-left: .25rem; color: var(--primario-texto); font-size: .66rem; font-weight: 800; font-variant-numeric: tabular-nums; }
	.widget-sobre { display: inline-grid; place-items: center; font-size: .95rem; }
	.widget-barra { display: flex; width: 100%; height: .38rem; overflow: hidden; border-radius: 999px; background: var(--primario-borde); }
	.widget-barra-enviados,
	.widget-barra-errores { height: 100%; transition: width .35s ease; }
	.widget-barra-enviados { background: var(--primario); }
	.widget-barra-errores { background: #dc2626; }
	.widget-envios.completado .widget-barra-enviados { background: var(--exito); }
	.widget-envios.con-errores .widget-porcentaje { color: var(--peligro-texto); }
	.widget-envios:not(.completado) .widget-barra-enviados {
		background-image: linear-gradient(90deg, transparent, rgba(255, 255, 255, .55), transparent);
		background-size: 200% 100%;
		animation: brillo-envio 1.5s linear infinite;
	}
	@keyframes brillo-envio { from { background-position: 200% 0; } to { background-position: -100% 0; } }
	@media (prefers-reduced-motion: reduce) { .widget-envios:not(.completado) .widget-barra-enviados { animation: none; } }

	/* Seguimiento de cobranza: indicador en la cartera y alta desde el detalle */
	.fila-seguimiento { display: flex; align-items: center; gap: .25rem; margin-top: .22rem; }
	.chip-seguimiento {
		display: inline-flex;
		align-items: center;
		gap: .25rem;
		padding: .1rem .42rem;
		border: 1px solid var(--primario-borde);
		border-radius: 999px;
		background: var(--primario-tenue);
		color: var(--primario-texto);
		font: inherit;
		font-size: .57rem;
		font-weight: 800;
		cursor: pointer;
	}
	.chip-seguimiento:hover { border-color: var(--primario-borde); background: var(--primario-tenue); }
	.punto-seg { width: .34rem; height: .34rem; border-radius: 50%; background: var(--primario); }
	.chip-seguimiento.promesa_pago { border-color: var(--exito-borde); background: var(--exito-tenue); color: var(--exito-texto); }
	.chip-seguimiento.promesa_pago .punto-seg { background: var(--exito); }
	.chip-seguimiento.esperando_cliente { border-color: var(--alerta-borde); background: var(--alerta-tenue); color: var(--alerta-texto); }
	.chip-seguimiento.esperando_cliente .punto-seg { background: #d97706; }
	.chip-seguimiento.bloqueado_ticket { border-color: var(--peligro-borde); background: var(--peligro-tenue); color: var(--peligro-texto); }
	.chip-seguimiento.bloqueado_ticket .punto-seg { background: #dc2626; }
	.chip-seguimiento.pausado { border-color: var(--borde-suave); background: var(--superficie-suave); color: var(--texto-suave); }
	.chip-seguimiento.pausado .punto-seg { background: #94a3b8; }
	.seg-alerta {
		display: inline-grid;
		place-items: center;
		width: .8rem;
		height: .8rem;
		border-radius: 50%;
		background: #dc2626;
		color: var(--texto-inverso);
		font-size: .5rem;
		font-weight: 900;
	}
	.seg-ticket {
		padding: 0 .22rem;
		border-radius: .25rem;
		background: #075985;
		color: var(--texto-inverso);
		font-size: .46rem;
		letter-spacing: .03em;
	}
	.chip-seguimiento-mas { color: var(--texto-suave); font-size: .55rem; font-weight: 800; }
	.btn-seguimiento {
		display: inline-flex;
		align-items: center;
		gap: .35rem;
		min-height: 2.05rem;
		padding: .4rem .6rem;
		border: 1px solid var(--primario-borde);
		border-radius: .6rem;
		background: var(--primario-tenue);
		color: var(--primario-texto);
		font: inherit;
		font-size: .68rem;
		font-weight: 800;
		cursor: pointer;
		white-space: nowrap;
	}
	.btn-seguimiento:hover { background: var(--primario-tenue); border-color: var(--primario-borde); }
	.contador-seguimientos { color: var(--texto-suave); font-size: .58rem; font-weight: 750; white-space: nowrap; text-transform: none; letter-spacing: 0; }

	.nuevo-seg { display: grid; gap: .75rem; }
	.seg-resumen {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: .75rem;
		padding: .65rem .75rem;
		border: 1px solid var(--primario-borde);
		border-radius: .65rem;
		background: var(--superficie-alta);
	}
	.seg-resumen strong { display: block; color: var(--texto); font-size: .82rem; }
	.seg-resumen small { color: var(--texto-suave); font-size: .64rem; }
	.seg-montos { display: flex; gap: .8rem; }
	.seg-montos span { display: grid; line-height: 1.15; text-align: right; }
	.seg-montos small { color: var(--texto-tenue); font-size: .52rem; font-weight: 850; letter-spacing: .05em; }
	.seg-montos strong { color: var(--texto); font-size: .78rem; }
	.aviso-seg.info { padding: .55rem .65rem; border: 1px solid var(--alerta-borde); border-radius: .6rem; background: var(--alerta-tenue); color: var(--alerta-texto); font-size: .68rem; }
	.aviso-seg.info strong { display: block; margin-bottom: .2rem; }
	.aviso-seg.info ul { display: grid; gap: .2rem; margin: 0 0 .3rem; padding: 0; list-style: none; }
	.aviso-seg.info li { display: flex; align-items: center; justify-content: space-between; gap: .5rem; }
	.aviso-seg.info a { color: var(--alerta-texto); font-weight: 800; text-decoration: underline; }
	.aviso-seg.info p { color: var(--alerta-texto); font-size: .62rem; }
	.seg-form { display: grid; grid-template-columns: 1fr 1fr; gap: .6rem; }
	.seg-form .span-2 { grid-column: span 2; }
	.seg-form label { display: grid; gap: 1px; color: var(--texto-suave); font-size: .6rem; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; }
	.seg-form input,
	.seg-form select,
	.seg-form textarea {
		width: 100%;
		padding: .5rem .65rem;
		border: 1px solid var(--borde);
		border-radius: .7rem;
		background: var(--superficie);
		color: var(--texto);
		font: inherit;
		font-size: .72rem;
		font-weight: 500;
		letter-spacing: 0;
		text-transform: none;
	}
	.seg-form select { min-height: 2.5rem; appearance: none; padding-right: 2rem; background-image: var(--chevron-select); background-repeat: no-repeat; background-position: right .7rem center; background-size: .65rem; }
	.seg-form input:focus, .seg-form select:focus, .seg-form textarea:focus { outline: 2px solid var(--foco); outline-offset: 1px; background: var(--superficie); }
	.seg-facturas { display: grid; gap: .3rem; }
	.seg-facturas .rotulo { color: var(--texto-tenue); font-size: .55rem; font-weight: 850; letter-spacing: .05em; text-transform: uppercase; }
	.seg-facturas-lista { display: flex; flex-wrap: wrap; gap: .3rem; max-height: 6.5rem; overflow: auto; }
	.chip-doc { padding: .16rem .45rem; border: 1px solid var(--borde-suave); border-radius: 999px; background: var(--superficie-alta); color: var(--texto-suave); font-size: .58rem; font-weight: 700; white-space: nowrap; }
	.enviar-seg { border-color: transparent; background: var(--accion-gradiente); color: var(--texto-inverso); }
	.enviar-seg:hover:not(:disabled) { background: var(--accion-gradiente); color: var(--texto-inverso); }
	.enviar-seg:disabled { opacity: .45; cursor: not-allowed; }

	/* ---------------------------------------------------------------
	 * Detalle de cobranza: mismos bloques de siempre, con los colores y
	 * recuadros de la opción marcada. No se movió ningún contenido.
	 * --------------------------------------------------------------- */
	.detalle-cabecera {
		background: linear-gradient(120deg, #182f63 0%, #13224a 60%, #0f1b38 100%);
	}
	.detalle-envio-resumen {
		border-color: #4f46e5;
		background: rgba(99, 102, 241, 0.17);
	}
	.tabla-comprobantes thead th {
		background: var(--tabla-gradiente);
		color: var(--texto-inverso);
	}
	.grupo-estado {
		margin-bottom: 14px;
		padding: 10px 12px 12px;
		border: 1px solid var(--borde-fuerte);
		border-radius: 14px;
		background: var(--superficie-alta);
		box-shadow:
			0 12px 28px rgba(0, 0, 0, 0.35),
			inset 0 1px 0 rgba(255, 255, 255, 0.04);
	}
	.grupo-estado .titulo-grupo {
		margin: 0 0 8px;
		padding: 0 2px;
	}
	.historial-grupo thead th {
		background: var(--tabla-gradiente);
		color: var(--texto-inverso);
	}
	.historial-grupo .historial-titulo {
		margin: 0 0 8px;
	}
	.tabla-detalle tfoot td {
		background: #2b1a5f;
		border-top-color: #6d3fc0;
	}
	.tabla-detalle tfoot .fila-excluidos td {
		background: rgba(217, 70, 239, 0.14);
		color: #e9d5ff;
		border-top: 0;
	}
	.destinatarios {
		border-color: var(--borde-fuerte);
		background: var(--superficie-alta);
	}
	.historial-titulo {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.historial-titulo::before {
		content: '';
		width: 6px;
		height: 6px;
		border-radius: 999px;
		background: var(--info);
		box-shadow: 0 0 8px var(--info-borde);
	}
</style>
