/**
 * Capa: ServiciosDatosAPI (facturas)
 *
 * Único punto del frontend que habla con los endpoints del Facturador y de las
 * variables. Las pantallas no llaman a `fetch` directamente.
 */

export type EstadoFactura =
	| 'PROCESO'
	| 'PENDIENTE'
	| 'BANDEJA'
	| 'FACTURADO'
	| 'COBRADO'
	| 'ELIMINADO';

export interface LineaFactura {
	id: number;
	articuloId: number;
	codigo: string;
	descripcion: string;
	cantidad: string;
	importeUnitario: string;
	detalle: string | null;
	comentario: string | null;
}

export interface FacturaListado {
	id: number;
	grupoId: number;
	grupoNombre: string;
	grupoColorFondo: string;
	grupoColorTexto: string;
	plantillaId: number;
	periodo: string;
	contactoFacturacion: string;
	nombreFantasia: string | null;
	numeracion: string | null;
	tipoNumeracion: string;
	tipoGestion: string;
	tipoCliente: string;
	modalidadCobranza: string;
	tipoGestionFacturacion: string;
	comentarioGestionFacturacion: string | null;
	moneda: string;
	tipoComprobante: string | null;
	tipoPrecio: string | null;
	idCliente: number | null;
	fecha: string | null;
	estado: EstadoFactura;
	motivoPendiente: string | null;
	facturadoEn: string | null;
	facturadoPor: 'MULTIFACTURACION' | 'API' | 'MANUAL' | null;
	facturadoVisto: boolean;
	serie: string | null;
	numero: string | null;
	comentarioGeneral: string | null;
	ordenManual: number | null;
	idCompra: string | null;
	detalleAuxiliar: string | null;
	uteVencimiento: string | null;
	informacionAdicional: string | null;
	lineas: LineaFactura[];
}

export interface ResumenCopia {
	facturasCreadas: number;
	omitidas: number;
}

export interface Variable {
	id: number;
	nombre: string;
	/** Último valor usado, persistido como preferencia de trabajo. */
	valor: string | null;
}

async function leerError(res: Response, respaldo: string): Promise<string> {
	const datos = await res.json().catch(() => ({}));
	const detalle = Array.isArray(datos?.detalles) && datos.detalles.length > 0
		? ` (${datos.detalles[0].campo}: ${datos.detalles[0].mensaje})`
		: '';
	return `${datos?.error ?? respaldo}${detalle}`;
}

/** Lista las facturas vivas, opcionalmente filtradas por estado. */
export async function listarFacturas(estado?: EstadoFactura): Promise<FacturaListado[]> {
	const url = estado ? `/api/facturas?estado=${encodeURIComponent(estado)}` : '/api/facturas';
	const res = await fetch(url);
	if (!res.ok) throw new Error('No se pudieron cargar las facturas');
	return res.json();
}

/** Copia las plantillas seleccionadas al Facturador para el período indicado. */
export async function enviarAlFacturador(
	plantillaIds: number[],
	periodo: string,
	fecha: string
): Promise<ResumenCopia> {
	const res = await fetch('/api/facturas', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ plantillaIds, periodo, fecha })
	});

	if (!res.ok) throw new Error(await leerError(res, 'No se pudieron enviar las plantillas'));
	return res.json();
}

/** Edita la cabecera de una factura. */
export async function actualizarFactura(
	id: number,
	cambios: {
		comentarioGeneral?: string | null;
		moneda?: '$' | 'USD';
		tipoComprobante?: string | null;
		tipoPrecio?: string | null;
		idCliente?: number | null;
		fecha?: string | null;
		serie?: string | null;
		numero?: string | null;
		ordenManual?: number | null;
		idCompra?: string | null;
		detalleAuxiliar?: string | null;
		uteVencimiento?: string | null;
		informacionAdicional?: string | null;
	}
): Promise<void> {
	const res = await fetch(`/api/facturas/${id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(cambios)
	});

	if (!res.ok) throw new Error(await leerError(res, 'No se pudo guardar la factura'));
}

/** Edición rápida de una línea. El código se valida contra el catálogo. */
export async function actualizarLineaFactura(
	facturaId: number,
	lineaId: number,
	cambios: {
		codigo?: string;
		cantidad?: number;
		importeUnitario?: number;
		detalle?: string | null;
		comentario?: string | null;
	}
): Promise<LineaFactura> {
	const res = await fetch(`/api/facturas/${facturaId}/lineas/${lineaId}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(cambios)
	});

	if (!res.ok) throw new Error(await leerError(res, 'No se pudo guardar la línea'));
	return res.json();
}

