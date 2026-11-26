import { fechaCorta, tablaHtml, tablaTexto, type FilaEstadoCuenta } from './estado-cuenta.ts';
import { fechaVencimientoEfectiva } from './cobranzas.ts';

/**
 * Capa: Servicios — mensaje de cobranza por WhatsApp.
 *
 * El correo lleva la carta en PDF; WhatsApp usa el mismo estado de cuenta en
 * texto. Si hay Chrome disponible, el PDF va como documento con un caption
 * corto; si no, el detalle completo viaja en el texto.
 */

export interface DatosCobranzaWhatsApp {
	contacto: string;
	filas: FilaEstadoCuenta[];
}

/** Documento tal como sale de `comprobantes_cobranza`. */
export interface DocumentoCobranzaWhatsApp {
	tipoComprobante: string;
	serie: string | null;
	numero: string;
	fechaEmision: string;
	fechaVencimiento: string | null;
	importe: string;
	saldo: string;
	moneda: string;
	excluidoEnvio: boolean;
}

/**
 * Arma las filas del estado de cuenta que viaja por WhatsApp.
 *
 * Regla clave: las notas de crédito tienen saldo NEGATIVO y forman parte del
 * total. Filtrar por saldo mayor a cero las descartaba y el total enviado
 * quedaba más alto que el del modal. Solo se excluyen los saldos en cero.
 */
export function armarFilasCobranza(
	documentos: DocumentoCobranzaWhatsApp[],
	opciones: { soloVencidos: boolean; hoy: string; plazoDias?: number }
): FilaEstadoCuenta[] {
	return documentos
		.filter((fila) => !fila.excluidoEnvio && Number(fila.saldo) !== 0)
		.map((fila) => ({
			numero: fila.numero,
			tipoComprobante: fila.tipoComprobante,
			serie: fila.serie ?? '',
			vencimiento: fechaVencimientoEfectiva(fila.fechaEmision, fila.fechaVencimiento),
			fechaEmision: fila.fechaEmision,
			importe: fila.importe,
			saldo: fila.saldo,
			moneda: (fila.moneda.toUpperCase() === 'USD' ? 'USD' : 'UYU') as 'USD' | 'UYU'
		}))
		.filter((fila) => {
			if (!opciones.soloVencidos) return true;
			// Misma regla que el modal: emisión + plazo del servicio. El día
			// exacto de vencimiento todavía no cuenta como vencido.
			if (opciones.plazoDias !== undefined) {
				const emision = Date.parse(`${fila.fechaEmision}T00:00:00Z`);
				const actual = Date.parse(`${opciones.hoy}T00:00:00Z`);
				if (Number.isFinite(emision) && Number.isFinite(actual)) {
					return Math.floor((actual - emision) / 86_400_000) > opciones.plazoDias;
				}
			}
			return fila.vencimiento < opciones.hoy;
		});
}

/** Totales por moneda de lo que realmente se envía (neto de notas de crédito). */
export function totalesDeFilas(filas: FilaEstadoCuenta[]): { uyu: number; usd: number } {
	const redondear = (valor: number) => Math.round(valor * 100) / 100;
	return {
		uyu: redondear(
			filas
				.filter((fila) => fila.moneda === 'UYU')
				.reduce((total, fila) => total + Number(fila.saldo), 0)
		),
		usd: redondear(
			filas
				.filter((fila) => fila.moneda === 'USD')
				.reduce((total, fila) => total + Number(fila.saldo), 0)
		)
	};
}

/** Texto legible de los totales, para el mensaje de error de verificación. */
export function formatearTotales(totales: { uyu: number; usd: number }): string {
	const formato = (valor: number, moneda: 'UYU' | 'USD') =>
		new Intl.NumberFormat('es-UY', {
			style: 'currency',
			currency: moneda,
			currencyDisplay: 'narrowSymbol',
			minimumFractionDigits: 2
		}).format(valor);
	return `UYU ${formato(totales.uyu, 'UYU')} · USD ${formato(totales.usd, 'USD')}`;
}

function totalDe(filas: FilaEstadoCuenta[]): number {
	return filas.reduce((suma, fila) => suma + Number(fila.saldo), 0);
}

function dinero(valor: number, moneda: 'UYU' | 'USD'): string {
	return new Intl.NumberFormat('es-UY', {
		style: 'currency',
		currency: moneda,
		currencyDisplay: 'narrowSymbol',
		minimumFractionDigits: 2
	}).format(valor);
}

/** Texto completo: sirve solo o acompaña al PDF como caption largo. */
export function textoCobranza(datos: DatosCobranzaWhatsApp): string {
	const pesos = datos.filas.filter((fila) => fila.moneda === 'UYU');
	const dolares = datos.filas.filter((fila) => fila.moneda === 'USD');

	const bloques: string[] = [`Hola ${datos.contacto}:`, 'Te escribimos por el saldo pendiente de tu cuenta.'];
	if (pesos.length > 0) bloques.push(tablaTexto(pesos, 'UYU'));
	if (dolares.length > 0) bloques.push(tablaTexto(dolares, 'USD'));
	bloques.push('Si ya lo pagaste, ignorá este mensaje. Respondé por acá y lo revisamos.');

	return bloques.join('\n\n');
}

