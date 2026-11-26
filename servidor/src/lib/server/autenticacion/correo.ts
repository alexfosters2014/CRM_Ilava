import { createTransport } from 'nodemailer';
import { SMTP_FROM, SMTP_HOST, SMTP_PASS, SMTP_PORT, SMTP_USER } from '$app/env/private';

/**
 * Remitente de correos (capa Autenticacion).
 *
 * Transporta los correos transaccionales (p. ej. el OTP de login) por SMTP
 * mediante Nodemailer, usando las variables de entorno SMTP_*.
 *
 * Modo desarrollo: si no hay SMTP_HOST configurado, NO intenta enviar por red y
 * imprime el OTP en la consola del servidor. Así el flujo de login es
 * probable sin credenciales reales. En producción, configurá SMTP_* y el
 * correo se envía de verdad.
 */

type Destino = { para: string; asunto: string; texto: string; html?: string };

type ConfigSmtp = {
	host?: string;
	port?: number;
	secure: boolean;
	auth?: { user: string; pass: string };
};

function leerConfigSmtp(): ConfigSmtp | null {
	const host = SMTP_HOST;
	if (!host) return null;

	const port = Number(SMTP_PORT ?? 587);
	const user = SMTP_USER;
	const pass = SMTP_PASS;

	return {
		host,
		port,
		// 465 = SMTPS implícito; el resto (587, etc.) usa STARTTLS.
		secure: port === 465,
		auth: user && pass ? { user, pass } : undefined
	};
}

/**
 * Envía un correo. Devuelve `true` si salió por SMTP, `false` si cayó al modo
 * desarrollo (consola).
 */
export async function enviarCorreo(destino: Destino): Promise<boolean> {
	const config = leerConfigSmtp();

	if (!config) {
		// Modo desarrollo: sin SMTP configurado, logueamos en lugar de enviar.
		console.info(
			`[correo:dev] Para: ${destino.para} | Asunto: ${destino.asunto}\n${destino.texto}`
		);
		return false;
	}

	const transport = createTransport({
		host: config.host,
		port: config.port,
		secure: config.secure,
		auth: config.auth,
		// Un servidor SMTP colgado no debe tener al usuario esperando: cortamos
		// la conexión a los 15 s y Better Auth registrará el fallo en su log.
		connectionTimeout: 15_000,
		greetingTimeout: 10_000,
		socketTimeout: 20_000
	});

	// Se AWAITA el envío a propósito (aunque Better Auth sugiere no hacerlo para
	// evitar oracles de timing): acá queremos que un fallo de SMTP sea VISIBLE
	// —si no, el usuario pide el código y no llega nunca sin enterarse—. En
	// Node (contenedor, no serverless) esperar es seguro.
	try {
		const info = await transport.sendMail({
			from: SMTP_FROM ?? (config.auth?.user ?? 'no-reply@localhost'),
			to: destino.para,
			subject: destino.asunto,
			text: destino.texto,
			html: destino.html ?? destino.texto
		});
		console.info(
			`[correo] OTP enviado a ${destino.para} vía ${config.host}:${config.port} (id: ${info.messageId})`
		);
		return true;
	} catch (e) {
		// Logueamos la causa real (sin credenciales) y lanzamos un error limpio:
		// Better Auth responde con error y el usuario ve que el envío falló.
		console.error(
			`[correo] ERROR SMTP enviando a ${destino.para} vía ${config.host}:${config.port}:`,
			(e as Error).message
		);
		throw new Error(
			'No se pudo enviar el correo de verificación. Revisá la configuración SMTP del servidor e intentá de nuevo.'
		);
	}
}
