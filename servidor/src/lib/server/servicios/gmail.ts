import {
	GMAIL_CLIENT_ID,
	GMAIL_CLIENT_SECRET,
	GMAIL_REDIRECT_URI,
	BETTER_AUTH_URL
} from '$app/env/private';
import { construirMensaje, type MensajeAEnviar } from './gmail-mime.ts';

export type { AdjuntoMime, MensajeAEnviar } from './gmail-mime.ts';

/**
 * Capa: Servicios — Gmail API (OAuth 2.0).
 *
 * Envía y lee correo de una casilla de Gmail/Workspace. Los envíos masivos de
 * cobranza siguen por SMTP: acá solo entra el correo que necesita hilo
 * (`threadId`), `Message-ID` y lectura de respuestas.
 *
 * Este módulo NO guarda tokens: recibe el access token ya resuelto por el
 * repositorio y devuelve datos planos. El refresh y el cifrado viven en
 * `repositorios/gmail.ts`.
 */

export const SCOPES_GMAIL = [
	'https://www.googleapis.com/auth/gmail.send',
	'https://www.googleapis.com/auth/gmail.readonly',
	'openid',
	'email',
	'profile'
] as const;

const AUTORIZACION = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export type CodigoErrorGmail =
	| 'NO_CONFIGURADO'
	| 'TOKEN'
	| 'API'
	| 'PERMISO'
	| 'CUOTA'
	| 'RED';

export class ErrorGmail extends Error {
	constructor(
		readonly codigo: CodigoErrorGmail,
		mensaje: string,
		readonly status?: number
	) {
		super(mensaje);
		this.name = 'ErrorGmail';
	}
}

export function configuracionGmail(): {
	clientId: string;
	clientSecret: string;
	redirectUri: string;
} | null {
	const clientId = GMAIL_CLIENT_ID?.trim();
	const clientSecret = GMAIL_CLIENT_SECRET?.trim();
	if (!clientId || !clientSecret) return null;
	const redirectUri =
		GMAIL_REDIRECT_URI?.trim() || `${(BETTER_AUTH_URL ?? 'http://localhost:5173').replace(/\/$/, '')}/api/gmail/oauth/callback`;
	return { clientId, clientSecret, redirectUri };
}

export function gmailConfigurado(): boolean {
	return configuracionGmail() !== null;
}

/** URL de consentimiento. `state` lo firma el repositorio y se valida al volver. */
export function urlConsentimiento(state: string): string {
	const config = configuracionGmail();
	if (!config) {
		throw new ErrorGmail('NO_CONFIGURADO', 'Falta configurar GMAIL_CLIENT_ID y GMAIL_CLIENT_SECRET');
	}
	const parametros = new URLSearchParams({
		client_id: config.clientId,
		redirect_uri: config.redirectUri,
		response_type: 'code',
		scope: SCOPES_GMAIL.join(' '),
		access_type: 'offline',
		// Fuerza refresh_token aunque el usuario ya haya autorizado antes y
		// muestra el selector de cuentas: así se pueden conectar varias
		// casillas con el mismo botón.
		prompt: 'select_account consent',
		include_granted_scopes: 'true',
		state
	});
	return `${AUTORIZACION}?${parametros.toString()}`;
}

async function pedirJson<T>(url: string, init?: RequestInit): Promise<T> {
	let respuesta: Response;
	try {
		respuesta = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
	} catch (error) {
		throw new ErrorGmail(
			'RED',
			`No se pudo conectar con Google: ${error instanceof Error ? error.message : 'error de red'}`
		);
	}
	const datos = (await respuesta.json().catch(() => ({}))) as Record<string, unknown>;
	if (!respuesta.ok) {
		const errorObjeto = datos.error;
		const detalle =
			(typeof errorObjeto === 'object' &&
			errorObjeto !== null &&
			typeof (errorObjeto as { message?: unknown }).message === 'string'
				? (errorObjeto as { message: string }).message
				: undefined) ??
			(typeof datos.error_description === 'string' ? datos.error_description : undefined) ??
			(typeof errorObjeto === 'string' ? errorObjeto : undefined);
		console.error(
			`[gmail] ${init?.method ?? 'GET'} ${url} -> ${respuesta.status}`,
			detalle ?? datos
		);
		if (typeof errorObjeto === 'string' && errorObjeto === 'invalid_grant') {
			throw new ErrorGmail(
				'TOKEN',
				'La cuenta de Gmail necesita reconectarse: el permiso venció o fue revocado.',
				respuesta.status
			);
		}
		const mensaje = detalle ?? `Google respondió ${respuesta.status}`;
		if (respuesta.status === 401) throw new ErrorGmail('TOKEN', mensaje, 401);
		if (respuesta.status === 403) {
			const razones = JSON.stringify(datos).toLowerCase();
			const codigo: CodigoErrorGmail = razones.includes('quota') ? 'CUOTA' : 'PERMISO';
			throw new ErrorGmail(codigo, mensaje, 403);
		}
		throw new ErrorGmail('API', mensaje, respuesta.status);
	}
	return datos as T;
}

