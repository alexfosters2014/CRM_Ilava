/**
 * Capa: ServiciosDatosAPI (correo)
 *
 * Cuentas SMTP y alias para los envíos de cobranza. La contraseña se envía al
 * guardar, pero la API nunca la devuelve: solo informa `tieneClave`.
 */

export interface AliasCorreo {
	id: number;
	email: string;
	nombreVisible: string | null;
	activo: boolean;
}

export interface CuentaCorreo {
	id: number;
	nombre: string;
	email: string;
	host: string;
	puerto: number;
	seguro: boolean;
	usuario: string;
	activo: boolean;
	predeterminada: boolean;
	tieneClave: boolean;
	/** Estado de la credencial SMTP: OK, rechazada o todavía sin verificar. */
	credencialEstado: 'SIN_VERIFICAR' | 'OK' | 'RECHAZADA';
	credencialError: string | null;
	credencialVerificadaEn: string | null;
	alias: AliasCorreo[];
}

export interface DatosCuentaCorreo {
	id?: number;
	nombre: string;
	email: string;
	host: string;
	puerto: number;
	seguro: boolean;
	usuario: string;
	clave?: string;
	activo?: boolean;
	predeterminada?: boolean;
	alias?: { email: string; nombreVisible?: string | null; activo?: boolean }[];
}

export async function listarCuentasCorreo(): Promise<CuentaCorreo[]> {
	const res = await fetch('/api/correo/cuentas');
	if (!res.ok) throw new Error('No se pudieron cargar las cuentas de correo');
	return res.json();
}

export async function guardarCuentaCorreo(datos: DatosCuentaCorreo): Promise<CuentaCorreo> {
	const res = await fetch('/api/correo/cuentas', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(datos)
	});
	const respuesta = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(respuesta?.error ?? 'No se pudo guardar la cuenta de correo');
	return respuesta as CuentaCorreo;
}

export async function eliminarCuentaCorreo(id: number): Promise<void> {
	const res = await fetch(`/api/correo/cuentas/${id}`, { method: 'DELETE' });
	if (!res.ok) {
		const respuesta = await res.json().catch(() => ({}));
		throw new Error(respuesta?.error ?? 'No se pudo eliminar la cuenta');
	}
}

export async function probarCuentaCorreo(datos: {
	destino: string;
	cuentaId: number;
	aliasId?: number | null;
}): Promise<{ ok: true; messageId: string }> {
	const res = await fetch('/api/correo/cuentas/probar', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(datos)
	});
	const respuesta = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(respuesta?.error ?? 'No se pudo enviar la prueba');
	return respuesta;
}

export interface ResultadoVerificacionCorreo {
	ok: boolean;
	tipo?: string;
	codigo?: string | null;
	error?: string;
	detalle?: string;
}

/** Verifica conexión y credencial SMTP sin enviar un correo. */
export async function verificarCuentaCorreo(id: number): Promise<ResultadoVerificacionCorreo> {
	const res = await fetch(`/api/correo/cuentas/${id}/verificar`, { method: 'POST' });
	const respuesta = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(respuesta?.error ?? 'No se pudo verificar la cuenta');
	return respuesta as ResultadoVerificacionCorreo;
}
