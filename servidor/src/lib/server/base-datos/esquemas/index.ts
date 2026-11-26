/**
 * Barrel de esquemas Drizzle.
 *
 * `drizzle.config.ts` apunta a este archivo (via glob) para conocer todas las
 * tablas y generar las migraciones. Exportá acá cada tabla nueva.
 */
export { clientes } from './clientes.ts';
export type { Cliente, ClienteNuevo } from './clientes.ts';

// Esquema core de Better Auth (user, session, account, verification).
export { user, session, account, verification, ROLES } from './auth.ts';
export type { Rol } from './auth.ts';

// Áreas organizativas y permisos por pantalla de cada usuario.
export { areas, AREA_TODOS } from './areas.ts';
export type { Area } from './areas.ts';
export { permisosUsuario } from './permisos.ts';
export type { PermisoUsuario } from './permisos.ts';

export {
	tiposComprobantes,
	tiposPrecios,
	monedas,
	articulos,
	tiposGestion,
	tiposCliente,
	modalidadesCobranza,
	tiposGestionFacturacion,
	gruposFacturacion,
	gruposCobranza,
	monedasTiposPrecio
} from './catalogos.ts';

// Servicios: el cliente facturable, dueño de los atributos de gestión.
export { servicios, TIPOS_NUMERACION } from './servicios.ts';
export type { Servicio, ServicioNuevo, TipoNumeracion } from './servicios.ts';

// Plantillas de facturación y sus líneas.
export { plantillas, plantillasLineas } from './plantillas.ts';
export type {
	Plantilla,
	PlantillaNueva,
	PlantillaLinea,
	PlantillaLineaNueva
} from './plantillas.ts';

// Facturas del multifacturador (copia de la plantilla) y sus líneas.
export { facturas, facturaLineas, ESTADOS_FACTURA } from './facturas.ts';
export type {
	Factura,
	FacturaNueva,
	FacturaLinea,
	FacturaLineaNueva,
	EstadoFactura
} from './facturas.ts';

// Variables de plantilla: solo nombres, sin valor persistido.
export { variables } from './variables.ts';
export type { Variable, VariableNueva } from './variables.ts';

// Correo: cuentas SMTP con alias e historial de envíos de cobranza.
export {
	cuentasCorreo,
	cuentasCorreoAlias,
	enviosCobranza,
	ESTADOS_ENVIO_COBRANZA
} from './correo.ts';
export type { CuentaCorreo, CuentaCorreoAlias, EnvioCobranza } from './correo.ts';

// Configuración global: colores de filas alternadas y parámetros de facturación.
export { configuracionVisual, configuracionFacturacion } from './configuracion.ts';
export type { ConfiguracionVisual, ConfiguracionFacturacion } from './configuracion.ts';

// Cartera, emails, plantillas y auditoría del módulo Cobranza.
export {
	configuracionCobranza,
	periodosCobranza,
	comprobantesCobranza,
	serviciosEmails,
	importacionesEmails,
	plantillasCobranza,
	auditoriaCobranza,
	exclusionesCobranza,
	lotesEnvioCobranza,
	lotesEnvioCobranzaItems
} from './cobranzas.ts';
export type {
	PeriodoCobranza,
	ComprobanteCobranza,
	EmailServicio,
	ImportacionEmails,
	PlantillaCobranza
} from './cobranzas.ts';
export type { ExclusionCobranza, LoteEnvioCobranza, LoteEnvioCobranzaItem } from './cobranzas.ts';

// Tickets transversales: conversación, participantes, auditoría, correo y avisos.
export {
	ticketCategorias,
	tickets,
	ticketCorreos,
	ticketCorreoEnvios,
	ticketEnlacesPublicos,
	ticketParticipantes,
	ticketMensajes,
	ticketEventos,
	ticketLecturas,
	ticketNotificaciones
} from './tickets.ts';
export type {
	Ticket,
	TicketNuevo,
	TicketCategoria,
	TicketParticipante,
	TicketMensaje,
	TicketEvento,
	TicketCorreo,
	TicketCorreoEnvio,
	TicketEnlacePublico,
	TicketNotificacion
} from './tickets.ts';

// Centro de seguimiento de cobranza: casos, facturas, historial, tareas,
// promesas, tickets vinculados, correos, lecturas y avisos.
export {
	seguimientos,
	seguimientosParticipantes,
	seguimientosFacturas,
	seguimientosEventos,
	seguimientosTareas,
	seguimientosPromesas,
	seguimientosTickets,
	seguimientosCorreos,
	seguimientosLecturas,
	seguimientosNotificaciones
} from './seguimientos.ts';
export type {
	Seguimiento,
	SeguimientoNuevo,
	SeguimientoParticipante,
	SeguimientoFactura,
	SeguimientoEvento,
	SeguimientoTarea,
	SeguimientoPromesa,
	SeguimientoTicket,
	SeguimientoCorreo,
	SeguimientoNotificacion
} from './seguimientos.ts';

// Conector Gmail API: cuentas OAuth y cursores de sincronización.
export { gmailCuentas } from './gmail.ts';
export type { GmailCuenta, GmailCuentaNueva } from './gmail.ts';

// WhatsApp Web (Baileys): sesión única, mensajes y sus vínculos con casos.
export {
	whatsappSesion,
	whatsappMensajes,
	whatsappMensajesSeguimientos,
	ESTADOS_SESION_WHATSAPP,
	ESTADOS_MENSAJE_WHATSAPP,
	TIPOS_MENSAJE_WHATSAPP,
	DIRECCIONES_MENSAJE_WHATSAPP
} from './whatsapp.ts';
export type {
	WhatsAppSesion,
	WhatsAppMensaje,
	WhatsAppMensajeSeguimiento,
	EstadoSesionWhatsApp,
	EstadoMensajeWhatsApp,
	TipoMensajeWhatsApp,
	DireccionMensajeWhatsApp
} from './whatsapp.ts';
