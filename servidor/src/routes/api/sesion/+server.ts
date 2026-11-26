import { json } from '@sveltejs/kit';
import { pantallasVisibles } from '#lib/server/permisos/acceso.ts';
import { RUTAS } from '#lib/server/permisos/catalogo.ts';
import type { RequestHandler } from './$types';

/**
 * GET /api/sesion
 *
 * Identidad + accesos efectivos del usuario de la petición. Es la única ruta
 * de API que no exige una pantalla: cualquiera con sesión válida puede leer
 * lo suyo. Lo consume el layout autenticado para armar el menú y para bloquear
 * la navegación directa a una pantalla no habilitada.
 *
 * La autorización real NO depende de esto: cada endpoint se valida en
 * `hooks.server.ts`. Si el cliente ignorara esta respuesta, igual recibe 403.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const usuario = locals.usuario;
	if (!usuario) {
		return json({ error: 'Sesión inválida o usuario desactivado' }, { status: 401 });
	}

	return json({
		usuario: {
			id: usuario.id,
			// `name`/`image` mantienen la forma que ya consumen Banner y el menú.
			name: usuario.nombre,
			image: null,
			email: usuario.email,
			rol: usuario.rol,
			area: usuario.areaId ? { id: usuario.areaId, nombre: usuario.areaNombre } : null
		},
		admin: usuario.admin,
		permisos: usuario.permisos,
		pantallas: pantallasVisibles(usuario).map((pantalla) => ({
			clave: pantalla.clave,
			etiqueta: pantalla.etiqueta,
			ruta: pantalla.ruta ?? null,
			icono: pantalla.icono ?? null,
			orden: pantalla.orden
		})),
		// Rutas conocidas: el layout las usa para distinguir "no existe" de
		// "existe pero no tenés permiso".
		rutas: RUTAS
	});
};
