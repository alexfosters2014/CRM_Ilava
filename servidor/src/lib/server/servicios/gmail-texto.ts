/**
 * Capa: Servicios — helpers puros de Gmail.
 *
 * Sin red ni base de datos: se testean aislados. El repositorio los usa para
 * armar el Reply-To y para el orden de vinculación de respuestas.
 */

/** `seguimiento+SEG-2026-000123@dominio` para el Reply-To. */
export function construirReplyTo(email: string, codigo: string): string {
	const [local, dominio] = email.split('@');
	if (!local || !dominio) return email;
	// Se conserva la parte local de la casilla: en Gmail, `seguimiento+...`
	// apunta a otra cuenta inexistente. Con `cuenta+TCK-...@gmail.com` la
	// respuesta vuelve al mismo buzón (plus-addressing).
	return `${local}+${codigo}@${dominio}`;
}

export function extraerCodigoSeguimiento(texto: string | null | undefined): string | null {
	const coincidencia = /\[(SEG-\d{4}-\d{6})\]/i.exec(texto ?? '');
	return coincidencia ? coincidencia[1].toUpperCase() : null;
}

export function extraerCodigoTicket(texto: string | null | undefined): string | null {
	const coincidencia = /\[(TCK-\d{6})\]/i.exec(texto ?? '');
	return coincidencia ? coincidencia[1].toUpperCase() : null;
}

export function extraerAliasSeguimiento(destinatarios: string | null | undefined): string | null {
	// Cualquier casilla con plus-addressing: cuenta+SEG-...@dominio.
	const coincidencia = /\+((SEG-\d{4}-\d{6}))@/i.exec(destinatarios ?? '');
	return coincidencia ? coincidencia[1].toUpperCase() : null;
}

export function extraerAliasTicket(destinatarios: string | null | undefined): string | null {
	// Cualquier casilla con plus-addressing: cuenta+TCK-...@dominio.
	const coincidencia = /\+((TCK-\d{6}))@/i.exec(destinatarios ?? '');
	return coincidencia ? coincidencia[1].toUpperCase() : null;
}

/**
 * Deja solo el texto nuevo de una respuesta de correo. Quita la cadena citada
 * (Outlook, Gmail, Apple Mail), las líneas con ">" y el pie promocional de
 * Outlook móvil. Si no queda texto, devuelve el original para no perder datos.
 */
export function limpiarRespuestaCorreo(cuerpo: string | null | undefined): string {
	if (!cuerpo) return '';
	const original = cuerpo.replace(/\r\n?/g, '\n').trim();

	let texto = original.replace(
		/^\s*(?:Obtener Outlook para Android|Get Outlook for Android)\s*<[^>\n]*>\s*$/gim,
		''
	);

	// El asunto suele repetirse al inicio del cuerpo; ya se muestra aparte.
	texto = texto.replace(/^\s*(?:Re|RV|RE):\s*\[(?:TCK-\d{6}|SEG-\d{4}-\d{6})\][^\n]*\n+/i, '');
	texto = texto.replace(/^\s*\[(?:TCK-\d{6}|SEG-\d{4}-\d{6})\][^\n]*\n+/i, '');

	const cortes = [
		/^\s*_{5,}\s*$/m,
		/^\s*-{2,}\s*(?:Original Message|Mensaje original)\s*-{2,}\s*$/im,
		/^\s*(?:De|From):\s[^\n]*\n(?:Enviado|Sent|Fecha|Date):\s/im,
		/^\s*(?:On|El|Em)\b[\s\S]{0,800}?\b(?:wrote|escribió|escreveu):\s*$/im
	];

	let corte = texto.length;
	for (const patron of cortes) {
		const coincidencia = patron.exec(texto);
		if (coincidencia && coincidencia.index < corte) corte = coincidencia.index;
	}
	texto = texto.slice(0, corte);

	texto = texto
		.split('\n')
		.filter((linea) => !linea.trimStart().startsWith('>'))
		.join('\n');

	const limpio = texto.replace(/\n{3,}/g, '\n\n').trim();
	return limpio || original;
}

/** Primer correo válido de una cabecera `Nombre <correo>`. */
export function extraerEmail(valor: string): string {
	const coincidencia = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(valor);
	return coincidencia ? coincidencia[0].toLowerCase() : valor.trim().toLowerCase();
}

/** Todos los correos de una cabecera con varios destinatarios. */
export function extraerEmails(valor: string): string[] {
	const encontrados = valor.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
	return [...new Set(encontrados.map((email) => email.toLowerCase()))];
}

export interface NotificacionPubSub {
	emailAddress: string;
	historyId: string | null;
}

/**
 * Decodifica `message.data` de un push de Gmail. Google lo envía en base64
 * (no base64url) con `emailAddress` y `historyId`.
 */
export function decodificarNotificacionPubSub(data: string): NotificacionPubSub {
	let crudo: string;
	try {
		crudo = Buffer.from(data, 'base64').toString('utf8');
	} catch {
		throw new Error('El payload de Pub/Sub no es base64 válido');
	}
	let json: unknown;
	try {
		json = JSON.parse(crudo);
	} catch {
		throw new Error('El payload de Pub/Sub no es JSON válido');
	}
	const datos = json as { emailAddress?: unknown; historyId?: unknown };
	if (typeof datos.emailAddress !== 'string' || !datos.emailAddress.includes('@')) {
		throw new Error('La notificación no trae emailAddress');
	}
	const historyId =
		typeof datos.historyId === 'string' || typeof datos.historyId === 'number'
			? String(datos.historyId)
			: null;
	return { emailAddress: datos.emailAddress.toLowerCase(), historyId };
}
