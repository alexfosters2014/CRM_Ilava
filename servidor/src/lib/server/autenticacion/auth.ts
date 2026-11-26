import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP } from 'better-auth/plugins';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { APIError } from 'better-auth/api';
import { asc, eq, sql } from 'drizzle-orm';
import { getRequestEvent } from '$app/server';
import { BETTER_AUTH_SECRET, BETTER_AUTH_URL, TRUSTED_ORIGINS } from '$app/env/private';
import { db } from '../base-datos/conexion.ts';
import * as esquemas from '../base-datos/esquemas/index.ts';
import { AREA_TODOS } from '../base-datos/esquemas/areas.ts';
import { enviarCorreo } from './correo.ts';

/**
 * Configuración de Better Auth (capa Autenticacion).
 *
 * Flujo de login: código de 6 dígitos (OTP) enviado al correo registrado.
 * 1. El cliente pide enviar el OTP (`emailOtp.sendVerificationOtp`).
 * 2. Better Auth genera el código y llama a `sendVerificationOTP`, que lo manda
 *    por correo vía Nodemailer (ver `correo.ts`).
 * 3. El cliente lo verifica con `signIn.emailOtp({ email, otp })` y crea sesión.
 *
 * El esquema (user/session/account/verification) vive en Drizzle
 * (`base-datos/esquemas/auth.ts`) y se migra igual que el resto.
 */

const DIA = 60 * 60 * 24;

