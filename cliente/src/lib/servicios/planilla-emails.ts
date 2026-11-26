import * as XLSX from 'xlsx';

/**
 * Capa: Servicios (frontend) — planilla de mails de cobranza.
 *
 * Descarga la planilla (ID, servicio y mails separados por `;`) y lee la
 * versión completada. El servidor vuelve a validar todo y calcula el diff
 * antes de aplicar: acá solo se valida la estructura del archivo.
 */

export interface FilaPlanillaEmails {
	servicioId: number;
	servicio: string;
	emails: string;
}

export interface FilaEmailsLeida {
	servicioId: number;
	/** Celda cruda: vacía, `-` o mails separados por `;`. */
	emails: string;
}

export interface ResultadoLecturaEmails {
	filas: FilaEmailsLeida[];
	errores: { fila: number; mensaje: string }[];
}

const INSTRUCCIONES: string[][] = [
	['Planilla de mails de cobranza'],
	[''],
	['1. Completá la columna "Mails de cobranza".'],
	['2. Separá varios mails con punto y coma (;). También se aceptan comas y saltos de línea.'],
	['3. Dejá la celda vacía para no cambiar los mails de ese servicio.'],
	['4. Escribí un guion (-) para dar de baja todos los mails de cobranza del servicio.'],
	['5. Los mails que ya no estén en la celda se dan de baja lógica: quedan en el histórico.'],
	['6. Si un mail era compartido con facturación, al quitarlo de cobranza sigue recibiendo facturas.'],
	['7. No modifiques la columna ID. La columna Servicio es solo de referencia.'],
	['8. La importación es atómica: si una fila tiene un mail inválido, no se aplica ninguna.']
];

function normalizar(valor: string): string {
	return String(valor ?? '')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.trim()
		.toLowerCase()
		.replace(/\s+/g, ' ');
}

function aTexto(valor: unknown): string {
	if (valor === null || valor === undefined) return '';
	return String(valor).trim();
}

/** Descarga la planilla editable con todos los servicios y sus mails actuales. */
export function descargarPlanillaEmails(servicios: FilaPlanillaEmails[]): void {
	const filas = servicios.map((servicio) => ({
		ID: servicio.servicioId,
		Servicio: servicio.servicio,
		'Mails de cobranza': servicio.emails
	}));
	const hoja = XLSX.utils.json_to_sheet(filas);
	hoja['!cols'] = [{ wch: 8 }, { wch: 46 }, { wch: 64 }];
	const instrucciones = XLSX.utils.aoa_to_sheet(INSTRUCCIONES);
	instrucciones['!cols'] = [{ wch: 110 }];
	const libro = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(libro, hoja, 'Mails');
	XLSX.utils.book_append_sheet(libro, instrucciones, 'Instrucciones');
	XLSX.writeFile(libro, 'mails-cobranza.xlsx');
}

/** Lee la planilla completada por el usuario. */
export async function leerPlanillaEmails(archivo: File): Promise<ResultadoLecturaEmails> {
	const libro = XLSX.read(await archivo.arrayBuffer(), { type: 'array' });
	const nombreHoja =
		libro.SheetNames.find((nombre) => normalizar(nombre) === 'mails') ?? libro.SheetNames[0];
	const hoja = libro.Sheets[nombreHoja];
	if (!hoja) throw new Error('La planilla no contiene ninguna hoja');
	const crudas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, {
		defval: '',
		blankrows: false
	});
	return mapearFilasPlanilla(crudas);
}

/**
 * Mapea las filas crudas del Excel a filas de importación.
 *
 * Es una función pura para poder testearla sin generar un archivo real.
 */
export function mapearFilasPlanilla(
	crudas: Record<string, unknown>[]
): ResultadoLecturaEmails {
	const filas: FilaEmailsLeida[] = [];
	const errores: { fila: number; mensaje: string }[] = [];
	const vistos = new Set<number>();

	crudas.forEach((cruda, indice) => {
		const numeroFila = indice + 2; // la fila 1 es el encabezado
		const obtener = (nombres: string[]) => {
			const entrada = Object.entries(cruda).find(([clave]) =>
				nombres.includes(normalizar(clave))
			);
			return aTexto(entrada?.[1]);
		};

		const idTexto = obtener(['id', 'id servicio', 'id de servicio']);
		const emails = obtener([
			'mails de cobranza',
			'mail de cobranza',
			'mails',
			'emails',
			'correos'
		]);
		const servicio = obtener(['servicio', 'servicio / contacto', 'contacto']);

		// Fila totalmente vacía: Excel suele arrastrarlas al final.
		if (!idTexto && !emails && !servicio) return;

		const servicioId = Number(idTexto);
		if (!Number.isInteger(servicioId) || servicioId <= 0) {
			errores.push({ fila: numeroFila, mensaje: 'ID de servicio inválido' });
			return;
		}
		if (vistos.has(servicioId)) {
			errores.push({
				fila: numeroFila,
				mensaje: `El servicio ${servicioId} está repetido en la planilla`
			});
			return;
		}
		vistos.add(servicioId);
		filas.push({ servicioId, emails });
	});

	if (filas.length === 0 && errores.length === 0) {
		errores.push({ fila: 0, mensaje: 'La planilla no tiene filas con ID de servicio' });
	}

	return { filas, errores };
}
