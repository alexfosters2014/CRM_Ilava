/**
 * Capa: Servicios — composición del estado de cuenta.
 *
 * El correo de cobranza lleva el detalle en una tabla HTML equivalente a la del
 * modal de cobranza, con el total de cada moneda al pie. Acá viven las funciones
 * puras (sin base de datos) para poder testearlas.
 */

export interface FilaEstadoCuenta {
	numero: string;
	tipoComprobante: string;
	serie: string;
	vencimiento: string | null;
	fechaEmision: string;
	importe: string;
	saldo: string;
	moneda: 'UYU' | 'USD';
}

const dinero = (valor: number, moneda: 'UYU' | 'USD') =>
	new Intl.NumberFormat('es-UY', {
		style: 'currency',
		currency: moneda,
		currencyDisplay: 'narrowSymbol',
		minimumFractionDigits: 2
	}).format(valor);

/** dd/mm/aaaa sin depender de la zona horaria. */
export function fechaCorta(iso: string | null): string {
	if (!iso) return '—';
	const partes = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
	return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : iso;
}

/** Escapa texto para incrustarlo en HTML. */
export function escaparHtml(valor: string): string {
	return valor.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function comprobante(fila: FilaEstadoCuenta): string {
	return `${fila.tipoComprobante} ${fila.serie ? `${fila.serie}-` : ''}${fila.numero}`;
}

function totalDe(filas: FilaEstadoCuenta[]): number {
	return filas.reduce((suma, fila) => suma + Number(fila.saldo), 0);
}

/** Versión texto plano (para clientes de correo sin HTML). */
export function tablaTexto(filas: FilaEstadoCuenta[], moneda: 'UYU' | 'USD'): string {
	if (filas.length === 0) return `Sin comprobantes en ${moneda}.`;
	const lineas = filas.map(
		(fila) =>
			`- ${comprobante(fila)} · vence ${fechaCorta(fila.vencimiento)} · ${dinero(Number(fila.saldo), moneda)}`
	);
	lineas.push(`Total ${moneda}: ${dinero(totalDe(filas), moneda)}`);
	return lineas.join('\n');
}

/**
 * Tabla HTML con el mismo criterio visual que la cartera.
 *
 * Se genera en UNA sola línea, sin saltos ni tabulaciones: los clientes de
 * correo insertan contenido espurio si el HTML de la tabla trae texto entre
 * celdas (y nuestro conversor de saltos de línea lo hacía).
 */
export function tablaHtml(filas: FilaEstadoCuenta[], moneda: 'UYU' | 'USD'): string {
	if (filas.length === 0) {
		return `<p style="font-family:Arial,sans-serif;font-size:13px;color:#68758a">Sin comprobantes en ${moneda}.</p>`;
	}
	const base = 'border:1px solid #dbe2f3;padding:7px 9px;font-family:Arial,sans-serif;font-size:13px;white-space:nowrap';
	const celda = (contenido: string, extra = '') => `<td style="${base}${extra}">${contenido}</td>`;
	const cabecera =
		`<tr style="background:#3037b6;color:#ffffff">` +
		`<th style="${base};text-align:left">Emisión</th>` +
		`<th style="${base};text-align:left">Vencimiento</th>` +
		`<th style="${base};text-align:left">Comprobante</th>` +
		`<th style="${base};text-align:right">Importe</th>` +
		`<th style="${base};text-align:right">Saldo</th>` +
		`</tr>`;
	const cuerpo = filas
		.map((fila, indice) => {
			const fondo = indice % 2 === 1 ? ';background:#f5f8ff' : '';
			return (
				`<tr style="color:#1f2430${fondo}">` +
				celda(fechaCorta(fila.fechaEmision)) +
				celda(fechaCorta(fila.vencimiento)) +
				celda(escaparHtml(comprobante(fila)), ';white-space:normal;max-width:260px') +
				celda(dinero(Number(fila.importe), moneda), ';text-align:right') +
				celda(dinero(Number(fila.saldo), moneda), ';text-align:right') +
				`</tr>`
			);
		})
		.join('');
	const pie =
		`<tr style="background:#eef2ff;color:#1f2430">` +
		`<td colspan="4" style="${base};text-align:right;font-weight:bold">Total ${moneda}</td>` +
		celda(dinero(totalDe(filas), moneda), ';text-align:right;font-weight:bold') +
		`</tr>`;
	return (
		`<table cellpadding="0" cellspacing="0" border="0" style="width:auto;max-width:100%;border-collapse:collapse;margin:12px 0;font-family:Arial,sans-serif;font-size:13px">` +
		`<thead>${cabecera}</thead><tbody>${cuerpo}</tbody><tfoot>${pie}</tfoot>` +
		`</table>`
	);
}

/**
 * Convierte el cuerpo del correo (texto) en HTML y reemplaza las variables.
 * Las tablas de estado de cuenta se inyectan como HTML; el resto se escapa.
 */
export function cuerpoHtml(
	cuerpo: string,
	valores: Record<string, string>,
	tablas: { pesos: string; dolares: string; general?: string }
): string {
	let html = escaparHtml(cuerpo);
	for (const [clave, valor] of Object.entries(valores)) {
		html = html.replace(new RegExp(`\\{\\{\\s*${clave}\\s*\\}\\}`, 'g'), escaparHtml(valor));
	}
	// Los saltos se convierten ANTES de inyectar las tablas: si se hiciera
	// después, cada salto interno de la tabla se volvería un <br> y rompería
	// el layout del correo.
	html = html.replace(/\r?\n/g, '<br>');
	// La variable general muestra solo las tablas que tienen comprobantes.
	const general = tablas.general ?? `${tablas.pesos}${tablas.dolares}`;
	html = html.replace(/\{\{\s*estado_cuenta_general\s*\}\}/gi, general);
	html = html.replace(/\{\{\s*estado_cuenta_pesos\s*\}\}/gi, tablas.pesos);
	html = html.replace(/\{\{\s*estado_cuenta_dolares\s*\}\}/gi, tablas.dolares);
	return html;
}
