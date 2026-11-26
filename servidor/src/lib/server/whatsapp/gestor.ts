import fs from 'node:fs/promises';
import path from 'node:path';
import makeWASocket, {
	Browsers,
	DisconnectReason,
	fetchLatestBaileysVersion,
	useMultiFileAuthState,
	type WAMessage,
	type WASocket
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { toDataURL } from 'qrcode';
import { WHATSAPP_AUTH_DIR } from '$app/env/private';
import { guardarSesionWhatsApp, obtenerSesionWhatsApp } from '../repositorios/whatsapp.ts';
import { actualizarEstadoMensaje } from '../repositorios/whatsapp-mensajes.ts';
import { procesarMensajesEntrantes } from './ingesta.ts';
import type { EstadoMensajeWhatsApp, EstadoSesionWhatsApp } from '../base-datos/index.ts';

/**
 * Gestor de la sesión de WhatsApp Web (Baileys).
 *
 * Reglas de diseño:
 * - UN solo socket por proceso. Dos procesos con las mismas credenciales se
 *   pelean la identidad del dispositivo y WhatsApp los expulsa.
 * - El estado vive en `globalThis` para sobrevivir al HMR de Vite en dev; en
 *   producción es simplemente un singleton del módulo.
 * - El QR nunca se persiste: expira en segundos y permitiría vincular la
 *   cuenta. Se entrega como data URL mientras la sesión espera vinculación.
 * - Toda transición de estado se guarda en la BD, pero un fallo de BD no debe
 *   tumbar el socket: se loguea y se sigue.
 * - Nunca se registra el contenido de los mensajes en logs.
 */

const RUTA_AUTH = WHATSAPP_AUTH_DIR ?? path.join(process.cwd(), '.whatsapp-auth');
const LOG = pino({ level: 'warn' });

/** Espera máxima entre reintentos de conexión. */
const ESPERA_MAXIMA_MS = 60_000;
/** Veces que se reintenta antes de dejar de insistir automáticamente. */
const MAX_INTENTOS = 12;

interface EstadoMemoria {
	socket: WASocket | null;
	qr: string | null;
	qrDataUrl: string | null;
	estado: EstadoSesionWhatsApp;
	numeroTelefono: string | null;
	ultimoError: string | null;
	conectadoEn: Date | null;
	intentos: number;
	temporizador: ReturnType<typeof setTimeout> | null;
	generacion: number;
	cerrando: boolean;
	inicializacion: Promise<void> | null;
}

const globalWhatsApp = globalThis as typeof globalThis & {
	__crmWhatsAppGestor?: EstadoMemoria;
};

/** Acks de WhatsApp (WebMessageInfo.Status) → estado del mensaje. */
const ESTADOS_ACK: Record<number, EstadoMensajeWhatsApp> = {
	0: 'FALLIDO',
	1: 'ENVIADO',
	2: 'ENVIADO',
	3: 'ENTREGADO',
	4: 'LEIDO',
	5: 'LEIDO'
};

function memoria(): EstadoMemoria {
	if (!globalWhatsApp.__crmWhatsAppGestor) {
		globalWhatsApp.__crmWhatsAppGestor = {
			socket: null,
			qr: null,
			qrDataUrl: null,
			estado: 'DESCONECTADO',
			numeroTelefono: null,
			ultimoError: null,
			conectadoEn: null,
			intentos: 0,
			temporizador: null,
			generacion: 0,
			cerrando: false,
			inicializacion: null
		};
	}
	return globalWhatsApp.__crmWhatsAppGestor;
}

export interface VistaSesionWhatsApp {
	estado: EstadoSesionWhatsApp;
	numeroTelefono: string | null;
	qrDataUrl: string | null;
	ultimoError: string | null;
	conectadoEn: string | null;
	conectado: boolean;
}

/** Vista para la API: estado en memoria + QR vigente. */
export function vistaSesionWhatsApp(): VistaSesionWhatsApp {
	const m = memoria();
	return {
		estado: m.estado,
		numeroTelefono: m.numeroTelefono,
		qrDataUrl: m.qrDataUrl,
		ultimoError: m.ultimoError,
		conectadoEn: m.conectadoEn?.toISOString() ?? null,
		conectado: m.estado === 'CONECTADO' && m.socket !== null
	};
}

function mensajeDeError(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === 'string') return error;
	return 'Error desconocido de WhatsApp';
}