/** Agrega una línea de facturación a la factura. */
export async function agregarLineaFactura(
	facturaId: number,
	datos: {
		codigo: string;
		cantidad: number;
		importeUnitario: number;
		detalle?: string | null;
		comentario?: string | null;
	}
): Promise<LineaFactura> {
	const res = await fetch(`/api/facturas/${facturaId}/lineas`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(datos)
	});

	if (!res.ok) throw new Error(await leerError(res, 'No se pudo agregar la línea'));
	return res.json();
}

/** Elimina una línea de la factura de forma definitiva. */
export async function eliminarLineaFactura(facturaId: number, lineaId: number): Promise<void> {
	const res = await fetch(`/api/facturas/${facturaId}/lineas/${lineaId}`, { method: 'DELETE' });
	if (!res.ok) throw new Error(await leerError(res, 'No se pudo eliminar la línea'));
}

/** Devuelve facturas de la Bandeja al Facturador (BANDEJA → PROCESO). */
export async function devolverAFacturador(ids: number[]): Promise<number> {
	const res = await fetch('/api/facturas/devolver', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ ids })
	});

	const datos = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(datos?.error ?? 'No se pudieron devolver las facturas');
	return datos.devueltas ?? 0;
}

/** Marca como FACTURADO las facturas exportadas en la planilla. */
export async function marcarFacturadas(ids: number[]): Promise<number> {
	const res = await fetch('/api/facturas/facturado', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ ids })
	});

	const datos = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(datos?.error ?? 'No se pudieron marcar como facturadas');
	return datos.marcadas ?? 0;
}

/** Marca como vistos los envíos: dejan de mostrarse en el histórico. */
export async function marcarEnviosVistos(ids: number[]): Promise<number> {
	const res = await fetch('/api/facturas/envios/visto', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ ids })
	});

	const datos = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(datos?.error ?? 'No se pudieron limpiar los envíos');
	return datos.vistas ?? 0;
}

/** Cambia el estado de una factura. */
export async function cambiarEstadoFactura(	id: number,
	cambio: {
		estado: Exclude<EstadoFactura, 'ELIMINADO'>;
		motivo?: string | null;
		fecha?: string | null;
		variables?: Record<string, string>;
	}
): Promise<void> {
	const res = await fetch(`/api/facturas/${id}/estado`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(cambio)
	});

	if (!res.ok) throw new Error(await leerError(res, 'No se pudo cambiar el estado'));
}

/** Borrado lógico por lote. */
export async function eliminarFacturas(ids: number[]): Promise<number> {	const res = await fetch('/api/facturas/eliminar', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ ids })
	});

	const datos = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(datos?.error ?? 'No se pudieron eliminar las facturas');
	return datos.eliminadas ?? 0;
}

/** Lista las variables con su último valor usado. */
export async function listarVariables(): Promise<Variable[]> {
	const res = await fetch('/api/variables');
	if (!res.ok) throw new Error('No se pudieron cargar las variables');
	return res.json();
}

/** Guarda el catálogo completo de variables y sus últimos valores. */
export async function guardarVariables(
	variables: { nombre: string; valor?: string | null }[]
): Promise<Variable[]> {
	const res = await fetch('/api/variables', {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ variables })
	});

	if (!res.ok) throw new Error(await leerError(res, 'No se pudieron guardar las variables'));
	return res.json();
}

/** Crea una variable (idempotente). */
export async function crearVariable(nombre: string): Promise<Variable> {
	const res = await fetch('/api/variables', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ nombre })
	});

	if (!res.ok) throw new Error(await leerError(res, 'No se pudo crear la variable'));
	return res.json();
}

/** Elimina el nombre de una variable. */
export async function eliminarVariable(id: number): Promise<void> {
	const res = await fetch(`/api/variables/${id}`, { method: 'DELETE' });
	if (!res.ok) throw new Error(await leerError(res, 'No se pudo eliminar la variable'));
}
