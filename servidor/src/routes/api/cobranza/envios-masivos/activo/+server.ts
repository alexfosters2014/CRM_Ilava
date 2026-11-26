import { json } from '@sveltejs/kit';
import { colaEnviosRepositorio } from '#lib/server/repositorios/index.ts';
import type { RequestHandler } from './$types';

/** GET /api/cobranza/envios-masivos/activo — último lote con su progreso. */
export const GET: RequestHandler = async () => json(await colaEnviosRepositorio.loteActivo());
