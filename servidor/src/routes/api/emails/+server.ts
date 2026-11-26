import { json } from '@sveltejs/kit';
import { emailsServicioRepositorio } from '#lib/server/repositorios/index.ts';
import { usuarioDePeticion } from '#lib/server/autenticacion/usuario.ts';
import { esUsoEmail } from '#lib/server/servicios/emails.ts';
import type { RequestHandler } from './$types';

/** GET /api/emails?servicioId=123 — mails activos con destino y modo derivado. */
export const GET: RequestHandler = async ({ url }) => {
	const servicioId = Number(url.searchParams.get('servicioId'));
	if (!Number.isInteger(servicioId) || servicioId <= 0) {
		return json({ error: 'servicioId inválido' }, { status: 400 });
	}
	return json(await emailsServicioRepositorio.listarEmailsServicio(servicioId));
};

/**
 * POST /api/emails
 * Body: { servicioId, emails: "luis@x.com; marta@y.com", uso? }
 *
 * `uso` debe ser COMPARTIDO, FACTURACION o COBRANZA (por defecto COBRANZA).
 * Acepta varios separados por `;`, `,` o salto de línea.
 */
export const POST: RequestHandler = async ({ request }) => {
	const cuerpo = await request.json().catch(() => null);
	const servicioId = Number(cuerpo?.servicioId);
	if (!Number.isInteger(servicioId) || servicioId <= 0) {
		return json({ error: 'servicioId inválido' }, { status: 400 });
	}
	const uso = esUsoEmail(cuerpo?.uso) ? cuerpo.uso : 'COBRANZA';
	const crudo: string = Array.isArray(cuerpo?.emails)
		? cuerpo.emails.join(';')
		: String(cuerpo?.emails ?? cuerpo?.email ?? '');
	const emails: string[] = crudo
		.split(/[,;\n]/)
		.map((email: string) => email.trim())
		.filter(Boolean);
	try {
		const resultado = await emailsServicioRepositorio.agregarEmailsServicio(
			servicioId,
			emails,
			uso,
			await usuarioDePeticion(request, cuerpo?.usuario)
		);
		return json({ ...resultado, uso }, { status: 201 });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'No se pudo agregar' }, { status: 400 });
	}
};
