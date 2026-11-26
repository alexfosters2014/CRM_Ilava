import { z } from 'zod';

/**
 * Capa: Validaciones — Tickets.
 *
 * La validación de forma vive acá. Las reglas de negocio (transiciones de
 * estado, quién cierra, visibilidad, concurrencia) viven en el repositorio,
 * porque necesitan leer la base y el usuario de la sesión.
 */

export const ESTADOS_TICKET = [
	'NUEVO',
	'ABIERTO',
	'EN_PROCESO',
	'ESPERANDO_RESPUESTA',
	'RESUELTO',
	'CERRADO',
	'CANCELADO'
] as const;
export type EstadoTicket = (typeof ESTADOS_TICKET)[number];

export const PRIORIDADES_TICKET = ['BAJA', 'NORMAL', 'ALTA', 'URGENTE'] as const;
export type PrioridadTicket = (typeof PRIORIDADES_TICKET)[number];

export const TIPOS_ORIGEN = ['SERVICIO', 'INTERNO'] as const;
export type TipoOrigenTicket = (typeof TIPOS_ORIGEN)[number];

export const TIPOS_RELACION = ['PADRE', 'RELACIONADO', 'DUPLICADO', 'BLOQUEADO'] as const;

const correo = z
	.string()
	.trim()
	.toLowerCase()
	.max(180)
	.regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'El correo no es válido');

const fechaIso = z
	.string()
	.trim()
	.min(1)
	.refine((valor) => !Number.isNaN(Date.parse(valor)), 'La fecha no es válida');

const idPositivo = z.number().int().positive();
const textoOpcional = z.string().trim().max(20000).nullable().optional();

export const crearTicketSchema = z
	.object({
		tipoOrigen: z.enum(TIPOS_ORIGEN),
		titulo: z.string().trim().min(3, 'El título es obligatorio').max(200),
		descripcion: z.string().trim().min(3, 'La descripción es obligatoria').max(20000),
		categoriaId: idPositivo.nullable().optional(),
		prioridad: z.enum(PRIORIDADES_TICKET).default('NORMAL'),
		areaResponsableId: idPositivo,
		usuarioAsignadoId: z.string().trim().min(1).max(64).nullable().optional(),
		areaSolicitanteId: idPositivo.nullable().optional(),
		fechaLimite: fechaIso.nullable().optional(),
		servicioId: idPositivo.nullable().optional(),
		periodoCobranzaId: idPositivo.nullable().optional(),
		facturaCobranzaIds: z.array(idPositivo).max(100).default([]),
		referenciaTexto: textoOpcional,
		ticketRelacionadoId: idPositivo.nullable().optional(),
		tipoRelacion: z.enum(TIPOS_RELACION).nullable().optional(),
		areasInvolucradas: z.array(idPositivo).max(50).default([]),
		usuariosInvolucrados: z.array(z.string().trim().min(1).max(64)).max(100).default([])
	})
	.superRefine((datos, ctx) => {
		if (datos.tipoOrigen === 'SERVICIO' && !datos.servicioId) {
			ctx.addIssue({
				code: 'custom',
				path: ['servicioId'],
				message: 'Un ticket vinculado a un servicio necesita el servicio'
			});
		}
		if (datos.tipoOrigen === 'INTERNO' && datos.servicioId) {
			ctx.addIssue({
				code: 'custom',
				path: ['servicioId'],
				message: 'Un ticket interno no lleva servicio'
			});
		}
	});

export const actualizarTicketSchema = z.object({
	version: z.number().int().positive(),
	titulo: z.string().trim().min(3).max(200).optional(),
	prioridad: z.enum(PRIORIDADES_TICKET).optional(),
	estado: z.enum(ESTADOS_TICKET).optional(),
	areaResponsableId: idPositivo.optional(),
	usuarioAsignadoId: z.string().trim().min(1).max(64).nullable().optional(),
	fechaLimite: fechaIso.nullable().optional(),
	motivoFechaLimite: z.string().trim().max(2000).nullable().optional(),
	resolucion: z.string().trim().min(3).max(20000).optional(),
	motivoCierre: z.string().trim().min(3).max(20000).optional(),
	motivoReapertura: z.string().trim().min(3).max(20000).optional(),
	esperaDeAreaId: idPositivo.nullable().optional(),
	esperaDeUsuarioId: z.string().trim().min(1).max(64).nullable().optional(),
	esperaDetalle: z.string().trim().max(2000).nullable().optional(),
	ticketRelacionadoId: idPositivo.nullable().optional(),
	tipoRelacion: z.enum(TIPOS_RELACION).nullable().optional(),
	accion: z.enum(['VALIDAR']).optional()
});

export const mensajeTicketSchema = z.object({
	contenido: z.string().trim().min(1, 'Escribí una respuesta').max(20000),
	enviarCorreo: z.boolean().default(false),
	paraInvolucrados: z.boolean().default(false),
	soloInterno: z.boolean().default(false),
	para: z.array(correo).max(20).default([]),
	cc: z.array(correo).max(20).default([]),
	asunto: z.string().trim().max(250).optional(),
	cuentaId: idPositivo.optional(),
	aliasId: idPositivo.nullable().optional(),
	cuentaGmailId: idPositivo.optional()
});

export const participanteTicketSchema = z.discriminatedUnion('tipo', [
	z.object({ tipo: z.literal('AREA'), areaId: idPositivo }),
	z.object({ tipo: z.literal('USUARIO'), usuarioId: z.string().trim().min(1).max(64) })
]);

export const correoTicketSchema = z.object({
	para: z.array(correo).min(1, 'Indicá al menos un destinatario').max(20),
	cc: z.array(correo).max(20).default([]),
	asunto: z.string().trim().min(3).max(250),
	cuerpo: z.string().trim().min(3).max(50000),
	cuentaId: idPositivo.optional(),
	aliasId: idPositivo.nullable().optional(),
	/** Si viene, el envío usa Gmail API en vez de SMTP. */
	cuentaGmailId: idPositivo.optional(),
	guardarEnHistorial: z.boolean().default(true)
});

export const correoEntranteSchema = z.object({
	de: correo,
	para: z.array(correo).max(30).default([]),
	asunto: z.string().trim().max(250).default(''),
	cuerpo: z.string().trim().min(1).max(100000),
	messageId: z.string().trim().max(300).nullable().optional(),
	threadId: z.string().trim().max(200).nullable().optional(),
	inReplyTo: z.string().trim().max(300).nullable().optional(),
	fecha: fechaIso.optional()
});

export const portalMensajeSchema = z.object({
	// Solo hace falta cuando el enlace no identifica al destinatario.
	nombre: z.string().trim().min(2).max(120).optional(),
	email: z.string().trim().email().max(200).optional(),
	contenido: z.string().trim().min(2).max(8000),
	// Honeypot: si viene completo, es un bot y se descarta.
	website: z.string().max(200).optional()
});

export const busquedaTicketSchema = z.object({
	q: z.string().trim().max(80).default('')
});

export type DatosTicketNuevo = z.infer<typeof crearTicketSchema>;
export type DatosTicketActualizar = z.infer<typeof actualizarTicketSchema>;
export type DatosMensajeTicket = z.infer<typeof mensajeTicketSchema>;
export type DatosParticipanteTicket = z.infer<typeof participanteTicketSchema>;
export type DatosCorreoTicket = z.infer<typeof correoTicketSchema>;
export type DatosCorreoEntrante = z.infer<typeof correoEntranteSchema>;
export type DatosMensajePortal = z.infer<typeof portalMensajeSchema>;
