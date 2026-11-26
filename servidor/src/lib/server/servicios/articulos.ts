import { eq } from 'drizzle-orm';
import { articulos, db } from '../base-datos/index.ts';

/**
 * Capa: Servicios — resolución de artículos por código.
 *
 * El código se digita a mano en la pantalla, así que todo alta o cambio de
 * línea tiene que resolverse contra el catálogo antes de persistir.
 */

/** El código de artículo tipeado no existe en el catálogo. */
export class ErrorArticuloInexistente extends Error {
	readonly codigo: string;

	constructor(codigo: string) {
		super(`El código ${codigo} no existe en el catálogo de artículos`);
		this.name = 'ErrorArticuloInexistente';
		this.codigo = codigo;
	}
}

export interface ArticuloResuelto {
	id: number;
	codigo: string;
	descripcion: string;
}

/** Busca un artículo por código exacto; si no existe, lanza el error de dominio. */
export async function resolverArticulo(codigo: string): Promise<ArticuloResuelto> {
	const limpio = codigo.trim();
	const [articulo] = await db
		.select({ id: articulos.id, codigo: articulos.codigo, descripcion: articulos.descripcion })
		.from(articulos)
		.where(eq(articulos.codigo, limpio))
		.limit(1);

	if (!articulo) throw new ErrorArticuloInexistente(limpio);
	return articulo;
}
