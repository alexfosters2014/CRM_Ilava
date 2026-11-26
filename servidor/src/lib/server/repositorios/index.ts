/**
 * Capa: Repositorios
 *
 * Acceso a PostgreSQL mediante Drizzle.
 * Cada repositorio expone operaciones de persistencia (consultas, inserts,
 * updates) para una entidad concreta, usando el cliente Drizzle de
 * `#lib/server/base-datos`. Las capas superiores (servicios) no escriben SQL:
 * delegan acá.
 */
export * as clientesRepositorio from './clientes.ts';
export * as plantillasRepositorio from './plantillas.ts';
export * as catalogosRepositorio from './catalogos.ts';
export * as facturasRepositorio from './facturas.ts';
export * as variablesRepositorio from './variables.ts';
export * as serviciosRepositorio from './servicios.ts';
export * as configuracionRepositorio from './configuracion.ts';
export * as cobranzasRepositorio from './cobranzas.ts';
export * as emailsServicioRepositorio from './emails-servicio.ts';
export * as correoRepositorio from './correo.ts';
export * as enviosCobranzaRepositorio from './envios-cobranza.ts';
export * as colaEnviosRepositorio from './cola-envios.ts';
export * as usuariosRepositorio from './usuarios.ts';
