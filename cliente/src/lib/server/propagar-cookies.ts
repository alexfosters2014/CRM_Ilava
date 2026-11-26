import type { Cookies } from '@sveltejs/kit';

/**
 * Capa: Server (frontend) — propagación de cookies.
 *
 * El frontend habla con la API a través de su propio proxy (`/api/*`). Cuando
 * Better Auth renueva la sesión (al pasar `updateAge`) devuelve un nuevo
 * `Set-Cookie` en `get-session`, pero un `fetch` del lado del servidor NO lo
 * aplica al navegador: se perdería y la cookie vencería a los 15 días fijos.
 *
 * Esta función toma esos `Set-Cookie` y los vuelve a emitir con la API de
 * cookies de SvelteKit, para que la sesión se renueve de verdad con el uso.
 */
export function propagarCookiesDeRespuesta(cookies: Cookies, respuesta: Response, url: URL): void {
	const cabeceras =
		typeof respuesta.headers.getSetCookie === 'function' ? respuesta.headers.getSetCookie() : [];
	if (cabeceras.length === 0) return;

	const esHttps = url.protocol === 'https:';

	for (const cabecera of cabeceras) {
		const [par, ...atributos] = cabecera.split(';');
		const separador = par.indexOf('=');
		if (separador <= 0) continue;

		const nombre = par.slice(0, separador).trim();
		const valor = par.slice(separador + 1).trim();
		const opciones: Parameters<Cookies['set']>[2] = { path: '/' };

		for (const atributo of atributos) {
			const [clave, ...resto] = atributo.split('=');
			const nombreAtributo = clave.trim().toLowerCase();
			const valorAtributo = resto.join('=').trim();

			switch (nombreAtributo) {
				case 'path':
					opciones.path = valorAtributo || '/';
					break;
				case 'max-age': {
					const segundos = Number(valorAtributo);
					if (Number.isFinite(segundos)) opciones.maxAge = segundos;
					break;
				}
				case 'expires': {
					const fecha = new Date(valorAtributo);
					if (!Number.isNaN(fecha.getTime())) opciones.expires = fecha;
					break;
				}
				case 'httponly':
					opciones.httpOnly = true;
					break;
				case 'secure':
					// SvelteKit rechaza `secure` sobre http: solo se reenvía si aplica.
					if (esHttps) opciones.secure = true;
					break;
				case 'samesite': {
					const sameSite = valorAtributo.toLowerCase();
					if (sameSite === 'lax' || sameSite === 'strict' || sameSite === 'none') {
						opciones.sameSite = sameSite;
					}
					break;
				}
				case 'domain':
					if (valorAtributo) opciones.domain = valorAtributo;
					break;
			}
		}

		cookies.set(nombre, valor, opciones);
	}
}
