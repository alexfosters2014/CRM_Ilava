import { eq } from 'drizzle-orm';
import { db, whatsappSesion } from '../base-datos/index.ts';
import type { EstadoSesionWhatsApp, WhatsAppSesion } from '../base-datos/index.ts';

/**
 * Repositorio: sesión de WhatsApp Web.
 *
 * Persiste el estado de la única sesión de la empresa. El socket de Baileys
 * vive en memoria (ver `whatsapp/gestor.ts`); acá solo se guarda lo que debe
 * sobrevivir a un reinicio: estado, número vinculado, último error y fechas.
 *
 * El QR no se guarda: expira en segundos y es material sensible.
 */

/** Fila fija de la sesión (la tabla tiene CHECK id = 1). */
const ID_SESION = 1;

export interface CambiosSesionWhatsApp {
	estado?: EstadoSesionWhatsApp;
	numeroTelefono?: string | null;
	ultimoError?: string | null;
	conectadoEn?: Date | null;
	desconectadoEn?: Date | null;
}

/** Estado actual de la sesión; crea la fila si falta (p. ej. BD vieja). */
export async function obtenerSesionWhatsApp(): Promise<WhatsAppSesion> {
	const [fila] = await db
		.select()
		.from(whatsappSesion)
		.where(eq(whatsappSesion.id, ID_SESION))
		.limit(1);

	if (fila) return fila;

	await db.insert(whatsappSesion).values({ id: ID_SESION }).onConflictDoNothing();
	const [creada] = await db
		.select()
		.from(whatsappSesion)
		.where(eq(whatsappSesion.id, ID_SESION))
		.limit(1);

	// La migración 0042 inserta la fila; esto es solo una red de seguridad.
	return creada ?? { ...filaVacia() };
}

function filaVacia(): WhatsAppSesion {
	return {
		id: ID_SESION,
		numeroTelefono: null,
		estado: 'DESCONECTADO',
		ultimoError: null,
		conectadoEn: null,
		desconectadoEn: null,
		actualizadoEn: new Date()
	};
}

/** Actualiza solo los campos presentes; `undefined` no pisa nada. */
export async function guardarSesionWhatsApp(cambios: CambiosSesionWhatsApp): Promise<void> {
	const limpios = Object.fromEntries(
		Object.entries(cambios).filter(([, valor]) => valor !== undefined)
	) as CambiosSesionWhatsApp;

	const valores = {
		...limpios,
		id: ID_SESION,
		actualizadoEn: new Date()
	};

	await db
		.insert(whatsappSesion)
		.values(valores)
		.onConflictDoUpdate({
			target: whatsappSesion.id,
			set: valores
		});
}
