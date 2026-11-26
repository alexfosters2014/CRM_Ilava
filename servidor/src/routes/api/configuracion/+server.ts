import { json } from '@sveltejs/kit';
import { configuracionRepositorio } from '#lib/server/repositorios/index.ts';
import type { RequestHandler } from './$types';

/**
 * GET /api/configuracion
 * Devuelve todo lo que necesita la pantalla: catálogos (con activo), grupos y
 * los colores globales de las filas alternadas.
 */
export const GET: RequestHandler = async () => {
	const [catalogos, grupos, gruposCobranza, apariencia, facturacion] = await Promise.all([
		configuracionRepositorio.listarCatalogosAdmin(),
		configuracionRepositorio.listarGruposAdmin(),
		configuracionRepositorio.listarGruposCobranzaAdmin(),
		configuracionRepositorio.obtenerApariencia(),
		configuracionRepositorio.obtenerConfiguracionFacturacion()
	]);

	return json({ catalogos, grupos, gruposCobranza, apariencia, facturacion });
};