function codigoDesconexion(error: unknown): number | undefined {
	if (error && typeof error === 'object' && 'output' in error) {
		return (error as { output?: { statusCode?: number } }).output?.statusCode;
	}
	return undefined;
}

/** Mensaje de los últimos 10 minutos (para no importar el archivo viejo). */
function esMensajeReciente(mensaje: WAMessage): boolean {
	const valor = mensaje.messageTimestamp;
	const segundos =
		typeof valor === 'number'
			? valor
			: valor && typeof valor === 'object' && 'toNumber' in valor
				? (valor as { toNumber: () => number }).toNumber()
				: 0;
	if (!segundos) return false;
	return Math.abs(Date.now() / 1000 - segundos) < 600;
}

function telefonoDesdeJid(jid: string | undefined): string | null {
	if (!jid) return null;
	const usuario = jid.split('@')[0]?.split(':')[0] ?? '';
	const digitos = usuario.replace(/\D/g, '');
	return digitos.length > 0 ? digitos : null;
}

function truncarError(texto: string): string {
	return texto.length > 500 ? `${texto.slice(0, 497)}...` : texto;
}

/** Persiste sin romper el socket: la BD no es crítica para la conexión. */
async function persistir(cambios: Parameters<typeof guardarSesionWhatsApp>[0]): Promise<void> {
	try {
		await guardarSesionWhatsApp(cambios);
	} catch (error) {
		console.error('[whatsapp] no se pudo guardar el estado de la sesión:', mensajeDeError(error));
	}
}

async function hayCredenciales(): Promise<boolean> {
	try {
		await fs.access(path.join(RUTA_AUTH, 'creds.json'));
		return true;
	} catch {
		return false;
	}
}

async function borrarCredenciales(): Promise<void> {
	await fs.rm(RUTA_AUTH, { recursive: true, force: true });
}

/** Cancela un reintento pendiente (no toca el socket). */
function cancelarReintento(m: EstadoMemoria): void {
	if (m.temporizador) {
		clearTimeout(m.temporizador);
		m.temporizador = null;
	}
}

/** Programa la reconexión con backoff exponencial + jitter. */
function programarReconexion(m: EstadoMemoria, motivo: string): void {
	if (m.cerrando) return;
	if (m.temporizador) return;

	if (m.intentos >= MAX_INTENTOS) {
		// No es un logout: las credenciales siguen. Se deja desconectado y el
		// admin puede reintentar a mano sin escanear un QR nuevo.
		m.estado = 'DESCONECTADO';
		m.ultimoError = truncarError(
			`Se agotaron los reintentos automáticos. Último error: ${motivo}`
		);
		void persistir({ estado: m.estado, ultimoError: m.ultimoError });
		return;
	}

	m.intentos += 1;
	const base = Math.min(ESPERA_MAXIMA_MS, 1_000 * 2 ** Math.min(m.intentos - 1, 5));
	const espera = base + Math.floor(Math.random() * 1_000);

	m.estado = 'RECONECTANDO';
	m.ultimoError = truncarError(motivo);
	void persistir({ estado: m.estado, ultimoError: m.ultimoError });

	console.warn(`[whatsapp] reconectando en ${espera} ms (intento ${m.intentos}): ${motivo}`);
	m.temporizador = setTimeout(() => {
		m.temporizador = null;
		void crearSocket().catch((error) => {
			console.error('[whatsapp] no se pudo recrear el socket:', mensajeDeError(error));
			programarReconexion(m, mensajeDeError(error));
		});
	}, espera);
}

