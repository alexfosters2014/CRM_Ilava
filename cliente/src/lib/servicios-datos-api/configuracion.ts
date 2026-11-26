/**
 * Capa: ServiciosDatosAPI (configuración)
 *
 * Catálogos administrables, grupos con colores y apariencia global.
 */

export type CatalogoAdmin =
	| 'tipos-comprobantes'
	| 'tipos-precios'
	| 'monedas'
	| 'tipos-gestion'
	| 'tipos-cliente'
	| 'modalidades-cobranza'
	| 'tipos-gestion-facturacion'
	| 'articulos';

export interface ValorCatalogo {
	id: number;
	nombre: string;
	activo: boolean;
	abreviatura?: string | null;
	descripcion?: string;
	monedaId?: number | null;
	moneda?: string | null;
}

export interface CatalogosAdmin {
	tiposComprobantes: ValorCatalogo[];
	tiposPrecios: ValorCatalogo[];
	monedas: ValorCatalogo[];
	tiposGestion: ValorCatalogo[];
	tiposCliente: ValorCatalogo[];
	modalidadesCobranza: ValorCatalogo[];
	tiposGestionFacturacion: ValorCatalogo[];
	articulos: ValorCatalogo[];
}

export interface GrupoAdmin {
	id: number;
	nombre: string;
	colorFondo: string;
	colorTexto: string;
	activo: boolean;
}

export interface Apariencia {
	filaParFondo: string;
	filaParTexto: string;
	filaImparFondo: string;
	filaImparTexto: string;
	tablaLineaColor: string;
	tablaLineaGrosor: number;
	filaPaddingY: number;
	listaLineaColor: string;
	listaLineaGrosor: number;
}

export interface GrupoCobranzaAdmin extends GrupoAdmin {
	orden: number;
}

export interface Configuracion {
	catalogos: CatalogosAdmin;
	grupos: GrupoAdmin[];
	gruposCobranza: GrupoCobranzaAdmin[];
	apariencia: Apariencia;
	facturacion: ConfiguracionFacturacion;
}

export interface ConfiguracionFacturacion {
	serie: string;
	/** Período en proceso (`YYYY-MM`), configurado en el Facturador. */
	periodo: string | null;
	/** Fecha general del envío (`YYYY-MM-DD`). */
	fechaGeneral: string | null;
}

async function leerError(res: Response, respaldo: string): Promise<string> {
	const datos = await res.json().catch(() => ({}));
	const detalle = Array.isArray(datos?.detalles) && datos.detalles.length > 0
		? ` (${datos.detalles[0].campo}: ${datos.detalles[0].mensaje})`
		: '';
	return `${datos?.error ?? respaldo}${detalle}`;
}

export async function listarConfiguracion(): Promise<Configuracion> {
	const res = await fetch('/api/configuracion');
	if (!res.ok) throw new Error('No se pudo cargar la configuración');
	return res.json();
}

export async function crearValorCatalogo(
	catalogo: CatalogoAdmin,
	datos: {
		nombre?: string;
		codigo?: string;
		descripcion?: string;
		abreviatura?: string | null;
		monedaId?: number | null;
	}
): Promise<void> {
	const res = await fetch(`/api/configuracion/catalogos/${catalogo}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(datos)
	});

	if (!res.ok) throw new Error(await leerError(res, 'No se pudo crear el valor'));
}

export async function actualizarValorCatalogo(
	catalogo: CatalogoAdmin,
	id: number,
	datos: {
		nombre?: string;
		codigo?: string;
		descripcion?: string;
		abreviatura?: string | null;
		monedaId?: number | null;
		activo?: boolean;
	}
): Promise<void> {
	const res = await fetch(`/api/configuracion/catalogos/${catalogo}/${id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(datos)
	});

	if (!res.ok) throw new Error(await leerError(res, 'No se pudo guardar el valor'));
}

export async function crearGrupo(datos: {
	nombre: string;
	colorFondo: string;
	colorTexto: string;
}): Promise<void> {
	const res = await fetch('/api/configuracion/grupos', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(datos)
	});

	if (!res.ok) throw new Error(await leerError(res, 'No se pudo crear el grupo'));
}

export async function listarGruposCobranza(): Promise<GrupoCobranzaAdmin[]> {
	const res = await fetch('/api/configuracion/grupos-cobranza');
	if (!res.ok) throw new Error('No se pudieron cargar los grupos de cobranza');
	return res.json();
}

export async function crearGrupoCobranza(datos: {
	nombre: string;
	colorFondo: string;
	colorTexto: string;
	orden?: number;
}): Promise<void> {
	const res = await fetch('/api/configuracion/grupos-cobranza', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(datos)
	});
	if (!res.ok) throw new Error(await leerError(res, 'No se pudo crear el grupo de cobranza'));
}

export async function actualizarGrupoCobranza(
	id: number,
	datos: { nombre?: string; colorFondo?: string; colorTexto?: string; orden?: number; activo?: boolean }
): Promise<void> {
	const res = await fetch(`/api/configuracion/grupos-cobranza/${id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(datos)
	});
	if (!res.ok) throw new Error(await leerError(res, 'No se pudo guardar el grupo de cobranza'));
}

export async function actualizarGrupo(
	id: number,
	datos: { nombre?: string; colorFondo?: string; colorTexto?: string; activo?: boolean }
): Promise<void> {
	const res = await fetch(`/api/configuracion/grupos/${id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(datos)
	});

	if (!res.ok) throw new Error(await leerError(res, 'No se pudo guardar el grupo'));
}

export async function guardarApariencia(datos: Apariencia): Promise<void> {
	const res = await fetch('/api/configuracion/apariencia', {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(datos)
	});

	if (!res.ok) throw new Error(await leerError(res, 'No se pudo guardar la apariencia'));
}

export async function guardarConfiguracionFacturacion(
	datos: Partial<ConfiguracionFacturacion>
): Promise<ConfiguracionFacturacion> {
	const res = await fetch('/api/configuracion/facturacion', {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(datos)
	});

	if (!res.ok) throw new Error(await leerError(res, 'No se pudo guardar la configuración de facturación'));
	return res.json();
}

export async function obtenerConfiguracionFacturacion(): Promise<ConfiguracionFacturacion> {
	const res = await fetch('/api/configuracion/facturacion');
	if (!res.ok) throw new Error('No se pudo cargar la configuración de facturación');
	return res.json();
}
