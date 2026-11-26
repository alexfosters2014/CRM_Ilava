export const TRAMOS_COBRANZA = ['A_VENCER', '1_30', '31_60', '61_90', 'MAS_90'] as const;
export type TramoCobranza = (typeof TRAMOS_COBRANZA)[number];

export interface FilaCobranzaImportacion {
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

export interface TipoComprobanteCobranza {
	nombre: string;
	abreviatura: string | null;
	activo: boolean;
}

/** Alias de los tipos que exporta Zureo hacia los nombres del catálogo interno. */
export function normalizarTipoComprobante(origen: string, catalogos: TipoComprobanteCobranza[]): string | null {
	const clave = origen.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
	const alias: Record<string, string> = {
		vcre: 'ventacredito',
		vtacap: 'ventacreditoalarma',
		vtacrd: 'ventacredito',
		vcrt: 'ventacreditotecnologia',
		vcont: 'ventacontado',
		vta: 'ventacontado',
		ventaa: 'ventaacreditoexenta',
		ncr: 'notadecredito',
		ncala: 'notadecreditoalarma',
		nctec: 'notadecreditotecnologia',
		nota_de: 'notadedebito',
		notade: 'notadedebito',
		nd: 'notadedebito',
		rc: 'recibodecobromanual',
		rcman: 'recibodecobromanual',
		ereci: 'erecibodecobro'
	};
	const objetivo = alias[clave] ?? clave;
	const exacto = catalogos.find((tipo) => {
		if (!tipo.activo) return false;
		const nombre = tipo.nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
		const abreviatura = (tipo.abreviatura ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
		return nombre === objetivo || abreviatura === objetivo;
	});
	if (exacto) return exacto.nombre;
	const candidatos = catalogos.filter((tipo) => {
		if (!tipo.activo) return false;
		const nombre = tipo.nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
		const abreviatura = (tipo.abreviatura ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
		return nombre === objetivo || abreviatura === objetivo || nombre.includes(objetivo) || objetivo.includes(nombre);
	});
	const encontrado = candidatos.sort((a, b) => b.nombre.length - a.nombre.length)[0];
	return encontrado?.nombre ?? null;
}

/** Normaliza un componente de la clave de exclusión. */
function normalizarClaveExclusion(valor: string | null | undefined): string {
	return (valor ?? '')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.trim()
		.replace(/\s+/g, ' ')
		.toUpperCase();
}

/**
 * Clave estable para excluir una observación de Cobranza en futuras importaciones.
 *
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
	const servicio = normalizarClaveExclusion(fila.contacto);
	const numero = normalizarClaveExclusion(fila.numero);
	if (numero) {
		return `numero|${servicio}|${normalizarClaveExclusion(fila.tipoComprobante)}|${normalizarClaveExclusion(fila.serie)}|${numero}`;
	}
	return `sincomprobante|${servicio}`;
}

export interface ErrorFilaCobranza {
	fila: number;
	mensaje: string;
}

export function fechaCortePeriodo(periodo: string): string | null {
	const coincidencia = /^(\d{4})-(\d{2})$/.exec(periodo);
	if (!coincidencia) return null;
	const anio = Number(coincidencia[1]);
	const mes = Number(coincidencia[2]);
	if (mes < 1 || mes > 12) return null;
	return new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
}

/** Aging: hoy menos emisión. La fecha efectiva de vencimiento se usa para operaciones auxiliares. */
export function calcularDiasAging(fechaEmision: string, hoy: string): number {
	const emision = Date.parse(`${fechaEmision}T00:00:00Z`);
	const actual = Date.parse(`${hoy}T00:00:00Z`);
	if (!Number.isFinite(emision) || !Number.isFinite(actual)) return 0;
	return Math.floor((actual - emision) / 86_400_000);
}

export function fechaVencimientoEfectiva(fechaEmision: string, fechaVencimiento?: string | null): string {
	if (fechaVencimiento) return fechaVencimiento;
	const fecha = new Date(`${fechaEmision}T00:00:00Z`);
	fecha.setUTCDate(fecha.getUTCDate() + 30);
	return fecha.toISOString().slice(0, 10);
}

export function tramoPorDias(dias: number): TramoCobranza {
	if (dias <= 0) return 'A_VENCER';
	if (dias <= 30) return '1_30';
	if (dias <= 60) return '31_60';
	if (dias <= 90) return '61_90';
	return 'MAS_90';
}

/**
 * Vencimiento con el plazo configurado en el servicio.
 *
 * El comprobante está vencido cuando los días desde la emisión SUPERAN el
 * plazo (emisión + plazo < hoy). El día exacto de vencimiento todavía no
 * cuenta como vencido.
 */
export function estadoVencimiento(diasDesdeEmision: number, plazoDias: number) {
	const diasVencido = diasDesdeEmision - plazoDias;
	return { diasVencido, vencida: diasVencido > 0 };
}

/**
 * ¿La plantilla lista comprobantes?
 *
 * Sirve de guarda para "enviar solo vencidos": si el correo y la carta no
 * muestran el detalle, filtrar dejaría totales que no se explican en el texto.
 * Alcanza con cualquiera de las variables de listado (general, pesos o USD).
 */
export function plantillaListaComprobantes(plantilla: {
	cuerpo: string;
	cartaHabilitada?: boolean | null;
	cartaHtml?: string | null;
}): boolean {
	const variable = /\{\{\s*estado_cuenta_(general|pesos|dolares)\s*\}\}/i;
	if (variable.test(plantilla.cuerpo)) return true;
	return Boolean(plantilla.cartaHabilitada && plantilla.cartaHtml && variable.test(plantilla.cartaHtml));
}

/**
 * Tramo EXCLUYENTE de un servicio: el del comprobante impago más antiguo.
 *
 * Regla de negocio: el tramo describe la deuda más vieja, no la existencia de
 * saldo en una franja. Un servicio con $100 de +90 y $100 de 1–30 cae en +90.
 * Solo cuentan saldos positivos: una nota de crédito no es deuda.
 * Devuelve `null` cuando no hay nada pendiente (o el saldo es cero/negativo).
 */
export function diasDeudaMasAntigua(
	documentos: { diasAging: number; saldoPendiente: string | number }[]
): number | null {
	let diasMasAntiguo: number | null = null;
	for (const documento of documentos) {
		if (!(Number(documento.saldoPendiente) > 0)) continue;
		if (diasMasAntiguo === null || documento.diasAging > diasMasAntiguo) {
			diasMasAntiguo = documento.diasAging;
		}
	}
	return diasMasAntiguo;
}

export function tramoDeudaMasAntigua(
	documentos: { diasAging: number; saldoPendiente: string | number }[]
): TramoCobranza | null {
	const dias = diasDeudaMasAntigua(documentos);
	return dias === null ? null : tramoPorDias(dias);
}

/** Colores de la alerta de mora que se muestra a la izquierda del sobre. */
export const ALERTAS_MORA = ['MOSTAZA', 'NARANJA', 'ROJO'] as const;
export type AlertaMora = (typeof ALERTAS_MORA)[number];

/**
 * Alerta de mora por antigüedad desde la EMISIÓN, en meses de 30 días.
 *
 * Se usa el mismo criterio que los tramos de la tabla (días desde emisión),
 * para que la alerta y las columnas de deuda cuenten la misma historia:
 * - 1..60 días  → amarillo (1 a 2 meses pendientes)
 * - 61..150     → naranja (3 a 5 meses)
 * - más de 150  → rojo (más de 5 meses)
 * - 0 / negativo / sin deuda → sin alerta (a vencer)
 */
export function alertaMoraPorDias(dias: number | null): AlertaMora | null {
	if (dias === null || dias <= 0) return null;
	if (dias <= 60) return 'MOSTAZA';
	if (dias <= 150) return 'NARANJA';
	return 'ROJO';
}

export function validarFilasCobranza(filas: FilaCobranzaImportacion[], corte?: string): ErrorFilaCobranza[] {
	const errores: ErrorFilaCobranza[] = [];
	const claves = new Set<string>();
	filas.forEach((fila, indice) => {
		// La exportación de Zureo tiene encabezados en la fila 5; los datos empiezan en la 6.
		const filaExcel = fila.filaExcel ?? indice + 6;
		if (!fila.contacto?.trim()) errores.push({ fila: filaExcel, mensaje: 'Falta el servicio/contacto' });
		if (!fila.tipoComprobante?.trim()) errores.push({ fila: filaExcel, mensaje: 'Falta el tipo de comprobante' });
		if (!fila.numero?.trim()) errores.push({ fila: filaExcel, mensaje: 'No se importó: falta el número de comprobante' });
		if (!fila.fechaEmision) errores.push({ fila: filaExcel, mensaje: 'Falta la fecha de emisión' });
		if (corte && fila.fechaEmision && fila.fechaEmision > corte) errores.push({ fila: filaExcel, mensaje: `La fecha de emisión supera el corte ${corte}` });
		if (!fila.moneda?.trim()) errores.push({ fila: filaExcel, mensaje: 'Falta la moneda' });
		if (!Number.isFinite(fila.importe)) errores.push({ fila: filaExcel, mensaje: 'Importe inválido' });
		if (!Number.isFinite(fila.saldoPendiente)) errores.push({ fila: filaExcel, mensaje: 'Saldo pendiente inválido' });
		const clave = fila.claveOrigen?.trim() || `${fila.contacto.trim().toLowerCase()}|${fila.tipoComprobante?.trim().toLowerCase() ?? ''}|${fila.serie?.trim() ?? ''}|${fila.numero?.trim() ?? ''}`;
		if (claves.has(clave)) errores.push({ fila: filaExcel, mensaje: 'Comprobante duplicado dentro de la planilla' });
		claves.add(clave);
	});
	return errores;
}

export const VARIABLES_COBRANZA = [
	'fecha_hoy',
	'nombre_servicio',
	'periodo',
	'cantidad_comprobantes',
	'cantidad_facturas',
	'total_pesos',
	'total_dolares',
	'estado_cuenta_general',
	'estado_cuenta_pesos',
	'estado_cuenta_dolares'
] as const;

export function variablesDesconocidas(texto: string): string[] {
	const usadas = [...texto.matchAll(/\{\{\s*([\w-]+)\s*\}\}/g)].map((match) => match[1].toLowerCase());
	return [...new Set(usadas.filter((variable) => !(VARIABLES_COBRANZA as readonly string[]).includes(variable)))];
}
