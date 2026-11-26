/**
 * Capa: Servicios (frontend) — presentación de teléfonos uruguayos.
 *
 * El backend guarda siempre `598` + 8 dígitos. Acá solo se muestra legible;
 * la normalización real vive en la API.
 */

export function formatearTelefonoUy(numero: string | null | undefined): string {
	if (!numero) return '';
	if (/^5989\d{7}$/.test(numero)) {
		return `+598 ${numero.slice(3, 5)} ${numero.slice(5, 8)} ${numero.slice(8)}`;
	}
	return numero;
}
