import { json } from '@sveltejs/kit';
import { catalogosRepositorio } from '#lib/server/repositorios/index.ts';
import type { RequestHandler } from './$types';

/**
 * GET /api/catalogos
 * Devuelve todos los catálogos (grupos, artículos, tipos, monedas y cobranzas).
 */
export const GET: RequestHandler = async () => {
	const catalogos = await catalogosRepositorio.listarCatalogos();
	return json(catalogos);
};
