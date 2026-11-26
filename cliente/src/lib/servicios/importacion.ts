import * as XLSX from 'xlsx';

/**
 * Capa: Servicios (frontend) — lectura de planillas.
 *
 * SheetJS corre en el navegador: los archivos .xlsx se leen acá y al backend
 * solo viajan las filas normalizadas como JSON. Hay DOS lectores:
 * - `leerPlantillasDesdeExcel`: planilla mensual de facturación.
 * - `leerServiciosDesdeExcel`: planilla de servicios (contactos).
 */

export interface FilaImportacion {
	contacto: string;
	agrupador: string;
	fecha?: string | null;
	serie?: string | null;
	moneda?: string | null;
	tipoComprobante?: string | null;
	tipoPrecio?: string | null;
	articuloCodigo: string;
	cantidad?: number | null;
	importeUnitario?: number | null;
	comentario?: string | null;
	detalle?: string | null;
	informacionAdicional?: string | null;
	idCompra?: string | null;
	vencimiento?: string | null;
	idCliente?: string | null;
}

export interface FilaServicio {
	contacto: string;
	numeracion?: string | null;
	tipo?: string | null;
	tipoGestion?: string | null;
	tipoCliente?: string | null;
	modalidadCobranza?: string | null;
	grupo?: string | null;
	tipoGestionFacturacion?: string | null;
}

export interface FilaCobranza {
	filaExcel?: number;
	contacto: string;
	comprobante?: string | null;
	tipoComprobante?: string | null;
	serie?: string | null;
	numero?: string | null;
	fechaEmision?: string | null;
	fechaVencimiento?: string | null;
	moneda: string;
	importe: number;
	saldoPendiente: number;
	claveOrigen?: string | null;
}

export interface ValidacionCobranza {
	fila: number;
	mensaje: string;
}

/**
 * Clave estable para excluir una observación de Cobranza en futuras importaciones.
 *
 * El Excel trae `Comp.` como un solo texto (tipo + serie + número); acá se usan
 * las partes que ya separó `leerCobranzaDesdeExcel`:
 * - Con número: `numero|SERVICIO|TIPO COMPROBANTE|SERIE|NUMERO`.
 * - Sin número: `sincomprobante|SERVICIO`, que omite todas las filas sin
 *   comprobante de ese servicio.
 */
export function claveExclusionCobranza(fila: {
	contacto: string;
	tipoComprobante?: string | null;
	serie?: string | null;
	numero?: string | null;
}): string {
	const normalizar = (valor: string | null | undefined) =>
		(valor ?? '')
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.trim()
			.replace(/\s+/g, ' ')
			.toUpperCase();
	const servicio = normalizar(fila.contacto);
	const numero = normalizar(fila.numero);
	if (numero) {
		return `numero|${servicio}|${normalizar(fila.tipoComprobante)}|${normalizar(fila.serie)}|${numero}`;
	}
	return `sincomprobante|${servicio}`;
}

/** Encabezados del Excel de plantillas (normalizados) → campo del payload. */
const CAMPOS_PLANTILLA: Record<string, keyof FilaImportacion> = {
	'contacto: nombre': 'contacto',
	'contacto': 'contacto',
	'fecha': 'fecha',
	'serie': 'serie',
	'numero': 'agrupador',
	'numero agrupador': 'agrupador',
	'agrupador': 'agrupador',
	'moneda': 'moneda',
	'tipo de comprobante': 'tipoComprobante',
	'tipo de precio': 'tipoPrecio',
	'articulo: codigo': 'articuloCodigo',
	'articulo codigo': 'articuloCodigo',
	'articulo: comentario': 'detalle',
	'articulo comentario': 'detalle',
	'cantidad': 'cantidad',
	'importe unitario (x1)': 'importeUnitario',
	'importe unitario': 'importeUnitario',
	'comentario': 'comentario',
	'id cliente': 'idCliente',
	'efactura: id compra': 'idCompra',
	'ute fecha vencimiento:': 'vencimiento',
	'ute fecha vencimiento': 'vencimiento',
	'informacion adicional': 'informacionAdicional'
};

