import { json } from '@sveltejs/kit';
import type { ZodError } from 'zod';
import { ErrorGmail } from '../servicios/gmail.ts';
import { ErrorGmailRepo } from '../repositorios/gmail.ts';

/** Respuestas HTTP comunes del conector Gmail. */
export function respuestaErrorGmail(error: unknown): Response {
	if (error instanceof ErrorGmailRepo) {
		const status =
			error.codigo === 'NO_ENCONTRADO'
				? 404
				: error.codigo === 'SIN_PERMISO'
					? 403
					: error.codigo === 'CONFLICTO'
						? 409
						: error.codigo === 'NO_CONFIGURADO'
							? 503
							: 400;
		return json({ error: error.message, codigo: error.codigo }, { status });
	}
	if (error instanceof ErrorGmail) {
		const status =
			error.codigo === 'NO_CONFIGURADO'
				? 503
				: error.codigo === 'TOKEN'
					? 401
					: error.codigo === 'CUOTA'
						? 429
						: error.codigo === 'RED'
							? 502
							: 400;
		return json({ error: error.message, codigo: error.codigo }, { status });
	}
	console.error('[gmail] error no controlado:', error);
	return json({ error: 'Error interno del conector Gmail' }, { status: 500 });
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
		return {};
	}
}
