/**
 * Capa: BaseDatos
 *
 * Esquemas Drizzle, conexión, transacciones, migraciones y seed. Drizzle es la
 * ÚNICA fuente de verdad del esquema y de los datos iniciales (no hay init.sql).
 *
 * - `conexion.ts`: pool de pg + cliente Drizzle (`db`). Punto único de acceso
 *   tipado a la base de datos.
 * - `esquemas/`: definición de tablas con Drizzle (fuente de tipos).
 * - `arranque.ts`: aplica migraciones pendientes y seedea al arrancar el server
 *   (lo invoca el hook `init` de SvelteKit).
 * - `seed.ts`: datos de ejemplo iniciales, idempotentes.
 * - `errores.ts`: clasificación de errores de pg (p. ej. violación única).
 *
 * Es el único punto que conoce el esquema físico; `repositorios` se apoya en
 * esta capa para persistir. Todo bajo `#lib/server` para que SvelteKit impida
 * importarlo desde el navegador.
 *
 * Flujo de cambios de esquema: `npm run db:generate` genera el SQL en `drizzle/`
 * a partir de `esquemas/`; esas migraciones se aplican solas al arrancar el
 * server (o con `npm run db:migrate`). Ver `drizzle.config.ts`.
 */
export { pool, db, query } from './conexion.ts';
export { esViolacionUnica } from './errores.ts';
export { prepararBaseDatos, cerrarBaseDatos } from './arranque.ts';
export { clientes } from './esquemas/index.ts';
export type { Cliente, ClienteNuevo } from './esquemas/index.ts';

// Usuarios, áreas y permisos por pantalla.
export { user, session, areas, permisosUsuario, ROLES, AREA_TODOS } from './esquemas/index.ts';
export type { Rol, Area, PermisoUsuario } from './esquemas/index.ts';

// Catálogos, plantillas y sus líneas (misma fuente de verdad: Drizzle).
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
	monedasTiposPrecio,
	servicios,
	plantillas,
	plantillasLineas,
	facturas,
	facturaLineas,
	variables,
	configuracionVisual,
	configuracionFacturacion,
	configuracionCobranza,
	periodosCobranza,
	comprobantesCobranza,
	serviciosEmails,
	importacionesEmails,
	plantillasCobranza,
	auditoriaCobranza,
	exclusionesCobranza,
	lotesEnvioCobranza,
	lotesEnvioCobranzaItems,
	cuentasCorreo,
	cuentasCorreoAlias,
	enviosCobranza,
	ticketCategorias,
	tickets,
	ticketCorreos,
	ticketCorreoEnvios,
	ticketEnlacesPublicos,
	ticketParticipantes,
	ticketMensajes,
	ticketEventos,
	ticketLecturas,
	ticketNotificaciones,
	seguimientos,
	seguimientosParticipantes,
	seguimientosFacturas,
	seguimientosEventos,
	seguimientosTareas,
	seguimientosPromesas,
	seguimientosTickets,
	seguimientosCorreos,
	seguimientosLecturas,
	seguimientosNotificaciones,
	gmailCuentas,
	whatsappSesion,
	whatsappMensajes,
	whatsappMensajesSeguimientos
} from './esquemas/index.ts';
export {
	ESTADOS_FACTURA,
	TIPOS_NUMERACION,
	ESTADOS_SESION_WHATSAPP,
	ESTADOS_MENSAJE_WHATSAPP,
	TIPOS_MENSAJE_WHATSAPP,
	DIRECCIONES_MENSAJE_WHATSAPP
} from './esquemas/index.ts';
export type {
	EstadoFactura,
	Servicio,
	ServicioNuevo,
	TipoNumeracion,
	Plantilla,
	PlantillaNueva,
	PlantillaLinea,
	PlantillaLineaNueva,
	Factura,
	FacturaNueva,
	FacturaLinea,
	FacturaLineaNueva,
	Variable,
	VariableNueva,
	ConfiguracionVisual,
	ConfiguracionFacturacion
} from './esquemas/index.ts';
export type {
	PeriodoCobranza,
	ComprobanteCobranza,
	EmailServicio,
	ImportacionEmails,
	PlantillaCobranza
} from './esquemas/index.ts';
export type { ExclusionCobranza } from './esquemas/index.ts';
export type {
	WhatsAppSesion,
	WhatsAppMensaje,
	WhatsAppMensajeSeguimiento,
	EstadoSesionWhatsApp,
	EstadoMensajeWhatsApp,
	TipoMensajeWhatsApp,
	DireccionMensajeWhatsApp
} from './esquemas/index.ts';