/** Hojas de la plantilla de servicios: solo la primera se importa. */
export const HOJA_SERVICIOS_IMPORTAR = 'Servicios a importar';
export const HOJA_PARAMETROS_SERVICIOS = 'Parámetros';

/** Encabezados de la hoja que se importa, en el orden del modelo. */
export const ENCABEZADOS_SERVICIOS = [
	'Contacto: nombre',
	'RUT / CI',
	'Tipo numeración',
	'Grupo',
	'Tipo de gestión',
	'Tipo de cliente',
	'Modalidad de cobranza',
	'Gestión de facturación'
] as const;

/** Valores admitidos para la numeración (vacío implica SIN_NUMERACION). */
export const TIPOS_NUMERACION_SERVICIO = ['RUT', 'CEDULA', 'OTROS'] as const;

/** Encabezados del Excel de servicios (normalizados) → campo del payload. */
const CAMPOS_SERVICIO: Record<string, keyof FilaServicio> = {
	'contacto: nombre': 'contacto',
	'contacto': 'contacto',
	'rut/ci': 'numeracion',
	'rut / ci': 'numeracion',
	'rut': 'numeracion',
	'ci': 'numeracion',
	'cedula': 'numeracion',
	'tipo': 'tipo',
	'tipo numeracion': 'tipo',
	'tipo_gestion': 'tipoGestion',
	'tipo gestion': 'tipoGestion',
	'tipo de gestion': 'tipoGestion',
	'tipo_cliente': 'tipoCliente',
	'tipo cliente': 'tipoCliente',
	'tipo de cliente': 'tipoCliente',
	'modalidad_cobranza': 'modalidadCobranza',
	'modalidad cobranza': 'modalidadCobranza',
	'modalidad de cobranza': 'modalidadCobranza',
	'grupo': 'grupo',
	'gestion facturacion': 'tipoGestionFacturacion',
	'gestion de facturacion': 'tipoGestionFacturacion',
	'tipo gestion facturacion': 'tipoGestionFacturacion'
};

const CAMPOS_COBRANZA: Record<string, keyof FilaCobranza> = {
	'contacto: nombre': 'contacto',
	'contacto': 'contacto',
	'servicio': 'contacto',
	'cliente': 'contacto',
	'comp.': 'comprobante',
	'comp': 'comprobante',
	'comprobante': 'comprobante',
	'vence': 'fechaVencimiento',
	'fecha': 'fechaEmision',
	'fecha emision': 'fechaEmision',
	'fecha emisión': 'fechaEmision',
	'fecha doc.': 'fechaEmision',
	'fecha doc': 'fechaEmision',
	'fecha documento': 'fechaEmision',
	'emision': 'fechaEmision',
	'emisión': 'fechaEmision',
	'serie': 'serie',
	'numero': 'numero',
	'número': 'numero',
	'numero comprobante': 'numero',
	'número comprobante': 'numero',
	'fecha vencimiento': 'fechaVencimiento',
	'vencimiento': 'fechaVencimiento',
	'moneda': 'moneda',
	'importe': 'importe',
	'importe total': 'importe',
	'importe pendiente': 'saldoPendiente',
	'saldo': 'saldoPendiente',
	'saldo pendiente': 'saldoPendiente',
	'clave origen': 'claveOrigen',
	'id comprobante': 'claveOrigen'
};

function normalizarClave(valor: string): string {
	return valor
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.trim()
		.replace(/\s+/g, ' ');
}

/** Convierte un serial de Excel (días desde 1899-12-30) a `YYYY-MM-DD`. */
function serialAFecha(serial: number): string | null {
	if (!Number.isFinite(serial) || serial <= 0) return null;
	const fecha = new Date(Math.round((serial - 25569) * 86400 * 1000));
	return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString().slice(0, 10);
}

