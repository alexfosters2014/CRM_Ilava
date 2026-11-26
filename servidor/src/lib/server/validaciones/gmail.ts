import { z } from 'zod';

/**
 * Capa: Validaciones — Gmail API.
 *
 * Solo valida forma. La configuración OAuth, la propiedad de la cuenta y los
 * permisos se resuelven en el repositorio.
 */

const correo = z
	.string()
	.trim()
	.toLowerCase()
	.max(180)
	.regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'El correo no es válido');

const idPositivo = z.number().int().positive();

export const enviarCorreoSeguimientoSchema = z.object({
	cuentaGmailId: idPositivo,
	para: z.array(correo).min(1, 'Agregá al menos un destinatario').max(30),
	cc: z.array(correo).max(30).default([]),
	asunto: z.string().trim().min(1, 'El asunto es obligatorio').max(250),
	cuerpo: z.string().trim().min(1, 'Escribí el cuerpo del correo').max(50000),
	facturasReferencia: z.array(z.string().trim().max(120)).max(200).default([])
});

export type DatosEnvioSeguimiento = z.infer<typeof enviarCorreoSeguimientoSchema>;

export const sincronizarSchema = z.object({
	cuentaId: idPositivo.optional()
});
