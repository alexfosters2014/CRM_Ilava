import type { WAMessage, WASocket } from '@whiskeysockets/baileys';
import {
	ingestarMensajeWhatsApp,
	type MensajeWhatsAppEntrada
} from '../repositorios/whatsapp-mensajes.ts';
import { normalizarTelefonoUy } from '../servicios/telefonos.ts';
import type { TipoMensajeWhatsApp } from '../base-datos/index.ts';

/**
 * Ingesta de mensajes de WhatsApp.
 *
 * El socket recibe TODO lo de la cuenta; acá se aplica la lista blanca: solo
 * se persiste lo que pertenece a un seguimiento activo. El resto se descarta
 * sin guardar contenido.
 *
 * LID: WhatsApp puede identificar al contacto con un id interno (@lid). El
 * teléfono viene en `remoteJidAlt` o se resuelve contra el store de Baileys.
 * Nunca se asume que `remoteJid` es un teléfono.
 */

interface ContenidoMensaje {
	conversation?: string | null;
	extendedTextMessage?: { text?: string | null } | null;
	imageMessage?: { caption?: string | null } | null;
	videoMessage?: { caption?: string | null } | null;
	documentMessage?: {
		caption?: string | null;
		fileName?: string | null;
		mimetype?: string | null;
	} | null;
	documentWithCaptionMessage?: { message?: ContenidoMensaje | null } | null;
	audioMessage?: unknown;
	stickerMessage?: unknown;
	ephemeralMessage?: { message?: ContenidoMensaje | null } | null;
	viewOnceMessage?: { message?: ContenidoMensaje | null } | null;
	viewOnceMessageV2?: { message?: ContenidoMensaje | null } | null;
}

/** Desenvuelve los sobres que WhatsApp usa para efímeros y "ver una vez". */
function desenvolver(contenido: ContenidoMensaje | null | undefined): ContenidoMensaje | null {
	if (!contenido) return null;
	if (contenido.ephemeralMessage?.message) return desenvolver(contenido.ephemeralMessage.message);
	if (contenido.viewOnceMessage?.message) return desenvolver(contenido.viewOnceMessage.message);
	if (contenido.viewOnceMessageV2?.message) return desenvolver(contenido.viewOnceMessageV2.message);
	if (contenido.documentWithCaptionMessage?.message) {
		return desenvolver(contenido.documentWithCaptionMessage.message);
	}
	return contenido;
}

function fechaDeTimestamp(valor: unknown): Date {
	if (typeof valor === 'number' && valor > 0) return new Date(valor * 1000);
	if (valor && typeof valor === 'object' && 'toNumber' in valor) {
		const numero = (valor as { toNumber: () => number }).toNumber();
		if (Number.isFinite(numero) && numero > 0) return new Date(numero * 1000);
	}
	return new Date();
}

function usuarioDeJid(jid: string): string {
	return jid.split('@')[0]?.split(':')[0] ?? '';
}

/** Grupo, estado, canal o difusión: fuera de alcance en v1. */
function esJidIgnorado(jid: string): boolean {
	if (!jid) return true;
	return (
		jid === 'status@broadcast' ||
		jid.endsWith('@g.us') ||
		jid.endsWith('@broadcast') ||
		jid.endsWith('@newsletter')
	);
}

async function resolverTelefono(
	jidPrincipal: string,
	jidAlterno: string | undefined,
	socket: WASocket
): Promise<{ telefono: string; jid: string; lid: string | null } | null> {
	let jidTelefono: string | null = null;
	let lid: string | null = null;

	if (jidPrincipal.endsWith('@s.whatsapp.net')) {
		jidTelefono = jidPrincipal;
	} else if (jidPrincipal.endsWith('@lid')) {
		lid = jidPrincipal;
		if (jidAlterno?.endsWith('@s.whatsapp.net')) {
			jidTelefono = jidAlterno;
		} else {
			try {
				jidTelefono = (await socket.signalRepository.lidMapping.getPNForLID(jidPrincipal)) ?? null;
			} catch {
				jidTelefono = null;
			}
		}
	} else if (jidAlterno?.endsWith('@s.whatsapp.net')) {
		// Algunos eventos invierten principal/alterno.
		jidTelefono = jidAlterno;
	}

	if (!jidTelefono) return null;
	const telefono = normalizarTelefonoUy(usuarioDeJid(jidTelefono));
	if (!telefono) return null;
	return { telefono, jid: jidTelefono, lid };
}

