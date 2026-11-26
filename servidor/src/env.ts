import { defineEnvVars } from '@sveltejs/kit/env';

/**
 * Variables de entorno privadas del servidor (SvelteKit 3).
 *
 * Se importan desde '$app/env/private'. Por defecto son dinámicas: se leen del
 * entorno cuando la app arranca (no se hornean en el build), de modo que
 * Podman puede inyectar DATABASE_URL en runtime.
 *
 * DATABASE_URL es opcional: `schema` devuelve el valor tal cual (puede ser
 * undefined) y `base-datos/conexion.ts` aplica un fallback local si no está
 * definida.
 */
export const variables = defineEnvVars({
	DATABASE_URL: {
		description: 'URL de conexión a PostgreSQL (postgres://user:pass@host:port/db)',
		schema: (value) => value
	},
	// SMTP (opcional): si SMTP_HOST no está definido, `autenticacion/correo.ts`
	// entra en modo desarrollo y loguea el OTP en consola en vez de enviarlo.
	SMTP_HOST: {
		description: 'Servidor SMTP para enviar correos (p. ej. smtp.example.com)',
		schema: (value) => value
	},
	SMTP_PORT: {
		description: 'Puerto SMTP (465 = SMTPS implícito; 587 = STARTTLS). Default 587.',
		schema: (value) => (value === undefined ? undefined : Number(value))
	},
	SMTP_USER: {
		description: 'Usuario SMTP',
		schema: (value) => value
	},
	SMTP_PASS: {
		description: 'Contraseña SMTP',
		schema: (value) => value
	},
	SMTP_FROM: {
		description: 'Dirección "De" de los correos salientes. Default: el usuario SMTP.',
		schema: (value) => value
	},
	// Better Auth la exige: firma las cookies de sesión. Generar con
	// `openssl rand -base64 32`. Opcional en dev (usa un default), obligatoria
	// y >=32 chars en producción.
	BETTER_AUTH_SECRET: {
		description: 'Secreto de Better Auth (>=32 caracteres) para firmar sesiones.',
		schema: (value) => value
	},
	// URL pública de la API. Better Auth la usa para armar callbacks/baseURL.
	BETTER_AUTH_URL: {
		description: 'URL pública de la API de auth (p. ej. http://localhost:8080).',
		schema: (value) => value
	},
	// Orígenes del frontend (donde corre la web app, p. ej.
	// http://localhost:5173) separados por coma. Better Auth los valida para el
	// CSRF: el navegador manda Origin: <frontend> y debe coincidir.
	TRUSTED_ORIGINS: {
		description: 'Orígenes del frontend confiables para Better Auth, separados por coma.',
		schema: (value) => value
	},
	// Cabeceras de proxy que adapter-node debe leer para reconstruir el origin
	// público (protocolo/host) en vez de asumir https/host propio.
	PROTOCOL_HEADER: {
		description: 'Cabecera de proxy con el protocolo real (x-forwarded-proto).',
		schema: (value) => value
	},
	HOST_HEADER: {
		description: 'Cabecera de proxy con el host real (x-forwarded-host).',
		schema: (value) => value
	},
	// Secreto compartido con el conector de correo (Gmail API / proveedor).
	// El webhook público de ingesta lo exige en x-ticket-secret. Si no está
	// definido, el webhook queda deshabilitado (fail-closed).
	TICKETS_EMAIL_WEBHOOK_SECRET: {
		description: 'Secreto del webhook de correo entrante de tickets.',
		schema: (value) => value
	},
	// Gmail API (OAuth 2.0). Se usa para seguimientos y tickets; los envíos
	// masivos de cobranza siguen por SMTP.
	GMAIL_CLIENT_ID: {
		description: 'Client ID de OAuth 2.0 de Google Cloud para Gmail API.',
		schema: (value) => value
	},
	GMAIL_CLIENT_SECRET: {
		description: 'Client secret de OAuth 2.0 de Google Cloud.',
		schema: (value) => value
	},
	GMAIL_REDIRECT_URI: {
		description:
			'URI de redirección autorizada. Default: <BETTER_AUTH_URL>/api/gmail/oauth/callback.',
		schema: (value) => value
	},
	GMAIL_SYNC_INTERVALO_MINUTOS: {
		description: 'Cada cuántos minutos se consultan las casillas Gmail. Default 2.',
		schema: (value) => (value === undefined ? 2 : Number(value))
	},
	GMAIL_PUBSUB_TOPIC: {
		description:
			'Topic de Pub/Sub para users.watch, formato projects/<proyecto>/topics/<topic>. Si falta, se usa solo sondeo.',
		schema: (value) => value
	},
	GMAIL_PUBSUB_SECRET: {
		description:
			'Secreto en la URL del push de Pub/Sub (/api/gmail/pubsub/<secreto>). Sin secreto, el endpoint queda cerrado.',
		schema: (value) => value
	},
	// Carpeta donde Baileys guarda las credenciales de la sesión de WhatsApp.
	// Default: .whatsapp-auth dentro del cwd del proceso. En el contenedor debe
	// ser un volumen persistente: sin ella hay que escanear el QR en cada deploy.
	WHATSAPP_AUTH_DIR: {
		description: 'Carpeta persistente para las credenciales de Baileys.',
		schema: (value) => value
	}
});
