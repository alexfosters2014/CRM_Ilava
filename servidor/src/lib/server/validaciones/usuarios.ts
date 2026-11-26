import { z } from 'zod';

/**
 * Capa: Validaciones — Usuarios y áreas.
 *
 * Las pantallas se validan contra el catálogo en el repositorio (no acá) porque
 * el catálogo es la fuente de verdad y puede cambiar.
 */

const correo = z
	.string()
	.trim()
	.toLowerCase()
	.max(180)
	.regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'El correo no es válido');

export const usuarioSchema = z.object({
	nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
	correo,
	rol: z.enum(['ADMIN', 'OPERADOR']),
	areaId: z.number().int().positive().nullable().optional(),
	pantallas: z.array(z.string().trim().min(1)).max(100).default([])
});

export const usuarioParcialSchema = z.object({
	nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(120).optional(),
	correo: correo.optional(),
	rol: z.enum(['ADMIN', 'OPERADOR']).optional(),
	areaId: z.number().int().positive().nullable().optional(),
	// Sin default a propósito: si el PATCH no manda pantallas, NO se tocan.
	pantallas: z.array(z.string().trim().min(1)).max(100).optional()
});

export const areaSchema = z.object({
	nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(80)
});

export const areaParcialSchema = areaSchema.partial().extend({
	activo: z.boolean().optional()
});

export type DatosUsuario = z.infer<typeof usuarioSchema>;
export type DatosUsuarioParcial = z.infer<typeof usuarioParcialSchema>;
export type DatosArea = z.infer<typeof areaSchema>;