function extraerContenido(contenido: ContenidoMensaje): {
	tipo: TipoMensajeWhatsApp;
	texto: string | null;
	nombreArchivo: string | null;
	mimetype: string | null;
} | null {
	if (typeof contenido.conversation === 'string' && contenido.conversation.trim()) {
		return { tipo: 'TEXTO', texto: contenido.conversation, nombreArchivo: null, mimetype: null };
	}
	const extendido = contenido.extendedTextMessage?.text;
	if (typeof extendido === 'string' && extendido.trim()) {
		return { tipo: 'TEXTO', texto: extendido, nombreArchivo: null, mimetype: null };
	}
	if (contenido.imageMessage) {
		return {
			tipo: 'IMAGEN',
			texto: contenido.imageMessage.caption ?? null,
			nombreArchivo: null,
			mimetype: null
		};
	}
	if (contenido.videoMessage) {
		return {
			tipo: 'VIDEO',
			texto: contenido.videoMessage.caption ?? null,
			nombreArchivo: null,
			mimetype: null
		};
	}
	if (contenido.documentMessage) {
		return {
			tipo: 'DOCUMENTO',
			texto: contenido.documentMessage.caption ?? null,
			nombreArchivo: contenido.documentMessage.fileName ?? null,
			mimetype: contenido.documentMessage.mimetype ?? null
		};
	}
	if (contenido.audioMessage) {
		return { tipo: 'AUDIO', texto: null, nombreArchivo: null, mimetype: null };
	}
	if (contenido.stickerMessage) {
		return { tipo: 'STICKER', texto: null, nombreArchivo: null, mimetype: null };
	}
	return null;
}

/** Procesa un lote de messages.upsert. Nunca lanza: la sesión no se cae. */
export async function procesarMensajesEntrantes(
	mensajes: WAMessage[],
	socket: WASocket
): Promise<void> {
	for (const mensaje of mensajes) {
		try {
			const key = mensaje.key;
			const jidPrincipal = key?.remoteJid ?? '';
			if (!key?.id || esJidIgnorado(jidPrincipal)) continue;

			const resuelto = await resolverTelefono(jidPrincipal, key.remoteJidAlt ?? undefined, socket);
			if (!resuelto) continue;

			const contenido = desenvolver(mensaje.message as ContenidoMensaje | null | undefined);
			if (!contenido) continue;
			const extraido = extraerContenido(contenido);
			if (!extraido) continue;

			const entrada: MensajeWhatsAppEntrada = {
				waId: key.id,
				telefono: resuelto.telefono,
				jid: resuelto.jid,
				lid: resuelto.lid,
				direccion: key.fromMe ? 'SALIENTE' : 'ENTRANTE',
				tipo: extraido.tipo,
				texto: extraido.texto,
				nombreArchivo: extraido.nombreArchivo,
				mimetype: extraido.mimetype,
				desdeTelefono: Boolean(key.fromMe),
				enviadoEn: fechaDeTimestamp(mensaje.messageTimestamp),
				metadatos: {
					pushName: mensaje.pushName ?? null,
					desdeTelefono: Boolean(key.fromMe)
				}
			};

			const resultado = await ingestarMensajeWhatsApp(entrada);
			if (resultado.casos > 0) {
				console.info(
					`[whatsapp] mensaje ${entrada.direccion.toLowerCase()} vinculado a ${resultado.casos} caso(s)`
				);
			}
		} catch (error) {
			console.error(
				'[whatsapp] no se pudo procesar un mensaje:',
				error instanceof Error ? error.message : 'error desconocido'
			);
		}
	}
}
