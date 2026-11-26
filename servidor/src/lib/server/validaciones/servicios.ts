import { z } from 'zod';
import { normalizarTelefonoUy } from '../servicios/telefonos.ts';

/**
 * Capa: Validaciones — importación de servicios.
 *
 * El archivo de servicios trae: contacto, numeración (RUT/CI), tipo, atributos
 * de gestión, grupo y gestión de facturación.
 */

const textoLimpio = z.string().trim();

export const filaServicioSchema = z.object({
	contacto: textoLimpio.min(1, 'El contacto es obligatorio').max(180),
	numeracion: textoLimpio.max(30).nullish(),
	tipo: textoLimpio.max(20).nullish(),
	tipoGestion: textoLimpio.nullish(),
	tipoCliente: textoLimpio.nullish(),
	modalidadCobranza: textoLimpio.nullish(),
	grupo: textoLimpio.nullish(),
	tipoGestionFacturacion: textoLimpio.nullish()
});

export const importacionServiciosSchema = z.object({
	filas: z.array(filaServicioSchema).min(1, 'El archivo no contiene filas para importar')
});

/** Celular de WhatsApp del servicio, canónico o vacío. */
const celularSchema = z
	.string()
	.trim()
	.max(30)
	.nullish()
	.superRefine((valor, ctx) => {
		if (valor && !normalizarTelefonoUy(valor)) {
			ctx.addIssue({
				code: 'custom',
				message: 'El celular debe ser un móvil uruguayo (ej.: 099 123 456)'
			});
		}
	})
	.transform((valor) =>
		valor === undefined ? undefined : valor ? normalizarTelefonoUy(valor) : null
	);

/** Body de PATCH /api/servicios/[id]: edición del servicio y su switch. */
export const actualizarServicioSchema = z.object({
	nombreFantasia: z.string().trim().max(180).nullish(),
	numeracion: z.string().trim().max(30).nullish(),
	tipoNumeracion: z.enum(['RUT', 'CEDULA', 'OTROS', 'SIN_NUMERACION']).optional(),
	grupoId: z.number().int().positive().optional(),
	grupoCobranzaId: z.number().int().positive().nullish(),
	tipoGestionId: z.number().int().positive().optional(),
	tipoClienteId: z.number().int().positive().optional(),
	modalidadCobranzaId: z.number().int().positive().optional(),
	tipoGestionFacturacionId: z.number().int().positive().optional(),
	comentarioGestionFacturacion: z.string().trim().max(2000).nullish(),
	cantidadDiasVencimiento: z.number().int().min(0).max(365).optional(),
	celular: celularSchema,
	habilitado: z.boolean().optional()
});

export type FilaServicio = z.infer<typeof filaServicioSchema>;
export type ActualizarServicio = z.infer<typeof actualizarServicioSchema>;
