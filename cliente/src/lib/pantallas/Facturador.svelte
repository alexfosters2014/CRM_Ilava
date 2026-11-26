<script lang="ts">
	import { onMount } from 'svelte';
	import { iconos } from '#lib/componentes/iconos.ts';
	import { confirmar } from '#lib/componentes/confirmacion.svelte.ts';
	import {
		actualizarFactura,
		actualizarLineaFactura,
		agregarLineaFactura,
		cambiarEstadoFactura,
		devolverAFacturador,
		eliminarFacturas,
		eliminarLineaFactura,
		guardarConfiguracionFacturacion,
		guardarVariables,
		listarCatalogos,
		listarFacturas,
		listarVariables,
		marcarFacturadas,
		obtenerConfiguracionFacturacion,
		type Catalogos,
		type EstadoFactura,
		type FacturaListado,
		type Variable
	} from '#lib/servicios-datos-api/index.ts';
	import { formatearFecha, hoyIso, parsearFecha } from '#lib/servicios/fechas.ts';
	import { formatearNumero } from '#lib/servicios/numeros.ts';
	import { descargarPlanilla, nombreArchivo } from '#lib/servicios/multifacturacion.ts';
	import ChipSelect from '#lib/componentes/ChipSelect.svelte';
	import ChipAuxiliar from '#lib/componentes/ChipAuxiliar.svelte';
	import BarraLotes from '#lib/componentes/BarraLotes.svelte';
	import ModalDocumento from '#lib/componentes/ModalDocumento.svelte';
	import ModalEnviadosFacturar from '#lib/componentes/ModalEnviadosFacturar.svelte';
	import type {
		CambiosLineaDocumento,
		CampoDocumento,
		DocumentoEditable
	} from '#lib/componentes/documento.ts';

	/**
	 * Pantalla: Facturador / Bandeja.
	 *
	 * Misma tabla que Plantillas, pero cada fila es una FACTURA (copia de la
	 * plantilla). En el Facturador se edita; en la Bandeja solo se consulta y se
	 * mueve el estado.
	 */

	interface Props {
		vista?: 'facturador' | 'bandeja';
	}

	let { vista = 'facturador' }: Props = $props();

	type EditCampo = 'codigo' | 'detalle' | 'cantidad' | 'importe' | 'comentario';

	const ESTADOS_FACTURADOR: EstadoFactura[] = ['PROCESO', 'PENDIENTE'];
	// La Bandeja es la cola de trabajo: solo muestra lo pendiente de exportar.
	const ESTADOS_BANDEJA: EstadoFactura[] = ['BANDEJA'];

	let busqueda = $state('');
	let filtroEstado = $state<'todos' | EstadoFactura>('todos');
	let gruposCerrados = $state<number[]>([]);
	let seleccionadas = $state<number[]>([]);

	let facturas = $state<FacturaListado[]>([]);
	let catalogos = $state<Catalogos | null>(null);
	let variables = $state<Variable[]>([]);
	/** Serie configurada para la planilla de multifacturación. */
	let serie = $state('A');
	/** Período en proceso (`YYYY-MM`) y fecha general del envío (`YYYY-MM-DD`). */
	let periodoFacturacion = $state<string | null>(null);
	let fechaGeneralFacturacion = $state<string | null>(null);
	let cargando = $state(true);
	let ocupado = $state(false);
	let error = $state<string | null>(null);
	let aviso = $state<string | null>(null);

	// Período y fecha general: visibles y editables desde el panel del Facturador.
	let borradorPeriodo = $state('');
	let borradorFechaGeneral = $state('');
	let configEditada = $state(false);

	// Panel flotante de variables
	let panelVariables = $state(false);
	let posicionPanel = $state({ x: 0, y: 0 });
	let posicionInicializada = $state(false);
	let arrastrandoPanel = $state(false);
	let variablesGuardadas = $state('[]');
	let guardandoVariables = $state(false);
	let avisoVariables = $state<string | null>(null);

	// Edición rápida
	let edicion = $state<{ facturaId: number; lineaId: number; campo: EditCampo } | null>(null);
	let edicionGeneral = $state<number | null>(null);
	let edicionFecha = $state<number | null>(null);
	let borradorFecha = $state('');
	let borrador = $state('');
	let popoverCodigo = $state(false);
	let editandoIdCliente = $state<number | null>(null);
	let borradorIdCliente = $state('');

	// Modales
	let modalFactura = $state<FacturaListado | null>(null);
	let modalEnviados = $state(false);
	let modalEnvio = $state(false);
	let modalPendiente = $state<FacturaListado | null>(null);
	let motivo = $state('');
	let nuevaVariable = $state('');
	let errorEnvio = $state<string | null>(null);

	onMount(() => {
		void cargar();
	});

	/**
	 * Carga las facturas. `silencioso` evita desmontar la tabla al refrescar
	 * después de una edición: así la fila no se va al principio de la página.
	 */
	async function cargar(silencioso = false) {
		if (!silencioso) cargando = true;
		error = null;
		try {
			const estados = vista === 'facturador' ? ESTADOS_FACTURADOR : ESTADOS_BANDEJA;
			const [datos, catalogosApi, variablesApi, facturacion] = await Promise.all([
				listarFacturas(),
				listarCatalogos(),
				listarVariables(),
				obtenerConfiguracionFacturacion()
			]);
			facturas = datos.filter((factura) => estados.includes(factura.estado));
			catalogos = catalogosApi;
			if (!variablesSucias) {
				variables = variablesApi;
				variablesGuardadas = serializarVariables(variablesApi);
			}
			serie = facturacion.serie;
			periodoFacturacion = facturacion.periodo;
			fechaGeneralFacturacion = facturacion.fechaGeneral;
			if (!configEditada) {
				borradorPeriodo = facturacion.periodo ?? '';
				borradorFechaGeneral = formatearFecha(facturacion.fechaGeneral);
			}

			const vigentes = new Set(facturas.map((factura) => factura.id));
			seleccionadas = seleccionadas.filter((id) => vigentes.has(id));
		} catch (e) {
			error = (e as Error).message;
		} finally {
			if (!silencioso) cargando = false;
		}
	}

	let visibles = $derived(
		facturas
			.filter((factura) => filtroEstado === 'todos' || factura.estado === filtroEstado)
			.filter((factura) => {
				const texto = `${factura.contactoFacturacion} ${factura.comentarioGeneral ?? ''} ${factura.periodo} ${factura.idCompra ?? ''} ${factura.detalleAuxiliar ?? ''} ${factura.informacionAdicional ?? ''} ${factura.lineas
					.map((linea) => `${linea.codigo} ${linea.descripcion} ${linea.detalle ?? ''} ${linea.comentario ?? ''}`)
					.join(' ')}`.toLowerCase();
				return texto.includes(busqueda.trim().toLowerCase());
			})
	);

	/** Facturas agrupadas por grupo de facturación, igual que en Plantillas. */
	let grupos = $derived.by(() => {
		const mapa = new Map<
			number,
			{ id: number; nombre: string; colorFondo: string; colorTexto: string; facturas: FacturaListado[] }
		>();

		// En la Bandeja, las facturas con orden manual forman el bloque "Prioridad"
		// arriba de todo. Las demás siguen en el orden actual, por grupo.
		if (vista === 'bandeja') {
			const prioritarias = visibles
				.filter((factura) => factura.ordenManual !== null)
				.sort(
					(a, b) =>
						(a.ordenManual ?? 0) - (b.ordenManual ?? 0) || a.id - b.id
				);

			if (prioritarias.length > 0) {
				mapa.set(-1, {
					id: -1,
					nombre: 'Prioridad',
					colorFondo: '#3346b8',
					colorTexto: '#ffffff',
					facturas: prioritarias
				});
			}
		}

		for (const factura of visibles) {
			if (vista === 'bandeja' && factura.ordenManual !== null) continue;

			const grupo = mapa.get(factura.grupoId);
			if (grupo) {
				grupo.facturas.push(factura);
			} else {
				mapa.set(factura.grupoId, {
					id: factura.grupoId,
					nombre: factura.grupoNombre,
					colorFondo: factura.grupoColorFondo,
					colorTexto: factura.grupoColorTexto,
					facturas: [factura]
				});
			}
		}
		return [...mapa.values()];
	});

	let paridad = $derived.by(() => {
		const mapa = new Map<number, boolean>();
		let indice = 0;
		for (const grupo of grupos) {
			for (const factura of grupo.facturas) {
				mapa.set(factura.id, indice % 2 === 1);
				indice++;
			}
		}
		return mapa;
	});

	function alternarGrupo(id: number) {
		gruposCerrados = gruposCerrados.includes(id)
			? gruposCerrados.filter((grupoId) => grupoId !== id)
			: [...gruposCerrados, id];
	}

	function alternarSeleccion(id: number) {
		seleccionadas = seleccionadas.includes(id)
			? seleccionadas.filter((facturaId) => facturaId !== id)
			: [...seleccionadas, id];
	}

	function seleccionarGrupo(lista: FacturaListado[]) {
		const ids = lista.map((factura) => factura.id);
		const completo = ids.every((id) => seleccionadas.includes(id));
		seleccionadas = completo
			? seleccionadas.filter((id) => !ids.includes(id))
			: [...new Set([...seleccionadas, ...ids])];
	}

	function grupoSeleccionado(lista: FacturaListado[]) {
		return lista.length > 0 && lista.every((factura) => seleccionadas.includes(factura.id));
	}

	function abrirModal(factura: FacturaListado) {
		modalFactura = factura;
		motivo = factura.motivoPendiente ?? '';
	}

	function cerrarModales() {
		modalFactura = null;
		modalEnvio = false;
		modalPendiente = null;
		motivo = '';
		nuevaVariable = '';
		errorEnvio = null;
	}

	// ---------- Edición rápida ----------

	function empezarEdicion(facturaId: number, lineaId: number, campo: EditCampo, valor: string) {
		if (vista !== 'facturador') return;
		edicion = { facturaId, lineaId, campo };
		borrador = valor;
		popoverCodigo = campo === 'codigo';
	}

	function empezarComentarioGeneral(factura: FacturaListado) {
		if (vista !== 'facturador') return;
		edicionGeneral = factura.id;
		borrador = factura.comentarioGeneral ?? '';
	}

	async function guardarLinea(campo: EditCampo) {
		if (!edicion) return;
		const { facturaId, lineaId } = edicion;
		const valor = borrador;
		edicion = null;
		popoverCodigo = false;

		try {
			if (campo === 'codigo') {
				if (!valor.trim()) return;
				await actualizarLineaFactura(facturaId, lineaId, { codigo: valor });
			} else if (campo === 'detalle') {
				await actualizarLineaFactura(facturaId, lineaId, { detalle: valor.trim() || null });
			} else if (campo === 'comentario') {
				await actualizarLineaFactura(facturaId, lineaId, { comentario: valor.trim() || null });
			} else {
				const numero = Number(valor.replace(',', '.'));
				if (!Number.isFinite(numero) || numero < 0) {
					error = 'El valor debe ser un número mayor o igual a 0';
					return;
				}
				await actualizarLineaFactura(
					facturaId,
					lineaId,
					campo === 'cantidad' ? { cantidad: numero } : { importeUnitario: numero }
				);
			}
			await cargar(true);
		} catch (e) {
			error = (e as Error).message;
		}
	}

	async function guardarComentarioGeneral(facturaId: number) {
		const valor = borrador;
		edicionGeneral = null;
		try {
			await actualizarFactura(facturaId, { comentarioGeneral: valor.trim() || null });
			await cargar(true);
		} catch (e) {
			error = (e as Error).message;
		}
	}

	async function guardarFecha(facturaId: number, texto: string) {
		const fecha = parsearFecha(texto);
		if (fecha.error) {
			// Se descarta el valor inválido y se avisa el motivo.
			edicionFecha = null;
			error = fecha.error;
			return;
		}

		edicionFecha = null;
		try {
			await actualizarFactura(facturaId, { fecha: fecha.iso });
			await cargar(true);
		} catch (e) {
			error = (e as Error).message;
		}
	}

	// ---------- Chips (comprobante, moneda, precio, ID cliente) ----------

	/** Tipos de precio válidos para la moneda elegida (pares moneda→precio). */
	function preciosParaMoneda(codigoMoneda: string | null) {
		const precios = catalogos?.tiposPrecios ?? [];
		if (!codigoMoneda) return precios;

		const moneda = catalogos?.monedas.find((opcion) => opcion.codigo === codigoMoneda);
		if (!moneda) return precios;

		const validos = new Set(
			(catalogos?.monedasTiposPrecio ?? [])
				.filter((par) => par.monedaId === moneda.id)
				.map((par) => par.tipoPrecioId)
		);
		if (validos.size === 0) return precios;
		return precios.filter((precio) => validos.has(precio.id));
	}

	async function cambiarChipFactura(
		factura: FacturaListado,
		campo: 'tipoComprobante' | 'moneda' | 'tipoPrecio',
		valor: string
	) {
		error = null;
		try {
			await actualizarFactura(factura.id, { [campo]: valor });
			// Se refleja en pantalla sin esperar la recarga.
			aplicarCambioFactura(factura.id, { [campo]: valor });

			// Relación moneda → precio: si el precio actual deja de ser válido, se limpia.
			if (campo === 'moneda' && factura.tipoPrecio) {
				const valido = preciosParaMoneda(valor).some((precio) => precio.nombre === factura.tipoPrecio);
				if (!valido) {
					await actualizarFactura(factura.id, { tipoPrecio: null });
					aplicarCambioFactura(factura.id, { tipoPrecio: null });
				}
			}

			await cargar(true);
		} catch (e) {
			error = (e as Error).message;
		}
	}

	function aplicarCambioFactura(id: number, cambios: Partial<FacturaListado>) {
		facturas = facturas.map((factura) => (factura.id === id ? { ...factura, ...cambios } : factura));
	}

	/** Recarga sin desmontar la tabla y devuelve el scroll a donde estaba. */
	async function refrescarSinSalto() {
		const y = window.scrollY;
		await cargar(true);
		requestAnimationFrame(() => window.scrollTo({ top: y }));
	}

	function deseleccionarTodas() {
		seleccionadas = [];
	}

	// ---------- Orden manual (solo Bandeja) ----------

	async function guardarOrden(factura: FacturaListado, texto: string) {
		if (vista !== 'bandeja') return;
		const limpio = texto.trim();
		error = null;

		if (limpio === '') {
			if (factura.ordenManual === null) return;
			try {
				await actualizarFactura(factura.id, { ordenManual: null });
				await refrescarSinSalto();
			} catch (e) {
				error = (e as Error).message;
			}
			return;
		}

		const orden = Number(limpio);
		if (!Number.isInteger(orden) || orden < 1 || orden > 9999) {
			error = 'El orden debe ser un número entero entre 1 y 9999';
			return;
		}
		if (orden === factura.ordenManual) return;

		try {
			await actualizarFactura(factura.id, { ordenManual: orden });
			await refrescarSinSalto();
		} catch (e) {
			error = (e as Error).message;
		}
	}

	// ---------- Bandeja: devolver al facturador y exportar ----------

	async function devolverSeleccionadas() {
		if (seleccionadas.length === 0) return;
		const ids = [...seleccionadas];
		ocupado = true;
		error = null;
		aviso = null;
		try {
			const devueltas = await devolverAFacturador(ids);
			// Optimista: salen de la Bandeja sin esperar la recarga.
			facturas = facturas.filter((factura) => !ids.includes(factura.id));
			seleccionadas = [];
			aviso = `${devueltas} ${devueltas === 1 ? 'factura devuelta' : 'facturas devueltas'} al Facturador`;
			await refrescarSinSalto();
		} catch (e) {
			error = (e as Error).message;
		} finally {
			ocupado = false;
		}
	}

	async function generarMultifacturacion() {
		if (seleccionadas.length === 0) return;
		const ids = [...seleccionadas];
		// Mismo orden que la tabla: bloque Prioridad y después los grupos.
		const ordenadas = grupos
			.flatMap((grupo) => grupo.facturas)
			.filter((factura) => ids.includes(factura.id));
		ocupado = true;
		error = null;
		aviso = null;

		try {
			if (!serie.trim()) throw new Error('Configurá la serie en Configuración → Facturación');
			const sinLineas = ordenadas.filter((factura) => factura.lineas.length === 0);
			if (sinLineas.length > 0) {
				throw new Error(`Hay ${sinLineas.length} factura(s) sin líneas para exportar`);
			}

			const archivo = nombreArchivo(ordenadas, hoyIso());
			const resumen = descargarPlanilla(ordenadas, { serie }, archivo);
			const marcadas = await marcarFacturadas(ids);

			facturas = facturas.filter((factura) => !ids.includes(factura.id));
			seleccionadas = [];
			aviso = `${resumen.facturas} factura(s) y ${resumen.filas} línea(s) exportadas. ${marcadas} marcada(s) como FACTURADO.`;
			await refrescarSinSalto();
		} catch (e) {
			error = (e as Error).message;
		} finally {
			ocupado = false;
		}
	}

	function empezarIdClienteFactura(factura: FacturaListado) {
		if (vista !== 'facturador') return;
		editandoIdCliente = factura.id;
		borradorIdCliente = factura.idCliente === null ? '' : String(factura.idCliente);
	}

	async function guardarIdClienteFactura(factura: FacturaListado) {
		const texto = borradorIdCliente.trim();
		editandoIdCliente = null;

		if (texto !== '' && !/^\d+$/.test(texto)) {
			error = 'El ID de cliente debe ser numérico';
			return;
		}

		try {
			await actualizarFactura(factura.id, { idCliente: texto === '' ? null : Number(texto) });
			aplicarCambioFactura(factura.id, { idCliente: texto === '' ? null : Number(texto) });
			await cargar(true);
		} catch (e) {
			error = (e as Error).message;
		}
	}

	/** Sugerencias de artículo para el popover de código. */
	let sugerenciasCodigo = $derived.by(() => {
		if (!popoverCodigo) return [];
		const texto = borrador.trim().toLowerCase();
		const articulos = (catalogos?.articulos ?? []).filter((articulo) => articulo.activo);
		const coincidencias = texto
			? articulos.filter(
					(articulo) =>
						articulo.codigo.toLowerCase().includes(texto) ||
						articulo.descripcion.toLowerCase().includes(texto)
				)
			: articulos;
		return coincidencias.slice(0, 6);
	});

	// ---------- Estados ----------

	function facturasSeleccionadas() {
		return facturas.filter((factura) => seleccionadas.includes(factura.id));
	}

	// ---------- Variables ----------

	/** Los nombres de variable no distinguen mayúsculas. */
	function claveVariable(nombre: string): string {
		return nombre.trim().toLowerCase();
	}

	function serializarVariables(lista: Variable[]): string {
		return JSON.stringify(
			lista.map((variable) => [claveVariable(variable.nombre), variable.valor ?? ''])
		);
	}

	let variablesSucias = $derived(serializarVariables(variables) !== variablesGuardadas);

	/** El período o la fecha del panel difieren de lo guardado. */
	let configSucias = $derived(
		borradorPeriodo.trim() !== (periodoFacturacion ?? '') ||
			borradorFechaGeneral.trim() !== formatearFecha(fechaGeneralFacturacion)
	);
	let panelSucio = $derived(variablesSucias || configSucias);

	/** Valor cargado para una variable ('' si no tiene). */
	function valorVariable(nombre: string): string {
		const clave = claveVariable(nombre);
		return variables.find((variable) => claveVariable(variable.nombre) === clave)?.valor ?? '';
	}

	/**
	 * Asigna un valor. Si la variable aparece en los textos pero no está en el
	 * catálogo, se agrega al borrador para poder completarla.
	 */
	function asignarValor(nombre: string, valor: string) {
		const clave = claveVariable(nombre);
		const existe = variables.some((variable) => claveVariable(variable.nombre) === clave);
		if (existe) {
			variables = variables.map((variable) =>
				claveVariable(variable.nombre) === clave ? { ...variable, valor } : variable
			);
			return;
		}
		variables = [...variables, { id: 0, nombre: nombre.trim(), valor }];
	}

	/** Variables usadas por las facturas seleccionadas: [clave, nombre visible]. */
	let variablesDelLote = $derived.by(() => {
		const nombres = new Map<string, string>();
		const patron = /\{\{\s*([^{}]+?)\s*\}\}/g;
		for (const factura of facturasSeleccionadas()) {
			const textos = [
				factura.comentarioGeneral,
				factura.detalleAuxiliar,
				factura.informacionAdicional,
				...factura.lineas.flatMap((linea) => [linea.detalle, linea.comentario])
			];
			for (const texto of textos) {
				if (!texto) continue;
				for (const coincidencia of texto.matchAll(patron)) {
					const nombre = coincidencia[1].trim();
					if (nombre) nombres.set(claveVariable(nombre), nombre);
				}
			}
		}
		return [...nombres.entries()].sort(([a], [b]) => a.localeCompare(b));
	});

	/** Variables del lote sin valor cargado. */
	let variablesFaltantesLote = $derived.by(() =>
		variablesDelLote.filter(([clave]) => !valorVariable(clave).trim())
	);

	/** Variables que muestra el panel: catálogo + las usadas por el lote. */
	let variablesPanel = $derived.by(() => {
		const lista = variables.map((variable) => ({
			nombre: variable.nombre,
			valor: variable.valor ?? ''
		}));
		const claves = new Set(lista.map((variable) => claveVariable(variable.nombre)));
		for (const [clave, nombre] of variablesDelLote) {
			if (!claves.has(clave)) lista.push({ nombre, valor: '' });
		}
		return lista;
	});

	function abrirPanelVariables() {
		avisoVariables = null;
		error = null;
		if (!configEditada) {
			borradorPeriodo = periodoFacturacion ?? '';
			borradorFechaGeneral = formatearFecha(fechaGeneralFacturacion);
		}
		if (!posicionInicializada) {
			// El panel mide como máximo 34rem (544px) o el 70% del alto visible.
			const altoPanel = Math.min(window.innerHeight * 0.7, 34 * 16);
			posicionPanel = {
				x: Math.max(12, window.innerWidth - 380),
				y: Math.max(12, window.innerHeight - altoPanel - 12)
			};
			posicionInicializada = true;
		}
		panelVariables = true;
	}

	function alternarPanelVariables() {
		if (panelVariables) {
			panelVariables = false;
			return;
		}
		abrirPanelVariables();
	}

	function iniciarArrastre(evento: PointerEvent) {
		evento.preventDefault();
		const ancho = 360;
		const inicioX = evento.clientX - posicionPanel.x;
		const inicioY = evento.clientY - posicionPanel.y;
		arrastrandoPanel = true;

		const mover = (movimiento: PointerEvent) => {
			posicionPanel = {
				x: Math.min(
					Math.max(0, movimiento.clientX - inicioX),
					Math.max(0, window.innerWidth - ancho)
				),
				y: Math.min(Math.max(0, movimiento.clientY - inicioY), Math.max(0, window.innerHeight - 48))
			};
		};
		const soltar = () => {
			arrastrandoPanel = false;
			window.removeEventListener('pointermove', mover);
			window.removeEventListener('pointerup', soltar);
		};

		window.addEventListener('pointermove', mover);
		window.addEventListener('pointerup', soltar);
	}

	function agregarVariable() {
		const nombre = nuevaVariable.trim();
		error = null;

		if (!nombre) {
			error = 'Escribí el nombre de la variable';
			return;
		}
		if (!/^[\w-]+$/.test(nombre)) {
			error = 'El nombre solo admite letras, números, guion y guion bajo';
			return;
		}
		if (variables.some((variable) => claveVariable(variable.nombre) === claveVariable(nombre))) {
			error = 'Esa variable ya existe';
			return;
		}

		variables = [...variables, { id: 0, nombre, valor: '' }];
		nuevaVariable = '';
	}

	function borrarVariable(nombre: string) {
		const clave = claveVariable(nombre);
		variables = variables.filter((variable) => claveVariable(variable.nombre) !== clave);
	}

	async function guardarPanel() {
		if (guardandoVariables) return;
		error = null;
		avisoVariables = null;

		const tienePeriodo = borradorPeriodo.trim() !== '';
		const tieneFecha = borradorFechaGeneral.trim() !== '';
		let fechaIso: string | null = null;

		if (tienePeriodo || tieneFecha) {
			if (!/^\d{4}-\d{2}$/.test(borradorPeriodo)) {
				error = 'Elegí el período en proceso';
				return;
			}
			const fecha = parsearFecha(borradorFechaGeneral);
			if (fecha.error) {
				error = fecha.error;
				return;
			}
			if (!fecha.iso) {
				error = 'Asigná la fecha general de facturación';
				return;
			}
			fechaIso = fecha.iso;
		}

		guardandoVariables = true;
		try {
			if (fechaIso) {
				const config = await guardarConfiguracionFacturacion({
					periodo: borradorPeriodo,
					fechaGeneral: fechaIso
				});
				periodoFacturacion = config.periodo;
				fechaGeneralFacturacion = config.fechaGeneral;
				borradorFechaGeneral = formatearFecha(config.fechaGeneral);
				configEditada = false;
			}

			const guardadas = await guardarVariables(
				variables.map((variable) => ({ nombre: variable.nombre, valor: variable.valor }))
			);
			variables = guardadas;
			variablesGuardadas = serializarVariables(guardadas);
			avisoVariables = 'Configuración guardada';
		} catch (e) {
			error = (e as Error).message;
		} finally {
			guardandoVariables = false;
		}
	}

	function abrirEnvioABandeja() {
		if (seleccionadas.length === 0) return;

		if (variablesFaltantesLote.length > 0) {
			abrirPanelVariables();
			avisoVariables = `Completá y guardá estas variables antes de enviar: ${variablesFaltantesLote
				.map(([, nombre]) => nombre)
				.join(', ')}`;
			return;
		}

		// La fecha ya viene desde Plantillas; si alguna factura no la tiene, se
		// corrige en la tabla antes de mover el lote.
		const sinFecha = facturasSeleccionadas().filter((factura) => !factura.fecha);
		if (sinFecha.length > 0) {
			error = `Falta la fecha en ${sinFecha.length} ${sinFecha.length === 1 ? 'factura' : 'facturas'}. Editala en la columna Fecha antes de enviar.`;
			return;
		}

		error = null;
		errorEnvio = null;
		modalEnvio = true;
	}

	async function enviarABandeja() {
		ocupado = true;
		error = null;
		errorEnvio = null;
		try {
			const valores: Record<string, string> = {};
			for (const variable of variables) {
				const valor = (variable.valor ?? '').trim();
				if (valor) valores[variable.nombre] = valor;
			}

			const ids = [...seleccionadas];
			for (const id of ids) {
				await cambiarEstadoFactura(id, { estado: 'BANDEJA', variables: valores });
			}
			seleccionadas = [];
			aviso = `${ids.length} ${ids.length === 1 ? 'factura enviada' : 'facturas enviadas'} a Bandeja`;
			cerrarModales();
			await cargar();
		} catch (e) {
			error = (e as Error).message;
			errorEnvio = (e as Error).message;
		} finally {
			ocupado = false;
		}
	}

	async function marcarPendiente() {
		if (!modalPendiente) return;
		if (!motivo.trim()) {
			error = 'Escribí el motivo por el que queda pendiente';
			return;
		}

		ocupado = true;
		error = null;
		try {
			await cambiarEstadoFactura(modalPendiente.id, { estado: 'PENDIENTE', motivo });
			cerrarModales();
			await cargar();
		} catch (e) {
			error = (e as Error).message;
		} finally {
			ocupado = false;
		}
	}

	async function cambiarEstadoLote(estado: 'FACTURADO' | 'COBRADO') {
		if (seleccionadas.length === 0) return;
		ocupado = true;
		error = null;
		try {
			const ids = [...seleccionadas];
			for (const id of ids) await cambiarEstadoFactura(id, { estado });
			seleccionadas = [];
			aviso = `${ids.length} ${ids.length === 1 ? 'factura marcada' : 'facturas marcadas'} como ${estado}`;
			await cargar();
		} catch (e) {
			error = (e as Error).message;
		} finally {
			ocupado = false;
		}
	}

	async function eliminarSeleccionadas() {
		if (seleccionadas.length === 0) return;
		const cantidad = seleccionadas.length;
		const confirmado = await confirmar({
			titulo: 'Eliminar facturas',
			mensaje:
				cantidad === 1
					? '¿Eliminar la factura seleccionada?'
					: `¿Eliminar las ${cantidad} facturas seleccionadas?`,
			tono: 'peligro',
			etiquetaConfirmar: 'Eliminar'
		});
		if (!confirmado) return;

		ocupado = true;
		error = null;
		try {
			await eliminarFacturas(seleccionadas);
			seleccionadas = [];
			cerrarModales();
			await cargar();
		} catch (e) {
			error = (e as Error).message;
		} finally {
			ocupado = false;
		}
	}

	// ---------- Modal de documento (cabecera + auxiliares + líneas) ----------

	/** Normaliza la factura a la forma que consume el modal compartido. */
	function documentoDe(factura: FacturaListado): DocumentoEditable {
		return {
			id: factura.id,
			titulo: factura.idCliente
				? `${factura.contactoFacturacion} (${factura.idCliente})`
				: factura.contactoFacturacion,
			subtitulo: `${etiquetaPeriodo(factura.periodo)} · ${etiquetaEstado(factura.estado)} · ${factura.tipoNumeracion} ${factura.numeracion ?? '—'}`,
			moneda: factura.moneda,
			tipoComprobante: factura.tipoComprobante,
			tipoPrecio: factura.tipoPrecio,
			idCliente: factura.idCliente,
			fecha: factura.fecha,
			serie: factura.serie,
			numero: factura.numero,
			comentarioGeneral: factura.comentarioGeneral,
			idCompra: factura.idCompra,
			detalleAuxiliar: factura.detalleAuxiliar,
			uteVencimiento: factura.uteVencimiento,
			informacionAdicional: factura.informacionAdicional,
			lineas: factura.lineas.map((linea) => ({
				id: linea.id,
				codigo: linea.codigo,
				descripcion: linea.descripcion,
				detalle: linea.detalle,
				cantidad: linea.cantidad,
				importeUnitario: linea.importeUnitario,
				comentario: linea.comentario
			}))
		};
	}

	let documentoModal = $derived(modalFactura ? documentoDe(modalFactura) : null);

	function textoOpcional(valor: string | number | null): string | null {
		if (typeof valor !== 'string') return null;
		const limpio = valor.trim();
		return limpio === '' ? null : limpio;
	}

	/** Refresca la factura abierta en el modal después de guardar. */
	async function sincronizarModal() {
		await cargar(true);
		modalFactura = facturas.find((factura) => factura.id === modalFactura?.id) ?? null;
	}

	async function guardarCabeceraDocumento(campo: CampoDocumento, valor: string | number | null) {
		if (!modalFactura || vista !== 'facturador') return;
		const id = modalFactura.id;
		ocupado = true;
		error = null;

		try {
			const cambios: Parameters<typeof actualizarFactura>[1] = {};
			switch (campo) {
				case 'moneda':
					cambios.moneda = valor === 'USD' ? 'USD' : '$';
					break;
				case 'idCliente':
					cambios.idCliente = typeof valor === 'number' ? valor : null;
					break;
				case 'tipoComprobante':
					cambios.tipoComprobante = textoOpcional(valor);
					break;
				case 'tipoPrecio':
					cambios.tipoPrecio = textoOpcional(valor);
					break;
				case 'fecha':
					cambios.fecha = textoOpcional(valor);
					break;
				case 'serie':
					cambios.serie = textoOpcional(valor);
					break;
				case 'numero':
					cambios.numero = textoOpcional(valor);
					break;
				case 'comentarioGeneral':
					cambios.comentarioGeneral = textoOpcional(valor);
					break;
				case 'idCompra':
					cambios.idCompra = textoOpcional(valor);
					break;
				case 'detalleAuxiliar':
					cambios.detalleAuxiliar = textoOpcional(valor);
					break;
				case 'uteVencimiento':
					cambios.uteVencimiento = textoOpcional(valor);
					break;
				case 'informacionAdicional':
					cambios.informacionAdicional = textoOpcional(valor);
					break;
			}

			await actualizarFactura(id, cambios);
			await sincronizarModal();

			// Relación moneda → precio: si el precio actual deja de ser válido, se limpia.
			if (campo === 'moneda' && modalFactura?.tipoPrecio) {
				const valido = preciosParaMoneda(modalFactura.moneda).some(
					(precio) => precio.nombre === modalFactura?.tipoPrecio
				);
				if (!valido) {
					await actualizarFactura(id, { tipoPrecio: null });
					await sincronizarModal();
				}
			}
		} catch (e) {
			error = (e as Error).message;
		} finally {
			ocupado = false;
		}
	}

	async function guardarLineaDocumento(lineaId: number, cambios: CambiosLineaDocumento) {
		if (!modalFactura || vista !== 'facturador') return;
		ocupado = true;
		error = null;
		try {
			await actualizarLineaFactura(modalFactura.id, lineaId, cambios);
			await sincronizarModal();
		} catch (e) {
			error = (e as Error).message;
		} finally {
			ocupado = false;
		}
	}

	async function agregarLineaDocumento(datos: {
		codigo: string;
		cantidad: number;
		importeUnitario: number;
		detalle?: string | null;
		comentario?: string | null;
	}) {
		if (!modalFactura || vista !== 'facturador') return;
		ocupado = true;
		error = null;
		try {
			await agregarLineaFactura(modalFactura.id, datos);
			await sincronizarModal();
		} catch (e) {
			error = (e as Error).message;
		} finally {
			ocupado = false;
		}
	}

	async function eliminarLineaDocumento(lineaId: number) {
		if (!modalFactura || vista !== 'facturador') return;
		ocupado = true;
		error = null;
		try {
			await eliminarLineaFactura(modalFactura.id, lineaId);
			await sincronizarModal();
		} catch (e) {
			error = (e as Error).message;
		} finally {
			ocupado = false;
		}
	}

	function marcarPendienteDesdeModal() {
		if (!modalFactura) return;
		modalPendiente = modalFactura;
		motivo = modalFactura.motivoPendiente ?? '';
	}

	function eliminarDesdeModal() {
		if (!modalFactura) return;
		seleccionadas = [modalFactura.id];
		void eliminarSeleccionadas();
	}

	// ---------- Período en proceso ----------

	/** Último día del mes de un período `YYYY-MM`, en ISO. */
	function ultimoDiaDelMes(periodo: string): string {
		const [anio, mes] = periodo.split('-').map(Number);
		if (!anio || !mes) return '';
		return new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
	}

	function cambiarBorradorPeriodo(valor: string) {
		const fechaSugeridaAnterior = formatearFecha(ultimoDiaDelMes(borradorPeriodo));
		borradorPeriodo = valor;
		configEditada = true;
		// Si la fecha estaba vacía o era el último día del mes anterior, se
		// propone el último día del mes elegido.
		if (!borradorFechaGeneral.trim() || borradorFechaGeneral.trim() === fechaSugeridaAnterior) {
			borradorFechaGeneral = formatearFecha(ultimoDiaDelMes(valor));
		}
	}

	// ---------- Formato ----------

	function formatearImporte(valor: string, moneda: string | null): string {
		const numero = Number(valor);
		if (!Number.isFinite(numero)) return valor;
		const simbolo = moneda === 'USD' ? 'US$' : '$';
		return `${simbolo} ${formatearNumero(numero)}`;
	}

	function formatearCantidad(valor: string): string {
		return formatearNumero(valor);
	}

	function etiquetaPeriodo(periodo: string): string {
		const [anio, mes] = periodo.split('-');
		const meses = [
			'ENERO',
			'FEBRERO',
			'MARZO',
			'ABRIL',
			'MAYO',
			'JUNIO',
			'JULIO',
			'AGOSTO',
			'SETIEMBRE',
			'OCTUBRE',
			'NOVIEMBRE',
			'DICIEMBRE'
		];
		return `${meses[Number(mes) - 1] ?? mes} ${anio}`;
	}

	/** Etiqueta legible del estado, como en la maqueta. */
	function etiquetaEstado(estado: EstadoFactura): string {
		const etiquetas: Record<EstadoFactura, string> = {
			PROCESO: 'En proceso',
			PENDIENTE: 'Pendiente',
			BANDEJA: 'En bandeja',
			FACTURADO: 'Facturado',
			COBRADO: 'Cobrado',
			ELIMINADO: 'Eliminado'
		};
		return etiquetas[estado] ?? estado;
	}

	function claseEstado(estado: EstadoFactura): string {
		return `estado-${estado.toLowerCase()}`;
	}
