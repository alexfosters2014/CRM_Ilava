/**
 * Capa: Servicios (frontend) — plantillas de cobranza.
 *
 * Reglas puras para que la pantalla no duplique criterios y se puedan testear.
 */

/**
 * ¿La plantilla lista comprobantes?
 *
 * `{{estado_cuenta_general}}`, `{{estado_cuenta_pesos}}` y
 * `{{estado_cuenta_dolares}}` arman el detalle en el cuerpo del correo o en la
 * carta PDF. Sin ninguna de ellas, "enviar solo vencidos" no tendría nada que
 * filtrar a la vista del destinatario.
 */
export function plantillaListaComprobantes(plantilla: {
	cuerpo: string;
	cartaHabilitada?: boolean | null;
	cartaHtml?: string | null;
}): boolean {
	const variable = /\{\{\s*estado_cuenta_(general|pesos|dolares)\s*\}\}/i;
	if (variable.test(plantilla.cuerpo)) return true;
	return Boolean(plantilla.cartaHabilitada && plantilla.cartaHtml && variable.test(plantilla.cartaHtml));
}
