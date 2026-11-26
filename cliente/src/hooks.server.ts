import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';

/**
 * Host canónico del frontend.
 *
 * La sesión vive en una cookie host-only: `127.0.0.1:4173` y `localhost:4173`
 * son dos "sitios" distintos para el navegador, con cookies distintas. Si se
 * entra por los dos lados, parece que la sesión no persiste.
 *
 * `iniciar.bat` y `BETTER_AUTH_URL` usan 127.0.0.1, así que cualquier pedido
 * que llegue por localhost se redirige ahí. En desarrollo (:5173) no aplica.
 */
const HOST_CANONICO = '127.0.0.1:4173';

export const handle: Handle = async ({ event, resolve }) => {
	if (event.url.host === 'localhost:4173') {
		redirect(308, `http://${HOST_CANONICO}${event.url.pathname}${event.url.search}`);
	}

	return resolve(event);
};
