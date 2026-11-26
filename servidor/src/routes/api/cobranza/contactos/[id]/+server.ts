import { json } from '@sveltejs/kit';
import { emailsServicioRepositorio } from '#lib/server/repositorios/index.ts';
import type { RequestHandler } from './$types';

/**
 * DELETE /api/cobranza/contactos/:id — quita el mail del listado de cobranza.
 * Si el mail es compartido, sigue activo para facturación.
 */
export const DELETE: RequestHandler = async ({ params }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id) || id <= 0) return json({ error: 'ID inválido' }, { status: 400 });
	try {
		const resultado = await emailsServicioRepositorio.quitarEmailDeLista(id, 'COBRANZA');
		return json(resultado);
	} catch {
		return json({ error: 'Contacto no encontrado' }, { status: 404 });
	}
};
