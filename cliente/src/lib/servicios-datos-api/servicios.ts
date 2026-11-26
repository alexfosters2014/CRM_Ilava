import { leerServiciosDesdeExcel, type FilaServicio } from '#lib/servicios/importacion.ts';

/**
 * Capa: ServiciosDatosAPI (servicios)
 *
 * Pantalla Servicios: listado, importación desde su propio Excel y edición
 * (incluye el switch de habilitado/deshabilitado).
 */

export interface ServicioListado {
	id: number;
	contactoFacturacion: string;
	nombreFantasia: string | null;
	numeracion: string | null;
	tipoNumeracion: string;
	grupoId: number;
	grupoNombre: string;
	grupoCobranzaId: number | null;
	grupoCobranza: string | null;
	tipoGestion: string;
	tipoCliente: string;
	modalidadCobranza: string;
	tipoGestionFacturacion: string;
	comentarioGestionFacturacion: string | null;
	/** Celular de WhatsApp normalizado (598 + 8 dígitos) o null. */
	celular: string | null;
	/** Plazo de pago en días (emisión → vencimiento). */
	cantidadDiasVencimiento: number;
	habilitado: boolean;
}

export interface ResumenImportacionServicios {
	filas: number;
	creados: number;
	duplicados: string[];
}

export type TipoNumeracion = 'RUT' | 'CEDULA' | 'OTROS' | 'SIN_NUMERACION';

export async function listarServicios(): Promise<ServicioListado[]> {
	const res = await fetch('/api/servicios');
	if (!res.ok) throw new Error('No se pudieron cargar los servicios');
	return res.json();
}

export async function importarServiciosDesdeArchivo(archivo: File): Promise<ResumenImportacionServicios> {
	const filas: FilaServicio[] = await leerServiciosDesdeExcel(archivo);
	return crearServiciosDesdeFilas(filas);
}

export async function crearServiciosDesdeFilas(filas: FilaServicio[]): Promise<ResumenImportacionServicios> {

	const res = await fetch('/api/servicios', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ filas })
	});

	const datos = await res.json().catch(() => ({}));
	if (!res.ok) {
		if (datos?.faltantes) {
			const mensaje = Object.entries(datos.faltantes as Record<string, string[]>)
				.map(([catalogo, valores]) => `${catalogo}: ${valores.join(', ')}`)
				.join(' · ');
			throw new Error(`Faltan valores de catálogo — ${mensaje}`);
		}
		const detalle = Array.isArray(datos?.detalles) && datos.detalles.length > 0
			? ` (${datos.detalles[0].campo}: ${datos.detalles[0].mensaje})`
			: '';
		throw new Error(`${datos?.error ?? 'No se pudieron importar los servicios'}${detalle}`);
	}

	return datos;
}

export async function actualizarServicio(
	id: number,
	cambios: {
	nombreFantasia?: string | null;
	numeracion?: string | null;
	tipoNumeracion?: TipoNumeracion;
	grupoId?: number;
	grupoCobranzaId?: number | null;
	tipoGestionId?: number;
	tipoClienteId?: number;
	modalidadCobranzaId?: number;
	tipoGestionFacturacionId?: number;
	comentarioGestionFacturacion?: string | null;
	/** Móvil uruguayo en cualquier formato; el backend lo normaliza. */
	celular?: string | null;
	cantidadDiasVencimiento?: number;
	habilitado?: boolean;
}
): Promise<void> {
	const res = await fetch(`/api/servicios/${id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(cambios)
	});

	const datos = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(datos?.error ?? 'No se pudo guardar el servicio');
}