/** Normaliza fechas: serial de Excel, DD/MM/AAAA o ISO. */
function aFecha(valor: unknown): string | null {
	if (typeof valor === 'number') return serialAFecha(valor);
	if (typeof valor !== 'string') return null;
	const texto = valor.trim();
	if (!texto) return null;
	if (/^\d{4}-\d{2}-\d{2}/.test(texto)) return texto.slice(0, 10);
	const partes = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
	if (partes) {
		const [, dia, mes, anio] = partes;
		const año = anio.length === 2 ? `20${anio}` : anio;
		return `${año}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
	}
	return null;
}

/** Convierte números del Excel usando el último separador como decimal. */
export function parsearNumeroImportacion(valor: unknown): number | null {
	if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
	if (typeof valor !== 'string') return null;
	let texto = valor.trim();
	if (!texto) return null;

	const tieneComa = texto.includes(',');
	const tienePunto = texto.includes('.');
	if (tieneComa && tienePunto) {
		// El último separador es el decimal: admite 1.234,56 y 1,234.56.
		const ultimoPunto = texto.lastIndexOf('.');
		const ultimaComa = texto.lastIndexOf(',');
		if (ultimaComa > ultimoPunto) texto = texto.replace(/\./g, '').replace(',', '.');
		else texto = texto.replace(/,/g, '');
	} else if (tieneComa) {
		texto = texto.replace(',', '.');
	} else if (/^\d{1,3}(\.\d{3})+$/.test(texto)) {
		// Solo puntos en grupos de 3: separador de miles.
		texto = texto.replace(/\./g, '');
	}

	const numero = Number(texto.replace(/[^0-9.\-]/g, ''));
	return Number.isFinite(numero) ? numero : null;
}

const aNumero = parsearNumeroImportacion;

function aTexto(valor: unknown): string {
	if (valor == null) return '';
	return String(valor).trim();
}

/** Lee las filas crudas de la primera hoja del archivo. */
function leerHoja(archivo: ArrayBuffer, filaEncabezados = 0): Record<string, unknown>[] {
	const libro = XLSX.read(archivo, { type: 'array' });
	const hoja = libro.Sheets[libro.SheetNames[0]];
	if (!hoja) throw new Error('El archivo no contiene hojas');
	return XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { defval: '', range: filaEncabezados });
}

/** Lee un `.xlsx` de plantillas y devuelve las filas para POST /api/plantillas/importar. */
export async function leerPlantillasDesdeExcel(archivo: File): Promise<FilaImportacion[]> {
	const crudas = leerHoja(await archivo.arrayBuffer());
	const filas: FilaImportacion[] = [];

	for (const cruda of crudas) {
		const fila: Partial<Record<keyof FilaImportacion, unknown>> = {};
		for (const [encabezado, valor] of Object.entries(cruda)) {
			const campo = CAMPOS_PLANTILLA[normalizarClave(encabezado)];
			if (campo) fila[campo] = valor;
		}

		const contacto = aTexto(fila.contacto);
		const articuloCodigo = aTexto(fila.articuloCodigo);
		if (!contacto || !articuloCodigo) continue;

		filas.push({
			contacto,
			agrupador: aTexto(fila.agrupador) || '1',
			fecha: aFecha(fila.fecha),
			serie: aTexto(fila.serie) || null,
			moneda: aTexto(fila.moneda) || null,
			tipoComprobante: aTexto(fila.tipoComprobante) || null,
			tipoPrecio: aTexto(fila.tipoPrecio) || null,
			articuloCodigo,
			cantidad: aNumero(fila.cantidad),
			importeUnitario: aNumero(fila.importeUnitario),
			comentario: aTexto(fila.comentario) || null,
			detalle: aTexto(fila.detalle) || null,
			informacionAdicional: aTexto(fila.informacionAdicional) || null,
			idCompra: aTexto(fila.idCompra) || null,
			vencimiento: aFecha(fila.vencimiento),
			idCliente: aTexto(fila.idCliente) || null
		});
	}

	if (filas.length === 0) {
		throw new Error(
			'No se encontraron filas válidas. Verificá que el archivo tenga las columnas "Contacto: nombre" y "Artículo: código".'
		);
	}

	return filas;
}

/** Lee un `.xlsx` de servicios y devuelve las filas para POST /api/servicios. */
export async function leerServiciosDesdeExcel(archivo: File): Promise<FilaServicio[]> {
	// La plantilla trae una hoja de importación y otra de parámetros. Se elige
	// por nombre; si no existe (archivo viejo de una sola hoja), cae a la primera.
	const libro = XLSX.read(await archivo.arrayBuffer(), { type: 'array' });
	const hoja = libro.Sheets[HOJA_SERVICIOS_IMPORTAR] ?? libro.Sheets[libro.SheetNames[0]];
	if (!hoja) throw new Error('El archivo no contiene hojas');

	const crudas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, {
		defval: '',
		range: 0
	});
	const filas: FilaServicio[] = [];

	for (const cruda of crudas) {
		const fila: Partial<Record<keyof FilaServicio, unknown>> = {};
		for (const [encabezado, valor] of Object.entries(cruda)) {
			const campo = CAMPOS_SERVICIO[normalizarClave(encabezado)];
			if (campo) fila[campo] = valor;
		}

		const contacto = aTexto(fila.contacto);
		if (!contacto) continue;

		filas.push({
			contacto,
			numeracion: aTexto(fila.numeracion) || null,
			tipo: aTexto(fila.tipo) || null,
			tipoGestion: aTexto(fila.tipoGestion) || null,
			tipoCliente: aTexto(fila.tipoCliente) || null,
			modalidadCobranza: aTexto(fila.modalidadCobranza) || null,
			grupo: aTexto(fila.grupo) || null,
			tipoGestionFacturacion: aTexto(fila.tipoGestionFacturacion) || null
		});
	}

	if (filas.length === 0) {
		throw new Error(
			'No se encontraron filas válidas. Verificá que el archivo tenga la columna "Contacto: nombre".'
		);
	}

	return filas;
}

export interface ParametrosPlantillaServicios {
	grupo: string[];
	tipoGestion: string[];
	tipoCliente: string[];
	modalidadCobranza: string[];
	gestionFacturacion: string[];
}

function filasParametros(catalogo: string, valores: string[]): (string | number)[][] {
	if (valores.length === 0) return [[catalogo, '(sin valores activos)']];
	return valores.map((valor) => [catalogo, valor]);
}

/**
 * Libro de la plantilla de servicios: la hoja que se importa y una hoja de
 * parámetros con los catálogos activos para completarla.
 */
export function construirLibroPlantillaServicios(
	parametros: ParametrosPlantillaServicios
): XLSX.WorkBook {
	const ejemplo = (numero: number, numeracion: string, tipo: string) => [
		`EJEMPLO ${numero} - BORRAR ANTES DE IMPORTAR`,
		numeracion,
		tipo,
		parametros.grupo[0] ?? '',
		parametros.tipoGestion[0] ?? '',
		parametros.tipoCliente[0] ?? '',
		parametros.modalidadCobranza[0] ?? '',
		parametros.gestionFacturacion[0] ?? ''
	];

	const datos: (string | number)[][] = [
		[...ENCABEZADOS_SERVICIOS],
		ejemplo(1, '216201450001', 'RUT'),
		ejemplo(2, '216201450002', 'RUT'),
		ejemplo(3, '12345678', 'CEDULA'),
		ejemplo(4, '', '')
	];

	const parametrosFilas: (string | number)[][] = [
		['Parámetros de la plantilla de servicios'],
		['Usá estos valores en la hoja "Servicios a importar". La importación rechaza valores fuera de catálogo.'],
		['Si el servicio no tiene RUT/CI, dejá vacíos "RUT / CI" y "Tipo numeración".'],
		[],
		['Catálogo', 'Valor'],
		...filasParametros('GRUPO', parametros.grupo),
		...filasParametros('TIPO_GESTION', parametros.tipoGestion),
		...filasParametros('TIPO_CLIENTE', parametros.tipoCliente),
		...filasParametros('MODALIDAD_COBRANZA', parametros.modalidadCobranza),
		...filasParametros('GESTION_FACTURACION', parametros.gestionFacturacion),
		...filasParametros('TIPO_NUMERACION', [...TIPOS_NUMERACION_SERVICIO]),
		[],
		['Borrá las 4 filas de ejemplo antes de importar.', '']
	];

	const hojaDatos = XLSX.utils.aoa_to_sheet(datos);
	hojaDatos['!cols'] = [
		{ wch: 42 },
		{ wch: 16 },
		{ wch: 16 },
		{ wch: 22 },
		{ wch: 18 },
		{ wch: 18 },
		{ wch: 24 },
		{ wch: 22 }
	];

	const hojaParametros = XLSX.utils.aoa_to_sheet(parametrosFilas);
	hojaParametros['!cols'] = [{ wch: 22 }, { wch: 52 }];

	const libro = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(libro, hojaDatos, HOJA_SERVICIOS_IMPORTAR);
	XLSX.utils.book_append_sheet(libro, hojaParametros, HOJA_PARAMETROS_SERVICIOS);
	return libro;
}

/** Descarga la plantilla de servicios con datos y parámetros. */
export function descargarPlantillaServicios(parametros: ParametrosPlantillaServicios): void {
	XLSX.writeFile(construirLibroPlantillaServicios(parametros), 'PLANTILLA SERVICIOS.xlsx');
}

export interface CatalogoPlantillaServicios {
	nombre: string;
	valores: string[];
}

export interface ResultadoServiciosFaltantes {
	filas: FilaServicio[];
	errores: { fila: number; mensaje: string }[];
}

/** Descarga una planilla editable para completar los servicios faltantes de Cobranza. */
export function descargarPlantillaServiciosFaltantes(
	servicios: string[],
	catalogos: CatalogoPlantillaServicios[]
): void {
	const filas = servicios.map((contacto, indice) => ({
		ID: indice + 1,
		'Servicio / contacto': contacto,
		'RUT / CI': '',
		'Tipo numeración': '',
		'Grupo': '',
		'Tipo de gestión': '',
		'Tipo de cliente': '',
		'Modalidad de cobranza': '',
		'Gestión de facturación': ''
	}));
	const referencias = catalogos.flatMap((catalogo) =>
		catalogo.valores.map((valor) => ({ Catálogo: catalogo.nombre, Valor: valor }))
	);
	const libro = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filas), 'Servicios a crear');
	XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(referencias), 'Catálogos');
	XLSX.writeFile(libro, 'servicios-faltantes-cobranza.xlsx');
}

/** Encabezados del reporte de Zureo Go, en la fila 5 del archivo. */
export const ENCABEZADOS_COBRANZA = [
	'Contacto',
	'Identificador',
	'Comp.',
	'Fecha doc.',
	'Vence',
	'Moneda',
	'Importe',
	'Saldo pendiente'
] as const;

/**
 * Cuatro filas de ejemplo: ventas en pesos, un recibo sin serie y una venta
 * en dólares. `Comp.` se descompone como tipo, serie y número.
 */
export const FILAS_EJEMPLO_COBRANZA: (string | number)[][] = [
	['CONSTRUCTORA EJEMPLO S.A.', '900001', 'VCre A-19943', '01/11/2026', '30/11/2026', '$', 1000, 600],
	['CONSTRUCTORA EJEMPLO S.A.', '900002', 'VCre A-19944', '01/11/2026', '30/11/2026', '$', 2500, 2500],
	['CLIENTE EJEMPLO DOS', '900003', 'RC 4754', '15/11/2026', '15/11/2026', '$', 800, 200],
	['ORGANISMO EJEMPLO', '900004', 'VCre B-20001', '01/11/2026', '31/12/2026', 'USD', 1200, 1200]
];

/**
 * Libro de la plantilla de cartera. Las filas 1–3 son título e instrucciones,
 * la 4 queda vacía y los encabezados van en la 5: el mismo corte que usa la
 * exportación de Zureo (`leerCobranzaDesdeExcel` lee desde la fila 5).
 */
export function construirLibroPlantillaCobranza(): XLSX.WorkBook {
	const filas: (string | number)[][] = [
		['Créditos pendientes de cobro — plantilla de ejemplo'],
		['Reemplazá las filas 6 a 9 por el reporte de facturas pendientes de cobro de Zureo Go.'],
		['Los encabezados van en la fila 5; los datos empiezan en la fila 6.'],
		[],
		[...ENCABEZADOS_COBRANZA],
		...FILAS_EJEMPLO_COBRANZA.map((fila) => [...fila])
	];

	const hoja = XLSX.utils.aoa_to_sheet(filas);
	hoja['!cols'] = [
		{ wch: 34 },
		{ wch: 13 },
		{ wch: 20 },
		{ wch: 12 },
		{ wch: 12 },
		{ wch: 9 },
		{ wch: 12 },
		{ wch: 15 }
	];

	const libro = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(libro, hoja, 'Pendientes de cobro');
	return libro;
}

/** Descarga la plantilla de cartera con encabezados y ejemplos. */
export function descargarPlantillaCobranza(): void {
	XLSX.writeFile(construirLibroPlantillaCobranza(), 'PLANTILLA COBRANZA.xlsx');
}

/** Lee y valida la planilla auxiliar completada por el usuario. */
export async function leerServiciosFaltantesDesdeExcel(archivo: File): Promise<ResultadoServiciosFaltantes> {
	const libro = XLSX.read(await archivo.arrayBuffer(), { type: 'array' });
	const hoja = libro.Sheets[libro.SheetNames[0]];
	if (!hoja) throw new Error('La planilla no contiene la hoja "Servicios a crear"');
	const crudas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { defval: '' });
	const filas: FilaServicio[] = [];
	const errores: { fila: number; mensaje: string }[] = [];
	const obtener = (fila: Record<string, unknown>, nombres: string[]) => {
		const entrada = Object.entries(fila).find(([clave]) => nombres.includes(normalizarClave(clave)));
		return aTexto(entrada?.[1]);
	};

	crudas.forEach((cruda, indice) => {
		const filaExcel = indice + 2;
		const id = obtener(cruda, ['id']);
		const contacto = obtener(cruda, ['servicio / contacto', 'servicio', 'contacto']);
		const numeracion = obtener(cruda, ['rut / ci', 'rut/ci', 'rut', 'ci']);
		const tipo = obtener(cruda, ['tipo numeracion', 'tipo numeración']);
		const tipoGestion = obtener(cruda, ['tipo de gestion', 'tipo de gestión', 'gestion']);
		const tipoCliente = obtener(cruda, ['tipo de cliente', 'cliente']);
		const modalidadCobranza = obtener(cruda, ['modalidad de cobranza', 'cobranza']);
		const grupo = obtener(cruda, ['grupo']);
		const tipoGestionFacturacion = obtener(cruda, ['gestion de facturacion', 'gestión de facturación', 'facturacion']);
		const campos = [
			['ID', id],
			['Servicio / contacto', contacto],
			['RUT / CI', numeracion],
			['Tipo numeración', tipo],
			['Grupo', grupo],
			['Tipo de gestión', tipoGestion],
			['Tipo de cliente', tipoCliente],
			['Modalidad de cobranza', modalidadCobranza],
			['Gestión de facturación', tipoGestionFacturacion]
		] as const;
		for (const [nombre, valor] of campos) {
			if (!valor) errores.push({ fila: filaExcel, mensaje: `Falta completar "${nombre}"` });
		}
		if (tipo && !['RUT', 'CEDULA', 'OTROS'].includes(tipo.toUpperCase())) {
			errores.push({ fila: filaExcel, mensaje: `Tipo numeración inválido: ${tipo}` });
		}
		filas.push({ contacto, numeracion, tipo, tipoGestion, tipoCliente, modalidadCobranza, grupo, tipoGestionFacturacion });
	});

	if (filas.length === 0) throw new Error('La planilla auxiliar no contiene servicios para crear');
	return { filas, errores };
}

/** Lee la planilla mensual de pendientes de cobro. */
export async function leerCobranzaDesdeExcel(archivo: File): Promise<FilaCobranza[]> {
	// La exportación de Zureo incluye título, filtros y fecha de exportación en
	// las filas 1–3; los encabezados reales comienzan en la fila 5.
	const crudas = leerHoja(await archivo.arrayBuffer(), 4);
	const filas: FilaCobranza[] = [];
	for (const cruda of crudas) {
		const fila: Partial<Record<keyof FilaCobranza, unknown>> = {};
		for (const [encabezado, valor] of Object.entries(cruda)) {
			const campo = CAMPOS_COBRANZA[normalizarClave(encabezado)];
			if (campo) fila[campo] = valor;
		}
		const contacto = aTexto(fila.contacto);
		const tieneDatos = Object.values(cruda).some((valor) => aTexto(valor) !== '');
		if (!contacto && !tieneDatos) continue;
		const comprobante = aTexto(fila.comprobante);
		const partesComprobante = comprobante.match(/^(.+?)\s+([^\s-]+)-(.+)$/);
		const comprobanteSinSerie = comprobante.match(/^(.+?)\s+(\d+)$/);
		const monedaLeida = aTexto(fila.moneda).toUpperCase();
		const moneda = monedaLeida === '$' ? '$' : monedaLeida;
		filas.push({
			filaExcel: filas.length + 6,
			contacto,
			comprobante: comprobante || null,
			tipoComprobante: aTexto(fila.tipoComprobante) || partesComprobante?.[1] || comprobanteSinSerie?.[1] || null,
			serie: aTexto(fila.serie) || partesComprobante?.[2] || null,
			numero: aTexto(fila.numero) || partesComprobante?.[3] || comprobanteSinSerie?.[2] || null,
			fechaEmision: aFecha(fila.fechaEmision),
			fechaVencimiento: aFecha(fila.fechaVencimiento),
			moneda,
			importe: aNumero(fila.importe) ?? Number.NaN,
			saldoPendiente: aNumero(fila.saldoPendiente) ?? Number.NaN,
			claveOrigen: aTexto(fila.claveOrigen) || null
		});
	}
	if (filas.length === 0) throw new Error('No se encontraron filas de cobranza debajo de la fila de encabezados 5.');
	return filas;
}

export function fechaCorteCobranza(periodo: string): string | null {
	const coincidencia = /^(\d{4})-(\d{2})$/.exec(periodo);
	if (!coincidencia) return null;
	const anio = Number(coincidencia[1]);
	const mes = Number(coincidencia[2]);
	if (mes < 1 || mes > 12) return null;
	return new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
}

export function validarFilasCobranzaLocal(filas: FilaCobranza[], periodo: string): ValidacionCobranza[] {
	const errores: ValidacionCobranza[] = [];
	const corte = fechaCorteCobranza(periodo);
	if (!corte) errores.push({ fila: 0, mensaje: 'Elegí un período válido' });
	const claves = new Set<string>();
	filas.forEach((fila, indice) => {
		// La exportación de Zureo tiene encabezados en la fila 5; los datos empiezan en la 6.
		const filaExcel = fila.filaExcel ?? indice + 6;
		if (!fila.contacto) errores.push({ fila: filaExcel, mensaje: 'Falta el servicio/contacto' });
		if (!fila.tipoComprobante) errores.push({ fila: filaExcel, mensaje: 'Falta el tipo de comprobante' });
		if (!fila.numero) errores.push({ fila: filaExcel, mensaje: 'Falta el número de comprobante' });
		if (!fila.fechaEmision) errores.push({ fila: filaExcel, mensaje: 'Falta la fecha de emisión' });
		if (corte && fila.fechaEmision && fila.fechaEmision > corte) errores.push({ fila: filaExcel, mensaje: `La fecha de emisión supera el corte ${corte}` });
		if (!fila.moneda) errores.push({ fila: filaExcel, mensaje: 'Falta la moneda' });
		if (!Number.isFinite(fila.importe)) errores.push({ fila: filaExcel, mensaje: 'Importe inválido' });
		if (!Number.isFinite(fila.saldoPendiente)) errores.push({ fila: filaExcel, mensaje: 'Saldo pendiente inválido' });
		const clave = fila.claveOrigen || `${fila.contacto}|${fila.tipoComprobante}|${fila.serie ?? ''}|${fila.numero}`;
		if (claves.has(clave)) errores.push({ fila: filaExcel, mensaje: 'Comprobante duplicado dentro de la planilla' });
		claves.add(clave);
	});
	return errores;
}
