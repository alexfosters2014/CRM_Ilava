import { json } from '@sveltejs/kit';
import type { ZodError } from 'zod';
import { ErrorTickets, estadoHttpTickets } from '../repositorios/tickets.ts';

/**
 * Respuestas HTTP comunes del módulo de tickets.
 *
 * El guard de `hooks.server.ts` ya resolvió la sesión y el permiso de pantalla.
 * Acá se traduce el error de negocio a un status estable para el cliente.
 */
export function respuestaErrorTickets(error: unknown): Response {
	if (error instanceof ErrorTickets) {
		return json(
			{
				error: error.message,
				codigo: error.codigo,
				...(error.datos ? { actual: error.datos } : {})
			},
			{ status: estadoHttpTickets(error.codigo) }
		);
	}

	console.error('[tickets] error no controlado:', error);
	return json({ error: 'Error interno del módulo de tickets' }, { status: 500 });
}

export function respuestaValidacion(error: ZodError): Response {
	return json(
		{
			error: 'Datos inválidos',
			codigo: 'DATOS_INVALIDOS',
			detalles: error.issues.map((issue) => ({
				campo: issue.path.join('.'),
				mensaje: issue.message
			}))
		},
		{ status: 400 }
	);
}

export async function leerCuerpo(request: Request): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		throw new ErrorTickets('DATOS_INVALIDOS', 'El cuerpo debe ser JSON válido');
	}
}
