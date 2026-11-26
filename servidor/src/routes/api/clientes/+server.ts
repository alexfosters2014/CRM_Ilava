import { json } from '@sveltejs/kit';
import { esViolacionUnica } from '#lib/server/base-datos/index.ts';
import { clientesRepositorio } from '#lib/server/repositorios/index.ts';
import type { RequestHandler } from './$types';

/**
 * GET /api/clientes
 * Devuelve todos los clientes ordenados por id.
 */
export const GET: RequestHandler = async () => {
	const clientes = await clientesRepositorio.listarClientes();
	return json(clientes);
};

/**
 * POST /api/clientes
 * Crea un cliente nuevo. Body: { nombre, email, telefono? }
 */
export const POST: RequestHandler = async ({ request }) => {
	const datos = await request.json();

	if (!datos.nombre || !datos.email) {
		return json({ error: 'Los campos "nombre" y "email" son obligatorios' }, { status: 400 });
	}

	try {
		const cliente = await clientesRepositorio.crearCliente({
			nombre: datos.nombre,
			email: datos.email,
			telefono: datos.telefono ?? null
		});
		return json(cliente, { status: 201 });
	} catch (error) {
		// Email duplicado (unique_violation). Drizzle envuelve el error de pg,
		// por eso se clasifica con esViolacionUnica() y no con error.code.
		if (esViolacionUnica(error)) {
			return json({ error: 'Ya existe un cliente con ese email' }, { status: 409 });
		}
		throw error;
	}
};