/**
 * Recrea el socket ya, sin gastar intentos. WhatsApp usa `restartRequired`
 * después de vincular el dispositivo: no es un fallo, es parte del protocolo.
 */
function reconectarYa(m: EstadoMemoria, espera = 250): void {
	cancelarReintento(m);
	m.temporizador = setTimeout(() => {
		m.temporizador = null;
		void crearSocket().catch((error) => {
			console.error('[whatsapp] no se pudo recrear el socket:', mensajeDeError(error));
			programarReconexion(m, mensajeDeError(error));
		});
	}, espera);
}

/** Abre el socket. Idempotente por generación: los eventos viejos se ignoran. */
async function crearSocket(): Promise<void> {
	const m = memoria();

	if (m.socket) return;

	cancelarReintento(m);
	m.cerrando = false;

	const generacion = ++m.generacion;

	// Sin red o endpoint caído se usa la versión que trae Baileys por defecto.
	const infoVersion = await fetchLatestBaileysVersion().catch(() => undefined);

	// Con credenciales la reconexión es silenciosa: no mostrar "esperando QR"
	// hasta que WhatsApp emita uno de verdad.
	const conCredenciales = await hayCredenciales();
	const { state, saveCreds } = await useMultiFileAuthState(RUTA_AUTH);

	// Si ya hay un número vinculado, mostrarlo aunque la conexión todavía no
	// haya abierto: el usuario necesita saber que las credenciales están.
	const numeroCreds = telefonoDesdeJid(state.creds?.me?.id);
	if (numeroCreds) {
		m.numeroTelefono = numeroCreds;
		void persistir({ numeroTelefono: numeroCreds });
	}

	const sock = makeWASocket({
		auth: state,
		version: infoVersion?.version,
		logger: LOG,
		printQRInTerminal: false,
		// OJO: los tuples "Desktop" (macOS/Windows) hacen que WhatsApp cierre la
		// conexión con 428 antes del QR (regresión server-side de oct-2026,
		// issue #2880 de Baileys). Un tuple de Chrome mantiene el sync de
		// historial y vincula sin error.
		browser: Browsers.ubuntu('Chrome'),
		syncFullHistory: true,
		// WhatsApp corta la conexión si los pings llegan tarde.
		keepAliveIntervalMs: 25_000,
		defaultQueryTimeoutMs: 60_000,
		// La cuenta es compartida con el teléfono: no marcar en línea ni
		// suprimir las notificaciones del dispositivo principal.
		markOnlineOnConnect: false
	});

	m.socket = sock;

	sock.ev.on('creds.update', () => {
		void saveCreds().catch((error) => {
			console.error('[whatsapp] no se pudieron guardar las credenciales:', mensajeDeError(error));
		});
	});

	sock.ev.on('connection.update', (update) => {
		if (m.generacion !== generacion) return;
		void manejarConexion(update, generacion);
	});

	sock.ev.on('messages.upsert', (evento) => {
		if (m.generacion !== generacion) return;
		// `notify` son mensajes nuevos. `append` incluye el historial que manda
		// el teléfono al vincularse: solo se aceptan los recientes (los que el
		// equipo escribió desde otro dispositivo), no el archivo completo.
		const mensajes =
			evento.type === 'notify'
				? evento.messages
				: evento.messages.filter(esMensajeReciente);
		if (mensajes.length === 0) return;
		void procesarMensajesEntrantes(mensajes, sock);
	});

	sock.ev.on('messages.update', (actualizaciones) => {
		if (m.generacion !== generacion) return;
		for (const actualizacion of actualizaciones) {
			const estado = ESTADOS_ACK[Number(actualizacion.update?.status)];
			const waId = actualizacion.key?.id;
			if (!estado || !waId) continue;
			void actualizarEstadoMensaje(waId, estado).catch(() => undefined);
		}
	});

	m.estado = conCredenciales ? 'RECONECTANDO' : 'ESPERANDO_QR';
	m.ultimoError = null;
	void persistir({ estado: m.estado, ultimoError: null });
}

