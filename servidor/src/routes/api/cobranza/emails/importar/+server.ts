import { json } from '@sveltejs/kit';
import { emailsServicioRepositorio } from '#lib/server/repositorios/index.ts';
import { ErrorImportacionEmails } from '#lib/server/repositorios/emails-servicio.ts';
import { usuarioDePeticion } from '#lib/server/autenticacion/usuario.ts';
import type { RequestHandler } from './$types';

/**
 * POST /api/cobranza/emails/importar
 * Body: { filas: [{ servicioId, emails }], archivoNombre?, aplicar? }
 *
 * Con `aplicar: false` (por defecto) valida y devuelve el diff sin escribir:
 * la pantalla lo usa para la previsualización. Con `aplicar: true` aplica todo
 * en una única transacción.
 */
export const POST: RequestHandler = async ({ request }) => {
	const cuerpo = await request.json().catch(() => null);
	if (!Array.isArray(cuerpo?.filas)) {
		return json({ error: 'Se requieren las filas de la planilla' }, { status: 400 });
	}

	try {
		const resumen = await emailsServicioRepositorio.importarPlanillaEmails({
			filas: cuerpo.filas,
			archivo: cuerpo.archivoNombre ? String(cuerpo.archivoNombre) : null,
			usuario: await usuarioDePeticion(request, cuerpo.usuario),
			aplicar: cuerpo.aplicar === true
		});
		return json(resumen, { status: resumen.importacionId ? 201 : 200 });
	} catch (error) {
		if (error instanceof ErrorImportacionEmails) {
			return json({ error: error.message, errores: error.errores }, { status: 422 });
		}
		return json(
			{ error: error instanceof Error ? error.message : 'No se pudo importar la planilla' },
			{ status: 400 }
		);
	}
};
