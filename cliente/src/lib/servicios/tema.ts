/**
 * Capa: Servicios (frontend) — tema de la interfaz.
 *
 * El tema vive en el navegador (localStorage) y se aplica como
 * `data-tema` en `<html>`. `app.html` lo fija antes del primer paint para
 * evitar el destello; este módulo lo lee y lo guarda desde la aplicación.
 */

export type Tema = 'oscuro' | 'claro';

export const TEMA_POR_DEFECTO: Tema = 'oscuro';

const CLAVE_TEMA = 'crm-tema';

/** Tema guardado; si no hay nada o el valor es inválido, oscuro. */
export function leerTema(): Tema {
	if (typeof localStorage === 'undefined') return TEMA_POR_DEFECTO;
	try {
		return localStorage.getItem(CLAVE_TEMA) === 'claro' ? 'claro' : TEMA_POR_DEFECTO;
	} catch {
		return TEMA_POR_DEFECTO;
	}
}

/** Aplica el tema al documento sin persistirlo. */
export function aplicarTema(tema: Tema): void {
	if (typeof document === 'undefined') return;
	document.documentElement.dataset.tema = tema;
}

/** Persiste y aplica el tema. */
export function guardarTema(tema: Tema): void {
	try {
		localStorage.setItem(CLAVE_TEMA, tema);
	} catch {
		// Sin localStorage (modo privado estricto) el tema se aplica igual.
	}
	aplicarTema(tema);
}
