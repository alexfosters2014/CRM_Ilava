/**
 * Capa: ServiciosDatosAPI — WhatsApp Web (Baileys).
 *
 * La sesión vive en la API: acá solo viajan estado, QR efímero y acciones.
 * El QR llega como data URL; nunca se guarda ni se reconstruye en el cliente.
 */

export type EstadoSesionWhatsApp =
	| 'DESCONECTADO'
	| 'ESPERANDO_QR'
	| 'CONECTADO'
	| 'RECONECTANDO'
	| 'CERRADO';

export interface SesionWhatsAppVista {
	estado: EstadoSesionWhatsApp;
	/** Número vinculado en formato E.164 sin '+' (ej.: 59899123456). */
	numeroTelefono: string | null;
	/** QR vigente como data URL; null si no está esperando vinculación. */
	qrDataUrl: string | null;
	ultimoError: string | null;
	conectadoEn: string | null;
	conectado: boolean;
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

export async function obtenerEstadoWhatsApp(): Promise<SesionWhatsAppVista> {
	return await pedir('/api/whatsapp/estado');
}

export async function conectarWhatsApp(): Promise<SesionWhatsAppVista> {
	return await pedir('/api/whatsapp/conectar', { method: 'POST' });
}

/**
 * `cerrarSesion = true` desvincula el dispositivo y borra las credenciales:
 * para volver a usarlo hay que escanear un QR nuevo.
 */
export async function desconectarWhatsApp(cerrarSesion = false): Promise<SesionWhatsAppVista> {
	return await pedir('/api/whatsapp/desconectar', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ cerrarSesion })
	});
}
