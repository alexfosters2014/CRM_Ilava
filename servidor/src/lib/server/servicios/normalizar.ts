/**
 * Capa: Servicios — normalización de textos para importación.
 *
 * El Excel trae los catálogos con mayúsculas variables, acentos y espacios de
 * más ("Transferencia", " TRANSFERENCIA ", "transferencia"). Para relacionar
 * cada fila con su tabla de catálogo se comparan los valores normalizados, no
 * el texto crudo.
 */

/** Normaliza un texto para comparar: sin acentos, sin espacios extra, mayúsculas. */
export function normalizarTexto(valor: string): string {
	return valor
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.trim()
		.replace(/\s+/g, ' ')
		.toUpperCase();
}

/** Devuelve la clave normalizada o `undefined` si el valor viene vacío. */
export function normalizarOpcional(valor: string | null | undefined): string | undefined {
	if (valor == null) return undefined;
	const limpio = valor.trim();
	return limpio === '' ? undefined : normalizarTexto(limpio);
}

/** Convierte un número serial de Excel (días desde 1899-12-30) a `YYYY-MM-DD`. */
export function serialExcelAFecha(serial: number): string | undefined {
	if (!Number.isFinite(serial) || serial <= 0) return undefined;
	const milisegundos = Math.round((serial - 25569) * 86400 * 1000);
	const fecha = new Date(milisegundos);
	if (Number.isNaN(fecha.getTime())) return undefined;
	return fecha.toISOString().slice(0, 10);
}