</script>

<svelte:head>
	<title>CRM — {vista === 'facturador' ? 'Facturador' : 'Bandeja'}</title>
</svelte:head>

<div class="periodo-banner" class:sin-configurar={!periodoFacturacion || !fechaGeneralFacturacion}>
	<div class="periodo-datos">
		<span class="periodo-etiqueta">Período en proceso</span>
		<strong class="periodo-valor">
			{periodoFacturacion ? etiquetaPeriodo(periodoFacturacion) : 'Sin configurar'}
		</strong>
		<span class="periodo-separador" aria-hidden="true">·</span>
		<span class="periodo-etiqueta">Fecha general</span>
		<strong class="periodo-valor">
			{fechaGeneralFacturacion ? formatearFecha(fechaGeneralFacturacion) : 'Sin configurar'}
		</strong>
	</div>
	{#if vista === 'facturador'}
		<button type="button" class="btn-periodo" onclick={abrirPanelVariables}>Cambiar período</button>
	{/if}
</div>

<div class="barra-herramientas">
	<label class="buscador">
		<span>{@html iconos.buscar}</span>
		<input bind:value={busqueda} placeholder="Buscar contacto, código o comentario..." aria-label="Buscar facturas" />
	</label>
	<div class="controles">
		{#if vista === 'facturador'}
			<label class="selector">
				<span class="etiqueta">Estado</span>
				<select bind:value={filtroEstado} aria-label="Filtrar por estado">
					<option value="todos">Todos los estados</option>
					{#each ESTADOS_FACTURADOR as estado}
						<option value={estado}>{estado}</option>
					{/each}
				</select>
			</label>
			<button
				type="button"
				class="btn-suave variables-boton"
				class:con-cambios={variablesSucias}
				onclick={alternarPanelVariables}
			>
				Variables ({variables.length})
				{#if variablesSucias}<span class="punto-cambios" title="Cambios sin guardar"></span>{/if}
			</button>
		{/if}
		{#if vista === 'bandeja'}
			<button type="button" class="btn-suave" onclick={() => (modalEnviados = true)}>
				Ver Enviados a facturar
			</button>
		{/if}
	</div>
</div>

{#if error}
	<p class="mensaje error-mensaje" role="alert">{error}</p>
{/if}
{#if aviso}
	<p class="mensaje ok-mensaje" role="status">{aviso}</p>
{/if}

{#if cargando}
	<div class="estado-vacio"><p>Cargando facturas…</p></div>
{:else if grupos.length === 0}
	<div class="estado-vacio">
		<span class="estado-icono">{@html iconos.factura}</span>
		<h1>{vista === 'facturador' ? 'Sin facturas en proceso' : 'Bandeja vacía'}</h1>
		<p>
			{vista === 'facturador'
				? 'Enviá plantillas desde la pestaña Plantillas para generar las facturas del período.'
				: 'Las facturas enviadas desde el Facturador aparecen acá.'}
		</p>
	</div>
{:else}
	<div class="tabla" role="table" aria-label={vista === 'facturador' ? 'Facturas en proceso' : 'Bandeja de facturas'}>
		<div class="cabecera-tabla" class:con-orden={vista === 'bandeja'} role="row">
			<span><input type="checkbox" aria-label="Seleccionar todas las facturas" /></span>
			{#if vista === 'bandeja'}<span>Orden</span>{/if}
			<span>Contacto</span>
			<span>Adenda / comentario general</span>
			<span>Código</span>
			<span>Artículo detalle</span>
			<span>Cantidad</span>
			<span>Importe unitario</span>
			<span>Fecha</span>
			<span>Estado</span>
			<span aria-hidden="true"></span>
		</div>

		{#each grupos as grupo (grupo.id)}
			<div class="grupo">
				<div
					class="cabecera-grupo"
					style="background: {grupo.colorFondo}; color: {grupo.colorTexto}"
				>
					<input
						type="checkbox"
						checked={grupoSeleccionado(grupo.facturas)}
						onchange={() => seleccionarGrupo(grupo.facturas)}
						aria-label={`Seleccionar grupo ${grupo.nombre}`}
					/>
					<button
						type="button"
						class="chevron-grupo"
						aria-label={`${gruposCerrados.includes(grupo.id) ? 'Expandir' : 'Colapsar'} grupo ${grupo.nombre}`}
						onclick={() => alternarGrupo(grupo.id)}
					>
						{gruposCerrados.includes(grupo.id) ? '›' : '⌄'}
					</button>
					<span class="etiqueta-grupo">{grupo.nombre}</span>
					<span class="resumen-grupo">
						{grupo.facturas.length} {grupo.facturas.length === 1 ? 'factura' : 'facturas'} ·
						{grupo.facturas.reduce((total, factura) => total + factura.lineas.length, 0)}
						{grupo.facturas.reduce((total, factura) => total + factura.lineas.length, 0) === 1 ? ' línea' : ' líneas'}
					</span>
				</div>

				{#if !gruposCerrados.includes(grupo.id)}
					{#each grupo.facturas as factura (factura.id)}
						<div
							class="fila"
							class:con-orden={vista === 'bandeja'}
							class:seleccionada-fila={seleccionadas.includes(factura.id)}
							class:par={paridad.get(factura.id)}
							role="row"
						>
							<span class="celda">
								<input
									type="checkbox"
									checked={seleccionadas.includes(factura.id)}
									onchange={() => alternarSeleccion(factura.id)}
									aria-label={`Seleccionar ${factura.contactoFacturacion}`}
								/>
							</span>

							{#if vista === 'bandeja'}
								<span class="celda orden">
									<input
										type="text"
										inputmode="numeric"
										class="entrada-orden"
										value={factura.ordenManual ?? ''}
										placeholder="—"
										aria-label={`Orden de ${factura.contactoFacturacion}`}
										title="Número de orden en la Bandeja"
										onblur={(evento) => guardarOrden(factura, evento.currentTarget.value)}
										onkeydown={(evento) => {
											if (evento.key === 'Enter') evento.currentTarget.blur();
										}}
									/>
									{#if factura.ordenManual !== null}
										<button
											type="button"
											class="quitar-orden"
											aria-label={`Quitar el orden de ${factura.contactoFacturacion}`}
											title="Quitar orden"
											onclick={() => guardarOrden(factura, '')}
										>
											×
										</button>
									{/if}
								</span>
							{/if}

							<span class="celda">
								<strong class="contacto">{factura.contactoFacturacion}</strong>
								<span class="chips">
									<ChipSelect
										variante="comprobante"
										valor={factura.tipoComprobante ?? ''}
										opciones={(catalogos?.tiposComprobantes ?? [])
											.filter((opcion) => opcion.activo || opcion.nombre === factura.tipoComprobante)
											.map((opcion) => ({
												valor: opcion.nombre,
												etiqueta: opcion.nombre,
												abreviatura: opcion.abreviatura
											}))}
										placeholder="Comprobante"
										disabled={vista !== 'facturador'}
										ariaLabel={`Tipo de comprobante de ${factura.contactoFacturacion}`}
										onchange={(valor) => cambiarChipFactura(factura, 'tipoComprobante', valor)}
									/>
									<ChipSelect
										variante="moneda"
										valor={factura.moneda}
										opciones={(catalogos?.monedas ?? [])
											.filter((opcion) => opcion.activo || opcion.codigo === factura.moneda)
											.map((opcion) => ({
												valor: opcion.codigo,
												etiqueta: opcion.codigo,
												abreviatura: opcion.codigo
											}))}
										placeholder="Moneda"
										disabled={vista !== 'facturador'}
										ariaLabel={`Moneda de ${factura.contactoFacturacion}`}
										onchange={(valor) => cambiarChipFactura(factura, 'moneda', valor)}
									/>
									<ChipSelect
										variante="precio"
										valor={factura.tipoPrecio ?? ''}
										opciones={preciosParaMoneda(factura.moneda)
											.filter((opcion) => opcion.activo || opcion.nombre === factura.tipoPrecio)
											.map((opcion) => ({
												valor: opcion.nombre,
												etiqueta: opcion.nombre
											}))}
										placeholder="Precio"
										disabled={vista !== 'facturador'}
										ariaLabel={`Tipo de precio de ${factura.contactoFacturacion}`}
										onchange={(valor) => cambiarChipFactura(factura, 'tipoPrecio', valor)}
									/>
									{#if editandoIdCliente === factura.id}
										<input
											class="chip chip-cliente entrada-id"
											type="text"
											inputmode="numeric"
											bind:value={borradorIdCliente}
											placeholder="ID"
											onblur={() => guardarIdClienteFactura(factura)}
											onkeydown={(evento) => {
												if (evento.key === 'Enter') guardarIdClienteFactura(factura);
												if (evento.key === 'Escape') editandoIdCliente = null;
											}}
											aria-label={`ID de cliente de ${factura.contactoFacturacion}`}
										/>
									{:else}
										<button
											type="button"
											class="chip chip-cliente"
											disabled={vista !== 'facturador'}
											onclick={() => empezarIdClienteFactura(factura)}
											title="Editar ID de cliente"
										>
											{factura.idCliente ?? 'Sin ID'}
										</button>
									{/if}
									<ChipAuxiliar
										etiqueta="ID Compra"
										valor={factura.idCompra}
										onclick={() => abrirModal(factura)}
									/>
									<ChipAuxiliar
										etiqueta="Vence"
										valor={formatearFecha(factura.uteVencimiento) || null}
										onclick={() => abrirModal(factura)}
									/>
									<ChipAuxiliar
										etiqueta="Detalle"
										valor={factura.detalleAuxiliar}
										onclick={() => abrirModal(factura)}
									/>
									<ChipAuxiliar
										etiqueta="Info. adicional"
										valor={factura.informacionAdicional}
										onclick={() => abrirModal(factura)}
									/>
								</span>
							</span>

							<span class="celda comentario">
								{#if edicionGeneral === factura.id}
									<input
										class="entrada"
										bind:value={borrador}
										onblur={() => guardarComentarioGeneral(factura.id)}
										onkeydown={(evento) => {
											if (evento.key === 'Enter') guardarComentarioGeneral(factura.id);
											if (evento.key === 'Escape') edicionGeneral = null;
										}}
										aria-label="Comentario general"
									/>
								{:else}
									<button
										type="button"
										class="texto-editable"
										onclick={() => empezarComentarioGeneral(factura)}
										disabled={vista !== 'facturador'}
									>
										{factura.comentarioGeneral ?? '—'}
									</button>
								{/if}
							</span>

							<div class="col-lineas">
								{#each factura.lineas as linea (linea.id)}
									{@const enEdicion =
										edicion?.facturaId === factura.id &&
										edicion?.lineaId === linea.id &&
										edicion?.campo === 'codigo'}
									<span class="sub celda-editable">
										{#if enEdicion}
											<input
												class="entrada"
												bind:value={borrador}
												oninput={() => (popoverCodigo = true)}
												onblur={() => guardarLinea('codigo')}
												onkeydown={(evento) => {
													if (evento.key === 'Enter') guardarLinea('codigo');
													if (evento.key === 'Escape') {
														edicion = null;
														popoverCodigo = false;
													}
												}}
												aria-label="Código de artículo"
											/>
											{#if popoverCodigo && sugerenciasCodigo.length > 0}
												<div class="popover">
													{#each sugerenciasCodigo as articulo (articulo.id)}
														<button
															type="button"
															onmousedown={(evento) => {
																evento.preventDefault();
																borrador = articulo.codigo;
																void guardarLinea('codigo');
															}}
														>
															<strong>{articulo.codigo}</strong>
															<span>{articulo.descripcion}</span>
														</button>
													{/each}
												</div>
											{/if}
										{:else}
											<button
												type="button"
												class="texto-editable codigo"
												title={linea.descripcion}
												onclick={() => empezarEdicion(factura.id, linea.id, 'codigo', linea.codigo)}
												disabled={vista !== 'facturador'}
											>
												{linea.codigo}
											</button>
										{/if}
									</span>
								{/each}
							</div>

							<div class="col-lineas">
								{#each factura.lineas as linea (linea.id)}
									{@const editando =
										edicion?.facturaId === factura.id &&
										edicion?.lineaId === linea.id &&
										edicion?.campo === 'detalle'}
									<span class="sub celda-editable">
										{#if editando}
											<input
												class="entrada"
												bind:value={borrador}
												onblur={() => guardarLinea('detalle')}
												onkeydown={(evento) => {
													if (evento.key === 'Enter') guardarLinea('detalle');
													if (evento.key === 'Escape') edicion = null;
												}}
												aria-label="Detalle del artículo"
											/>
										{:else}
											<button
												type="button"
												class="texto-editable"
												onclick={() => empezarEdicion(factura.id, linea.id, 'detalle', linea.detalle ?? '')}
												disabled={vista !== 'facturador'}
											>
												{linea.detalle ?? '—'}
											</button>
										{/if}
									</span>
								{/each}
							</div>

							<div class="col-lineas">
								{#each factura.lineas as linea (linea.id)}
									{@const editando =
										edicion?.facturaId === factura.id &&
										edicion?.lineaId === linea.id &&
										edicion?.campo === 'cantidad'}
									<span class="sub celda-editable">
										{#if editando}
											<input
												class="entrada numero"
												bind:value={borrador}
												onblur={() => guardarLinea('cantidad')}
												onkeydown={(evento) => {
													if (evento.key === 'Enter') guardarLinea('cantidad');
													if (evento.key === 'Escape') edicion = null;
												}}
												aria-label="Cantidad"
											/>
										{:else}
											<button
												type="button"
												class="texto-editable"
												onclick={() => empezarEdicion(factura.id, linea.id, 'cantidad', linea.cantidad)}
												disabled={vista !== 'facturador'}
											>
												{formatearCantidad(linea.cantidad)}
											</button>
										{/if}
									</span>
								{/each}
							</div>

							<div class="col-lineas">
								{#each factura.lineas as linea (linea.id)}
									{@const editando =
										edicion?.facturaId === factura.id &&
										edicion?.lineaId === linea.id &&
										edicion?.campo === 'importe'}
									<span class="sub celda-editable">
										{#if editando}
											<input
												class="entrada numero"
												bind:value={borrador}
												onblur={() => guardarLinea('importe')}
												onkeydown={(evento) => {
													if (evento.key === 'Enter') guardarLinea('importe');
													if (evento.key === 'Escape') edicion = null;
												}}
												aria-label="Importe unitario"
											/>
										{:else}
											<button
												type="button"
												class="texto-editable importe"
												onclick={() => empezarEdicion(factura.id, linea.id, 'importe', linea.importeUnitario)}
												disabled={vista !== 'facturador'}
											>
												{formatearImporte(linea.importeUnitario, factura.moneda)}
											</button>
										{/if}
									</span>
								{/each}
							</div>

							<span class="celda">
								{#if edicionFecha === factura.id}
									<input
										class="entrada"
										type="text"
										inputmode="numeric"
										bind:value={borradorFecha}
										placeholder="dd/mm/aaaa"
										onblur={() => guardarFecha(factura.id, borradorFecha)}
										onkeydown={(evento) => {
											if (evento.key === 'Enter') guardarFecha(factura.id, borradorFecha);
											if (evento.key === 'Escape') edicionFecha = null;
										}}
										aria-label="Fecha de la factura"
									/>
								{:else}
									<button
										type="button"
										class="texto-editable"
										onclick={() => {
											borradorFecha = formatearFecha(factura.fecha);
											edicionFecha = factura.id;
										}}
										disabled={vista !== 'facturador'}
										title="Editar fecha"
									>
										{formatearFecha(factura.fecha) || '—'}
									</button>
								{/if}
							</span>

							<span class="celda">
								<span class="insignia {claseEstado(factura.estado)}">{etiquetaEstado(factura.estado)}</span>
								{#if factura.estado === 'PENDIENTE' && factura.motivoPendiente}
									<span class="meta" title={factura.motivoPendiente}>{factura.motivoPendiente}</span>
								{/if}
							</span>

							<span class="celda acciones-fila">
								<button
									type="button"
									class="btn-icono"
									aria-label={`Editar ${factura.contactoFacturacion}`}
									title="Editar factura"
									onclick={() => abrirModal(factura)}
								>
									{@html iconos.lapiz}
								</button>
							</span>
						</div>
					{/each}
				{/if}
			</div>
		{/each}
	</div>
{/if}

{#if seleccionadas.length > 0}
	<BarraLotes
		etiqueta={`${seleccionadas.length} ${seleccionadas.length === 1 ? 'factura seleccionada' : 'facturas seleccionadas'}`}
	>
			{#if vista === 'facturador'}
				<button type="button" class="lote-accion" onclick={abrirEnvioABandeja} disabled={ocupado}>
					<span class="lote-icono">{@html iconos.enviar}</span>
					<span class="lote-etiqueta">Enviar a Bandeja</span>
				</button>
			{:else}
				<label class="lote-check">
					<input
						type="checkbox"
						checked={false}
						onchange={deseleccionarTodas}
						aria-label="Deseleccionar todas las facturas"
					/>
					<span>Deseleccionar todos</span>
				</label>
				<button type="button" class="lote-accion" onclick={devolverSeleccionadas} disabled={ocupado}>
					<span class="lote-icono">{@html iconos.enviar}</span>
					<span class="lote-etiqueta">Devolver a Facturador</span>
				</button>
				<button
					type="button"
					class="lote-accion"
					disabled
					title="Próximamente"
					aria-disabled="true"
				>
					<span class="lote-icono">{@html iconos.factura}</span>
					<span class="lote-etiqueta">Facturar API</span>
				</button>
				<button
					type="button"
					class="lote-accion"
					onclick={generarMultifacturacion}
					disabled={ocupado}
				>
					<span class="lote-icono">{@html iconos.descargar}</span>
					<span class="lote-etiqueta">Generar Multifacturación</span>
				</button>
				<button type="button" class="lote-accion" onclick={() => cambiarEstadoLote('FACTURADO')} disabled={ocupado}>
					<span class="lote-icono">{@html iconos.tilda}</span>
					<span class="lote-etiqueta">Facturado</span>
				</button>
				<button type="button" class="lote-accion" onclick={() => cambiarEstadoLote('COBRADO')} disabled={ocupado}>
					<span class="lote-icono">{@html iconos.centro}</span>
					<span class="lote-etiqueta">Cobrado</span>
				</button>
			{/if}
			<button type="button" class="lote-accion" onclick={eliminarSeleccionadas} disabled={ocupado}>
				<span class="lote-icono">{@html iconos.papelera}</span>
				<span class="lote-etiqueta">Eliminar</span>
			</button>
	</BarraLotes>
{/if}

<!-- Histórico de envíos a facturar (solo Bandeja) -->
{#if modalEnviados}
	<ModalEnviadosFacturar onCerrar={() => (modalEnviados = false)} />
{/if}

<!-- Modal de edición de la factura: cabecera, auxiliares y líneas -->
{#if documentoModal}
	<ModalDocumento
		documento={documentoModal}
		articulos={catalogos?.articulos ?? []}
		opcionesMoneda={(catalogos?.monedas ?? []).map((moneda) => moneda.codigo)}
		opcionesComprobante={(catalogos?.tiposComprobantes ?? []).map((comprobante) => comprobante.nombre)}
		opcionesPrecio={preciosParaMoneda(documentoModal.moneda).map((precio) => precio.nombre)}
		soloLectura={vista !== 'facturador'}
		{ocupado}
		{error}
		etiquetas={[
			{ etiqueta: 'Gestión', valor: modalFactura?.tipoGestion ?? '' },
			{ etiqueta: 'Cliente', valor: modalFactura?.tipoCliente ?? '' },
			{ etiqueta: 'Cobranza', valor: modalFactura?.modalidadCobranza ?? '' },
			{ etiqueta: 'Facturación', valor: modalFactura?.tipoGestionFacturacion ?? '' }
		]}
		onCerrar={cerrarModales}
		onCabecera={guardarCabeceraDocumento}
		onLinea={guardarLineaDocumento}
		onAgregar={agregarLineaDocumento}
		onEliminar={eliminarLineaDocumento}
		onMarcarPendiente={vista === 'facturador' && modalFactura?.estado !== 'PENDIENTE'
			? marcarPendienteDesdeModal
			: undefined}
		onEliminarDocumento={vista === 'facturador' ? eliminarDesdeModal : undefined}
	/>
{/if}

<!-- Modal de envío a Bandeja -->
{#if modalEnvio}
	<div
		class="fondo-modal"
		role="presentation"
		tabindex="-1"
		onclick={cerrarModales}
		onkeydown={(evento) => {
			if (evento.key === 'Escape') cerrarModales();
		}}
	>
		<div class="modal" role="dialog" aria-modal="true" tabindex="-1" aria-label="Enviar a Bandeja" onclick={(evento) => evento.stopPropagation()} onkeydown={(evento) => evento.stopPropagation()}>
			<header class="modal-cabecera">
				<h2>Enviar a Bandeja</h2>
				<button type="button" class="btn-cerrar" aria-label="Cerrar" onclick={cerrarModales}>×</button>
			</header>

			<div class="modal-cuerpo">
				{#if errorEnvio}
					<p class="mensaje error-mensaje" role="alert">{errorEnvio}</p>
				{/if}

				<p class="meta">
					Se aplica la fecha de cada factura y se sustituyen las variables de los comentarios.
				</p>

				{#if variablesDelLote.length > 0}
					<p class="meta">
						Variables del lote ({variablesDelLote.length} de {variablesDelLote.length} completas):
					</p>
					<ul class="lista-variables-lote">
						{#each variablesDelLote as [clave, nombre] (clave)}
							<li>
								<span>{nombre}</span>
								<strong>{valorVariable(clave)}</strong>
							</li>
						{/each}
					</ul>
					<p class="meta">
						Si necesitás cambiarlas, cerrá este aviso y editá el panel de Variables.
					</p>
				{/if}
			</div>

			<footer class="modal-pie">
				<button type="button" class="btn-secundario" onclick={cerrarModales} disabled={ocupado}>Cancelar</button>
				<button type="button" class="btn-primario" onclick={enviarABandeja} disabled={ocupado}>
					{ocupado ? 'Enviando…' : 'Enviar a Bandeja'}
				</button>
			</footer>
		</div>
	</div>
{/if}

<!-- Modal de pendiente -->
{#if modalPendiente}
	<div
		class="fondo-modal"
		role="presentation"
		tabindex="-1"
		onclick={cerrarModales}
		onkeydown={(evento) => {
			if (evento.key === 'Escape') cerrarModales();
		}}
	>
		<div class="modal" role="dialog" aria-modal="true" tabindex="-1" aria-label="Marcar pendiente" onclick={(evento) => evento.stopPropagation()} onkeydown={(evento) => evento.stopPropagation()}>
			<header class="modal-cabecera">
				<h2>Marcar pendiente</h2>
				<button type="button" class="btn-cerrar" aria-label="Cerrar" onclick={cerrarModales}>×</button>
			</header>

			<div class="modal-cuerpo">
				<label class="campo ancho">
					<span>Motivo</span>
					<textarea rows="3" bind:value={motivo} placeholder="Por qué no se pudo facturar o qué trámite falta"></textarea>
				</label>
			</div>

			<footer class="modal-pie">
				<button type="button" class="btn-secundario" onclick={cerrarModales} disabled={ocupado}>Cancelar</button>
				<button type="button" class="btn-primario" onclick={marcarPendiente} disabled={ocupado}>Guardar</button>
			</footer>
		</div>
	</div>
{/if}

<!-- Panel flotante de variables: solo en el Facturador. -->
{#if vista === 'facturador' && panelVariables}
	<aside
		class="panel-variables"
		class:arrastrando={arrastrandoPanel}
		style="left: {posicionPanel.x}px; top: {posicionPanel.y}px"
		aria-label="Variables de la facturación"
	>
		<header class="panel-cabecera">
			<button
				type="button"
				class="panel-agarre"
				aria-label="Arrastrar para mover"
				title="Arrastrar para mover"
				onpointerdown={iniciarArrastre}
			>
				⠿
			</button>
			<h2>Variables y período</h2>
			<button
				type="button"
				class="btn-cerrar"
				aria-label="Cerrar variables"
				onclick={() => (panelVariables = false)}
				onpointerdown={(evento) => evento.stopPropagation()}
			>
				×
			</button>
		</header>

		<div class="panel-cuerpo">
			{#if error}
				<p class="panel-aviso aviso-error" role="alert">{error}</p>
			{:else if avisoVariables}
				<p class="panel-aviso" class:aviso-error={variablesFaltantesLote.length > 0} role="status">
					{avisoVariables}
				</p>
			{/if}

			<div class="panel-seccion">
				<span class="panel-seccion-titulo">Período en proceso</span>
				<label class="panel-campo">
					<span>Mes/año</span>
					<input
						type="month"
						value={borradorPeriodo}
						oninput={(evento) => cambiarBorradorPeriodo(evento.currentTarget.value)}
					/>
				</label>
				<label class="panel-campo">
					<span>Fecha general de facturación</span>
					<input
						type="text"
						inputmode="numeric"
						value={borradorFechaGeneral}
						oninput={(evento) => {
							borradorFechaGeneral = evento.currentTarget.value;
							configEditada = true;
						}}
						placeholder="dd/mm/aaaa"
					/>
				</label>
				<p class="panel-ayuda">
					Se aplican a las facturas que se envíen desde Plantillas y quedan guardados.
				</p>
			</div>

			<div class="panel-seccion">
				<span class="panel-seccion-titulo">Variables</span>
				<p class="panel-ayuda">
					En los textos se escriben como <code>{'{{nombre}}'}</code> y no distinguen mayúsculas.
					Guardá los valores y se reutilizan en los próximos envíos.
				</p>

				<div class="fila-variable">
					<input bind:value={nuevaVariable} placeholder="nueva-variable" aria-label="Nombre de la variable" />
					<button type="button" class="btn-primario" onclick={agregarVariable}>Agregar</button>
				</div>

				<ul class="lista-variables">
					{#each variablesPanel as variable (variable.nombre)}
						{@const clave = claveVariable(variable.nombre)}
						{@const enLote = variablesDelLote.some(([claveLote]) => claveLote === clave)}
						{@const faltante = enLote && !variable.valor.trim()}
						<li class:faltante>
							<div class="variable-encabezado">
								<span class="nombre-variable">{variable.nombre}</span>
								{#if enLote}<span class="marca-lote">en el lote</span>{/if}
							</div>
							<div class="variable-fila">
								<input
									class="valor-variable"
									value={variable.valor}
									oninput={(evento) => asignarValor(variable.nombre, evento.currentTarget.value)}
									placeholder="Valor a sustituir"
									aria-label={`Valor de ${variable.nombre}`}
								/>
								<button
									type="button"
									class="btn-icono"
									aria-label={`Eliminar ${variable.nombre}`}
									onclick={() => borrarVariable(variable.nombre)}
								>
									{@html iconos.papelera}
								</button>
							</div>
						</li>
					{:else}
						<li class="vacio">Sin variables creadas.</li>
					{/each}
				</ul>
			</div>
		</div>

		<footer class="panel-pie">
			<span class="panel-estado" class:con-cambios={panelSucio}>
				{panelSucio ? 'Cambios sin guardar' : 'Guardado'}
			</span>
			<button
				type="button"
				class="btn-primario"
				onclick={guardarPanel}
				disabled={guardandoVariables || !panelSucio}
			>
				{guardandoVariables ? 'Guardando…' : 'Guardar'}
			</button>
		</footer>
	</aside>
{/if}

<style>
	.barra-herramientas { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1.15rem; padding: 1rem 1.15rem; border: 1px solid var(--borde); border-radius: 1rem; background: var(--superficie-panel); }
	.buscador { display: flex; align-items: center; gap: .65rem; width: min(22rem, 100%); padding: .68rem .8rem; border: 1px solid var(--borde); border-radius: .75rem; background: var(--superficie-alta); color: var(--texto); }
	.buscador span { display: grid; width: 1rem; place-items: center; font-size: .8rem; }
	.buscador input { width: 100%; border: 0; outline: 0; background: transparent; color: var(--texto); font: inherit; font-size: .75rem; }
	.controles { display: flex; align-items: center; gap: .8rem; color: var(--texto-suave); font-size: .68rem; white-space: nowrap; }
	.selector { display: grid; gap: 1px; padding: 0; border: 0; background: transparent; }
	.selector .etiqueta { color: var(--texto-suave); font-size: .6rem; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; }
	.selector select { width: 100%; min-height: 2.5rem; appearance: none; padding: .5rem 2rem .5rem .7rem; border: 1px solid var(--borde); border-radius: .7rem; background-color: var(--superficie); background-image: var(--chevron-select); background-repeat: no-repeat; background-position: right .7rem center; background-size: .65rem; color: var(--texto); font: inherit; font-size: .72rem; cursor: pointer; }
	.btn-suave { border: 1px solid var(--borde); border-radius: .7rem; padding: .62rem .85rem; background: var(--superficie-alta); color: var(--texto-suave); font: inherit; font-size: .7rem; font-weight: 700; cursor: pointer; }
	.mensaje { margin: 0 0 1rem; padding: .7rem .9rem; border-radius: .7rem; font-size: .74rem; }
	.error-mensaje { border: 1px solid var(--peligro-borde); background: var(--peligro-tenue); color: var(--peligro-texto); }
	.ok-mensaje { border: 1px solid var(--exito-borde); background: var(--exito-tenue); color: var(--exito-texto); }
	.tabla { overflow: visible; border: 1px solid var(--borde); border-radius: 1rem 1rem 0 0; background: var(--superficie-panel); box-shadow: 0 12px 30px rgba(49, 64, 129, .08); }
	.cabecera-tabla, .fila { display: grid; grid-template-columns: 3.2rem minmax(15rem, 1.35fr) minmax(15rem, 1.6fr) 5.5rem minmax(11rem, 1fr) 5.5rem 8.5rem 7.5rem 6.5rem 3.7rem; align-items: center; }
	.cabecera-tabla.con-orden, .fila.con-orden { grid-template-columns: 3.2rem 3.4rem minmax(15rem, 1.35fr) minmax(15rem, 1.6fr) 5.5rem minmax(11rem, 1fr) 5.5rem 8.5rem 7.5rem 6.5rem 3.7rem; }
	.celda.orden { display: flex; align-items: center; gap: .1rem; }
	.entrada-orden { width: 2rem; padding: .18rem .2rem; border: 1px solid var(--borde-suave); border-radius: .35rem; background: var(--superficie); color: var(--texto); font: inherit; font-size: .68rem; text-align: center; }
	.entrada-orden::placeholder { color: var(--texto-tenue); }
	.quitar-orden { width: 1rem; height: 1rem; padding: 0; border: 0; background: transparent; color: var(--texto-tenue); font-size: .78rem; line-height: 1; cursor: pointer; }
	.quitar-orden:hover { color: var(--peligro-texto); }
	.cabecera-tabla { min-height: 3.1rem; padding: 0 .35rem; border-radius: 1rem 1rem 0 0; background: var(--tabla-gradiente); color: white; font-size: .62rem; font-weight: 800; text-transform: uppercase; }
	.cabecera-tabla span:not(:first-child) { padding-left: .45rem; }
	.cabecera-grupo { position: relative; display: flex; align-items: center; gap: .7rem; min-height: 3.25rem; padding: 0 .35rem; }
	.etiqueta-grupo { padding: .35rem .72rem; border-radius: .55rem; background: rgba(255,255,255,.18); color: inherit; font-size: .68rem; font-weight: 800; }
	.cabecera-grupo input[type='checkbox'] { accent-color: #fff; }
	.resumen-grupo { margin-left: auto; font-size: .68rem; }
	.chevron-grupo { width: 1rem; border: 0; background: transparent; color: inherit; font-size: .9rem; cursor: pointer; }
	.fila { position: relative; min-height: 2.4rem; padding: var(--fila-padding-y, 2px) .35rem; border-bottom: var(--tabla-linea-grosor, 1px) solid var(--tabla-linea-color, var(--borde-suave)); font-size: .72rem; }
	.fila .celda, .fila .col-lineas { padding-left: .45rem; min-width: 0; }
	.fila { background: var(--fila-impar-fondo, var(--superficie)); color: var(--fila-impar-texto, var(--texto)); }
	.fila.par { background: var(--fila-par-fondo, var(--superficie-suave)); color: var(--fila-par-texto, var(--texto)); }
	/* La selección NO reemplaza el fondo: se marca con un velo tenue encima del
	   color alternado y un anillo interior, así la fila conserva su color. */
	.fila.seleccionada-fila { background-image: linear-gradient(rgba(80,72,245,.14), rgba(80,72,245,.14)); box-shadow: inset 0 0 0 2px var(--primario); }
	.contacto { display: block; font-weight: 700; font-size: .72rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	/* Chips editables: comprobante, moneda, precio e ID de cliente. */
	.chips { display: flex; align-items: center; gap: .3rem; flex-wrap: wrap; margin-top: .3rem; }
	.chip {
		appearance: none;
		border: 1px solid;
		border-radius: 999px;
		padding: .16rem .55rem;
		background: transparent;
		font: inherit;
		font-size: .6rem;
		font-weight: 700;
		line-height: 1.2;
		cursor: pointer;
	}
	.chip:disabled { opacity: .75; cursor: default; }
	.chip-cliente { border-color: var(--rosa-borde); background: var(--rosa-tenue); color: var(--rosa-texto); }
	.chip.entrada-id { width: 4.2rem; text-align: center; }
	.meta { display: block; color: var(--texto-suave); font-size: .62rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.comentario { color: var(--texto-suave); font-size: .68rem; line-height: 1.35; overflow: hidden; text-overflow: ellipsis; }
	.col-lineas { display: flex; flex-direction: column; justify-content: center; }
	.sub { display: block; padding: 2px 0; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.celda-editable { position: relative; }
	.texto-editable { display: block; width: 100%; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: text; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.texto-editable:disabled { cursor: default; }
	.texto-editable:hover:not(:disabled) { color: var(--primario-texto); text-decoration: underline dotted rgba(80, 72, 245, .45); text-underline-offset: 3px; }
	.texto-editable.codigo { text-decoration: underline dotted rgba(80, 72, 245, .35); text-underline-offset: 3px; }
	.texto-editable.importe { font-size: .78rem; font-weight: 600; }
	.entrada { width: 100%; padding: .16rem .3rem; border: 1px solid var(--primario); border-radius: .35rem; background: var(--superficie); font: inherit; font-size: .7rem; }
	.entrada.numero { text-align: right; }
	.popover { position: absolute; top: 1.35rem; left: 0; z-index: 60; display: grid; width: 17rem; padding: .3rem; border: 1px solid var(--borde); border-radius: .6rem; background: var(--superficie); box-shadow: 0 14px 30px rgba(30, 43, 96, .18); }
	.popover button { display: grid; gap: .1rem; padding: .35rem .45rem; border: 0; border-radius: .4rem; background: transparent; color: var(--texto); text-align: left; font: inherit; font-size: .66rem; cursor: pointer; }
	.popover button:hover { background: var(--primario-tenue); }
	.popover button span { color: var(--texto-suave); }
	/* Estado como píldora con punto, igual que la maqueta. */
	.insignia {
		display: inline-flex;
		align-items: center;
		gap: .35rem;
		padding: .28rem .65rem;
		border: 1px solid;
		border-radius: 999px;
		font-size: .62rem;
		font-weight: 700;
		white-space: nowrap;
	}
	.insignia::before {
		content: '';
		width: .38rem;
		height: .38rem;
		border-radius: 50%;
		background: currentColor;
	}
	.estado-proceso { border-color: var(--info-borde); background: var(--info-tenue); color: var(--info-texto); }
	.estado-pendiente { border-color: var(--alerta-borde); background: var(--alerta-tenue); color: var(--alerta-texto); }
	.estado-bandeja { border-color: var(--primario-borde); background: var(--primario-tenue); color: var(--primario-texto); }
	.estado-facturado { border-color: var(--exito-borde); background: var(--exito-tenue); color: var(--exito-texto); }
	.estado-cobrado { border-color: var(--teal-borde); background: var(--teal-tenue); color: var(--teal-texto); }
	.estado-eliminado { border-color: var(--borde); background: var(--superficie-suave); color: var(--texto-suave); }
	input[type='checkbox'] { width: 1rem; height: 1rem; accent-color: var(--foco); cursor: pointer; }
	.acciones-fila { position: relative; display: flex; justify-content: center; }
	.btn-icono { display: grid; place-items: center; width: 2.15rem; height: 2.15rem; border: 1px solid var(--borde); border-radius: .65rem; background: transparent; color: var(--texto-suave); font-size: .95rem; cursor: pointer; transition: background 150ms ease, color 150ms ease, border-color 150ms ease; }
	.btn-icono:hover { background: var(--primario-tenue); border-color: var(--borde-fuerte); color: var(--primario-texto); }
	.btn-icono:focus-visible { outline: 2px solid var(--foco); outline-offset: 2px; }

	/* La barra flotante vive en BarraLotes.svelte. */


	.lote-check { display: flex; align-items: center; gap: .35rem; padding: 0 .3rem; color: var(--barra-lotes-tecla-texto); font-size: .66rem; font-weight: 700; cursor: pointer; }
	.lote-check input { accent-color: var(--foco); }








	.estado-vacio { display: grid; place-items: center; gap: .35rem; min-height: 20rem; padding: 2rem; border: 1px solid var(--borde); border-radius: 1rem; background: var(--superficie-panel); text-align: center; }
	.estado-icono { color: var(--primario-texto); font-size: 2rem; } .estado-vacio h1 { margin: .5rem 0 0; font-size: 1.4rem; } .estado-vacio p { color: var(--texto-suave); font-size: .85rem; }

	.fondo-modal { position: fixed; inset: 0; z-index: 70; display: grid; place-items: center; padding: 1.5rem; background: var(--velo-modal); }
	.modal { display: grid; width: min(44rem, 100%); max-height: 88vh; overflow: auto; border-radius: 1rem; background: var(--modal-fondo); box-shadow: var(--sombra-modal); }
	.modal-cabecera { display: flex; align-items: start; justify-content: space-between; gap: 1rem; padding: 1.1rem 1.25rem; border-bottom: 1px solid var(--borde-suave); }
	.modal-cabecera h2 { margin: 0; font-size: .95rem; }
	.btn-cerrar { border: 0; background: transparent; color: var(--texto-suave); font-size: 1.3rem; line-height: 1; cursor: pointer; }
	.modal-cuerpo { display: grid; gap: .85rem; padding: 1.1rem 1.25rem; }
	.campo { display: grid; gap: .3rem; }
	.campo span { color: var(--texto-suave); font-size: .66rem; font-weight: 700; text-transform: uppercase; }
	.campo textarea { padding: .55rem .65rem; border: 1px solid var(--borde); border-radius: .6rem; background: var(--superficie-alta); color: var(--texto); font: inherit; font-size: .74rem; }
	.campo.ancho { grid-column: 1 / -1; }
	.campos-fila { display: flex; flex-wrap: wrap; gap: .4rem; }
	.chip { padding: .3rem .55rem; border: 1px solid var(--borde-suave); border-radius: .5rem; background: var(--superficie-alta); color: var(--texto-suave); font-size: .62rem; }
	.modal-pie { display: flex; justify-content: flex-end; gap: .55rem; padding: 1rem 1.25rem; border-top: 1px solid var(--borde-suave); }
	.btn-primario { border: 0; border-radius: .7rem; padding: .62rem 1rem; background: var(--primario); color: var(--texto-inverso); font: inherit; font-size: .72rem; font-weight: 700; cursor: pointer; }
	.btn-secundario { border: 1px solid var(--borde); border-radius: .7rem; padding: .62rem 1rem; background: var(--superficie-alta); color: var(--texto-suave); font: inherit; font-size: .72rem; font-weight: 700; cursor: pointer; }
	.btn-peligro { border: 1px solid var(--peligro-borde); border-radius: .7rem; padding: .62rem 1rem; background: var(--peligro-tenue); color: var(--peligro-texto); font: inherit; font-size: .72rem; font-weight: 700; cursor: pointer; }
	.btn-primario:disabled, .btn-secundario:disabled, .btn-peligro:disabled { opacity: .55; cursor: progress; }
	.fila-variable { display: flex; gap: .5rem; }
	.fila-variable input { flex: 1; padding: .55rem .65rem; border: 1px solid var(--borde); border-radius: .6rem; background: var(--superficie-alta); font: inherit; font-size: .74rem; }
	.lista-variables { display: grid; gap: .3rem; margin: 0; padding: 0; list-style: none; }
	.lista-variables li { display: flex; align-items: center; gap: .5rem; padding: .35rem .5rem; border: var(--lista-linea-grosor, 1px) solid var(--lista-linea-color, var(--borde-suave)); border-radius: .55rem; font-size: .72rem; }
	.nombre-variable { min-width: 7rem; font-weight: 700; }
	.valor-variable { flex: 1; min-width: 6rem; padding: .4rem .5rem; border: 1px solid var(--borde); border-radius: .5rem; background: var(--superficie-alta); color: var(--texto); font: inherit; font-size: .7rem; }
	.lista-variables li.vacio { justify-content: center; color: var(--texto-suave); font-size: .68rem; }
	code { padding: .1rem .3rem; border-radius: .3rem; background: var(--primario-tenue); font-family: ui-monospace, monospace; font-size: .68rem; }

	/* Período en proceso: visible en Facturador y Bandeja. */
	.periodo-banner { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: .9rem; padding: .75rem 1rem; border: 1px solid var(--primario-borde); border-radius: .9rem; background: var(--accion-gradiente); color: var(--texto-inverso); box-shadow: 0 10px 24px rgba(67, 56, 202, .18); }
	.periodo-datos { display: flex; align-items: center; gap: .55rem; flex-wrap: wrap; }
	.periodo-etiqueta { font-size: .62rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; opacity: .78; }
	.periodo-valor { font-size: .92rem; letter-spacing: .01em; }
	.periodo-separador { opacity: .5; }
	.btn-periodo { border: 1px solid rgba(255,255,255,.55); border-radius: .65rem; padding: .45rem .8rem; background: rgba(255,255,255,.12); color: var(--texto-inverso); font: inherit; font-size: .68rem; font-weight: 700; cursor: pointer; }
	.btn-periodo:hover { background: rgba(255,255,255,.22); }
	.periodo-banner.sin-configurar { background: var(--tabla-gradiente-aviso); box-shadow: 0 10px 24px rgba(180, 83, 9, .18); }

	.variables-boton { display: inline-flex; align-items: center; gap: .45rem; }
	.punto-cambios { width: .5rem; height: .5rem; border-radius: 50%; background: var(--alerta); }

	/* Panel flotante de variables */
	.panel-variables { position: fixed; z-index: 60; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; width: 22rem; max-height: min(70vh, 34rem); border: 1px solid var(--borde); border-radius: .9rem; background: var(--superficie); box-shadow: 0 22px 50px rgba(19, 27, 56, .3); overflow: hidden; }
	.panel-variables.arrastrando { user-select: none; cursor: grabbing; box-shadow: 0 28px 60px rgba(19, 27, 56, .38); }
	.panel-cabecera { display: flex; align-items: center; gap: .5rem; padding: .65rem .8rem; border-bottom: 1px solid var(--borde-suave); background: var(--superficie-alta); }
	.panel-cabecera h2 { margin: 0; font-size: .82rem; }
	.panel-agarre { padding: 0 .15rem; border: 0; background: transparent; color: var(--texto-tenue); font: inherit; font-size: .95rem; letter-spacing: -.08em; cursor: grab; touch-action: none; }
	.panel-agarre:active { cursor: grabbing; }
	.panel-cabecera .btn-cerrar { margin-left: auto; }
	.panel-cuerpo { display: grid; gap: .7rem; padding: .8rem; overflow: auto; min-height: 0; }
	.panel-seccion { display: grid; gap: .45rem; padding-bottom: .65rem; border-bottom: 1px solid var(--borde-suave); }
	.panel-seccion:last-child { padding-bottom: 0; border-bottom: 0; }
	.panel-seccion-titulo { color: var(--primario-texto); font-size: .6rem; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; }
	.panel-campo { display: grid; gap: .2rem; }
	.panel-campo span { color: var(--texto-suave); font-size: .6rem; font-weight: 700; text-transform: uppercase; }
	.panel-campo input { padding: .45rem .55rem; border: 1px solid var(--borde); border-radius: .55rem; background: var(--superficie-alta); color: var(--texto); font: inherit; font-size: .72rem; }
	.panel-ayuda { margin: 0; color: var(--texto-suave); font-size: .66rem; line-height: 1.45; }
	.panel-aviso { margin: 0; padding: .5rem .6rem; border: 1px solid var(--alerta-borde); border-radius: .55rem; background: var(--alerta-tenue); color: var(--alerta-texto); font-size: .68rem; line-height: 1.4; }
	.panel-aviso.aviso-error { border-color: var(--peligro-borde); background: var(--peligro-tenue); color: var(--peligro-texto); }
	.panel-variables .lista-variables li { display: grid; align-items: stretch; gap: .35rem; }
	.variable-encabezado { display: flex; align-items: center; gap: .4rem; }
	.marca-lote { padding: .08rem .35rem; border: 1px solid var(--primario-borde); border-radius: 999px; background: var(--primario-tenue); color: var(--primario-texto); font-size: .55rem; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; }
	.lista-variables li.faltante { border-color: var(--peligro-borde); background: var(--peligro-tenue); }
	.variable-fila { display: flex; align-items: center; gap: .4rem; }
	.panel-pie { display: flex; align-items: center; justify-content: space-between; gap: .6rem; padding: .6rem .8rem; border-top: 1px solid var(--borde-suave); background: var(--superficie-alta); }
	.panel-estado { color: var(--exito-texto); font-size: .64rem; font-weight: 700; }
	.panel-estado.con-cambios { color: var(--alerta-texto); }
	.lista-variables-lote { display: grid; gap: .25rem; margin: 0; padding: 0; list-style: none; }
	.lista-variables-lote li { display: flex; justify-content: space-between; gap: .6rem; padding: .35rem .5rem; border: var(--lista-linea-grosor, 1px) solid var(--lista-linea-color, var(--borde-suave)); border-radius: .5rem; font-size: .7rem; }

	@media (max-width: 60rem) { .barra-herramientas { align-items: stretch; flex-direction: column; } .controles { justify-content: space-between; flex-wrap: wrap; } .tabla { overflow-x: auto; } .cabecera-tabla, .fila { min-width: 80rem; } }
</style>
