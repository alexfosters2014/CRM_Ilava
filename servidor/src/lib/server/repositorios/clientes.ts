import { eq } from 'drizzle-orm';
import { db } from '../base-datos/index.ts';
import { clientes, type Cliente, type ClienteNuevo } from '../base-datos/index.ts';

/**
 * Repositorio: clientes
 *
 * Acceso a PostgreSQL mediante Drizzle. Concentra todas las consultas de la
 * tabla `clientes`; las capas superiores (Servicios/Endpoints) no escriben SQL.
 */

/** Devuelve todos los clientes ordenados por id. */
export async function listarClientes(): Promise<Cliente[]> {
	return db.select().from(clientes).orderBy(clientes.id);
}

/** Devuelve un cliente por su id, o `undefined` si no existe. */
export async function obtenerClientePorId(id: number): Promise<Cliente | undefined> {
	const resultado = await db.select().from(clientes).where(eq(clientes.id, id)).limit(1);
	return resultado[0];
}

/** Crea un cliente y devuelve la fila insertada. */
export async function crearCliente(datos: ClienteNuevo): Promise<Cliente> {
	const resultado = await db.insert(clientes).values(datos).returning();
	return resultado[0];
}

/**
 * Actualiza un cliente devolviendo la fila resultante.
 * Solo los campos presentes en `parcial` se modifican (parcial real, no COALESCE).
 */
export async function actualizarCliente(
	id: number,
	parcial: Partial<Pick<ClienteNuevo, 'nombre' | 'email' | 'telefono'>>
): Promise<Cliente | undefined> {
	const resultado = await db.update(clientes).set(parcial).where(eq(clientes.id, id)).returning();
	return resultado[0];
}

/** Elimina un cliente y devuelve su id, o `undefined` si no existía. */
export async function eliminarCliente(id: number): Promise<{ id: number } | undefined> {
	const resultado = await db.delete(clientes).where(eq(clientes.id, id)).returning({ id: clientes.id });
	return resultado[0];
}
