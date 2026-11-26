import type { PageServerLoad } from './$types';

/**
 * Pantalla pública del ticket: se abre con el token del correo, sin sesión.
 * El backend valida el token, el estado del ticket y filtra los mensajes
 * visibles para el cliente.
 */

const apiBase = () => process.env.API_URL ?? 'http://localhost:8080';

export const load: PageServerLoad = async ({ params, fetch, setHeaders }) => {
	setHeaders({
		'cache-control': 'no-store',
		'referrer-policy': 'no-referrer',
		'x-robots-tag': 'noindex'
	});

	try {
		const respuesta = await fetch(
			`${apiBase()}/api/tickets/portal/${encodeURIComponent(params.token)}`,
			{ cache: 'no-store' }
		);
		const datos = await respuesta.json().catch(() => ({}));

		if (respuesta.status === 404) {
			return {
				token: params.token,
				error: 'El enlace no es válido o venció. Pedí uno nuevo al equipo.',
				ticket: null,
				identificado: false,
				nombre: '',
				mensajes: []
			};
		}
		if (!respuesta.ok) {
			return {
				token: params.token,
				error: 'No se pudo abrir la conversación. Intentá de nuevo en unos minutos.',
				ticket: null,
				identificado: false,
				nombre: '',
				mensajes: []
			};
		}

		return {
			token: params.token,
			error: '',
			ticket: datos.ticket ?? null,
			identificado: Boolean(datos.identificado),
			nombre: String(datos.nombre ?? ''),
			mensajes: datos.mensajes ?? []
		};
	} catch {
		return {
			token: params.token,
			error: 'No se pudo conectar con el servidor. Intentá de nuevo.',
			ticket: null,
			identificado: false,
			nombre: '',
			mensajes: []
		};
	}
};