async function manejarConexion(
	update: {
		connection?: 'connecting' | 'open' | 'close';
		lastDisconnect?: { error?: unknown };
		qr?: string;
	},
	generacion: number
): Promise<void> {
	const m = memoria();
	if (m.generacion !== generacion) return;

	if (update.qr) {
		m.qr = update.qr;
		try {
			m.qrDataUrl = await toDataURL(update.qr, {
				margin: 1,
				width: 320,
				errorCorrectionLevel: 'M'
			});
		} catch (error) {
			m.qrDataUrl = null;
			console.error('[whatsapp] no se pudo dibujar el QR:', mensajeDeError(error));
		}
		if (m.estado !== 'ESPERANDO_QR') {
			m.estado = 'ESPERANDO_QR';
			void persistir({ estado: m.estado });
		}
		return;
	}

	if (update.connection === 'open') {
		m.estado = 'CONECTADO';
		m.ultimoError = null;
		m.qr = null;
		m.qrDataUrl = null;
		m.intentos = 0;
		m.conectadoEn = new Date();
		m.numeroTelefono = telefonoDesdeJid(m.socket?.user?.id) ?? m.numeroTelefono;
		void persistir({
			estado: m.estado,
			numeroTelefono: m.numeroTelefono,
			ultimoError: null,
			conectadoEn: m.conectadoEn
		});
		console.info('[whatsapp] sesión conectada');
		return;
	}

	if (update.connection === 'close') {
		const codigo = codigoDesconexion(update.lastDisconnect?.error);
		const motivo = mensajeDeError(update.lastDisconnect?.error ?? 'Conexión cerrada');
		console.warn(`[whatsapp] conexión cerrada (código ${codigo ?? 'n/a'}): ${motivo}`);

		m.socket = null;
		m.qr = null;
		m.qrDataUrl = null;
		m.conectadoEn = null;

		if (m.cerrando) return;

		if (codigo === DisconnectReason.loggedOut) {
			m.estado = 'CERRADO';
			m.ultimoError = 'WhatsApp cerró la sesión. Escaneá un QR nuevo para volver a vincular.';
			m.numeroTelefono = null;
			m.intentos = 0;
			cancelarReintento(m);
			await borrarCredenciales().catch(() => undefined);
			await persistir({
				estado: m.estado,
				numeroTelefono: null,
				ultimoError: m.ultimoError,
				desconectadoEn: new Date()
			});
			return;
		}

		if (codigo === DisconnectReason.restartRequired) {
			// WhatsApp pide recrear el stream (normal al vincular). No es un
			// fallo: se reabre de inmediato y no consume intentos.
			m.estado = 'RECONECTANDO';
			m.ultimoError = null;
			void persistir({ estado: m.estado, ultimoError: null });
			// 1,5 s: le da tiempo a `creds.update` a terminar de escribir en
			// disco antes de recrear el socket con las credenciales nuevas.
			reconectarYa(m, 1_500);
			return;
		}

		if (codigo === DisconnectReason.connectionReplaced) {
			// Otra instancia tomó el control: reintentar sería una pelea.
			m.estado = 'DESCONECTADO';
			m.ultimoError =
				'Otra sesión tomó el control de este número. Revisá que no haya otra instancia de la API usando las mismas credenciales.';
			m.intentos = MAX_INTENTOS;
			cancelarReintento(m);
			await persistir({ estado: m.estado, ultimoError: m.ultimoError });
			return;
		}

		if (
			codigo === DisconnectReason.badSession ||
			codigo === DisconnectReason.multideviceMismatch
		) {
			m.estado = 'CERRADO';
			m.ultimoError = 'La sesión de WhatsApp quedó inválida. Escaneá un QR nuevo.';
			m.numeroTelefono = null;
			m.intentos = 0;
			cancelarReintento(m);
			await borrarCredenciales().catch(() => undefined);
			await persistir({
				estado: m.estado,
				numeroTelefono: null,
				ultimoError: m.ultimoError,
				desconectadoEn: new Date()
			});
			console.warn('[whatsapp] sesión inválida: credenciales borradas');
			return;
		}

		if (codigo === DisconnectReason.forbidden) {
			m.estado = 'CERRADO';
			m.ultimoError =
				'WhatsApp bloqueó este número. No se reintenta automáticamente; revisá la cuenta.';
			cancelarReintento(m);
			await persistir({ estado: m.estado, ultimoError: m.ultimoError });
			return;
		}

		programarReconexion(m, motivo);
	}
}

