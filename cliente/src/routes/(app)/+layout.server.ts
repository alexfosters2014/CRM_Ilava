import { error, redirect } from '@sveltejs/kit';
import { propagarCookiesDeRespuesta } from '#lib/server/propagar-cookies.ts';
import type { SesionApp } from '#lib/servicios/sesion.ts';
import type { LayoutServerLoad } from './$types';

/**
 * Guard de sesión y de permisos para todas las rutas dentro de (app)/.
 *
 * Corre en el servidor y redirige a /login si no hay sesión válida. Además
 * consulta `/api/sesion` para saber qué pantallas tiene habilitadas el usuario
 * y bloquea la navegación directa a una pantalla que no le corresponde.
 *
 * OJO: esto es UX, no seguridad. La autorización real la hace la API: si un
 * usuario escribe la URL igual recibe 403 en los datos.
 *
 * OJO 2: "el backend no responde" NO es lo mismo que "no hay sesión". Si la
 * consulta falla se devuelve 503 en vez de mandar a /login, para no hacer creer
 * que la sesión se perdió.
 */
export const load: LayoutServerLoad = async ({ fetch, request, cookies, url }) => {
	const cookie = request.headers.get('cookie');
	let sesion: SesionApp | null = null;
	let backendCaido = false;
	let sinSesion = false;

	try {
		const res = await fetch('/api/sesion', {
			headers: cookie ? { cookie } : {}
		});

		if (res.status === 401) {
			sinSesion = true;
		} else if (!res.ok) {
			backendCaido = true;
		} else {
			propagarCookiesDeRespuesta(cookies, res, url);
			sesion = await res.json();
		}
	} catch {
		backendCaido = true;
	}

	if (backendCaido) {
		error(503, 'El servidor no responde. Tu sesión sigue guardada: esperá unos segundos y recargá.');
	}

	if (sinSesion || !sesion?.usuario) {
		// Diagnóstico barato para el caso "me pide login de nuevo": distingue
		// "el navegador no manda cookie" de "la manda pero no vale".
		const nombres = (cookie ?? '')
			.split(';')
			.map((parte) => parte.split('=')[0].trim())
			.filter(Boolean);
		console.log(
			`[sesion] sin sesión · host=${request.headers.get('host') ?? '?'} · cookies=${nombres.join(',') || 'ninguna'}`
		);
		redirect(303, '/login');
	}

	// Bloqueo de navegación directa. Solo se evalúan rutas de pantalla
	// conocidas: una subruta o una ruta inexistente no se toca acá.
	const conocida = sesion.rutas.find((ruta) => ruta.ruta === url.pathname);
	if (conocida && !sesion.pantallas.some((pantalla) => pantalla.clave === conocida.clave)) {
		// /principal es el destino de repliegue: si el usuario no tiene ni
		// Inicio, no lo mandamos en círculos.
		if (url.pathname !== '/principal') redirect(303, '/principal');
	}

	return {
		usuario: sesion.usuario,
		admin: sesion.admin,
		permisos: sesion.permisos,
		pantallas: sesion.pantallas,
		rutas: sesion.rutas
	};
};
