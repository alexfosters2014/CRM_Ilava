import { asc, eq, notInArray, sql } from 'drizzle-orm';
import { db, variables } from '../base-datos/index.ts';

/** Repositorio: variables de plantilla (nombre + último valor usado). */

export interface VariableListado {
	id: number;
	nombre: string;
	valor: string | null;
}

const COLUMNAS = { id: variables.id, nombre: variables.nombre, valor: variables.valor };

export async function listarVariables(): Promise<VariableListado[]> {
	return db.select(COLUMNAS).from(variables).orderBy(asc(variables.nombre));
}

/** Crea la variable si no existe y devuelve la fila resultante. */
export async function crearVariable(nombre: string): Promise<VariableListado> {
	// Los nombres no distinguen mayúsculas: se guardan normalizados en minúsculas.
	const limpio = nombre.trim().toLowerCase();

	const [existente] = await db
		.select(COLUMNAS)
		.from(variables)
		.where(sql`lower(${variables.nombre}) = ${limpio}`)
		.limit(1);

	if (existente) return existente;

	const [creada] = await db.insert(variables).values({ nombre: limpio }).returning(COLUMNAS);

	return creada;
}

export async function eliminarVariable(id: number): Promise<boolean> {
	const eliminada = await db.delete(variables).where(eq(variables.id, id)).returning({ id: variables.id });
	return eliminada.length > 0;
}

/**
 * Reemplaza el catálogo completo desde el panel del Facturador: hace upsert por
 * nombre (con su último valor) y elimina las que ya no están en la lista.
 */
export async function reemplazarVariables(
	lista: { nombre: string; valor?: string | null }[]
): Promise<VariableListado[]> {
	return db.transaction(async (tx) => {
		const porNombre = new Map<string, string | null>();

		for (const item of lista) {
			const nombre = item.nombre.trim().toLowerCase();
			if (!nombre) continue;
			const limpio = item.valor?.trim();
			porNombre.set(nombre, limpio ? limpio : null);
		}

		const nombres = [...porNombre.keys()];

		if (nombres.length === 0) {
			await tx.delete(variables);
		} else {
			await tx.delete(variables).where(notInArray(variables.nombre, nombres));
			for (const nombre of nombres) {
				await tx
					.insert(variables)
					.values({ nombre, valor: porNombre.get(nombre) ?? null })
					.onConflictDoUpdate({
						target: variables.nombre,
						set: { valor: sql`excluded.valor` }
					});
			}
		}

		return tx.select(COLUMNAS).from(variables).orderBy(asc(variables.nombre));
	});
}