/**
 * Arranca el gestor al iniciar el servidor.
 *
 * Solo reconecta si la última ejecución dejó la sesión activa: un
 * "Desconectar" manual debe sobrevivir al reinicio.
 */
export async function iniciarWhatsApp(): Promise<void> {
	const m = memoria();
	if (m.inicializacion) return m.inicializacion;

	m.inicializacion = (async () => {
		try {
			const sesion = await obtenerSesionWhatsApp();
			m.estado = sesion.estado;
			m.numeroTelefono = sesion.numeroTelefono;
			m.ultimoError = sesion.ultimoError;
			m.conectadoEn = sesion.conectadoEn;

			const estabaActiva = sesion.estado === 'CONECTADO' || sesion.estado === 'RECONECTANDO';
			if (!estabaActiva) return;
			if (!(await hayCredenciales())) {
				m.estado = 'DESCONECTADO';
				m.ultimoError = 'No hay credenciales guardadas: hay que vincular el número de nuevo.';
				await persistir({
					estado: m.estado,
					ultimoError: m.ultimoError,
					numeroTelefono: null
				});
				return;
			}

			await crearSocket();
		} catch (error) {
			console.error('[whatsapp] no se pudo iniciar el gestor:', mensajeDeError(error));
		}
	})();

	return m.inicializacion;
}

/** Vincula o reconecta el número. Devuelve la vista ya actualizada. */
export async function conectarWhatsApp(): Promise<VistaSesionWhatsApp> {
	const m = memoria();
	await iniciarWhatsApp();

	if (m.socket) return vistaSesionWhatsApp();

	m.cerrando = false;
	m.intentos = 0;
	m.ultimoError = null;
	try {
		await crearSocket();
	} catch (error) {
		m.estado = 'DESCONECTADO';
		m.ultimoError = truncarError(mensajeDeError(error));
		await persistir({ estado: m.estado, ultimoError: m.ultimoError });
	}
	return vistaSesionWhatsApp();
}

export interface VerificacionNumeroWhatsApp {
	/** ¿Se pudo consultar? (false si no hay sesión conectada o falló la query) */
	consultado: boolean;
	existe: boolean;
	jid: string | null;
	motivo: string | null;
}

/**
 * Consulta si un número tiene WhatsApp. Requiere sesión conectada: si no la
 * hay, devuelve `consultado: false` para que el llamador no borre una
 * verificación previa por una caída temporal.
 */
export async function verificarNumeroWhatsApp(
	numero: string
): Promise<VerificacionNumeroWhatsApp> {
	const m = memoria();
	if (!m.socket || m.estado !== 'CONECTADO') {
		return {
			consultado: false,
			existe: false,
			jid: null,
			motivo: 'La sesión de WhatsApp no está conectada'
		};
	}

	try {
		const resultados = await m.socket.onWhatsApp(numero);
		const resultado = resultados?.[0];
		const existe = resultado?.exists === true;
		return {
			consultado: true,
			existe,
			jid: resultado?.jid ?? null,
			motivo: existe ? null : 'El número no tiene WhatsApp'
		};
	} catch (error) {
		return {
			consultado: false,
			existe: false,
			jid: null,
			motivo: mensajeDeError(error)
		};
	}
}

export interface EnvioWhatsAppConfirmado {
	waId: string;
	enviadoEn: Date;
}

export function jidDeTelefono(telefono: string): string {
	return `${telefono}@s.whatsapp.net`;
}

