import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Proxy /api/* → API_URL
 * El frontend llama a su propio /api y este endpoint reenvía la petición
 * al servidor de la API. Así evitamos problemas de CORS y la URL de la API
 * solo se configura una vez (variable API_URL).
 */

// URL de la API, configurable en runtime vía la variable de entorno API_URL
// (en desarrollo proviene de .env; en el contenedor, de compose-backend/frontend)
const apiBase = () => process.env.API_URL ?? 'http://localhost:8080';

const reenviar = async ({
	url,
	request,
	platform
}: {
	url: URL;
	request: Request;
	platform?: App.Platform;
}) => {
	const destino = apiBase() + url.pathname + url.search;

	// GET y HEAD no llevan cuerpo. Para el resto leemos el body en memoria
	// (ArrayBuffer): reenviar request.body como stream obligaría a pasar
	// `duplex: 'half'` a fetch y falla con POST/PUT/PATCH.
	const sinCuerpo = request.method === 'GET' || request.method === 'HEAD';
	const cuerpo = sinCuerpo ? undefined : await request.arrayBuffer();

	// Cabeceras que no deben reenviarse tal cual al destino: las hop-by-hop
	// (Expect/Connection/Transfer-Encoding) y las de identidad (Host,
	// Content-Length, que recalculará el fetch de destino).
	const encabezados = new Headers(request.headers);
	for (const cabecera of [
		'content-length',
		'host',
		'expect',
		'connection',
		'keep-alive',
		'transfer-encoding',
		'upgrade',
		'proxy-authenticate',
		'proxy-authorization',
		'te',
		'trailer'
	]) {
		encabezados.delete(cabecera);
	}

	// Protocolo y host reales de la petición original.
	//
	// OJO: NO usamos `url.protocol`: adapter-node asume `https` por defecto (si
	// no hay PROTOCOL_HEADER ni paths.origin) y contamina event.url, así que el
	// frontend reportaría https aunque el request llegue por http. Ese https
	// falso lo heredaría el backend vía x-forwarded-proto y desalinearía el
	// origin que Better Auth compara en isAuthPath/CSRF → 404 o "Invalid origin".
	//
	// En su lugar derivamos el protocolo del SOCKET real (adapter-node inyecta
	// el request de Node en platform.req): si el socket no está encriptado, es
	// http. Así el valor es correcto en runtime, sin horneare el origin en el build.
	// encriptado: `req.socket` está tipado como Socket (node:net) que no expone
	// `encrypted`; solo TLSSocket lo tiene. Chequeamos la propiedad en runtime
	// sin forzar el tipo.
	const socket = platform?.req?.socket as
		| (import('node:net').Socket & { encrypted?: boolean })
		| undefined;
	const protocolo = socket?.encrypted ? 'https' : 'http';

	encabezados.set('x-forwarded-proto', protocolo);
	encabezados.set('x-forwarded-host', url.host);

	try {
		const respuesta = await fetch(destino, {
			method: request.method,
			headers: encabezados,
			body: cuerpo,
			// Un proxy debe devolver el 3xx al navegador, no seguirlo. Si se
			// sigue, el HTML final (por ejemplo el login de Google en OAuth)
			// se sirve con el origen del frontend y sus recursos relativos
			// apuntan al lugar equivocado (CSP base-uri, 404 y CORS).
			redirect: 'manual'
		});

		const encabezadosRespuesta = new Headers(respuesta.headers);
		encabezadosRespuesta.delete('content-encoding');
		encabezadosRespuesta.delete('content-length');

		// set-cookie: al iterar Headers, el fetch los combina en un solo valor
		// separado por ", ", lo que rompe si Better Auth manda varias cookies de
		// sesión. Los extraemos por separado de la respuesta original y los
		// volvemos a agregar con append para que lleguen individuales al navegador.
		const cookies =
			typeof respuesta.headers.getSetCookie === 'function' ? respuesta.headers.getSetCookie() : [];
		if (cookies.length > 0) {
			encabezadosRespuesta.delete('set-cookie');
			for (const c of cookies) encabezadosRespuesta.append('set-cookie', c);
		}

		return new Response(respuesta.body, {
			status: respuesta.status,
			headers: encabezadosRespuesta
		});
	} catch (e) {
		throw error(502, `No se pudo contactar con la API en ${destino}: ${(e as Error).message}`);
	}
};

export const GET: RequestHandler = reenviar;
export const POST: RequestHandler = reenviar;
export const PUT: RequestHandler = reenviar;
export const PATCH: RequestHandler = reenviar;
export const DELETE: RequestHandler = reenviar;