/** Caption corto para el documento (WhatsApp limita el texto del caption). */
export function captionCobranza(datos: DatosCobranzaWhatsApp): string {
	const pesos = datos.filas.filter((fila) => fila.moneda === 'UYU');
	const dolares = datos.filas.filter((fila) => fila.moneda === 'USD');
	const totales = [
		pesos.length > 0 ? `Total UYU: ${dinero(totalDe(pesos), 'UYU')}` : '',
		dolares.length > 0 ? `Total USD: ${dinero(totalDe(dolares), 'USD')}` : ''
	]
		.filter(Boolean)
		.join(' · ');

	const caption = `Hola ${datos.contacto}: te enviamos tu estado de cuenta. ${totales}. Si ya lo pagaste, ignorá este mensaje.`;
	return caption.length > 1000 ? `${caption.slice(0, 997)}...` : caption;
}

/** HTML A4 para el PDF (sin fondo: márgenes normales). */
export function htmlCobranza(datos: DatosCobranzaWhatsApp): string {
	const pesos = datos.filas.filter((fila) => fila.moneda === 'UYU');
	const dolares = datos.filas.filter((fila) => fila.moneda === 'USD');
	const filas = [...pesos, ...dolares]
		.map(
			(fila) =>
				`<tr><td>${fila.tipoComprobante} ${fila.serie ? `${fila.serie}-` : ''}${fila.numero}</td>` +
				`<td>${fechaCorta(fila.fechaEmision)}</td><td>${fechaCorta(fila.vencimiento)}</td>` +
				`<td style="text-align:right">${dinero(Number(fila.saldo), fila.moneda)}</td></tr>`
		)
		.join('');

	const totales = [
		pesos.length > 0 ? `<p><strong>Total UYU:</strong> ${dinero(totalDe(pesos), 'UYU')}</p>` : '',
		dolares.length > 0
			? `<p><strong>Total USD:</strong> ${dinero(totalDe(dolares), 'USD')}</p>`
			: ''
	].join('');

	return `<h1 style="font-size:18pt;margin:0 0 4mm">Estado de cuenta</h1>
		<p style="margin:0 0 6mm">${datos.contacto}</p>
		<table style="width:100%;border-collapse:collapse;font-size:10pt">
			<thead><tr>
				<th style="text-align:left;border-bottom:1px solid #ccc;padding:2mm 0">Comprobante</th>
				<th style="text-align:left;border-bottom:1px solid #ccc;padding:2mm 0">Emisión</th>
				<th style="text-align:left;border-bottom:1px solid #ccc;padding:2mm 0">Vencimiento</th>
				<th style="text-align:right;border-bottom:1px solid #ccc;padding:2mm 0">Saldo</th>
			</tr></thead>
			<tbody>${filas}</tbody>
		</table>
		<div style="margin-top:6mm">${totales}</div>
		<p style="margin-top:8mm;font-size:9pt;color:#555">Si ya realizaste el pago, ignorá este mensaje. Respondé por WhatsApp y lo revisamos.</p>`;
}

export interface PlantillaCartaCobranza {
	cartaHabilitada?: boolean | null;
	cartaHtml?: string | null;
	/** Imagen de fondo (data URL) subida en el modelo de Cobranza. */
	cartaFondo?: string | null;
}

function reemplazar(plantilla: string, valores: Record<string, string>): string {
	return plantilla.replace(
		/\{\{\s*([\w-]+)\s*\}\}/g,
		(original, clave: string) => valores[clave.toLowerCase()] ?? original
	);
}

/**
 * HTML del PDF de WhatsApp.
 *
 * Si el modelo de Cobranza tiene carta, se usa la MISMA carta y la MISMA
 * imagen de fondo que el correo (con las variables del estado de cuenta). Si
 * no, se usa la tabla simple, pero igual se aplica el fondo configurado.
 */
export function armarPdfCobranza(datos: {
	contacto: string;
	periodo: string;
	filas: FilaEstadoCuenta[];
	plantilla?: PlantillaCartaCobranza | null;
}): { html: string; fondo: string | null } {
	const fondo = datos.plantilla?.cartaFondo ?? null;
	const carta =
		datos.plantilla?.cartaHabilitada && datos.plantilla.cartaHtml
			? datos.plantilla.cartaHtml
			: null;

	if (!carta) {
		return { html: htmlCobranza({ contacto: datos.contacto, filas: datos.filas }), fondo };
	}

	const pesos = datos.filas.filter((fila) => fila.moneda === 'UYU');
	const dolares = datos.filas.filter((fila) => fila.moneda === 'USD');
	const htmlPesos = pesos.length > 0 ? tablaHtml(pesos, 'UYU') : '';
	const htmlDolares = dolares.length > 0 ? tablaHtml(dolares, 'USD') : '';
	const totalPesos = pesos.reduce((total, fila) => total + Number(fila.saldo), 0);
	const totalDolares = dolares.reduce((total, fila) => total + Number(fila.saldo), 0);

	const valores: Record<string, string> = {
		fecha_hoy: fechaCorta(new Date().toISOString().slice(0, 10)),
		nombre_servicio: datos.contacto,
		periodo: datos.periodo,
		cantidad_comprobantes: String(datos.filas.length),
		cantidad_facturas: String(datos.filas.length),
		total_pesos: dinero(totalPesos, 'UYU'),
		total_dolares: dinero(totalDolares, 'USD'),
		estado_cuenta_general: [htmlPesos, htmlDolares].filter(Boolean).join(''),
		estado_cuenta_pesos: htmlPesos || tablaHtml([], 'UYU'),
		estado_cuenta_dolares: htmlDolares || tablaHtml([], 'USD')
	};

	return { html: reemplazar(carta, valores), fondo };
}

export function nombreArchivoCobranza(contacto: string): string {
	const limpio = contacto
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-zA-Z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60)
		.toLowerCase();
	return `estado-de-cuenta-${limpio || 'servicio'}.pdf`;
}
