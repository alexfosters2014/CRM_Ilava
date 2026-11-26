import { json } from '@sveltejs/kit';
import type { ZodError } from 'zod';
import { ErrorSeguimientos, estadoHttpSeguimientos } from '../repositorios/seguimientos.ts';

/**
 * Respuestas HTTP comunes del Centro de seguimiento de cobranza.
 *
 * El guard de `hooks.server.ts` resolvió sesión y pantalla; acá se traduce el
 * error de negocio a un status estable para el cliente.
 */
export function respuestaErrorSeguimientos(error: unknown): Response {
	if (error instanceof ErrorSeguimientos) {
		return json(
			{
				error: error.message,
				codigo: error.codigo,
				...(error.datos ? { actual: error.datos } : {})
			},
			{ status: estadoHttpSeguimientos(error.codigo) }
		);
	}

	console.error('[seguimientos] error no controlado:', error);
	return json({ error: 'Error interno del Centro de seguimiento' }, { status: 500 });
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
		throw new ErrorSeguimientos('DATOS_INVALIDOS', 'El cuerpo debe ser JSON válido');
	}
}

export function idDeParams(params: { id: string }): number {
	const id = Number(params.id);
	if (!Number.isInteger(id) || id <= 0) {
		throw new ErrorSeguimientos('DATOS_INVALIDOS', 'El identificador no es válido');
	}
	return id;
}
