import { redirect } from '@sveltejs/kit';
import { propagarCookiesDeRespuesta } from '#lib/server/propagar-cookies.ts';
import type { PageServerLoad } from './$types';

/**
 * Si el usuario YA tiene sesión, /login lo redirige a la pantalla principal.
 * Evita que un usuario autenticado vuelva a ver el formulario de acceso.
 */
export const load: PageServerLoad = async ({ fetch, request, cookies, url }) => {
	const cookie = request.headers.get('cookie');
	let sesion: { user?: unknown } | null = null;

	if (!cookie) {
		console.log(`[sesion] /login sin cookie · host=${request.headers.get('host') ?? '?'}`);
	}

	try {
		const res = await fetch('/api/auth/get-session', {
			headers: cookie ? { cookie } : {}
		});
		if (res.ok) {
			propagarCookiesDeRespuesta(cookies, res, url);
			const datos = await res.json();
			if (datos && typeof datos === 'object') sesion = datos;
		}
	} catch {
		sesion = null;
	}

	if (sesion?.user) redirect(303, '/principal');

	return {};
};
