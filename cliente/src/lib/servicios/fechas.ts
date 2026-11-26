/**
 * Capa: Servicios — fechas para la interfaz.
 *
 * Convención del proyecto: TODAS las fechas se muestran como `dd/mm/aaaa` y se
 * interpretan en la zona horaria de Uruguay (`America/Montevideo`, UTC-3).
 *
 * En la base y en la API las fechas viajan como ISO (`YYYY-MM-DD`). Para el
 * usuario se muestran y se escriben como `dd/mm/aaaa`, que es el formato de la
 * operativa. Los `<input type="date">` nativos se comportan distinto según el
 * navegador y complican el tipeo, por eso se usan campos de texto y estas
 * funciones hacen la conversión y la validación.
 */

/** Zona horaria de referencia para fechas y horas mostradas al usuario. */
export const ZONA_HORARIA = 'America/Montevideo';

const MESES = [
	'Enero',
	'Febrero',
	'Marzo',
	'Abril',
	'Mayo',
	'Junio',
	'Julio',
	'Agosto',
	'Setiembre',
	'Octubre',
	'Noviembre',
	'Diciembre'
];

/**
 * `2026-11` → `Noviembre 2026`.
 *
 * Los períodos de cobranza se guardan como `YYYY-MM`, que ordena bien pero se
 * lee mal. En pantalla se muestra el nombre del mes; si el valor no tiene ese
 * formato, se devuelve tal cual.
 */
export function nombrePeriodo(periodo: string | null | undefined): string {
	if (!periodo) return '';
	const coincidencia = /^(\d{4})-(\d{2})$/.exec(periodo);
	if (!coincidencia) return periodo;
	const mes = Number(coincidencia[2]);
	if (mes < 1 || mes > 12) return periodo;
	return `${MESES[mes - 1]} ${coincidencia[1]}`;
}

/**
 * ISO → `dd/mm/aaaa`. Devuelve cadena vacía si no hay fecha.
 *
 * Se formatean los componentes tal cual: una columna `date` no tiene hora, así
 * que aplicarle una zona horaria correría el día.
 */
export function formatearFecha(iso: string | null | undefined): string {
	if (!iso) return '';

	const partes = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (!partes) return iso;

	const [, anio, mes, dia] = partes;
	return `${dia}/${mes}/${anio}`;
}

/** Fecha y hora (timestamp) → `dd/mm/aaaa hh:mm` en hora de Uruguay. */
export function formatearFechaHora(valor: string | Date): string {
	const fecha = typeof valor === 'string' ? new Date(valor) : valor;
	if (Number.isNaN(fecha.getTime())) return '';

	const partes = new Intl.DateTimeFormat('es-UY', {
		timeZone: ZONA_HORARIA,
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	}).formatToParts(fecha);

	const valorDe = (tipo: Intl.DateTimeFormatPartTypes) =>
		partes.find((parte) => parte.type === tipo)?.value ?? '';

	return `${valorDe('day')}/${valorDe('month')}/${valorDe('year')} ${valorDe('hour')}:${valorDe('minute')}`;
}

/** Timestamp → `hh:mm` en hora de Uruguay (para columnas de hora). */
export function formatearHora(valor: string | Date | null | undefined): string {
	if (!valor) return '';
	const fecha = typeof valor === 'string' ? new Date(valor) : valor;
	if (Number.isNaN(fecha.getTime())) return '';

	return new Intl.DateTimeFormat('es-UY', {
		timeZone: ZONA_HORARIA,
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	}).format(fecha);
}

/** Fecha de hoy en Uruguay, en ISO (`YYYY-MM-DD`). */
export function hoyIso(): string {
	const partes = new Intl.DateTimeFormat('en-CA', {
		timeZone: ZONA_HORARIA,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(new Date());

	const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
		partes.find((parte) => parte.type === tipo)?.value ?? '';

	return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

export interface FechaParseada {
	iso: string | null;
	error: string | null;
}/**
 * `dd/mm/aaaa` (o `dd-mm-aaaa`) → ISO. Valida que la fecha exista: 31/09 no es
 * válido porque septiembre tiene 30 días.
 */
export function parsearFecha(texto: string): FechaParseada {
	const limpio = texto.trim();
	if (!limpio) return { iso: null, error: null };

	const partes = limpio.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
	if (!partes) return { iso: null, error: 'Usá el formato dd/mm/aaaa' };

	const dia = Number(partes[1]);
	const mes = Number(partes[2]);
	const anio = Number(partes[3]);

	const fecha = new Date(Date.UTC(anio, mes - 1, dia));
	const valida =
		fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia;

	if (!valida) return { iso: null, error: `La fecha ${limpio} no existe` };

	return {
		iso: `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`,
		error: null
	};
}
