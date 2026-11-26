/**
 * Capa: Servicios — nombres visibles.
 *
 * Deriva un nombre presentable desde un correo cuando no hay un nombre real
 * asociado. Se usa en el portal público: el token identifica al destinatario
 * y la pantalla no debe volver a pedirle el nombre.
 */

/** "juan.perez+facturas@empresa.com" → "Juan Perez". */
export function nombreDesdeEmail(email: string | null | undefined): string {
	const valor = (email ?? '').trim().toLowerCase();
	if (!valor) return '';

	const local = (valor.split('@')[0] ?? '').split('+')[0] ?? '';
	const palabras = local
		.replace(/[._-]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.split(' ')
		.filter(Boolean)
		.map((palabra) => palabra.charAt(0).toUpperCase() + palabra.slice(1));

	return palabras.join(' ').slice(0, 120);
}
