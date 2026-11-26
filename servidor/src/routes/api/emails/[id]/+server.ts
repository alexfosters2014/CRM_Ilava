import { json } from '@sveltejs/kit';
import { emailsServicioRepositorio } from '#lib/server/repositorios/index.ts';
import { usuarioDePeticion } from '#lib/server/autenticacion/usuario.ts';
import { esUsoEmail } from '#lib/server/servicios/emails.ts';
import type { RequestHandler } from './$types';

/**
 * PATCH /api/emails/:id — cambia el destino de un mail.
 * Body: { uso: 'COMPARTIDO' | 'FACTURACION' | 'COBRANZA' }
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id) || id <= 0) return json({ error: 'ID inválido' }, { status: 400 });
	const cuerpo = await request.json().catch(() => null);
	if (!esUsoEmail(cuerpo?.uso)) return json({ error: 'Destino de email inválido' }, { status: 400 });
	try {
		const email = await emailsServicioRepositorio.cambiarUsoEmail(
			id,
			cuerpo.uso,
			await usuarioDePeticion(request, cuerpo?.usuario)
		);
		return json(email);
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'No se pudo cambiar' }, { status: 400 });
	}
};

/**
 * DELETE /api/emails/:id?lista=COBRANZA — quita de un listado.
 *
 * Sin `lista`, da de baja el mail completo. Con `lista`, si era compartido
 * queda en el otro listado (sigue recibiendo el proceso restante).
 */
export const DELETE: RequestHandler = async ({ params, request, url }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id) || id <= 0) return json({ error: 'ID inválido' }, { status: 400 });
	const listaParam = url.searchParams.get('lista');
	const lista: 'COBRANZA' | 'FACTURACION' | null =
		listaParam === 'COBRANZA' || listaParam === 'FACTURACION' ? listaParam : null;
	if (listaParam && !lista) {
		return json({ error: 'Listado inválido' }, { status: 400 });
	}
	try {
		if (lista) {
			const resultado = await emailsServicioRepositorio.quitarEmailDeLista(
				id,
				lista,
				await usuarioDePeticion(request)
			);
			return json(resultado);
		}
		const eliminado = await emailsServicioRepositorio.eliminarEmailServicio(
			id,
			await usuarioDePeticion(request)
		);
		return eliminado ? json({ eliminado: true }) : json({ error: 'Email no encontrado' }, { status: 404 });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'No se pudo quitar' }, { status: 400 });
	}
};
