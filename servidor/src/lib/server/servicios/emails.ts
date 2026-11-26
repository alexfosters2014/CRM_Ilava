/**
 * Capa: Servicios — emails por servicio para facturación y cobranza.
 *
 * Un mail puede recibir solo facturas, solo estados de cuenta, o ambos. El
 * destino se guarda en una sola etiqueta (`uso`), así que no existen dos
 * listados que puedan desincronizarse: hay una fila por mail y cada lector
 * filtra por lo que necesita.
 *
 * Reglas puras (sin base de datos) para poder testearlas.
 */

export const USOS_EMAIL = ['COMPARTIDO', 'FACTURACION', 'COBRANZA'] as const;
export type UsoEmail = (typeof USOS_EMAIL)[number];

/** Listados que leen los emails de un servicio. */
export type ListaEmail = 'FACTURACION' | 'COBRANZA';

/**
 * Estado derivado del conjunto de mails activos, nunca persistido:
 * - VACIO: no hay mails.
 * - COMPARTIDO: todos reciben ambos procesos.
 * - SEPARADO: ninguno recibe ambos (cada mail tiene un solo destino).
 * - MIXTO: conviven mails compartidos con mails de un solo destino.
 */
export type ModoEmails = 'VACIO' | 'COMPARTIDO' | 'SEPARADO' | 'MIXTO';

export const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function esUsoEmail(valor: unknown): valor is UsoEmail {
	return typeof valor === 'string' && (USOS_EMAIL as readonly string[]).includes(valor);
}

/** Normaliza una lista: trim, minúsculas, sin vacíos y sin repetidos. */
export function normalizarEmails(emails: string[]): string[] {
	const normalizados = emails
		.map((email) => email.trim().toLowerCase())
		.filter(Boolean);
	return [...new Set(normalizados)];
}

/** Devuelve los emails con formato inválido (la lista debe venir normalizada). */
export function emailsInvalidos(emails: string[]): string[] {
	return emails.filter((email) => !EMAIL_VALIDO.test(email));
}

/**
 * Une el destino que ya tenía un mail con el listado donde se lo está
 * agregando. Agregar a facturación un mail de cobranza lo vuelve compartido.
 */
export function combinarUso(actual: UsoEmail, destino: UsoEmail): UsoEmail {
	return actual === destino ? actual : 'COMPARTIDO';
}

/** Usos que debe leer un listado para armar sus destinatarios. */
export function usosDeLista(lista: ListaEmail): UsoEmail[] {
	return ['COMPARTIDO', lista];
}

export function modoEmails(usos: UsoEmail[]): ModoEmails {
	if (usos.length === 0) return 'VACIO';
	const compartidos = usos.filter((uso) => uso === 'COMPARTIDO').length;
	if (compartidos === usos.length) return 'COMPARTIDO';
	if (compartidos === 0) return 'SEPARADO';
	return 'MIXTO';
}
