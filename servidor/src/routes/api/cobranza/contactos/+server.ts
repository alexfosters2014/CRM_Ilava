import { json } from '@sveltejs/kit';
import { emailsServicioRepositorio } from '#lib/server/repositorios/index.ts';
import { usuarioDePeticion } from '#lib/server/autenticacion/usuario.ts';
import type { RequestHandler } from './$types';

/**
 * Endpoints históricos de destinatarios de cobranza.
 * Deprecados: la API nueva es `/api/emails` (con destino explícito). Se
 * mantienen para scripts y consumidores externos.
 */

/** GET /api/cobranza/contactos?servicioId=123 — destinatarios de cobranza. */
export const GET: RequestHandler = async ({ url }) => {
	const servicioId = Number(url.searchParams.get('servicioId'));
	if (!Number.isInteger(servicioId) || servicioId <= 0) {
		return json({ error: 'servicioId inválido' }, { status: 400 });
	}
	const { emails } = await emailsServicioRepositorio.listarEmailsServicio(servicioId);
	return json(emails.filter((email) => email.uso !== 'FACTURACION'));
};

/**
 * POST /api/cobranza/contactos
 * Body: { servicioId, emails: "luis@x.com; marta@y.com" } o { servicioId, email }
 * Acepta varios separados por `;`, `,` o salto de línea.
 */
export const POST: RequestHandler = async ({ request }) => {
	const cuerpo = await request.json().catch(() => null);
	const servicioId = Number(cuerpo?.servicioId);
	if (!Number.isInteger(servicioId) || servicioId <= 0) {
		return json({ error: 'servicioId inválido' }, { status: 400 });
	}
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
			'COBRANZA',
			await usuarioDePeticion(request, cuerpo?.usuario)
		);
		return json(resultado, { status: 201 });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'No se pudo agregar' }, { status: 400 });
	}
};
