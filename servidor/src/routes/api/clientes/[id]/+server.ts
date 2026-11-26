import { json } from '@sveltejs/kit';
import { esViolacionUnica } from '#lib/server/base-datos/index.ts';
import { clientesRepositorio } from '#lib/server/repositorios/index.ts';
import type { RequestHandler } from './$types';

/**
 * GET /api/clientes/:id
 * Devuelve un cliente por su id.
 */
export const GET: RequestHandler = async ({ params }) => {
	const cliente = await clientesRepositorio.obtenerClientePorId(Number(params.id));

	if (!cliente) {
		return json({ error: 'Cliente no encontrado' }, { status: 404 });
	}

	return json(cliente);
};

/**
 * PUT /api/clientes/:id
 * Actualiza un cliente. Body: { nombre?, email?, telefono? }
 * Solo se modifican los campos presentes en el body.
 */
export const PUT: RequestHandler = async ({ params, request }) => {
	const datos = await request.json();

	const parcial: Record<string, string | null> = {};
	if (datos.nombre !== undefined) parcial.nombre = datos.nombre;
	if (datos.email !== undefined) parcial.email = datos.email;
	if (datos.telefono !== undefined) parcial.telefono = datos.telefono;

	try {
		const cliente = await clientesRepositorio.actualizarCliente(Number(params.id), parcial);

		if (!cliente) {
			return json({ error: 'Cliente no encontrado' }, { status: 404 });
		}

		return json(cliente);
	} catch (error) {
		// Email duplicado (unique_violation). Drizzle envuelve el error de pg.
		if (esViolacionUnica(error)) {
			return json({ error: 'Ya existe un cliente con ese email' }, { status: 409 });
		}
		throw error;
	}
};

/**
 * DELETE /api/clientes/:id
 * Elimina un cliente.
 */
export const DELETE: RequestHandler = async ({ params }) => {
	const eliminado = await clientesRepositorio.eliminarCliente(Number(params.id));

	if (!eliminado) {
		return json({ error: 'Cliente no encontrado' }, { status: 404 });
	}

	return json({ ok: true, eliminado: eliminado.id });
};
