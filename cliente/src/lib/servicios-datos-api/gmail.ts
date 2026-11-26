/**
 * Capa: ServiciosDatosAPI — Gmail API.
 *
 * El backend maneja OAuth y tokens. Acá solo viajan datos de cuenta y envíos;
 * el refresh token nunca sale del servidor.
 */

import type { SeguimientoDetalle } from './seguimientos.ts';

export interface GmailCuentaVista {
	id: number;
	email: string;
	nombre: string | null;
	activo: boolean;
	historyId: string | null;
	ultimaSincronizacion: string | null;
	watchExpiraEn: string | null;
	ultimoError: string | null;
	creadoEn: string;
}

export interface GmailCuentaEnvio {
	id: number;
	email: string;
	nombre: string | null;
}

export interface ResultadoSyncGmail {
	cuenta: string;
	nuevos: number;
	vinculadosSeguimiento: number;
	vinculadosTicket: number;
	pendientes: number;
	error: string | null;
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
	const respuesta = await fetch(url, { cache: 'no-store', ...init });
	const datos = (await respuesta.json().catch(() => ({}))) as Record<string, unknown>;
	if (!respuesta.ok) {
		throw new Error(
			typeof datos.error === 'string' ? datos.error : 'No se pudo completar la operación'
		);
	}
	return datos as T;
}

export async function listarCuentasGmail(): Promise<{
	configurado: boolean;
	tiempoReal: boolean;
	cuentas: GmailCuentaVista[];
}> {
	return await pedir('/api/gmail/cuentas');
}

export function urlConectarGmail(): string {
	return '/api/gmail/oauth/iniciar';
}

export async function verificarCuentaGmail(
	id: number
): Promise<{ ok: boolean; email?: string; error?: string }> {
	return await pedir(`/api/gmail/cuentas/${id}/verificar`, { method: 'POST' });
}

export async function sincronizarCuentaGmail(id: number): Promise<ResultadoSyncGmail> {
	const datos = await pedir<{ resultado: ResultadoSyncGmail }>(
		`/api/gmail/cuentas/${id}/sincronizar`,
		{ method: 'POST' }
	);
	return datos.resultado;
}

export async function sincronizarTodasGmail(): Promise<ResultadoSyncGmail[]> {
	const datos = await pedir<{ resultados: ResultadoSyncGmail[] }>('/api/gmail/sincronizar', {
		method: 'POST'
	});
	return datos.resultados;
}

export async function desconectarCuentaGmail(id: number): Promise<boolean> {
	const datos = await pedir<{ ok: boolean }>(`/api/gmail/cuentas/${id}`, { method: 'DELETE' });
	return datos.ok;
}

export async function listarCuentasGmailSeguimiento(): Promise<GmailCuentaEnvio[]> {
	const datos = await pedir<{ cuentas: GmailCuentaEnvio[] }>('/api/seguimientos/cuentas-gmail');
	return datos.cuentas;
}

export async function listarCuentasGmailTickets(): Promise<GmailCuentaEnvio[]> {
	const datos = await pedir<{ cuentas: GmailCuentaEnvio[] }>('/api/tickets/cuentas-gmail');
	return datos.cuentas;
}

export async function enviarCorreoSeguimiento(
	id: number,
	datos: {
		cuentaGmailId: number;
		para: string[];
		cc?: string[];
		asunto: string;
		cuerpo: string;
		facturasReferencia?: string[];
	}
): Promise<SeguimientoDetalle> {
	const respuesta = await pedir<{ seguimiento: SeguimientoDetalle }>(
		`/api/seguimientos/${id}/correo`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(datos)
		}
	);
	return respuesta.seguimiento;
}
