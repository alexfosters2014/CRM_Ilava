import { z } from 'zod';
import { normalizarTelefonoUy } from '../servicios/telefonos.ts';

/**
 * Capa: Validaciones — Centro de seguimiento de cobranza.
 *
 * La forma de los datos vive acá. Las reglas de negocio (permisos por área,
 * transiciones, cierre con tickets bloqueantes, concurrencia) viven en el
 * repositorio, porque necesitan leer la base y la sesión.
 */

export const ESTADOS_SEGUIMIENTO = [
	'EN_SEGUIMIENTO',
	'ESPERANDO_CLIENTE',
	'PROMESA_PAGO',
	'BLOQUEADO_TICKET',
	'PAUSADO',
	'CERRADO_PAGADO',
	'CERRADO_ACUERDO',
	'CERRADO_LEGAL',
	'CERRADO_INCOBRABLE'
] as const;
export type EstadoSeguimiento = (typeof ESTADOS_SEGUIMIENTO)[number];

export const ESTADOS_CERRADOS: readonly EstadoSeguimiento[] = [
	'CERRADO_PAGADO',
	'CERRADO_ACUERDO',
	'CERRADO_LEGAL',
	'CERRADO_INCOBRABLE'
];

export const PRIORIDADES_SEGUIMIENTO = ['BAJA', 'NORMAL', 'ALTA', 'URGENTE'] as const;
export type PrioridadSeguimiento = (typeof PRIORIDADES_SEGUIMIENTO)[number];

/** Canales de una gestión. Ninguno es un estado del caso. */
export const CANALES_AVANCE = [
	'NOTA',
	'CORREO',
	'CORREO_MANUAL',
	'WHATSAPP',
	'WHATSAPP_MANUAL',
	'TELEFONO',
	'REUNION',
	'OTRO'
] as const;
export type CanalAvance = (typeof CANALES_AVANCE)[number];

export const TIPOS_ACCION = [
	'CORREO',
	'WHATSAPP',
	'LLAMADA',
	'CONFIRMAR_PAGO',
	'VALIDAR_COMPROBANTE',
	'VERIFICAR_ACREDITACION',
	'REVISAR_TICKET',
	'OTRA'
] as const;
export type TipoAccion = (typeof TIPOS_ACCION)[number];

export const ESTADOS_TAREA = ['PENDIENTE', 'COMPLETADA', 'REPROGRAMADA', 'CANCELADA'] as const;
export type EstadoTarea = (typeof ESTADOS_TAREA)[number];

export const ESTADOS_PROMESA = [
	'VIGENTE',
	'CUMPLIDA',
	'CUMPLIDA_PARCIAL',
	'INCUMPLIDA',
	'REPROGRAMADA',
	'CANCELADA'
] as const;
export type EstadoPromesa = (typeof ESTADOS_PROMESA)[number];

const idPositivo = z.number().int().positive();

const fechaIso = z
	.string()
	.trim()
	.min(1)
	.refine((valor) => !Number.isNaN(Date.parse(valor)), 'La fecha no es válida');

const textoOpcional = z.string().trim().max(20000).nullable().optional();

/**
 * Celular de WhatsApp del caso. Se guarda canónico (598 + 8 dígitos).
 * - `undefined`: al crear se copia del servicio; al editar no se toca.
 * - `null` o vacío: el caso queda sin WhatsApp.
 */
const telefonoWhatsappSchema = z
	.string()
	.trim()
	.max(30)
	.nullable()
	.optional()
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

const proximaAccion = z.object({
	tipoAccion: z.enum(TIPOS_ACCION),
	titulo: z.string().trim().min(3).max(200),
	fechaHora: fechaIso,
	responsableUsuarioId: z.string().trim().min(1).max(64).optional(),
	recordatorioMinutos: z.number().int().min(0).max(10080).default(0),
	nota: textoOpcional,
	canalPrevisto: z.enum(CANALES_AVANCE).nullable().optional()
});

export const crearSeguimientoSchema = z.object({
	servicioId: idPositivo,
	titulo: z.string().trim().min(3, 'El título es obligatorio').max(200),
	motivo: textoOpcional,
	estado: z.enum(ESTADOS_SEGUIMIENTO).default('EN_SEGUIMIENTO'),
	prioridad: z.enum(PRIORIDADES_SEGUIMIENTO).default('NORMAL'),
	responsableUsuarioId: z.string().trim().min(1).max(64).optional(),
	canalPreferido: z.enum(CANALES_AVANCE).nullable().optional(),
	telefonoWhatsapp: telefonoWhatsappSchema,
	facturaIds: z.array(idPositivo).min(1, 'Elegí al menos un comprobante').max(200),
	nota: z.string().trim().max(20000).optional(),
	observadores: z.array(z.string().trim().min(1).max(64)).max(50).default([]),
	proximaAccion: proximaAccion.optional(),
	/** Envío de correo de origen (desde el modal de Cobranza). */
	envioId: idPositivo.nullable().optional()
});

