<script lang="ts">
	import { onMount } from 'svelte';
	import { iconos } from '#lib/componentes/iconos.ts';
	import { confirmar } from '#lib/componentes/confirmacion.svelte.ts';
	import { notificar } from '#lib/componentes/notificaciones.svelte.ts';
	import {
		actualizarLineaPlantilla,
		actualizarPlantilla,
		agregarLineaPlantilla,
		eliminarLineaPlantilla,
		eliminarPlantillas,
		enviarAlFacturador,
		ErrorImportacionPlantillas,
		importarPlantillasDesdeArchivo,
		listarCatalogos,
		listarFacturas,
		listarPlantillas,
		obtenerConfiguracionFacturacion,
		type Catalogos,
		type EstadoFactura,
		type GrupoPlantillas,
		type LineaPlantilla,
		type PlantillaListado,
		type ResumenImportacion
	} from '#lib/servicios-datos-api/index.ts';
	import Facturador from './Facturador.svelte';
	import BarraLotes from '#lib/componentes/BarraLotes.svelte';
	import ChipSelect from '#lib/componentes/ChipSelect.svelte';
	import ChipAuxiliar from '#lib/componentes/ChipAuxiliar.svelte';
	import ModalDocumento from '#lib/componentes/ModalDocumento.svelte';
	import ModalPanel from '#lib/componentes/ModalPanel.svelte';
	import type {
		CambiosLineaDocumento,
		CampoDocumento,
		DocumentoEditable
	} from '#lib/componentes/documento.ts';
	import { formatearFecha, parsearFecha } from '#lib/servicios/fechas.ts';
	import { formatearNumero } from '#lib/servicios/numeros.ts';
	import { descargarPlantillaModelo } from '#lib/servicios/multifacturacion.ts';

	type Pestaña = 'plantillas' | 'facturador' | 'bandeja';

	let pestaña = $state<Pestaña>('plantillas');
	let busqueda = $state('');
	let filtroGrupo = $state('todos');
	let gruposCerrados = $state<number[]>([]);
	let seleccionadas = $state<number[]>([]);

	let grupos = $state<GrupoPlantillas[]>([]);
	let catalogos = $state<Catalogos | null>(null);
	let cargando = $state(true);
	let importando = $state(false);
	let eliminando = $state(false);
	let error = $state<string | null>(null);
	let inputArchivo: HTMLInputElement | undefined = $state();
	/** Modal con las dos acciones: descargar el modelo o importar la planilla. */
	let modalImportacion = $state(false);

	/** Reporte de la importación: éxito total, parcial o rechazada. */
	type Reporte =
		| { tipo: 'ok' | 'parcial'; resumen: ResumenImportacion }
		| {
				tipo: 'error';
				mensaje: string;
				faltantes?: Record<string, string[]>;
				detalles?: { campo: string; mensaje: string }[];
		  };
	let reporte = $state<Reporte | null>(null);

	// Chips editables por plantilla
	let editandoIdCliente = $state<number | null>(null);
	let borradorIdCliente = $state('');

	// Edición rápida de líneas y comentario general (igual que el Facturador)
	type CampoLinea = 'detalle' | 'cantidad' | 'importe' | 'comentario';
	let edicion = $state<{ plantillaId: number; lineaId: number; campo: CampoLinea } | null>(null);
	let edicionGeneral = $state<number | null>(null);
	let borrador = $state('');

	// Envío al Facturador
	let modalEnvio = $state(false);
	let periodoEnvio = $state('');
	let fechaGlobalTexto = $state('');
	let enviando = $state(false);
	let avisoEnvio = $state<string | null>(null);
	let configCargando = $state(false);
	let errorConfig = $state<string | null>(null);

	/**
	 * Plantillas del lote que YA tienen una factura viva para el período elegido.
	 * El backend las omite al copiar; acá se muestran en el modal para que el
	 * usuario sepa de antemano qué no se va a volver a enviar.
	 */
	type FacturaExistente = { plantillaId: number; contacto: string; estado: EstadoFactura };
	let existentesDelPeriodo = $state<FacturaExistente[]>([]);
	let cargandoExistentes = $state(false);
	let errorExistentes = $state<string | null>(null);
	let solicitudExistentes = 0;

	// Modal de documento: cabecera, auxiliares y líneas
	let modalPlantilla = $state<PlantillaListado | null>(null);
	let ocupadoModal = $state(false);
	let errorModal = $state<string | null>(null);

	function buscarPlantilla(id: number): PlantillaListado | null {
		for (const grupo of grupos) {
			const encontrada = grupo.plantillas.find((plantilla) => plantilla.id === id);
			if (encontrada) return encontrada;
		}
		return null;
	}

	function abrirModal(plantilla: PlantillaListado) {
		errorModal = null;
		modalPlantilla = plantilla;
	}

	function cerrarModal() {
		modalPlantilla = null;
		errorModal = null;
	}

	/** Normaliza la plantilla a la forma que consume el modal compartido. */
	function documentoDe(plantilla: PlantillaListado): DocumentoEditable {
		return {
			id: plantilla.id,
			titulo: plantilla.idCliente
				? `${plantilla.contactoFacturacion} (${plantilla.idCliente})`
				: plantilla.contactoFacturacion,
			subtitulo: `Agrupador ${plantilla.agrupador} · ${plantilla.lineas.length} ${plantilla.lineas.length === 1 ? 'línea' : 'líneas'}`,
			moneda: plantilla.moneda,
			tipoComprobante: plantilla.tipoComprobante,
			tipoPrecio: plantilla.tipoPrecio,
			idCliente: plantilla.idCliente,
			fecha: plantilla.fecha,
			serie: plantilla.serie,
			numero: null,
			comentarioGeneral: plantilla.comentarioGeneral,
			idCompra: plantilla.idCompra,
			detalleAuxiliar: plantilla.detalleAuxiliar,
			uteVencimiento: plantilla.uteVencimiento,
			informacionAdicional: plantilla.informacionAdicional,
			lineas: plantilla.lineas.map((linea) => ({
				id: linea.id,
				codigo: linea.codigo,
				descripcion: linea.articulo,
				detalle: linea.detalle,
				cantidad: linea.cantidad,
				importeUnitario: linea.importeUnitario,
				comentario: linea.comentario
			}))
		};
	}

	let documentoModal = $derived(modalPlantilla ? documentoDe(modalPlantilla) : null);

	async function sincronizarModal() {
		await cargar(true);
		modalPlantilla = modalPlantilla ? buscarPlantilla(modalPlantilla.id) : null;
	}

	function textoOpcional(valor: string | number | null): string | null {
		if (typeof valor !== 'string') return null;
		const limpio = valor.trim();
		return limpio === '' ? null : limpio;
	}

	async function guardarCabeceraDocumento(campo: CampoDocumento, valor: string | number | null) {
		if (!modalPlantilla) return;
		const id = modalPlantilla.id;
		ocupadoModal = true;
		errorModal = null;

		try {
			const cambios: Parameters<typeof actualizarPlantilla>[1] = {};
			switch (campo) {
				case 'moneda':
					cambios.monedaId =
						catalogos?.monedas.find((moneda) => moneda.codigo === valor)?.id ?? null;
					break;
				case 'tipoComprobante':
					cambios.tipoComprobanteId =
						catalogos?.tiposComprobantes.find((comprobante) => comprobante.nombre === valor)?.id ?? null;
					break;
				case 'tipoPrecio':
					cambios.tipoPrecioId =
						catalogos?.tiposPrecios.find((precio) => precio.nombre === valor)?.id ?? null;
					break;
				case 'idCliente':
					cambios.idCliente = typeof valor === 'number' ? valor : null;
					break;
				case 'fecha':
					cambios.fecha = textoOpcional(valor);
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
				case 'comentarioGeneral':
					cambios.comentarioGeneral = textoOpcional(valor);
					break;
				case 'serie':
					// La plantilla guarda serie; el número recién se completa al facturar.
					cambios.serie = textoOpcional(valor);
					break;
				default:
					break;
			}

			await actualizarPlantilla(id, cambios);
			await sincronizarModal();

			// Relación moneda → precio: si el precio actual deja de ser válido, se limpia.
			if (campo === 'moneda' && modalPlantilla?.tipoPrecioId) {
				const valido = preciosParaMoneda(modalPlantilla.monedaId).some(
					(precio) => precio.id === modalPlantilla?.tipoPrecioId
				);
				if (!valido) {
					await actualizarPlantilla(id, { tipoPrecioId: null });
					await sincronizarModal();
				}
			}
		} catch (e) {
			errorModal = (e as Error).message;
		} finally {
			ocupadoModal = false;
		}
	}

	async function guardarLineaDocumento(lineaId: number, cambios: CambiosLineaDocumento) {
		if (!modalPlantilla) return;
		ocupadoModal = true;
		errorModal = null;
		try {
			await actualizarLineaPlantilla(modalPlantilla.id, lineaId, cambios);
			await sincronizarModal();
		} catch (e) {
			errorModal = (e as Error).message;
		} finally {
			ocupadoModal = false;
		}
	}

	async function agregarLineaDocumento(datos: {
		codigo: string;
		cantidad: number;
		importeUnitario: number;
		detalle?: string | null;
		comentario?: string | null;
	}) {
		if (!modalPlantilla) return;
		ocupadoModal = true;
		errorModal = null;
		try {
			await agregarLineaPlantilla(modalPlantilla.id, datos);
			await sincronizarModal();
		} catch (e) {
			errorModal = (e as Error).message;
		} finally {
			ocupadoModal = false;
		}
	}

	async function eliminarLineaDocumento(lineaId: number) {
		if (!modalPlantilla) return;
		ocupadoModal = true;
		errorModal = null;
		try {
			await eliminarLineaPlantilla(modalPlantilla.id, lineaId);
			await sincronizarModal();
		} catch (e) {
			errorModal = (e as Error).message;
		} finally {
			ocupadoModal = false;
		}
	}

	onMount(() => {
		void cargar();
	});

	/**
	 * Carga las plantillas. `silencioso` evita desmontar la tabla al refrescar
	 * después de una edición: así la fila no se va al principio de la página.
	 */
	async function cargar(silencioso = false) {
		if (!silencioso) cargando = true;
		error = null;
		try {
			const [datos, catalogosApi] = await Promise.all([listarPlantillas(), listarCatalogos()]);
			grupos = datos;
			catalogos = catalogosApi;
			// Las plantillas que ya no existen no deben quedar seleccionadas.
			const vigentes = new Set(datos.flatMap((grupo) => grupo.plantillas.map((p) => p.id)));
			seleccionadas = seleccionadas.filter((id) => vigentes.has(id));
		} catch (e) {
			error = (e as Error).message;
		} finally {
			if (!silencioso) cargando = false;
		}
	}

	async function importar(evento: Event) {
		const entrada = evento.currentTarget as HTMLInputElement;
		const archivo = entrada.files?.[0];
		if (!archivo) return;

		importando = true;
		error = null;
		reporte = null;
		try {
			const resultado = await importarPlantillasDesdeArchivo(archivo);
			reporte = {
				tipo: resultado.serviciosOmitidos.length > 0 ? 'parcial' : 'ok',
				resumen: resultado
			};
			await cargar();
		} catch (e) {
			if (e instanceof ErrorImportacionPlantillas) {
				reporte = {
					tipo: 'error',
					mensaje: e.message,
					faltantes: e.faltantes,
					detalles: e.detalles
				};
			} else {
				// Errores del parser (planilla sin filas válidas, archivo ilegible).
				reporte = { tipo: 'error', mensaje: (e as Error).message };
			}
		} finally {
			importando = false;
			entrada.value = '';
		}
	}

	function abrirImportacion() {
		modalImportacion = true;
	}

	function cerrarImportacion() {
		modalImportacion = false;
	}

	/** Cierra el modal y delega en el selector de archivo del sistema. */
	function elegirArchivo() {
		modalImportacion = false;
		inputArchivo?.click();
	}

	function descargarModelo() {
		try {
			descargarPlantillaModelo();
			error = null;
		} catch (e) {
			error = (e as Error).message;
		}
	}

	/** Tipos de precio válidos para la moneda elegida (pares moneda→precio). */
	function preciosParaMoneda(monedaId: number | null) {
		const precios = catalogos?.tiposPrecios ?? [];
		if (!monedaId) return precios;

		const validos = new Set(
			(catalogos?.monedasTiposPrecio ?? [])
				.filter((par) => par.monedaId === monedaId)
				.map((par) => par.tipoPrecioId)
		);
		// Sin pares configurados para esa moneda: se muestran todos.
		if (validos.size === 0) return precios;
		return precios.filter((precio) => validos.has(precio.id));
	}

	function aplicarCambioLocal(plantillaId: number, cambios: Partial<PlantillaListado>) {
		grupos = grupos.map((grupo) => ({
			...grupo,
			plantillas: grupo.plantillas.map((plantilla) =>
				plantilla.id === plantillaId ? { ...plantilla, ...cambios } : plantilla
			)
		}));
	}

	/** Refleja en pantalla el cambio de una línea sin esperar la recarga. */
	function aplicarCambioLinea(plantillaId: number, lineaId: number, cambios: Partial<LineaPlantilla>) {
		grupos = grupos.map((grupo) => ({
			...grupo,
			plantillas: grupo.plantillas.map((plantilla) =>
				plantilla.id === plantillaId
					? {
							...plantilla,
							lineas: plantilla.lineas.map((linea) =>
								linea.id === lineaId ? { ...linea, ...cambios } : linea
							)
						}
					: plantilla
			)
		}));
	}

	// ---------- Edición rápida ----------

	function empezarEdicion(plantillaId: number, lineaId: number, campo: CampoLinea, valor: string) {
		edicion = { plantillaId, lineaId, campo };
		borrador = valor;
	}

	function empezarComentarioGeneral(plantilla: PlantillaListado) {
		edicionGeneral = plantilla.id;
		borrador = plantilla.comentarioGeneral ?? '';
	}

	async function guardarLinea(campo: CampoLinea) {
		if (!edicion) return;
		const { plantillaId, lineaId } = edicion;
		const valor = borrador;
		edicion = null;
		error = null;

		try {
			if (campo === 'detalle') {
				const limpio = valor.trim() || null;
				await actualizarLineaPlantilla(plantillaId, lineaId, { detalle: limpio });
				aplicarCambioLinea(plantillaId, lineaId, { detalle: limpio });
			} else if (campo === 'comentario') {
				const limpio = valor.trim() || null;
				await actualizarLineaPlantilla(plantillaId, lineaId, { comentario: limpio });
				aplicarCambioLinea(plantillaId, lineaId, { comentario: limpio });
			} else {
				const numero = Number(valor.replace(',', '.'));
				if (!Number.isFinite(numero) || numero < 0) {
					error = 'El valor debe ser un número mayor o igual a 0';
					return;
				}
				if (campo === 'cantidad') {
					await actualizarLineaPlantilla(plantillaId, lineaId, { cantidad: numero });
					aplicarCambioLinea(plantillaId, lineaId, { cantidad: String(numero) });
				} else {
					await actualizarLineaPlantilla(plantillaId, lineaId, { importeUnitario: numero });
					aplicarCambioLinea(plantillaId, lineaId, { importeUnitario: String(numero) });
				}
			}

			await cargar(true);
		} catch (e) {
			error = (e as Error).message;
		}
	}

	async function guardarComentarioGeneral(plantillaId: number) {
		const valor = borrador;
		edicionGeneral = null;
		error = null;

		try {
			const limpio = valor.trim() || null;
			await actualizarPlantilla(plantillaId, { comentarioGeneral: limpio });
			aplicarCambioLocal(plantillaId, { comentarioGeneral: limpio });
			await cargar(true);
		} catch (e) {
			error = (e as Error).message;
		}
	}

	async function cambiarChip(
		plantilla: PlantillaListado,
		campo: 'monedaId' | 'tipoComprobanteId' | 'tipoPrecioId',
		valor: string
	) {
		const id = valor === '' ? null : Number(valor);
		error = null;

		// Nombre visible para reflejar el cambio sin esperar la recarga.
		const nombres = {
			monedaId: {
				moneda: catalogos?.monedas.find((opcion) => opcion.id === id)?.codigo ?? null
			},
			tipoComprobanteId: {
				tipoComprobante:
					catalogos?.tiposComprobantes.find((opcion) => opcion.id === id)?.nombre ?? null
			},
			tipoPrecioId: {
				tipoPrecio: catalogos?.tiposPrecios.find((opcion) => opcion.id === id)?.nombre ?? null
			}
		} as const;

		try {
			await actualizarPlantilla(plantilla.id, { [campo]: id });
			aplicarCambioLocal(plantilla.id, { [campo]: id, ...nombres[campo] });

			// Relación moneda → precio: si el precio actual deja de ser válido, se limpia.
			if (campo === 'monedaId' && plantilla.tipoPrecioId !== null) {
				const validos = new Set(preciosParaMoneda(id).map((precio) => precio.id));
				if (!validos.has(plantilla.tipoPrecioId)) {
					await actualizarPlantilla(plantilla.id, { tipoPrecioId: null });
					aplicarCambioLocal(plantilla.id, { tipoPrecioId: null, tipoPrecio: null });
				}
			}
		} catch (e) {
			error = (e as Error).message;
			return;
		}

		// La recarga es solo para sincronizar: si falla, el cambio ya está a la vista.
		await cargar(true);
	}

	function empezarIdCliente(plantilla: PlantillaListado) {
		editandoIdCliente = plantilla.id;
		borradorIdCliente = plantilla.idCliente === null ? '' : String(plantilla.idCliente);
	}

	async function guardarIdCliente(plantilla: PlantillaListado) {
		const texto = borradorIdCliente.trim();
		editandoIdCliente = null;

		if (texto !== '' && !/^\d+$/.test(texto)) {
			error = 'El ID de cliente debe ser numérico';
			return;
		}

		try {
			const valor = texto === '' ? null : Number(texto);
			await actualizarPlantilla(plantilla.id, { idCliente: valor });
			aplicarCambioLocal(plantilla.id, { idCliente: valor });
			await cargar(true);
		} catch (e) {
			error = (e as Error).message;
		}
	}

	let gruposVisibles = $derived(
		grupos
			.filter((grupo) => filtroGrupo === 'todos' || String(grupo.id) === filtroGrupo)
			.map((grupo) => ({
				...grupo,
				plantillas: grupo.plantillas.filter((plantilla) => {
					const texto = `${plantilla.contactoFacturacion} ${plantilla.comentarioGeneral ?? ''} ${plantilla.agrupador} ${plantilla.idCompra ?? ''} ${plantilla.detalleAuxiliar ?? ''} ${plantilla.informacionAdicional ?? ''} ${plantilla.lineas
						.map((linea) => `${linea.codigo} ${linea.articulo} ${linea.detalle ?? ''}`)
						.join(' ')}`.toLowerCase();
					return texto.includes(busqueda.trim().toLowerCase());
				})
			}))
			.filter((grupo) => grupo.plantillas.length > 0)
	);

	// Paridad por plantilla para el color intercalado (azul suave grisáceo).
	let paridad = $derived.by(() => {
		const mapa = new Map<number, boolean>();
		let indice = 0;
		for (const grupo of gruposVisibles) {
			for (const plantilla of grupo.plantillas) {
				mapa.set(plantilla.id, indice % 2 === 1);
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
			? seleccionadas.filter((plantillaId) => plantillaId !== id)
			: [...seleccionadas, id];
	}

	function seleccionarGrupo(grupo: GrupoPlantillas) {
		const ids = grupo.plantillas.map((plantilla) => plantilla.id);
		const completo = ids.every((id) => seleccionadas.includes(id));
		seleccionadas = completo
			? seleccionadas.filter((id) => !ids.includes(id))
			: [...new Set([...seleccionadas, ...ids])];
	}

	function grupoSeleccionado(grupo: GrupoPlantillas) {
		return grupo.plantillas.length > 0 && grupo.plantillas.every((p) => seleccionadas.includes(p.id));
	}

	function mostrarPendiente(accion: string) {
		notificar(`${accion}: funcionalidad prevista para la siguiente iteración.`, 'info');
	}

	/** Borrado lógico del lote seleccionado. */
	async function eliminarSeleccionadas() {
		if (seleccionadas.length === 0 || eliminando) return;
		const cantidad = seleccionadas.length;
		const confirmado = await confirmar({
			titulo: 'Eliminar plantillas',
			mensaje:
				cantidad === 1
					? '¿Eliminar la plantilla seleccionada?'
					: `¿Eliminar las ${cantidad} plantillas seleccionadas?`,
			tono: 'peligro',
			etiquetaConfirmar: 'Eliminar'
		});
		if (!confirmado) return;

		eliminando = true;
		error = null;
		try {
			await eliminarPlantillas(seleccionadas);
			seleccionadas = [];
			await cargar();
		} catch (e) {
			error = (e as Error).message;
		} finally {
			eliminando = false;
		}
	}

	/** Envío del lote al Facturador: el período y la fecha se leen del Facturador. */
	async function enviarAlFacturadorSeleccionadas() {
		if (seleccionadas.length === 0) return;
		avisoEnvio = null;
		error = null;
		errorConfig = null;
		existentesDelPeriodo = [];
		modalEnvio = true;
		configCargando = true;
		try {
			const config = await obtenerConfiguracionFacturacion();
			periodoEnvio = config.periodo ?? '';
			fechaGlobalTexto = formatearFecha(config.fechaGeneral);
			if (!config.periodo || !config.fechaGeneral) {
				errorConfig = 'Falta configurar el período y la fecha general en la pestaña Facturador.';
			}
		} catch (e) {
			periodoEnvio = '';
			fechaGlobalTexto = '';
			errorConfig = (e as Error).message;
		} finally {
			configCargando = false;
		}
	}

	/** Cierra el aviso y lleva a la pestaña donde se configura el período. */
	function irAlFacturador() {
		modalEnvio = false;
		pestaña = 'facturador';
	}

	async function confirmarEnvio() {
		if (!periodoEnvio) {
			error = 'Configurá el período en la pestaña Facturador';
			return;
		}

		// Sin fecha global no se envía: la factura nace con su fecha.
		const fecha = parsearFecha(fechaGlobalTexto);
		if (fecha.error) {
			error = fecha.error;
			return;
		}
		if (!fecha.iso) {
			error = 'Configurá la fecha general en la pestaña Facturador';
			return;
		}

		enviando = true;
		error = null;
		try {
			const resultado = await enviarAlFacturador(seleccionadas, periodoEnvio, fecha.iso);
			avisoEnvio =
				`${resultado.facturasCreadas} ${resultado.facturasCreadas === 1 ? 'factura creada' : 'facturas creadas'} en el Facturador para ${etiquetaPeriodo(periodoEnvio)}` +
				(resultado.omitidas > 0 ? ` · ${resultado.omitidas} ya estaban en ese período` : '');
			seleccionadas = [];
			modalEnvio = false;
		} catch (e) {
			error = (e as Error).message;
		} finally {
			enviando = false;
		}
	}

	/**
	 * Consulta qué plantillas del lote ya tienen factura viva en el período
	 * elegido. El backend las omite al copiar, así que se avisan en el modal.
	 * Se vuelve a ejecutar al abrir el modal y cada vez que cambia el período.
	 */
	$effect(() => {
		if (!modalEnvio) return;
		const periodo = periodoEnvio;
		if (!/^\d{4}-\d{2}$/.test(periodo)) return;
		void cargarExistentes(periodo);
	});

	async function cargarExistentes(periodo: string) {
		const solicitud = ++solicitudExistentes;
		cargandoExistentes = true;
		errorExistentes = null;
		try {
			const facturas = await listarFacturas();
			if (solicitud !== solicitudExistentes) return;
			existentesDelPeriodo = facturas
				.filter(
					(factura) =>
						factura.periodo === periodo && seleccionadas.includes(factura.plantillaId)
				)
				.map((factura) => ({
					plantillaId: factura.plantillaId,
					contacto: factura.contactoFacturacion,
					estado: factura.estado
				}));
		} catch (e) {
			if (solicitud !== solicitudExistentes) return;
			errorExistentes = (e as Error).message;
			existentesDelPeriodo = [];
		} finally {
			if (solicitud === solicitudExistentes) cargandoExistentes = false;
		}
	}

	/** Plantillas del lote que sí se van a copiar (las que no están ya enviadas). */
	let nuevasDelLote = $derived.by(() => {
		const usadas = new Set(existentesDelPeriodo.map((factura) => factura.plantillaId));
		return seleccionadas.filter((id) => !usadas.has(id)).length;
	});

	/** `2026-10` → `OCTUBRE 2026`. */
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
			'SEPTIEMBRE',
			'OCTUBRE',
			'NOVIEMBRE',
			'DICIEMBRE'
		];
		const nombre = meses[Number(mes) - 1];
		return nombre && anio ? `${nombre} ${anio}` : periodo;
	}

	/** Etiqueta legible del estado de una factura ya enviada. */
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

	/** Importe con el símbolo de moneda y la regla numérica común. */
	function formatearImporte(valor: string, moneda: string | null): string {
		const numero = Number(valor);
		if (!Number.isFinite(numero)) return valor;
		const simbolo = moneda === 'USD' ? 'US$' : '$';
		return `${simbolo} ${formatearNumero(numero)}`;
	}

	/** Cantidad con la regla común: hasta 3 decimales, sin ceros de más. */
	function formatearCantidad(valor: string): string {
		return formatearNumero(valor);
	}
</script>

<svelte:head>
	<title>CRM — Multifacturador</title>
</svelte:head>

<section class="pantalla">
	<nav class="pestanas" aria-label="Módulo de multifacturación">
		{#each [
			{ id: 'plantillas', texto: 'Plantillas' },
			{ id: 'facturador', texto: 'Facturador' },
			{ id: 'bandeja', texto: 'Bandeja' }
		] as item}
			<button
				type="button"
				class:seleccionada={pestaña === item.id}
				onclick={() => (pestaña = item.id as Pestaña)}
			>
				{item.texto}
			</button>
		{/each}
	</nav>

	{#if pestaña === 'plantillas'}
		<div class="barra-herramientas">
			<label class="buscador">
				<span>{@html iconos.buscar}</span>
				<input bind:value={busqueda} placeholder="Buscar contacto, servicio o número..." aria-label="Buscar plantillas" />
			</label>
			<div class="controles">
				<label class="selector">
					<span class="etiqueta">Grupo</span>
					<select bind:value={filtroGrupo} aria-label="Filtrar por grupo">
						<option value="todos">Todos los grupos</option>
						{#each catalogos?.grupos ?? [] as grupo}<option value={String(grupo.id)}>{grupo.nombre}</option>{/each}
					</select>
				</label>
				<span class="leyenda"><i class="punto punto-grupo"></i>Grupo configurable</span>
				<span class="leyenda"><i class="punto punto-plantilla"></i>Plantilla</span>
				<button type="button" class="btn-importar" disabled={importando} onclick={abrirImportacion}>
					{importando ? 'Importando…' : 'Importar Excel'}
				</button>
				<input
					bind:this={inputArchivo}
					type="file"
					accept=".xlsx,.xls"
					class="oculto"
					onchange={importar}
					aria-label="Seleccionar planilla de facturación"
				/>
			</div>
		</div>

		{#if error}
			<p class="mensaje error-mensaje" role="alert">{error}</p>
		{/if}
		{#if avisoEnvio}
			<p class="mensaje ok-mensaje" role="status">{avisoEnvio}</p>
		{/if}

		{#if cargando}
			<div class="estado-vacio"><p>Cargando plantillas…</p></div>
		{:else if gruposVisibles.length === 0}
			<div class="estado-vacio">
				<span class="estado-icono">{@html iconos.capas}</span>
				<h1>{grupos.length === 0 ? 'Sin plantillas importadas' : 'Sin resultados'}</h1>
				<p>
					{grupos.length === 0
						? 'Importá primero los servicios desde la pantalla Servicios y después la planilla mensual.'
						: 'Ajustá la búsqueda o el filtro de grupo.'}
				</p>
				{#if grupos.length === 0}
					<button type="button" class="btn-importar" disabled={importando} onclick={abrirImportacion}>
						Importar Excel
					</button>
				{/if}
			</div>
		{:else}
			<div class="tabla" role="table" aria-label="Plantillas de facturación">
				<div class="cabecera-tabla" role="row">
					<span><input type="checkbox" aria-label="Seleccionar todas las plantillas" /></span>
					<span>Contacto</span>
					<span>Adenda / comentario general</span>
					<span>Código</span>
					<span>Articulo detalle</span>
					<span>Cantidad</span>
					<span>Importe unitario</span>
					<span aria-hidden="true"></span>
				</div>

				{#each gruposVisibles as grupo (grupo.id)}
					<div class="grupo">
						<div
							class="cabecera-grupo"
							style="background: {grupo.colorFondo}; color: {grupo.colorTexto}"
						>
							<input
								type="checkbox"
								checked={grupoSeleccionado(grupo)}
								onchange={() => seleccionarGrupo(grupo)}
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
								{grupo.plantillas.length}
								{grupo.plantillas.length === 1 ? ' factura' : ' facturas'} ·
								{grupo.plantillas.reduce((total, p) => total + p.lineas.length, 0)}
								{grupo.plantillas.reduce((total, p) => total + p.lineas.length, 0) === 1 ? ' línea' : ' líneas'}
							</span>
							<button
								type="button"
								class="btn-icono"
								aria-label={`Editar grupo ${grupo.nombre}`}
								title="Editar grupo"
								onclick={() => mostrarPendiente('Editar grupo')}
							>
								{@html iconos.lapiz}
							</button>
						</div>

						{#if !gruposCerrados.includes(grupo.id)}
							{#each grupo.plantillas as plantilla (plantilla.id)}
								{@const lineas = plantilla.lineas}
								<div
									class="fila"
									class:seleccionada-fila={seleccionadas.includes(plantilla.id)}
									class:par={paridad.get(plantilla.id)}
									role="row"
								>
									<span class="celda">
										<input
											type="checkbox"
											checked={seleccionadas.includes(plantilla.id)}
											onchange={() => alternarSeleccion(plantilla.id)}
											aria-label={`Seleccionar ${plantilla.contactoFacturacion}`}
										/>
									</span>
									<span class="celda">
										<strong class="contacto">{plantilla.contactoFacturacion}</strong>
										<span class="chips">
											<ChipSelect
												variante="comprobante"
												valor={plantilla.tipoComprobanteId === null ? '' : String(plantilla.tipoComprobanteId)}
												opciones={(catalogos?.tiposComprobantes ?? [])
													.filter((opcion) => opcion.activo || opcion.id === plantilla.tipoComprobanteId)
													.map((opcion) => ({
														valor: String(opcion.id),
														etiqueta: opcion.nombre,
														abreviatura: opcion.abreviatura
													}))}
												placeholder="Comprobante"
												ariaLabel={`Tipo de comprobante de ${plantilla.contactoFacturacion}`}
												onchange={(valor) => cambiarChip(plantilla, 'tipoComprobanteId', valor)}
											/>
											<ChipSelect
												variante="moneda"
												valor={plantilla.monedaId === null ? '' : String(plantilla.monedaId)}
												opciones={(catalogos?.monedas ?? [])
													.filter((opcion) => opcion.activo || opcion.id === plantilla.monedaId)
													.map((opcion) => ({
														valor: String(opcion.id),
														etiqueta: opcion.codigo,
														abreviatura: opcion.codigo
													}))}
												placeholder="Moneda"
												ariaLabel={`Moneda de ${plantilla.contactoFacturacion}`}
												onchange={(valor) => cambiarChip(plantilla, 'monedaId', valor)}
											/>
											<ChipSelect
												variante="precio"
												valor={plantilla.tipoPrecioId === null ? '' : String(plantilla.tipoPrecioId)}
												opciones={preciosParaMoneda(plantilla.monedaId)
													.filter((opcion) => opcion.activo || opcion.id === plantilla.tipoPrecioId)
													.map((opcion) => ({
														valor: String(opcion.id),
														etiqueta: opcion.nombre
													}))}
												placeholder="Precio"
												ariaLabel={`Tipo de precio de ${plantilla.contactoFacturacion}`}
												onchange={(valor) => cambiarChip(plantilla, 'tipoPrecioId', valor)}
											/>
											{#if editandoIdCliente === plantilla.id}
												<input
													class="chip chip-cliente entrada-id"
													type="text"
													inputmode="numeric"
													bind:value={borradorIdCliente}
													placeholder="ID"
													onblur={() => guardarIdCliente(plantilla)}
													onkeydown={(evento) => {
														if (evento.key === 'Enter') guardarIdCliente(plantilla);
														if (evento.key === 'Escape') editandoIdCliente = null;
													}}
													aria-label={`ID de cliente de ${plantilla.contactoFacturacion}`}
												/>
											{:else}
												<button
													type="button"
													class="chip chip-cliente"
													onclick={() => empezarIdCliente(plantilla)}
													title="Editar ID de cliente"
												>
													{plantilla.idCliente ?? 'Sin ID'}
												</button>
											{/if}
											<ChipAuxiliar
												etiqueta="ID Compra"
												valor={plantilla.idCompra}
												onclick={() => abrirModal(plantilla)}
											/>
											<ChipAuxiliar
												etiqueta="Vence"
												valor={formatearFecha(plantilla.uteVencimiento) || null}
												onclick={() => abrirModal(plantilla)}
											/>
											<ChipAuxiliar
												etiqueta="Detalle"
												valor={plantilla.detalleAuxiliar}
												onclick={() => abrirModal(plantilla)}
											/>
											<ChipAuxiliar
												etiqueta="Info. adicional"
												valor={plantilla.informacionAdicional}
												onclick={() => abrirModal(plantilla)}
											/>
										</span>
									</span>
									<span class="celda comentario">
										{#if edicionGeneral === plantilla.id}
											<input
												class="entrada"
												bind:value={borrador}
												onblur={() => guardarComentarioGeneral(plantilla.id)}
												onkeydown={(evento) => {
													if (evento.key === 'Enter') guardarComentarioGeneral(plantilla.id);
													if (evento.key === 'Escape') edicionGeneral = null;
												}}
												aria-label="Comentario general"
											/>
										{:else}
											<button
												type="button"
												class="texto-editable"
												onclick={() => empezarComentarioGeneral(plantilla)}
												title="Editar comentario general"
											>
												{plantilla.comentarioGeneral ?? '—'}
											</button>
										{/if}
									</span>

									<div class="col-lineas">
										{#each lineas as linea (linea.id)}
											<span class="sub codigo" title={linea.articulo}>{linea.codigo}</span>
										{/each}
										{#if lineas.length === 0}<span class="sub">—</span>{/if}
									</div>
									<div class="col-lineas">
										{#each lineas as linea (linea.id)}
											{@const editando =
												edicion?.plantillaId === plantilla.id &&
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
														onclick={() => empezarEdicion(plantilla.id, linea.id, 'detalle', linea.detalle ?? '')}
													>
														{linea.detalle ?? '—'}
													</button>
												{/if}
											</span>
										{/each}
										{#if lineas.length === 0}<span class="sub">—</span>{/if}
									</div>
									<div class="col-lineas">
										{#each lineas as linea (linea.id)}
											{@const editando =
												edicion?.plantillaId === plantilla.id &&
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
														onclick={() => empezarEdicion(plantilla.id, linea.id, 'cantidad', linea.cantidad)}
													>
														{formatearCantidad(linea.cantidad)}
													</button>
												{/if}
											</span>
										{/each}
										{#if lineas.length === 0}<span class="sub">—</span>{/if}
									</div>
									<div class="col-lineas">
										{#each lineas as linea (linea.id)}
											{@const editando =
												edicion?.plantillaId === plantilla.id &&
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
														onclick={() => empezarEdicion(plantilla.id, linea.id, 'importe', linea.importeUnitario)}
													>
														{formatearImporte(linea.importeUnitario, plantilla.moneda)}
													</button>
												{/if}
											</span>
										{/each}
										{#if lineas.length === 0}<span class="sub">—</span>{/if}
									</div>

									<span class="celda acciones-fila">
										<button
											type="button"
											class="btn-icono"
											aria-label={`Editar ${plantilla.contactoFacturacion}`}
											title="Editar plantilla"
											onclick={() => abrirModal(plantilla)}
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
	{:else if pestaña === 'facturador'}
		<Facturador vista="facturador" />
	{:else}
		<Facturador vista="bandeja" />
	{/if}

	{#if pestaña === 'plantillas' && seleccionadas.length > 0}
		<BarraLotes
			etiqueta={`${seleccionadas.length} ${seleccionadas.length === 1 ? 'plantilla seleccionada' : 'plantillas seleccionadas'}`}
		>
				<button type="button" class="lote-accion" onclick={eliminarSeleccionadas} disabled={eliminando}>
					<span class="lote-icono">{@html iconos.papelera}</span>
					<span class="lote-etiqueta">{eliminando ? 'Eliminando…' : 'Eliminar'}</span>
				</button>
				<button type="button" class="lote-accion" onclick={enviarAlFacturadorSeleccionadas} disabled={eliminando}>
					<span class="lote-icono">{@html iconos.enviar}</span>
					<span class="lote-etiqueta">Enviar a Facturador</span>
				</button>
		</BarraLotes>
	{/if}

	<!-- Modal de la plantilla: cabecera, auxiliares y líneas -->
	{#if documentoModal}
		<ModalDocumento
			documento={documentoModal}
			articulos={catalogos?.articulos ?? []}
			opcionesMoneda={(catalogos?.monedas ?? []).map((moneda) => moneda.codigo)}
			opcionesComprobante={(catalogos?.tiposComprobantes ?? []).map((comprobante) => comprobante.nombre)}
			opcionesPrecio={preciosParaMoneda(modalPlantilla?.monedaId ?? null).map((precio) => precio.nombre)}
			ocupado={ocupadoModal}
			error={errorModal}
			mostrarFecha={false}
			onCerrar={cerrarModal}
			onCabecera={guardarCabeceraDocumento}
			onLinea={guardarLineaDocumento}
			onAgregar={agregarLineaDocumento}
			onEliminar={eliminarLineaDocumento}
		/>
	{/if}

	<!-- Envío al Facturador: período (mes/año) y fecha global del lote. -->
	{#if modalEnvio}
		<div
			class="fondo-modal"
			role="presentation"
			tabindex="-1"
			onclick={() => (modalEnvio = false)}
			onkeydown={(evento) => {
				if (evento.key === 'Escape') modalEnvio = false;
			}}
		>
			<div class="modal" role="dialog" aria-modal="true" tabindex="-1" aria-label="Enviar al Facturador" onclick={(evento) => evento.stopPropagation()} onkeydown={(evento) => evento.stopPropagation()}>
				<header class="modal-cabecera">
					<h2>Enviar al Facturador</h2>
					<button type="button" class="btn-cerrar" aria-label="Cerrar" onclick={() => (modalEnvio = false)}>×</button>
				</header>

				<div class="modal-cuerpo">
					<p class="mensaje-texto">
						Se {nuevasDelLote === 1 ? 'va a copiar' : 'van a copiar'}
						<strong>{nuevasDelLote}</strong>
						de {seleccionadas.length}
						{seleccionadas.length === 1 ? 'plantilla' : 'plantillas'} como
						{nuevasDelLote === 1 ? 'factura' : 'facturas'} en estado PROCESO.
					</p>

					{#if configCargando}
						<p class="mensaje-texto" role="status">Leyendo la configuración del Facturador…</p>
					{:else if errorConfig}
						<div class="info-periodo sin-configurar" role="alert">
							<p class="mensaje-texto">{errorConfig}</p>
							<button type="button" class="btn-secundario" onclick={irAlFacturador}>
								Ir al Facturador
							</button>
						</div>
					{:else}
						<div class="info-periodo" role="status">
							<div class="info-linea">
								<span>Período en proceso</span>
								<strong>{etiquetaPeriodo(periodoEnvio)}</strong>
							</div>
							<div class="info-linea">
								<span>Fecha general</span>
								<strong>{fechaGlobalTexto}</strong>
							</div>
							<p class="mensaje-texto">
								Si necesitás cambiarlos, se configuran en la pestaña Facturador.
							</p>
							<button type="button" class="btn-secundario" onclick={irAlFacturador}>
								Ir al Facturador
							</button>
						</div>
					{/if}

					{#if cargandoExistentes}
						<p class="mensaje-texto" role="status">Verificando plantillas ya enviadas en el período…</p>
					{:else if errorExistentes}
						<p class="mensaje error-mensaje" role="alert">
							No se pudo verificar el período: {errorExistentes}
						</p>
					{:else if existentesDelPeriodo.length > 0}
						<div class="aviso-existentes" role="status">
							<p class="aviso-titulo">
								{existentesDelPeriodo.length === 1
									? 'Esta plantilla ya fue enviada'
									: `Estas ${existentesDelPeriodo.length} plantillas ya fueron enviadas`}
								en {etiquetaPeriodo(periodoEnvio)} y no se
								{existentesDelPeriodo.length === 1 ? 'va' : 'van'} a copiar de nuevo:
							</p>
							<ul>
								{#each existentesDelPeriodo as existente (existente.plantillaId)}
									<li>
										<span class="existente-contacto">{existente.contacto}</span>
										<span class="existente-estado estado-{existente.estado.toLowerCase()}">
											{etiquetaEstado(existente.estado)}
										</span>
									</li>
								{/each}
							</ul>
							{#if nuevasDelLote === 0}
								<p class="aviso-pie">
									No queda ninguna plantilla nueva para este período. Cambiá el período desde la
									pestaña Facturador si querés volver a enviarlas.
								</p>
							{:else}
								<p class="aviso-pie">
									Las demás {nuevasDelLote}
									{nuevasDelLote === 1 ? 'se va a copiar' : 'se van a copiar'} normalmente.
								</p>
							{/if}
						</div>
					{/if}
				</div>

				<footer class="modal-pie">
					<button type="button" class="btn-secundario" onclick={() => (modalEnvio = false)} disabled={enviando}>
						Cancelar
					</button>
					<button
						type="button"
						class="btn-primario"
						onclick={confirmarEnvio}
						disabled={enviando || configCargando || Boolean(errorConfig) || !periodoEnvio || !fechaGlobalTexto}
					>
						{enviando ? 'Enviando…' : 'Enviar'}
					</button>
				</footer>
			</div>
		</div>
	{/if}

	<!-- Reporte de la importación: éxito total, parcial o rechazada. -->
	{#if reporte}
		<div
			class="fondo-modal"
			role="presentation"
			tabindex="-1"
			onclick={() => (reporte = null)}
			onkeydown={(evento) => {
				if (evento.key === 'Escape') reporte = null;
			}}
		>
			<div
				class="modal"
				role="dialog"
				aria-modal="true"
				tabindex="-1"
				aria-label="Resultado de la importación"
				onclick={(evento) => evento.stopPropagation()}
				onkeydown={(evento) => evento.stopPropagation()}
			>
				<header class="modal-cabecera">
					<h2>
						{reporte.tipo === 'ok'
							? 'Importación completada'
							: reporte.tipo === 'parcial'
								? 'Importación completada con observaciones'
								: 'No se pudo importar'}
					</h2>
					<button type="button" class="btn-cerrar" aria-label="Cerrar" onclick={() => (reporte = null)}>×</button>
				</header>

				<div class="modal-cuerpo">
					{#if reporte.tipo === 'error'}
						<p class="mensaje-texto">{reporte.mensaje}</p>

						{#if reporte.faltantes}
							<p class="mensaje-texto">
								Estos valores no están en los catálogos. Agregalos antes de volver a importar:
							</p>
							<ul class="lista-omitidos">
								{#each Object.entries(reporte.faltantes) as [catalogo, valores]}
									<li>
										<span>{catalogo}</span>
										<span class="motivo">{valores.join(', ')}</span>
									</li>
								{/each}
							</ul>
						{/if}

						{#if reporte.detalles && reporte.detalles.length > 0}
							<ul class="lista-omitidos">
								{#each reporte.detalles as detalle}
									<li>
										<span>{detalle.campo}</span>
										<span class="motivo">{detalle.mensaje}</span>
									</li>
								{/each}
							</ul>
						{/if}
					{:else}
						<p class="mensaje-texto">
							{reporte.resumen.filas} filas · {reporte.resumen.plantillasNuevas} plantillas nuevas ·
							{reporte.resumen.plantillasReutilizadas} existentes · {reporte.resumen.lineasInsertadas} líneas importadas.
						</p>

						{#if reporte.tipo === 'parcial'}
							<p class="mensaje-texto">
								Estas plantillas no se importaron porque el servicio no existe o está deshabilitado. Cargalo
								desde la pantalla Servicios y volvé a importar la planilla:
							</p>
							<ul class="lista-omitidos">
								{#each reporte.resumen.serviciosOmitidos as omitido}
									<li>
										<span>{omitido.contacto}</span>
										<span class="motivo">{omitido.motivo === 'NO_EXISTE' ? 'No existe' : 'Deshabilitado'}</span>
									</li>
								{/each}
							</ul>
						{/if}
					{/if}
				</div>

				<footer class="modal-pie">
					<button type="button" class="btn-primario" onclick={() => (reporte = null)}>Entendido</button>
				</footer>
			</div>
		</div>
	{/if}

	<!-- Dos caminos: descargar el modelo con ejemplos o importar una planilla. -->
	{#if modalImportacion}
		<ModalPanel
			titulo="Importar planilla de facturación"
			subtitulo="Descargá el modelo con ejemplos o subí tu planilla mensual."
			etiqueta="MULTIFACTURACIÓN"
			compacto
			onCerrar={cerrarImportacion}
		>
			<div class="importar-opciones">
				<button type="button" class="importar-opcion" onclick={descargarModelo}>
					<span class="importar-icono">{@html iconos.descargar}</span>
					<span>
						<strong>Descargar plantilla</strong>
						<small>Los 17 encabezados y 4 filas de ejemplo para completar.</small>
					</span>
				</button>
				<button
					type="button"
					class="importar-opcion"
					disabled={importando}
					onclick={elegirArchivo}
				>
					<span class="importar-icono">{@html iconos.capas}</span>
					<span>
						<strong>Importar planilla</strong>
						<small>Seleccioná un archivo .xlsx o .xls de tu equipo.</small>
					</span>
				</button>
			</div>
			<p class="importar-nota">
				La primera hoja debe tener los encabezados del modelo. <strong>Contacto: nombre</strong> y
				<strong>Artículo: código</strong> son obligatorios; <strong>Número</strong> agrupa las líneas
				de una misma factura.
			</p>
		</ModalPanel>
	{/if}
</section>

<style>
	.pantalla { min-width: 0; color: var(--texto); }
	/* Flota sobre el banner superior (z-index 40) para no ocupar alto del cuerpo. */
	.pestanas {
		position: fixed;
		top: 0.55rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 50;
		display: flex;
		width: min(24rem, calc(100vw - 2rem));
		padding: 0.22rem;
		border: 1px solid var(--borde);
		border-radius: 0.9rem;
		background: var(--superficie);
		box-shadow: 0 8px 20px rgba(35, 48, 110, 0.14);
	}
	.pestanas button { flex: 1; border: 0; border-radius: .65rem; padding: .48rem .55rem; background: transparent; color: var(--texto); font: inherit; font-size: .74rem; font-weight: 800; cursor: pointer; transition: background 180ms ease, color 180ms ease, box-shadow 180ms ease; }
	.pestanas button.seleccionada { background: var(--primario); color: white; box-shadow: 0 8px 16px rgba(80,72,245,.25); }
	.barra-herramientas { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1.15rem; padding: 1rem 1.15rem; border: 1px solid var(--borde); border-radius: 1rem; background: var(--superficie-panel); }
	.buscador { display: flex; align-items: center; gap: .65rem; width: min(22rem, 100%); padding: .68rem .8rem; border: 1px solid var(--borde); border-radius: .75rem; background: var(--superficie-alta); color: var(--texto); }
	.buscador span { display: grid; width: 1rem; place-items: center; font-size: .8rem; }
	.buscador input { width: 100%; border: 0; outline: 0; background: transparent; color: var(--texto); font: inherit; font-size: .75rem; }
	.controles { display: flex; align-items: center; gap: 1rem; color: var(--texto-suave); font-size: .68rem; white-space: nowrap; }
	.selector { display: grid; gap: 1px; padding: 0; border: 0; background: transparent; }
	.selector .etiqueta { color: var(--texto-suave); font-size: .6rem; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; }
	.selector select { width: 100%; min-height: 2.5rem; appearance: none; padding: .5rem 2rem .5rem .7rem; border: 1px solid var(--borde); border-radius: .7rem; background-color: var(--superficie); background-image: var(--chevron-select); background-repeat: no-repeat; background-position: right .7rem center; background-size: .65rem; color: var(--texto); font: inherit; font-size: .72rem; cursor: pointer; }
	.leyenda { display: inline-flex; align-items: center; gap: .35rem; }
	.punto { width: .62rem; height: .62rem; border-radius: 50%; }
	.punto-grupo { background: var(--primario); } .punto-plantilla { background: var(--exito); }
	.btn-importar { border: 0; border-radius: .7rem; padding: .68rem 1rem; background: var(--primario); color: white; font: inherit; font-size: .72rem; font-weight: 700; cursor: pointer; box-shadow: 0 8px 16px rgba(80,72,245,.25); }
	.btn-importar:disabled { opacity: .6; cursor: progress; }
	.importar-opciones { display: grid; gap: .7rem; }
	.importar-opcion { display: flex; align-items: flex-start; gap: .85rem; width: 100%; padding: .9rem 1rem; border: 1px solid var(--borde); border-radius: .8rem; background: var(--superficie-alta); color: var(--texto); font: inherit; text-align: left; cursor: pointer; transition: border-color 150ms ease, background 150ms ease, box-shadow 150ms ease; }
	.importar-opcion:hover { border-color: var(--primario); background: var(--superficie); box-shadow: 0 8px 18px rgba(80,72,245,.12); }
	.importar-opcion:disabled { opacity: .6; cursor: progress; }
	.importar-icono { display: grid; flex: 0 0 auto; width: 2.2rem; height: 2.2rem; place-items: center; border-radius: .6rem; background: var(--primario-tenue); color: var(--primario-texto); font-size: 1.15rem; }
	.importar-opcion strong { display: block; margin-bottom: .15rem; font-size: .82rem; }
	.importar-opcion small { display: block; color: var(--texto-suave); font-size: .7rem; line-height: 1.4; }
	.importar-nota { margin: .95rem 0 0; padding: .7rem .8rem; border-left: 3px solid var(--primario-borde); border-radius: .45rem; background: var(--superficie-alta); color: var(--texto-suave); font-size: .71rem; line-height: 1.5; }
	.importar-nota strong { color: var(--texto); }
	.oculto { display: none; }
	.mensaje { margin: 0 0 1rem; padding: .7rem .9rem; border-radius: .7rem; font-size: .74rem; }
	.error-mensaje { border: 1px solid var(--peligro-borde); background: var(--peligro-tenue); color: var(--peligro-texto); }
	.ok-mensaje { border: 1px solid var(--exito-borde); background: var(--exito-tenue); color: var(--exito-texto); }

	/* Período y fecha general leídos del Facturador. */
	.info-periodo { display: grid; gap: .5rem; padding: .75rem .85rem; border: 1px solid var(--primario-borde); border-radius: .7rem; background: var(--primario-tenue); }
	.info-periodo.sin-configurar { border-color: var(--peligro-borde); background: var(--peligro-tenue); }
	.info-linea { display: flex; align-items: baseline; justify-content: space-between; gap: .75rem; }
	.info-linea span { color: var(--texto-suave); font-size: .62rem; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; }
	.info-linea strong { color: var(--texto); font-size: .82rem; }
	.info-periodo.sin-configurar .mensaje-texto { color: var(--peligro-texto); }
	.info-periodo .btn-secundario { justify-self: start; }

	/* Plantillas del lote que ya tienen factura en el período elegido. */
	.aviso-existentes { display: grid; gap: .45rem; padding: .7rem .8rem; border: 1px solid var(--alerta-borde); border-radius: .7rem; background: var(--alerta-tenue); }
	.aviso-existentes .aviso-titulo,
	.aviso-existentes .aviso-pie { margin: 0; color: var(--alerta-texto); font-size: .73rem; line-height: 1.45; }
	.aviso-existentes .aviso-pie { color: var(--alerta-texto); }
	.aviso-existentes ul { display: grid; gap: .3rem; margin: 0; padding: 0; list-style: none; }
	.aviso-existentes li { display: flex; align-items: center; justify-content: space-between; gap: .6rem; font-size: .73rem; color: var(--alerta-texto); }
	.existente-contacto { font-weight: 600; }
	.existente-estado { flex-shrink: 0; padding: .1rem .5rem; border: 1px solid; border-radius: 999px; font-size: .6rem; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; white-space: nowrap; }
	.estado-proceso { border-color: var(--info-borde); background: var(--info-tenue); color: var(--info-texto); }
	.estado-pendiente { border-color: var(--alerta-borde); background: var(--alerta-tenue); color: var(--alerta-texto); }
	.estado-bandeja { border-color: var(--primario-borde); background: var(--primario-tenue); color: var(--primario-texto); }
	.estado-facturado { border-color: var(--exito-borde); background: var(--exito-tenue); color: var(--exito-texto); }
	.estado-cobrado { border-color: var(--teal-borde); background: var(--teal-tenue); color: var(--teal-texto); }
	.estado-eliminado { border-color: var(--borde); background: var(--superficie-suave); color: var(--texto-suave); }
	.tabla { overflow: visible; border: 1px solid var(--borde); border-radius: 1rem 1rem 0 0; background: var(--superficie-panel); box-shadow: 0 12px 30px rgba(49, 64, 129, .08); }
	.cabecera-tabla, .fila { display: grid; grid-template-columns: 3.2rem minmax(12rem, 1.15fr) minmax(16rem, 1.75fr) 5.5rem minmax(12rem, 1.1fr) 5.5rem 8.5rem 3.7rem; align-items: center; }
	.cabecera-tabla { min-height: 3.1rem; padding: 0 .35rem; border-radius: 1rem 1rem 0 0; background: var(--tabla-gradiente); color: white; font-size: .62rem; font-weight: 800; text-transform: uppercase; }
	.cabecera-tabla span:not(:first-child) { padding-left: .45rem; }
	.cabecera-grupo { position: relative; display: flex; align-items: center; gap: .7rem; min-height: 3.25rem; padding: 0 .35rem; }
	.cabecera-grupo .btn-icono { border-color: rgba(255, 255, 255, .45); color: inherit; }
	.cabecera-grupo .btn-icono:hover { background: rgba(255, 255, 255, .16); border-color: #fff; color: inherit; }
	.cabecera-grupo input[type='checkbox'] { accent-color: #fff; }
	.etiqueta-grupo { padding: .35rem .72rem; border-radius: .55rem; background: rgba(255,255,255,.18); color: var(--texto-inverso); font-size: .68rem; font-weight: 800; }
	.resumen-grupo { margin-left: auto; font-size: .68rem; }
	.chevron-grupo { width: 1rem; border: 0; background: transparent; color: inherit; font-size: .9rem; cursor: pointer; }
	.fila { position: relative; min-height: 2.4rem; padding: var(--fila-padding-y, 2px) .35rem; border-bottom: var(--tabla-linea-grosor, 1px) solid var(--tabla-linea-color, var(--borde-suave)); font-size: .72rem; }
	.fila .celda, .fila .col-lineas { padding-left: .45rem; min-width: 0; }
	/* Color intercalado configurable (variables globales de Configuración). */
	.fila { background: var(--fila-impar-fondo, var(--superficie)); color: var(--fila-impar-texto, var(--texto)); }
	.fila.par { background: var(--fila-par-fondo, var(--superficie-suave)); color: var(--fila-par-texto, var(--texto)); }
	/* La selección NO reemplaza el fondo: se marca con un velo tenue encima del
	   color alternado y un anillo interior, así la fila conserva su color. */
	.fila.seleccionada-fila { background-image: linear-gradient(rgba(80,72,245,.14), rgba(80,72,245,.14)); box-shadow: inset 0 0 0 2px var(--primario); }
	.contacto { display: block; font-weight: 700; font-size: .72rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	/* Chips editables de la plantilla: comprobante, moneda, precio e ID de cliente. */
	.chips { display: flex; align-items: center; gap: .3rem; flex-wrap: wrap; margin-top: .32rem; }
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
	.chip-cliente { border-color: var(--rosa-borde); background: var(--rosa-tenue); color: var(--rosa-texto); }
	.chip.entrada-id { width: 4.2rem; text-align: center; }
	.lista-omitidos { display: grid; gap: .3rem; margin: 0; padding: 0; list-style: none; max-height: 16rem; overflow: auto; }
	.lista-omitidos li { display: flex; justify-content: space-between; gap: 1rem; padding: .4rem .55rem; border: var(--lista-linea-grosor, 1px) solid var(--lista-linea-color, var(--borde-suave)); border-radius: .55rem; font-size: .72rem; }
	.lista-omitidos .motivo { color: var(--peligro-texto); font-weight: 700; font-size: .62rem; white-space: nowrap; }
	.comentario { color: var(--texto-suave); font-size: .68rem; line-height: 1.35; overflow: hidden; text-overflow: ellipsis; }
	.col-lineas { display: flex; flex-direction: column; justify-content: center; }
	.sub { display: block; padding: 2px 0; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.sub.codigo { cursor: help; text-decoration: underline dotted rgba(80, 72, 245, .35); text-underline-offset: 3px; }
	.importe { font-size: .78rem !important; font-weight: 600; }
	/* Edición rápida inline (igual que el Facturador). */
	.celda-editable { position: relative; }
	.texto-editable {
		display: block;
		width: 100%;
		padding: 0;
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: text;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.texto-editable:hover { color: var(--primario-texto); text-decoration: underline dotted rgba(80, 72, 245, .45); text-underline-offset: 3px; }
	.texto-editable.importe { font-size: .78rem; font-weight: 600; }
	.entrada { width: 100%; padding: .16rem .3rem; border: 1px solid var(--primario); border-radius: .35rem; background: var(--superficie); font: inherit; font-size: .7rem; }
	.entrada.numero { text-align: right; }
	input[type='checkbox'] { width: 1rem; height: 1rem; accent-color: var(--foco); cursor: pointer; }
	.acciones-fila { position: relative; display: flex; justify-content: center; }
	/* Botón de edición (lápiz): única acción por plantilla y por grupo. */
	.btn-icono {
		display: grid;
		place-items: center;
		width: 2.15rem;
		height: 2.15rem;
		border: 1px solid var(--borde);
		border-radius: .65rem;
		background: transparent;
		color: var(--texto-suave);
		font-size: .95rem;
		cursor: pointer;
		transition: background 150ms ease, color 150ms ease, border-color 150ms ease;
	}
	.btn-icono:hover { background: var(--primario-tenue); border-color: var(--borde-fuerte); color: var(--primario-texto); }
	.btn-icono:focus-visible { outline: 2px solid var(--foco); outline-offset: 2px; }

	/* La barra flotante vive en BarraLotes.svelte. */
	.estado-vacio { display: grid; place-items: center; gap: .35rem; min-height: 20rem; padding: 2rem; border: 1px solid var(--borde); border-radius: 1rem; background: var(--superficie-panel); text-align: center; }
	.estado-icono { color: var(--primario-texto); font-size: 2rem; } .estado-vacio h1 { margin: .5rem 0 0; font-size: 1.4rem; } .estado-vacio p { color: var(--texto-suave); font-size: .85rem; }
	@media (max-width: 60rem) { .barra-herramientas { align-items: stretch; flex-direction: column; } .controles { justify-content: space-between; flex-wrap: wrap; } .tabla { overflow-x: auto; } .cabecera-tabla, .fila { min-width: 75rem; } }
	@media (max-width: 40rem) { .controles { align-items: stretch; flex-direction: column; } .leyenda { display: none; } }

	.fondo-modal { position: fixed; inset: 0; z-index: 70; display: grid; place-items: center; padding: 1.5rem; background: var(--velo-modal); }
	.modal { display: grid; width: min(28rem, 100%); border-radius: 1rem; background: var(--modal-fondo); box-shadow: var(--sombra-modal); }
	.modal-cabecera { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1.1rem 1.25rem; border-bottom: 1px solid var(--borde-suave); }
	.modal-cabecera h2 { margin: 0; font-size: .95rem; }
	.btn-cerrar { border: 0; background: transparent; color: var(--texto-suave); font-size: 1.3rem; line-height: 1; cursor: pointer; }
	.modal-cuerpo { display: grid; gap: .85rem; padding: 1.1rem 1.25rem; }
	.mensaje-texto { margin: 0; color: var(--texto-suave); font-size: .74rem; line-height: 1.45; }
	.modal-pie { display: flex; justify-content: flex-end; gap: .55rem; padding: 1rem 1.25rem; border-top: 1px solid var(--borde-suave); }
	.btn-primario { border: 0; border-radius: .7rem; padding: .62rem 1rem; background: var(--primario); color: var(--texto-inverso); font: inherit; font-size: .72rem; font-weight: 700; cursor: pointer; }
	.btn-secundario { border: 1px solid var(--borde); border-radius: .7rem; padding: .62rem 1rem; background: var(--superficie-alta); color: var(--texto-suave); font: inherit; font-size: .72rem; font-weight: 700; cursor: pointer; }
	.btn-primario:disabled, .btn-secundario:disabled { opacity: .55; cursor: progress; }

	/* En pantallas angostas no hay lugar libre en el banner: la píldora vuelve
	   al flujo normal debajo de él. */
	@media (max-width: 56rem) {
		.pestanas { position: static; transform: none; width: 100%; margin: 0 auto 1.15rem; }
	}
</style>
