import { randomUUID } from 'node:crypto';
import MailComposer from 'nodemailer/lib/mail-composer';

/**
 * Capa: Servicios — construcción de MIME para Gmail API.
 *
 * Módulo puro (sin env ni base de datos) para poder testear el formato:
 * Message-ID propio, Reply-To, In-Reply-To/References y adjuntos.
 */

export interface AdjuntoMime {
	filename: string;
	content: Buffer | string;
	contentType?: string;
}

export interface MensajeAEnviar {
	de: { nombre: string; email: string };
	para: string[];
	cc?: string[];
	bcc?: string[];
	asunto: string;
	texto: string;
	html?: string;
	adjuntos?: AdjuntoMime[];
	/** Código visible de seguimiento o ticket para auditoría propia. */
	codigo?: string;
	replyTo?: string;
	inReplyTo?: string | null;
	references?: string | null;
}

function dominioDe(email: string): string {
	const partes = email.split('@');
	return partes[1] || 'localhost';
}

/** Construye el MIME y devuelve base64url listo para `messages.send`. */
export async function construirMensaje(
	datos: MensajeAEnviar
): Promise<{ raw: string; messageId: string }> {
	const messageId = `<${randomUUID()}@${dominioDe(datos.de.email)}>`;
	const composer = new MailComposer({
		from: `"${datos.de.nombre}" <${datos.de.email}>`,
		to: datos.para,
		cc: datos.cc && datos.cc.length > 0 ? datos.cc : undefined,
		bcc: datos.bcc && datos.bcc.length > 0 ? datos.bcc : undefined,
		subject: datos.asunto,
		text: datos.texto,
		html: datos.html ?? datos.texto,
		replyTo: datos.replyTo,
		messageId,
		inReplyTo: datos.inReplyTo ?? undefined,
		references: datos.references ?? undefined,
		attachments: datos.adjuntos?.map((adjunto) => ({
			filename: adjunto.filename,
			content: adjunto.content,
			contentType: adjunto.contentType
		})),
		headers: datos.codigo ? { 'X-CRM-Referencia': datos.codigo } : undefined
	});
	const mensaje = composer.compile();
	const buffer = await new Promise<Buffer>((resolve, reject) => {
		mensaje.build((error, resultado) => {
			if (error) reject(error);
			else resolve(resultado);
		});
	});
	return { raw: buffer.toString('base64url'), messageId };
}