export const auth = betterAuth({
	// Secreto que firma las cookies de sesión (obligatorio en producción).
	secret: BETTER_AUTH_SECRET,
	// URL pública de la API: Better Auth la usa para armar callbacks/baseURL.
	baseURL: BETTER_AUTH_URL,
	// Orígenes del frontend (el navegador manda Origin: <frontend> en los POST
	// a /api/auth/*). Sin esto Better Auth rechaza con "Invalid origin" (CSRF).
	trustedOrigins: TRUSTED_ORIGINS
		? TRUSTED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
		: [],
	// Sesión persistente: 15 días desde el login, renovada una vez por día con
	// el uso. La sesión vive en PostgreSQL (volumen crm-pgdata), así que
	// reiniciar o reconstruir los contenedores no obliga a volver a entrar.
	session: {
		expiresIn: DIA * 15,
		updateAge: DIA
	},
	advanced: {
		// La app local se sirve por http: marcar las cookies como Secure haría
		// que el navegador las descarte fuera de localhost. Se deriva del baseURL,
		// así en un despliegue https quedan Secure automáticamente.
		useSecureCookies: BETTER_AUTH_URL?.startsWith('https://') ?? false,
		defaultCookieAttributes: {
			httpOnly: true,
			sameSite: 'lax',
			path: '/'
		}
	},
	// Persistencia vía Drizzle sobre nuestro pg pool.
	database: drizzleAdapter(db, {
		provider: 'pg',
		schema: {
			user: esquemas.user,
			session: esquemas.session,
			account: esquemas.account,
			verification: esquemas.verification
		}
	}),
	/**
	 * Reglas de alta y de sesión.
	 *
	 * No se usa `disableSignUp` porque bloquearía también al PRIMER usuario
	 * (Better Auth rechaza el envío de OTP cuando el correo no existe). La
	 * política real vive acá:
	 * - Solo se crea un usuario solo si la tabla está vacía: eso es el bootstrap.
	 *   Del segundo en adelante, el alta es exclusiva de un ADMIN desde el panel.
	 * - Un usuario desactivado o dado de baja no puede crear sesión nueva,
	 *   aunque tenga un código OTP vigente.
	 */
	databaseHooks: {
		user: {
			create: {
				before: async () => {
					const [conteo] = await db
						.select({ total: sql<number>`count(*)::int` })
						.from(esquemas.user);

					if ((conteo?.total ?? 0) > 0) {
						throw new APIError('FORBIDDEN', {
							message:
								'Tu correo no tiene acceso al CRM. Pedile a un administrador que cree tu usuario.'
						});
					}
				},
				after: async (nuevoUsuario) => {
					try {
						// El bootstrap es el usuario MÁS ANTIGUO, no "el que llegó
						// primero al hook": si dos altas compiten, solo una gana.
						const [primero] = await db
							.select({ id: esquemas.user.id })
							.from(esquemas.user)
							.orderBy(asc(esquemas.user.createdAt), asc(esquemas.user.id))
							.limit(1);

						if (primero?.id !== nuevoUsuario.id) return;

						const [areaTodos] = await db
							.select({ id: esquemas.areas.id })
							.from(esquemas.areas)
							.where(eq(esquemas.areas.nombre, AREA_TODOS))
							.limit(1);

						await db
							.update(esquemas.user)
							.set({
								rol: 'ADMIN',
								activo: true,
								areaId: areaTodos?.id ?? null,
								updatedAt: new Date()
							})
							.where(eq(esquemas.user.id, nuevoUsuario.id));

						console.info(`[auth] Primer usuario promovido a ADMIN: ${nuevoUsuario.email}`);
					} catch (error) {
						// No se rompe el login del primer usuario por un fallo del
						// promotor, pero queda visible para corregirlo.
						console.error('[auth] No se pudo promover al primer usuario a ADMIN', error);
					}
				}
			}
		},
		session: {
			create: {
				before: async (sesion) => {
					const [fila] = await db
						.select({
							activo: esquemas.user.activo,
							eliminadoEn: esquemas.user.eliminadoEn
						})
						.from(esquemas.user)
						.where(eq(esquemas.user.id, sesion.userId))
						.limit(1);

					if (!fila || !fila.activo || fila.eliminadoEn) {
						throw new APIError('FORBIDDEN', {
							message: 'Tu usuario está desactivado. Contactá a un administrador.'
						});
					}
				}
			}
		}
	},
	plugins: [
		emailOTP({
			// Longitud 6 por defecto; lo dejamos explícito por claridad.
			otpLength: 6,
			// Expiración del código: 5 minutos.
			expiresIn: 300,
			// Hasta 3 intentos antes de invalidar el OTP.
			allowedAttempts: 3,
			async sendVerificationOTP({ email, otp, type }) {
				const destino = email.trim().toLowerCase();

				// No se manda código a desconocidos ni a usuarios dados de baja.
				// Se corta en silencio a propósito: responder distinto revelaría
				// qué correos existen (enumeración de cuentas).
				const [existente] = await db
					.select({
						activo: esquemas.user.activo,
						eliminadoEn: esquemas.user.eliminadoEn
					})
					.from(esquemas.user)
					.where(eq(esquemas.user.email, destino))
					.limit(1);

				if (existente) {
					if (!existente.activo || existente.eliminadoEn) {
						console.warn(`[auth] OTP no enviado: usuario inactivo (${destino})`);
						return;
					}
				} else {
					// Base vacía = bootstrap: el primer correo sí recibe el código.
					const [conteo] = await db
						.select({ total: sql<number>`count(*)::int` })
						.from(esquemas.user);

					if ((conteo?.total ?? 0) > 0) {
						console.warn(`[auth] OTP no enviado: correo no registrado (${destino})`);
						return;
					}
				}

				const asunto =
					type === 'sign-in'
						? 'Tu código de acceso'
						: type === 'email-verification'
							? 'Tu código de verificación'
							: 'Tu código de recuperación';

				await enviarCorreo({
					para: email,
					asunto,
					texto: `Tu código es: ${otp}\nVence en 5 minutos. Si no pediste este código, ignorá este mensaje.`,
					html: `
						<div style="font-family:sans-serif;max-width:32rem;margin:auto">
							<p>${asunto}</p>
							<p style="font-size:2rem;letter-spacing:.5rem;font-weight:bold;margin:1rem 0">${otp}</p>
							<p style="color:#555">Vence en 5 minutos. Si no pediste este código, ignorá este mensaje.</p>
						</div>`
				});
			}
		}),
		// Sincroniza las cookies de Better Auth con el cookie jar de SvelteKit.
		// Obligatorio ir ÚLTIMO en la lista de plugins.
		sveltekitCookies(getRequestEvent)
	]
});