export interface TokensOAuth {
	accessToken: string;
	refreshToken: string | null;
	expiraEn: Date;
	scope: string | null;
}

export async function intercambiarCodigo(code: string): Promise<TokensOAuth> {
	const config = configuracionGmail();
	if (!config) throw new ErrorGmail('NO_CONFIGURADO', 'Gmail API no está configurada');
	const datos = await pedirJson<{
		access_token: string;
		refresh_token?: string;
		expires_in: number;
		scope?: string;
	}>(TOKEN, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			code,
			client_id: config.clientId,
			client_secret: config.clientSecret,
			redirect_uri: config.redirectUri,
			grant_type: 'authorization_code'
		})
	});
	return {
		accessToken: datos.access_token,
		refreshToken: datos.refresh_token ?? null,
		expiraEn: new Date(Date.now() + (datos.expires_in ?? 3600) * 1000),
		scope: datos.scope ?? null
	};
}

export async function refrescarToken(refreshToken: string): Promise<TokensOAuth> {
	const config = configuracionGmail();
	if (!config) throw new ErrorGmail('NO_CONFIGURADO', 'Gmail API no está configurada');
	const datos = await pedirJson<{
		access_token: string;
		refresh_token?: string;
		expires_in: number;
		scope?: string;
	}>(TOKEN, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			refresh_token: refreshToken,
			client_id: config.clientId,
			client_secret: config.clientSecret,
			grant_type: 'refresh_token'
		})
	});
	return {
		accessToken: datos.access_token,
		refreshToken: datos.refresh_token ?? refreshToken,
		expiraEn: new Date(Date.now() + (datos.expires_in ?? 3600) * 1000),
		scope: datos.scope ?? null
	};
}

export interface PerfilGmail {
	email: string;
	messagesTotal: number;
	threadsTotal: number;
	historyId: string;
}

export interface WatchGmail {
	historyId: string;
	expiraEn: Date;
}

/**
 * Activa `users.watch` sobre INBOX. Google entrega un `historyId` de partida y
 * una expiración (máximo 7 días). El repositorio la renueva antes de vencer.
 */
export async function iniciarWatch(
	accessToken: string,
	topicName: string
): Promise<WatchGmail> {
	const datos = await pedirJson<{ historyId: string; expiration: string }>(`${API}/watch`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ topicName, labelIds: ['INBOX'] })
	});
	return {
		historyId: datos.historyId,
		expiraEn: datos.expiration
			? new Date(Number(datos.expiration))
			: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
	};
}

