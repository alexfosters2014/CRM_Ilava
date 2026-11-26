import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { json } from '@sveltejs/kit';
import { prepararBaseDatos } from '#lib/server/base-datos/arranque.ts';
import { auth } from '#lib/server/autenticacion/auth.ts';
import { iniciarColaEnvios } from '#lib/server/repositorios/cola-envios.ts';
import { iniciarSincronizacionGmail } from '#lib/server/repositorios/gmail.ts';
import { cargarUsuarioDeSesion, puedeAlguno } from '#lib/server/permisos/acceso.ts';
import { clavesDeApi, validarCatalogo } from '#lib/server/permisos/catalogo.ts';
import { iniciarWhatsApp } from '#lib/server/whatsapp/gestor.ts';

/**
 * Hook de inicialización del servidor.
 *
 * Corre una sola vez al arrancar, ANTES de atender el primer request. Aplica
 * las migraciones de Drizzle pendientes y seedea los datos de ejemplo, de modo
 * que Drizzle es la única fuente de verdad del esquema y los datos (no hay
 * init.sql). Si la BD falla, lanza y el server no arranca (fallo visible).
 */
export const init: ServerInit = async () => {
	// Un catálogo de permisos inconsistente es un agujero de seguridad: si una
	// pantalla quedó sin llave o una llave sin padre, mejor no arrancar.
	const errores = validarCatalogo();
	if (errores.length > 0) {
		throw new Error(`Catálogo de permisos inválido:\n- ${errores.join('\n- ')}`);
	}

	await prepararBaseDatos();
	// Sesión de WhatsApp Web: un único socket por proceso. Se abre después de
	// las migraciones (lee el estado de la BD) y no bloquea el arranque.
	void iniciarWhatsApp();
	// Cola de envíos masivos: sigue en el servidor aunque se cierre la pestaña
	// y reanuda los ítems interrumpidos al reiniciar.
	iniciarColaEnvios();
	// Sondeo de Gmail para respuestas de seguimientos y tickets. Sin
	// credenciales OAuth no hace nada.
	iniciarSincronizacionGmail();
};

// Cabeceras CORS para permitir llamadas directas desde el navegador (opcional:
// el frontend normalmente llama a la API a través de su propio proxy /api).
const CORS_HEADERS: Record<string, string> = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

/** Rutas que se atienden sin sesión (healthcheck y documentación). */
const SIN_SESION = ['/api/salud', '/api/docs', '/api/openapi.json'];

/**
 * Webhooks externos: no tienen cookie de sesión, pero se autentican con un
 * secreto compartido dentro de la propia ruta. Se listan por prefijo porque el
 * id del ticket forma parte de la URL.
 */
const SIN_SESION_PREFIJOS = [
	'/api/webhooks/tickets/',
	'/api/gmail/pubsub/',
	'/api/tickets/portal/'
];

/**
 * Rutas que exigen sesión pero no una pantalla concreta. Hoy solo la propia
 * sesión: cualquiera puede leer sus accesos, nadie los de otro.
 */
const SOLO_AUTENTICADO = ['/api/sesion'];

function conCors(response: Response): Response {
	for (const [clave, valor] of Object.entries(CORS_HEADERS)) {
		response.headers.set(clave, valor);
	}
	return response;
}

function esRutaDeAutenticacion(pathname: string): boolean {
	return pathname === '/api/auth' || pathname.startsWith('/api/auth/');
}

export const handle: Handle = async ({ event, resolve }) => {
	// Rutas de Better Auth (/api/auth/*): login OTP, sesión, etc. Se atienden
	// directo con el handler de Better Auth, antes de la lógica CORS.
	//
	// Se compara solo el pathname a propósito: `isAuthPath` de Better Auth exige
	// que el origin de la petición sea igual a baseURL. Detrás del proxy del
	// frontend, event.url trae el origin de la API (8080) mientras baseURL es el
	// del navegador (5173), así que esa comparación devolvía 404 en /api/auth/*.
	if (esRutaDeAutenticacion(event.url.pathname)) {
		return auth.handler(event.request);
	}

	if (event.url.pathname.startsWith('/api')) {
		if (event.request.method === 'OPTIONS') {
			return new Response(null, { headers: CORS_HEADERS });
		}

		// Healthcheck, documentación y webhooks con secreto propio: públicos a
		// propósito. El webhook valida el secreto dentro de la ruta.
		if (
			SIN_SESION.includes(event.url.pathname) ||
			SIN_SESION_PREFIJOS.some((prefijo) => event.url.pathname.startsWith(prefijo))
		) {
			return conCors(await resolve(event));
		}

		// Identidad SIEMPRE desde la cookie de sesión. Nunca desde el cuerpo.
		const usuario = await cargarUsuarioDeSesion(event.request);
		event.locals.usuario = usuario;

		if (!usuario) {
			return conCors(json({ error: 'Sesión inválida o usuario desactivado' }, { status: 401 }));
		}

		if (SOLO_AUTENTICADO.includes(event.url.pathname)) {
			return conCors(await resolve(event));
		}

		// Fail-closed: una ruta sin llave declarada no se atiende. Si mañana se
		// agrega un endpoint y se olvida el catálogo, el test de cobertura lo
		// detecta antes del deploy; en runtime, esto evita que quede abierto.
		const claves = clavesDeApi(event.url.pathname);
		if (claves.size === 0) {
			console.warn(`[permisos] ruta de API sin llave declarada: ${event.url.pathname}`);
			return conCors(json({ error: 'Ruta no habilitada' }, { status: 403 }));
		}

		if (!puedeAlguno(usuario, claves)) {
			return conCors(
				json({ error: 'No tenés permiso para acceder a esta pantalla' }, { status: 403 })
			);
		}

		return conCors(await resolve(event));
	}

	return resolve(event);
};
