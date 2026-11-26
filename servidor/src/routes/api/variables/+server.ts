import { json } from '@sveltejs/kit';
import { variablesRepositorio } from '#lib/server/repositorios/index.ts';
import { variableSchema, variablesGuardarSchema } from '#lib/server/validaciones/facturas.ts';
import type { RequestHandler } from './$types';

/**
 * GET /api/variables
 * Lista las variables con su último valor usado.
 *
 * POST /api/variables
 * Crea una variable (idempotente por nombre). Body: { nombre }
 *
 * PUT /api/variables
 * Guarda el catálogo completo desde el panel del Facturador.
 * Body: { variables: [{ nombre, valor? }] }
 */
export const GET: RequestHandler = async () => {
	const variables = await variablesRepositorio.listarVariables();
	return json(variables);
};

export const POST: RequestHandler = async ({ request }) => {
	let cuerpo: unknown;

	try {
		cuerpo = await request.json();
	} catch {
		return json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
	}

	const validacion = variableSchema.safeParse(cuerpo);
	if (!validacion.success) {
		return json(
			{
				error: 'Datos inválidos',
				detalles: validacion.error.issues.map((issue) => ({
					campo: issue.path.join('.'),
					mensaje: issue.message
				}))
			},
			{ status: 400 }
		);
	}

	const variable = await variablesRepositorio.crearVariable(validacion.data.nombre);
	return json(variable, { status: 201 });
};

export const PUT: RequestHandler = async ({ request }) => {
	let cuerpo: unknown;

	try {
		cuerpo = await request.json();
	} catch {
		return json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
	}

	const validacion = variablesGuardarSchema.safeParse(cuerpo);
	if (!validacion.success) {
		return json(
			{
				error: 'Datos inválidos',
				detalles: validacion.error.issues.map((issue) => ({
					campo: issue.path.join('.'),
					mensaje: issue.message
				}))
			},
			{ status: 400 }
		);
	}

	const variables = await variablesRepositorio.reemplazarVariables(validacion.data.variables);
	return json(variables);
};
