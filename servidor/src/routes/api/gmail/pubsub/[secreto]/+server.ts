import { json } from '@sveltejs/kit';
import {
	procesarNotificacionGmail,
	pubsubConfigurado,
	secretoPubSubValido
} from '#lib/server/repositorios/gmail.ts';
import { decodificarNotificacionPubSub } from '#lib/server/servicios/gmail-texto.ts';
import type { RequestHandler } from './$types';

/**
 * POST /api/gmail/pubsub/[secreto]
 *
 * Push de Google Cloud Pub/Sub para `users.watch`. Es público (lo llama un
 * servicio externo) pero exige el secreto en el path. Si no hay secreto
 * configurado, responde 404: fail-closed.
 *
 * El push solo dispara una sincronización por `history.list`; no confía en el
 * contenido para mutar datos.
 */
export const POST: RequestHandler = async ({ params, request }) => {
	if (!pubsubConfigurado() || !secretoPubSubValido(params.secreto)) {
		return json({ error: 'No encontrado' }, { status: 404 });
	}

	try {
		const cuerpo = (await request.json().catch(() => null)) as
			| { message?: { data?: unknown } }
			| null;
		const data = cuerpo?.message?.data;
		if (typeof data !== 'string' || !data) {
			return json({ error: 'Payload inválido' }, { status: 400 });
		}
		const notificacion = decodificarNotificacionPubSub(data);
		const resultado = await procesarNotificacionGmail(notificacion);
		return json({ ok: true, ...resultado });
	} catch (error) {
		if (error instanceof Error && /payload|notificación/i.test(error.message)) {
			return json({ error: error.message }, { status: 400 });
		}
		console.error('[gmail] error procesando push de Pub/Sub:', error);
		// 500 para que Pub/Sub reintente si fue un fallo transitorio de Google.
		return json({ error: 'Error procesando la notificación' }, { status: 500 });
	}
};
