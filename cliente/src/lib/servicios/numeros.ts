/**
 * Capa: Servicios (frontend) — formato numérico.
 *
 * Regla única para cantidades, precios unitarios y totales:
 * - hasta 3 decimales (redondeo);
 * - sin ceros de más a la derecha;
 * - si queda una sola decimal, se completa a dos (`25,3` → `25,30`);
 * - los enteros se muestran sin decimales (`10,00` → `10`).
 *
 * Ejemplos: `25.30` → `25,30` · `30.400` → `30,40` · `10.00` → `10`.
 */
export function formatearNumero(valor: number | string): string {
	const numero = typeof valor === 'number' ? valor : Number(valor);
	if (!Number.isFinite(numero)) {
		return typeof valor === 'string' ? valor : '';
	}

	const texto = numero.toLocaleString('es-UY', { maximumFractionDigits: 3 });
	if (!texto.includes(',')) return texto;

	const [entero, decimales] = texto.split(',');
	return `${entero},${decimales.length === 1 ? `${decimales}0` : decimales}`;
}
