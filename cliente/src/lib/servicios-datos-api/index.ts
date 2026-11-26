/**
 * Capa: ServiciosDatosAPI
 *
 * Solicitudes HTTP y transformación de las respuestas.
 * Único punto del frontend que habla con la API (vía el proxy propio /api,
 * ver `src/routes/api/[...ruta]`). Cada servicio expone funciones tipadas que
 * realizan la petición y devuelven ya transformadas/tipadas las respuestas,
 * usando Zod para validar la forma de los datos que llegan del servidor.
 */
export {
	authClient,
	enviarCodigo,
	entrarConCodigo,
	obtenerSesion,
	salir
} from './auth.ts';

export {
	actualizarLineaPlantilla,
	actualizarPlantilla,
	agregarLineaPlantilla,
	eliminarLineaPlantilla,
	eliminarPlantillas,
	ErrorImportacionPlantillas,
	importarPlantillasDesdeArchivo,
	listarCatalogos,
	listarPlantillas,
	mensajeFaltantes
} from './plantillas.ts';
export type {
	Catalogos,
	GrupoPlantillas,
	LineaPlantilla,
	PlantillaListado,
	ResumenImportacion,
	ServicioOmitido
} from './plantillas.ts';

export {
	actualizarServicio,
	crearServiciosDesdeFilas,
	importarServiciosDesdeArchivo,
	listarServicios
} from './servicios.ts';
export type {
	ResumenImportacionServicios,
	ServicioListado,
	TipoNumeracion
} from './servicios.ts';

export {
	eliminarCuentaCorreo,
	guardarCuentaCorreo,
	listarCuentasCorreo,
	probarCuentaCorreo,
	verificarCuentaCorreo
} from './correo.ts';
export type {
	AliasCorreo,
	CuentaCorreo,
	DatosCuentaCorreo,
	ResultadoVerificacionCorreo
} from './correo.ts';

export {
	actualizarGrupo,
	actualizarGrupoCobranza,
	crearGrupoCobranza,
	listarGruposCobranza,
	actualizarValorCatalogo,
	crearGrupo,
	crearValorCatalogo,
	guardarApariencia,
	guardarConfiguracionFacturacion,
	listarConfiguracion,
	obtenerConfiguracionFacturacion
} from './configuracion.ts';
export type {
	Apariencia,
	CatalogoAdmin,
	CatalogosAdmin,
	Configuracion,
	ConfiguracionFacturacion,
	GrupoAdmin,
	GrupoCobranzaAdmin,
	ValorCatalogo
} from './configuracion.ts';

export {
	actualizarFactura,
	actualizarLineaFactura,
	agregarLineaFactura,
	cambiarEstadoFactura,
	crearVariable,
	devolverAFacturador,
	eliminarFacturas,
	eliminarLineaFactura,
	eliminarVariable,
	enviarAlFacturador,
	guardarVariables,
	listarFacturas,
	listarVariables,
	marcarEnviosVistos,
	marcarFacturadas
} from './facturas.ts';

export {
	actualizarArea,
	actualizarUsuario,
	crearArea,
	crearUsuario,
	darDeBajaArea,
	darDeBajaUsuario,
	listarAreas,
	listarCatalogoPermisos,
	listarUsuarios,
	restaurarArea,
	restaurarUsuario
} from './usuarios.ts';
export type {
	AreaAdmin,
	DatosUsuario,
	DatosUsuarioParcial,
	GrupoPermisos,
	UsuarioAdmin
} from './usuarios.ts';

export { ErrorImportacionCobranza, ErrorImportacionEmails, agregarEmailsServicio, alternarExclusionEnvio, asignarGrupoCobranza, cambiarUsoEmail, crearLoteEnvios, eliminarEmailServicio, enviarCobranzaPorWhatsApp, guardarConfiguracionCobranza, guardarPlantillaPredeterminadaCobranza, obtenerConfiguracionCobranza, obtenerEstadoWhatsAppCobranza, obtenerLoteActivo, obtenerLoteEnvios, obtenerPlantillaPredeterminadaCobranza, eliminarComprobanteCobranza, enviarEstadoCuenta, excluirObservacionCobranza, guardarPlantillaCobranza, importarCarteraDesdeArchivo, importarPlanillaEmails, listarCarteraCobranza, listarComprobantesEliminados, listarCuentasCorreoEnvio, listarEmailsServicio, listarEnviosCobranza, listarExclusionesCobranza, listarImportacionesEmails, listarPlantillasCobranza, obtenerPlanillaEmails, quitarEmailDeLista, restaurarComprobanteCobranza, unificarEmailsServicio } from './cobranzas.ts';
export type { CambioServicioEmails, CambiosEmails, CarteraCobranza, ComprobanteEliminado, ComprobanteEnvio, ConfiguracionCobranza, DocumentoCartera, EmailServicio, EmailsServicio, EnvioCobranza, EstadoWhatsAppCobranza, ExclusionCobranza, FilaPlanillaEmails, ImportacionEmails, ItemLoteEnvios, ModoEmails, PlantillaCobranza, ResultadoEnvioWhatsAppCobranza, ResumenAltaEmails, ResumenImportacionEmails, ResumenLoteEnvios, ServicioCartera, UsoEmail } from './cobranzas.ts';
export type {
	EstadoFactura,
	FacturaListado,
	LineaFactura,
	ResumenCopia,
	Variable
} from './facturas.ts';

