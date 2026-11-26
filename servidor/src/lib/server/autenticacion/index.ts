/**
 * Capa: Autenticacion
 *
 * Configuración de Better Auth y permisos.
 *
 * - `auth.ts`: instancia de Better Auth con el adapter Drizzle y el plugin
 *   Email OTP (login por código de 6 dígitos enviado al correo).
 * - `correo.ts`: envío de correos transaccionales por SMTP (Nodemailer), con
 *   modo desarrollo (consola) si no hay SMTP configurado.
 *
 * El esquema de auth (user/session/account/verification) vive en
 * `base-datos/esquemas/auth.ts`. Los endpoints de auth se montan en
 * `src/routes/api/auth/[...all]/+server.ts`.
 */
export { auth } from './auth.ts';
export { enviarCorreo } from './correo.ts';
