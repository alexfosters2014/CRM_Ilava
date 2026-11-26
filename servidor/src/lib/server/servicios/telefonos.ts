/**
 * Capa: Servicios — teléfonos uruguayos.
 *
 * Un solo formato canónico para toda la app: 598 + 8 dígitos del móvil, sin
 * '+'. Es la llave con la que el servicio de WhatsApp resuelve la lista blanca
 * de seguimientos, así que la normalización tiene que ser única y estable.
 *
 * Se aceptan las formas en que el número aparece en la realidad:
 * 099123456, 99123456, +598 99 123 456, 00598 99 123 456, con guiones o
 * paréntesis. Los fijos (2xxx/4xxx) no sirven para WhatsApp y se rechazan.
 */

const MOVIL_URUGUAYO = /^9\d{7}$/;

/** Devuelve `598XXXXXXXX` si es un móvil uruguayo; `null` si no lo es. */
export function normalizarTelefonoUy(valor: string | null | undefined): string | null {
	if (!valor) return null;

	let digitos = valor.replace(/\D/g, '');
	if (!digitos) return null;

	// Prefijo internacional escrito a mano.
	if (digitos.startsWith('00')) digitos = digitos.slice(2);
	if (digitos.startsWith('598')) digitos = digitos.slice(3);
	// 0 de larga distancia nacional.
	if (digitos.startsWith('0')) digitos = digitos.slice(1);

	if (!MOVIL_URUGUAYO.test(digitos)) return null;
	return `598${digitos}`;
}

/** Formato legible: +598 99 123 456. Si no matchea, devuelve el valor crudo. */
export function formatearTelefonoUy(numero: string | null | undefined): string {
	if (!numero) return '';
	if (/^5989\d{7}$/.test(numero)) {
		return `+598 ${numero.slice(3, 5)} ${numero.slice(5, 8)} ${numero.slice(8)}`;
	}
	return numero;
}

/** ¿Es un móvil uruguayo ya normalizado? */
export function esTelefonoUyNormalizado(numero: string | null | undefined): boolean {
	return typeof numero === 'string' && /^5989\d{7}$/.test(numero);
}
