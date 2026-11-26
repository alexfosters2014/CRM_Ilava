/**
 * Capa: Servicios — clasificación de errores SMTP.
 *
 * Nodemailer expone `code` (EAUTH, ECONNECTION, EENVELOPE…), `responseCode`
 * (535, 550…) y `response`. Con eso se distingue una credencial rechazada de
 * una caída de red, un destinatario inválido o un límite del proveedor.
 */

export type TipoErrorCorreo =
	| 'AUTENTICACION'
	| 'CONEXION'
	| 'DESTINATARIO'
	| 'LIMITE'
	| 'CONTENIDO'
	| 'DESCONOCIDO';

export interface ErrorCorreoClasificado {
	tipo: TipoErrorCorreo;
	/** Código técnico: EAUTH, ECONNECTION, 535, 550… */
	codigo: string | null;
	/** Mensaje crudo del proveedor, útil para diagnóstico. */
	mensaje: string;
	/** Explicación accionable para mostrar en la interfaz. */
	explicacion: string;
}

const EXPLICACIONES: Record<TipoErrorCorreo, string> = {
	AUTENTICACION:
		'El servidor rechazó el usuario o la contraseña. Suele pasar cuando se cambió la contraseña, se revocó la contraseña de aplicación o la cuenta quedó bloqueada. Actualizá la credencial en Configuración → Correo y volvé a probar.',
	CONEXION:
		'No se pudo conectar con el servidor SMTP. Revisá el host, el puerto, el cifrado y la conexión a internet.',
	DESTINATARIO:
		'El servidor rechazó uno o más destinatarios. Revisá las direcciones de correo del servicio.',
	LIMITE:
		'El proveedor limitó el envío por cuota o por demasiados intentos. Esperá unos minutos y reintentá.',
	CONTENIDO:
		'El servidor rechazó el contenido del mensaje. Revisá la plantilla o los adjuntos.',
	DESCONOCIDO: 'Error SMTP no clasificado. Revisá el detalle técnico.'
};

const CODIGOS_AUTENTICACION = new Set([530, 534, 535]);
const CODIGOS_DESTINATARIO = new Set([550, 551, 552, 553, 554]);
const CODIGOS_LIMITE = new Set([421, 450, 451, 452, 454]);
const CODIGOS_CONEXION = new Set(['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ECONNRESET', 'ENOTFOUND', 'EHOSTUNREACH', 'ECONNREFUSED']);

function textoDe(error: unknown): string {
	if (!error || typeof error !== 'object') return String(error ?? '');
	const dato = error as { message?: unknown; response?: unknown };
	const partes = [dato.message, dato.response].filter((parte) => typeof parte === 'string');
	return partes.join(' ').toLowerCase();
}

export function clasificarErrorCorreo(error: unknown): ErrorCorreoClasificado {
	const dato = (error ?? {}) as {
		code?: unknown;
		responseCode?: unknown;
		response?: unknown;
		message?: unknown;
	};
	const mensaje =
		typeof dato.message === 'string' && dato.message.trim()
			? dato.message.trim()
			: 'Error desconocido al enviar el correo';
	const code = typeof dato.code === 'string' ? dato.code.toUpperCase() : null;
	const responseCode = Number(dato.responseCode) || null;
	const codigo = code ?? (responseCode ? String(responseCode) : null);
	const texto = textoDe(error);

	let tipo: TipoErrorCorreo = 'DESCONOCIDO';
	if (
		code === 'EAUTH' ||
		(responseCode !== null && CODIGOS_AUTENTICACION.has(responseCode)) ||
		/invalid login|username and password not accepted|authentication (unsuccessful|failed)|application-specific password|bad credentials|login denied|credenciales|autenticaci[oó]n/.test(texto)
	) {
		tipo = 'AUTENTICACION';
	} else if (
		(responseCode !== null && CODIGOS_LIMITE.has(responseCode)) ||
		/quota|rate limit|too many|throttl|l[ií]mite/.test(texto)
	) {
		tipo = 'LIMITE';
	} else if (
		(code !== null && CODIGOS_CONEXION.has(code)) ||
		/timeout|timed out|econn|network|socket|dns|connect/.test(texto)
	) {
		tipo = 'CONEXION';
	} else if (
		code === 'EENVELOPE' ||
		(responseCode !== null && CODIGOS_DESTINATARIO.has(responseCode)) ||
		/recipient|mailbox|no such user|address.*(rejected|invalid)/.test(texto)
	) {
		tipo = 'DESTINATARIO';
	} else if (code === 'EMESSAGE' || /message (rejected|content)|content rejected/.test(texto)) {
		tipo = 'CONTENIDO';
	}

	return { tipo, codigo, mensaje, explicacion: EXPLICACIONES[tipo] };
}

export function esErrorAutenticacion(error: unknown): boolean {
	return clasificarErrorCorreo(error).tipo === 'AUTENTICACION';
}
