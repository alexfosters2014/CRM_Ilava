import { emailsInvalidos, normalizarEmails, type UsoEmail } from './emails.ts';

/**
 * Capa: Servicios — planilla de mails de cobranza.
 *
 * Reglas puras (sin base de datos) para leer la celda de mails y calcular qué
 * cambia en cada servicio. La importación es un reemplazo del listado de
 * cobranza: los mails que no están en la celda se dan de baja lógica.
 *
 * Convenciones de la celda:
 * - vacía          -> no se toca el servicio;
 * - "-"            -> se retiran todos sus mails de cobranza;
 * - mails con `;`, `,` o salto de línea -> listado nuevo.
 */

export type AccionPlanilla = 'SIN_CAMBIOS' | 'LIMPIAR' | 'REEMPLAZAR';

export interface CeldaEmails {
	accion: AccionPlanilla;
	emails: string[];
	invalidos: string[];
}

/** Interpreta la celda de mails de una fila de la planilla. */
export function leerCeldaEmails(celda: string | null | undefined): CeldaEmails {
	const texto = (celda ?? '').trim();
	if (!texto) return { accion: 'SIN_CAMBIOS', emails: [], invalidos: [] };
	if (texto === '-') return { accion: 'LIMPIAR', emails: [], invalidos: [] };
	const emails = normalizarEmails(texto.split(/[,;\n]/));
	return { accion: 'REEMPLAZAR', emails, invalidos: emailsInvalidos(emails) };
}

export interface EmailActual {
	id: number;
	email: string;
	uso: UsoEmail;
	activo: boolean;
}

export interface CambiosEmails {
	/** No existe ninguna fila para ese mail en el servicio. */
	nuevos: string[];
	/** Existía dado de baja: se reactiva. */
	reactivados: string[];
	/** Estaba solo en facturación: pasa a COMPARTIDO. */
	aCompartido: string[];
	/** Estaba en cobranza y ya no está en la celda: baja lógica. */
	quitados: string[];
	/** Era COMPARTIDO y se retira de cobranza: queda solo en facturación. */
	retenidos: string[];
	sinCambios: string[];
}

export function cambiosVacios(): CambiosEmails {
	return { nuevos: [], reactivados: [], aCompartido: [], quitados: [], retenidos: [], sinCambios: [] };
}

export function hayCambios(cambios: CambiosEmails): boolean {
	return (
		cambios.nuevos.length +
			cambios.reactivados.length +
			cambios.aCompartido.length +
			cambios.quitados.length +
			cambios.retenidos.length >
		0
	);
}

/**
 * Compara los mails actuales del servicio con los deseados.
 *
 * `deseados` debe venir normalizado (minúsculas, sin repetidos). Los mails
 * solo de facturación que no están en la celda no se tocan.
 */
export function diferenciarEmails(actuales: EmailActual[], deseados: string[]): CambiosEmails {
	const cambios = cambiosVacios();
	const deseadosSet = new Set(deseados.map((email) => email.toLowerCase()));
	const porEmail = new Map(actuales.map((actual) => [actual.email.toLowerCase(), actual]));

	for (const email of deseadosSet) {
		const actual = porEmail.get(email);
		if (!actual) {
			cambios.nuevos.push(email);
		} else if (!actual.activo) {
			cambios.reactivados.push(email);
		} else if (actual.uso === 'FACTURACION') {
			cambios.aCompartido.push(email);
		} else {
			cambios.sinCambios.push(email);
		}
	}

	for (const actual of actuales) {
		if (!actual.activo || deseadosSet.has(actual.email.toLowerCase())) continue;
		// Se devuelven normalizados para que el repositorio los encuentre por clave.
		if (actual.uso === 'COBRANZA') cambios.quitados.push(actual.email.toLowerCase());
		else if (actual.uso === 'COMPARTIDO') cambios.retenidos.push(actual.email.toLowerCase());
	}

	return cambios;
}