/** Detiene el watch de la casilla. Gmail responde 204 sin cuerpo. */
export async function detenerWatch(accessToken: string): Promise<void> {
	await pedirJson(`${API}/stop`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${accessToken}` }
	});
}

export async function obtenerPerfil(accessToken: string): Promise<PerfilGmail> {
	const datos = await pedirJson<{
		emailAddress: string;
		messagesTotal: number;
		threadsTotal: number;
		historyId: string;
	}>(`${API}/profile`, {
		headers: { Authorization: `Bearer ${accessToken}` }
	});
	return {
		email: datos.emailAddress,
		messagesTotal: datos.messagesTotal,
		threadsTotal: datos.threadsTotal,
		historyId: datos.historyId
	};
}

export async function enviarMensaje(
	accessToken: string,
	datos: MensajeAEnviar & { threadId?: string | null }
): Promise<{ id: string; threadId: string; messageId: string; raw: string }> {
	const { raw, messageId } = await construirMensaje(datos);
	const cuerpo: { raw: string; threadId?: string } = { raw };
	// Al responder, Gmail mantiene el hilo aunque el cliente haya cambiado el asunto.
	if (datos.threadId) cuerpo.threadId = datos.threadId;
	const respuesta = await pedirJson<{ id: string; threadId: string }>(`${API}/messages/send`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(cuerpo)
	});
	return { id: respuesta.id, threadId: respuesta.threadId, messageId, raw };
}

export async function listarMensajes(	accessToken: string,
	consulta: string,
	maxResults = 50
): Promise<{ id: string; threadId: string }[]> {
	const parametros = new URLSearchParams({
		q: consulta,
		maxResults: String(maxResults)
	});
	const datos = await pedirJson<{ messages?: { id: string; threadId: string }[] }>(
		`${API}/messages?${parametros.toString()}`,
		{ headers: { Authorization: `Bearer ${accessToken}` } }
	);
	return datos.messages ?? [];
}

export async function listarHistorial(
	accessToken: string,
	startHistoryId: string
): Promise<{ ids: string[]; historyId: string | null }> {
	const parametros = new URLSearchParams({
		startHistoryId,
		historyTypes: 'messageAdded',
		maxResults: '100'
	});
	const datos = await pedirJson<{
		history?: { id: string; messagesAdded?: { message: { id: string } }[] }[];
		historyId?: string;
	}>(`${API}/history?${parametros.toString()}`, {
		headers: { Authorization: `Bearer ${accessToken}` }
	});
	const ids = new Set<string>();
	for (const entrada of datos.history ?? []) {
		for (const agregado of entrada.messagesAdded ?? []) {
			if (agregado.message?.id) ids.add(agregado.message.id);
		}
	}
	return { ids: [...ids], historyId: datos.historyId ?? null };
}

export interface MensajeGmail {
	id: string;
	threadId: string;
	historyId: string | null;
	internalDate: Date;
	labelIds: string[];
	asunto: string;
	de: string;
	para: string;
	cc: string;
	messageId: string | null;
	inReplyTo: string | null;
	referencias: string | null;
	texto: string;
	html: string | null;
	adjuntos: { filename: string; mimeType: string; size: number }[];
}

function cabecera(
	headers: { name?: string | null; value?: string | null }[] | undefined,
	nombre: string
): string {
	const encontrada = (headers ?? []).find(
		(header) => (header.name ?? '').toLowerCase() === nombre.toLowerCase()
	);
	return encontrada?.value ?? '';
}

function decodificar(data?: string | null): string {
	if (!data) return '';
	return Buffer.from(data, 'base64url').toString('utf8');
}

function extraerCuerpo(payload: {
	mimeType?: string | null;
	body?: { data?: string | null } | null;
	parts?: unknown[] | null;
}): { texto: string; html: string; adjuntos: { filename: string; mimeType: string; size: number }[] } {
	let texto = '';
	let html = '';
	const adjuntos: { filename: string; mimeType: string; size: number }[] = [];
	const visitar = (parte: {
		mimeType?: string | null;
		filename?: string | null;
		body?: { data?: string | null; size?: number | null; attachmentId?: string | null } | null;
		parts?: unknown[] | null;
	}) => {
		const tipo = parte.mimeType ?? '';
		if (parte.filename) {
			adjuntos.push({
				filename: parte.filename,
				mimeType: tipo,
				size: parte.body?.size ?? 0
			});
			return;
		}
		if (tipo.startsWith('multipart/')) {
			for (const hijo of (parte.parts ?? []) as typeof parte[]) visitar(hijo);
			return;
		}
		const contenido = decodificar(parte.body?.data);
		if (!contenido) return;
		if (tipo === 'text/plain' && !texto) texto = contenido;
		if (tipo === 'text/html' && !html) html = contenido;
	};
	visitar(payload);
	return { texto, html, adjuntos };
}

export async function obtenerMensaje(
	accessToken: string,
	id: string
): Promise<MensajeGmail> {
	const datos = await pedirJson<{
		id: string;
		threadId: string;
		historyId?: string;
		internalDate?: string;
		labelIds?: string[];
		snippet?: string;
		payload?: {
			mimeType?: string | null;
			headers?: { name?: string | null; value?: string | null }[];
			body?: { data?: string | null } | null;
			parts?: unknown[] | null;
		};
	}>(`${API}/messages/${id}?format=full`, {
		headers: { Authorization: `Bearer ${accessToken}` }
	});
	const payload = datos.payload ?? {};
	const cuerpo = extraerCuerpo(payload);
	return {
		id: datos.id,
		threadId: datos.threadId,
		historyId: datos.historyId ?? null,
		internalDate: datos.internalDate ? new Date(Number(datos.internalDate)) : new Date(),
		labelIds: datos.labelIds ?? [],
		asunto: cabecera(payload.headers, 'Subject'),
		de: cabecera(payload.headers, 'From'),
		para: cabecera(payload.headers, 'To'),
		cc: cabecera(payload.headers, 'Cc'),
		messageId: cabecera(payload.headers, 'Message-ID') || null,
		inReplyTo: cabecera(payload.headers, 'In-Reply-To') || null,
		referencias: cabecera(payload.headers, 'References') || null,
		texto: cuerpo.texto || datos.snippet || '',
		html: cuerpo.html || null,
		adjuntos: cuerpo.adjuntos
	};
}

export {
	construirReplyTo,
	extraerAliasSeguimiento,
	extraerCodigoSeguimiento,
	extraerCodigoTicket
} from './gmail-texto.ts';