export {
	ErrorApiNotificaciones,
	listarNotificacionesGenerales,
	marcarNotificacionLeida,
	marcarTodasNotificaciones
} from './notificaciones.ts';
export type {
	NotificacionGeneral,
	NotificacionesGenerales,
	OrigenNotificacion
} from './notificaciones.ts';

export {
	ErrorApiTickets,
	actualizarTicket,
	agregarParticipante,
	buscarServiciosTickets,
	crearTicket,
	enviarCorreoTicket,
	enviarMensaje,
	listarCatalogosTickets,
	listarNotificacionesTickets,
	listarTickets,
	marcarNotificacionesLeidas,
	obtenerTicket,
	quitarParticipante
} from './tickets.ts';
export type {
	ActualizarTicketDatos,
	AreaTicket,
	CatalogosTickets,
	CorreoTicket,
	CorreoTicketDatos,
	EstadoTicket,
	EventoTicket,
	FacturaTicket,
	MensajeTicket,
	MensajeTicketDatos,
	NotificacionTicket,
	NotificacionesTickets,
	NuevoTicketDatos,
	ParticipanteTicket,
	ParticipanteTicketDatos,
	PermisosTicket,
	PrioridadTicket,
	ResultadoMensajeTicket,
	ServicioBuscadoTicket,
	ServicioTicket,
	TicketDetalle,
	TicketResumen,
	TipoOrigenTicket,
	TipoRelacionTicket,
	UsuarioTicket
} from './tickets.ts';

export {
	ErrorApiSeguimientos,
	actualizarPromesa,
	actualizarSeguimiento,
	actualizarTarea,
	agregarFacturas,
	buscarServiciosSeguimiento,
	comprobantesDeServicio,
	crearPromesa,
	crearSeguimiento,
	crearTarea,
	crearTicketSeguimiento,
	desvincularMensajeWhatsApp,
	enviarWhatsAppSeguimiento,
	listarCatalogosSeguimientos,
	listarCorreosSinVincular,
	listarEmailsServicioSeguimiento,
	listarNotificacionesSeguimientos,
	listarSeguimientos,
	marcarNotificacionesSeguimientosLeidas,
	obtenerEstadoWhatsAppSeguimientos,
	obtenerSeguimiento,
	obtenerTicketVinculado,
	registrarAvance,
	responderTicketVinculado,
	retirarFactura,
	verificarWhatsAppSeguimiento,
	vincularCorreo
} from './seguimientos.ts';
export type {
	CanalAvance,
	CatalogosSeguimientos,
	ComprobanteServicio,
	CorreoSinVincular,
	EmailServicioSeguimiento,
	EstadoSeguimiento,
	EstadoWhatsAppSeguimientos,
	NotificacionesSeguimientos,
	NuevoSeguimientoDatos,
	PrioridadSeguimiento,
	ProximaAccionDatos,
	SeguimientoDetalle,
	SeguimientoEvento,
	SeguimientoFactura,
	SeguimientoPermisos,
	SeguimientoPromesa,
	SeguimientoResumen,
	SeguimientoServicio,
	SeguimientoTarea,
	SeguimientoTicket,
	SeguimientoUsuario,
	ServicioBuscadoSeguimiento,
	TipoAccion,
	VerificacionWhatsAppSeguimiento
} from './seguimientos.ts';

export {
	desconectarCuentaGmail,
	enviarCorreoSeguimiento,
	listarCuentasGmail,
	listarCuentasGmailSeguimiento,
	listarCuentasGmailTickets,
	sincronizarCuentaGmail,
	sincronizarTodasGmail,
	urlConectarGmail,
	verificarCuentaGmail
} from './gmail.ts';
export type {
	GmailCuentaEnvio,
	GmailCuentaVista,
	ResultadoSyncGmail
} from './gmail.ts';

export {
	conectarWhatsApp,
	desconectarWhatsApp,
	obtenerEstadoWhatsApp
} from './whatsapp.ts';
export type { EstadoSesionWhatsApp, SesionWhatsAppVista } from './whatsapp.ts';