export const actualizarSeguimientoSchema = z.object({
	version: z.number().int().positive(),
	titulo: z.string().trim().min(3).max(200).optional(),
	motivo: textoOpcional,
	estado: z.enum(ESTADOS_SEGUIMIENTO).optional(),
	prioridad: z.enum(PRIORIDADES_SEGUIMIENTO).optional(),
	responsableUsuarioId: z.string().trim().min(1).max(64).optional(),
	canalPreferido: z.enum(CANALES_AVANCE).nullable().optional(),
	telefonoWhatsapp: telefonoWhatsappSchema,
	motivoCierre: textoOpcional,
	/** Agregar o quitar observadores (ids de usuario). */
	observadores: z.array(z.string().trim().min(1).max(64)).max(50).optional()
});

export const registrarAvanceSchema = z.object({
	canal: z.enum(CANALES_AVANCE),
	direccion: z.enum(['ENTRANTE', 'SALIENTE', 'INTERNA']).default('INTERNA'),
	contenido: z.string().trim().min(1, 'Escribí el avance').max(20000),
	contacto: z.string().trim().max(200).optional(),
	resultado: z.string().trim().max(500).optional(),
	duracionMinutos: z.number().int().min(0).max(1440).optional(),
	asunto: z.string().trim().max(300).optional(),
	destinatarios: z.array(z.string().trim().max(200)).max(50).optional(),
	estadoEntrega: z.enum(['REGISTRADO', 'ENVIADO', 'RECIBIDO', 'FALLIDO']).optional(),
	programarProxima: proximaAccion.optional()
});

export const crearTareaSchema = z.object({
	tipoAccion: z.enum(TIPOS_ACCION),
	titulo: z.string().trim().min(3, 'El título es obligatorio').max(200),
	nota: textoOpcional,
	fechaHora: fechaIso,
	responsableUsuarioId: z.string().trim().min(1).max(64).optional(),
	recordatorioMinutos: z.number().int().min(0).max(10080).default(0),
	canalPrevisto: z.enum(CANALES_AVANCE).nullable().optional()
});

export const actualizarTareaSchema = z
	.object({
		version: z.number().int().positive(),
		accion: z.enum(['COMPLETAR', 'REPROGRAMAR', 'CANCELAR', 'TRANSFERIR']),
		resultado: z.string().trim().max(20000).optional(),
		fechaHora: fechaIso.optional(),
		responsableUsuarioId: z.string().trim().min(1).max(64).optional(),
		motivo: z.string().trim().max(2000).optional()
	})
	.superRefine((datos, ctx) => {
		if (datos.accion === 'REPROGRAMAR' && !datos.fechaHora) {
			ctx.addIssue({ code: 'custom', path: ['fechaHora'], message: 'Indicá la nueva fecha' });
		}
		if (datos.accion === 'CANCELAR' && !datos.motivo) {
			ctx.addIssue({ code: 'custom', path: ['motivo'], message: 'Indicá el motivo' });
		}
		if (datos.accion === 'TRANSFERIR' && !datos.responsableUsuarioId) {
			ctx.addIssue({
				code: 'custom',
				path: ['responsableUsuarioId'],
				message: 'Elegí el nuevo responsable'
			});
		}
	});

export const crearPromesaSchema = z.object({
	fechaPrometida: fechaIso,
	importe: z.number().positive('El importe debe ser mayor a cero').max(999999999),
	moneda: z.enum(['UYU', 'USD']),
	comprobanteIds: z.array(idPositivo).max(200).default([]),
	medioPago: z.string().trim().max(60).optional(),
	confirmadoPorContacto: z.string().trim().max(160).optional(),
	canal: z.enum(CANALES_AVANCE).optional(),
	observaciones: textoOpcional
});

export const actualizarPromesaSchema = z.object({
	version: z.number().int().positive(),
	estado: z.enum(ESTADOS_PROMESA),
	detalle: z.string().trim().max(2000).optional()
});

export const agregarFacturasSchema = z.object({
	comprobanteIds: z.array(idPositivo).min(1, 'Elegí al menos un comprobante').max(200)
});

export const retirarFacturaSchema = z.object({
	motivo: z.string().trim().min(3, 'El motivo es obligatorio').max(2000)
});

export const crearTicketSeguimientoSchema = z.object({
	titulo: z.string().trim().min(3, 'El título es obligatorio').max(200),
	descripcion: z.string().trim().min(3, 'La descripción es obligatoria').max(20000),
	prioridad: z.enum(['BAJA', 'NORMAL', 'ALTA', 'URGENTE']).default('NORMAL'),
	areaResponsableId: idPositivo,
	usuarioAsignadoId: z.string().trim().min(1).max(64).nullable().optional(),
	bloqueante: z.boolean().default(false),
	motivoBloqueo: textoOpcional,
	facturaIds: z.array(idPositivo).max(200).default([])
});

export const vincularCorreoSchema = z.object({
	seguimientoId: idPositivo
});

export type DatosSeguimientoNuevo = z.infer<typeof crearSeguimientoSchema>;
export type DatosSeguimientoActualizar = z.infer<typeof actualizarSeguimientoSchema>;
export type DatosAvance = z.infer<typeof registrarAvanceSchema>;
export type DatosTareaNueva = z.infer<typeof crearTareaSchema>;
export type DatosTareaActualizar = z.infer<typeof actualizarTareaSchema>;
export type DatosPromesaNueva = z.infer<typeof crearPromesaSchema>;
export type DatosPromesaActualizar = z.infer<typeof actualizarPromesaSchema>;
export type DatosTicketSeguimiento = z.infer<typeof crearTicketSeguimientoSchema>;