function fechaDeMensaje(valor: unknown): Date {
	if (typeof valor === 'number' && valor > 0) return new Date(valor * 1000);
	if (valor && typeof valor === 'object' && 'toNumber' in valor) {
		const numero = (valor as { toNumber: () => number }).toNumber();
		if (Number.isFinite(numero) && numero > 0) return new Date(numero * 1000);
	}
	return new Date();
}

function socketConectado(): WASocket {
	const m = memoria();
	if (!m.socket || m.estado !== 'CONECTADO') {
		throw new Error('La sesión de WhatsApp no está conectada');
	}
	return m.socket;
}

/** Envía texto y devuelve el id de WhatsApp (llave de deduplicación). */
export async function enviarTextoWhatsApp(
	telefono: string,
	texto: string
): Promise<EnvioWhatsAppConfirmado> {
	if (!/^5989\d{7}$/.test(telefono)) throw new Error('El teléfono no está normalizado');
	const limpio = texto.trim();
	if (!limpio) throw new Error('El mensaje está vacío');
	if (limpio.length > 4096) {
		throw new Error('El mensaje supera el límite de WhatsApp (4096 caracteres)');
	}

	const resultado = await socketConectado().sendMessage(jidDeTelefono(telefono), { text: limpio });
	const waId = resultado?.key?.id;
	if (!waId) throw new Error('WhatsApp no confirmó el envío');
	return { waId, enviadoEn: fechaDeMensaje(resultado.messageTimestamp) };
}

export interface DocumentoWhatsApp {
	contenido: Buffer;
	nombreArchivo: string;
	mimetype: string;
	caption?: string;
}

/** Envía un documento (por ejemplo la carta de cobranza en PDF). */
export async function enviarDocumentoWhatsApp(
	telefono: string,
	datos: DocumentoWhatsApp
): Promise<EnvioWhatsAppConfirmado> {
	if (!/^5989\d{7}$/.test(telefono)) throw new Error('El teléfono no está normalizado');

	const resultado = await socketConectado().sendMessage(jidDeTelefono(telefono), {
		document: datos.contenido,
		fileName: datos.nombreArchivo,
		mimetype: datos.mimetype,
		caption: datos.caption
	});
	const waId = resultado?.key?.id;
	if (!waId) throw new Error('WhatsApp no confirmó el envío');
	return { waId, enviadoEn: fechaDeMensaje(resultado.messageTimestamp) };
}

/**
 * Corta la conexión.
 *
 * - `cerrarSesion = false`: solo apaga el socket; las credenciales quedan y un
 *   "Conectar" vuelve a abrir sin QR.
 * - `cerrarSesion = true`: desvincula el dispositivo (logout) y borra las
 *   credenciales locales. Requiere escanear un QR nuevo.
 */
export async function desconectarWhatsApp(
	cerrarSesion = false
): Promise<VistaSesionWhatsApp> {
	const m = memoria();
	m.cerrando = true;
	cancelarReintento(m);
	m.generacion += 1;

	const sock = m.socket;
	m.socket = null;
	m.qr = null;
	m.qrDataUrl = null;
	m.conectadoEn = null;
	m.intentos = 0;

	if (sock) {
		try {
			if (cerrarSesion) {
				await sock.logout();
			} else {
				sock.end(new Error('Desconectado desde el CRM'));
			}
		} catch (error) {
			console.warn('[whatsapp] el cierre del socket falló:', mensajeDeError(error));
		}
	}

	if (cerrarSesion) {
		await borrarCredenciales().catch((error) => {
			console.error('[whatsapp] no se pudieron borrar las credenciales:', mensajeDeError(error));
		});
		m.estado = 'CERRADO';
		m.numeroTelefono = null;
		m.ultimoError = null;
	} else {
		m.estado = 'DESCONECTADO';
		m.ultimoError = null;
	}

	await persistir({
		estado: m.estado,
		numeroTelefono: m.numeroTelefono,
		ultimoError: null,
		desconectadoEn: new Date()
	});

	return vistaSesionWhatsApp();
}
