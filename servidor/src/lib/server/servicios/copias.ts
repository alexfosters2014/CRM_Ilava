/**
 * Capa: Servicios — copias de control interno en envíos de cobranza.
 *
 * Regla pura (sin base de datos) para poder testearla: la copia puede ir visible
 * (CC) u oculta (CCO) y nunca se repite una dirección que ya es destinataria.
 */

export type TipoCopia = 'CC' | 'CCO';

export interface ConfigCopia {
	activa: boolean;
	emails: string;
	tipo: TipoCopia;
}

export function listaEmails(valor: string | null | undefined): string[] {
	return (valor ?? '')
		.split(/[,;\n]/)
		.map((email) => email.trim().toLowerCase())
		.filter(Boolean);
}

export function resolverCopias(
	config: ConfigCopia,
	destinatarios: string[]
): { cc: string[]; bcc: string[] } {
	if (!config.activa) return { cc: [], bcc: [] };
	const yaIncluidos = new Set(destinatarios.map((email) => email.trim().toLowerCase()));
	const emails = listaEmails(config.emails).filter((email) => !yaIncluidos.has(email));
	return config.tipo === 'CCO' ? { cc: [], bcc: emails } : { cc: emails, bcc: [] };
}
