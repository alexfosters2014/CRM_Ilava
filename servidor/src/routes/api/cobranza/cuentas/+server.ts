import { json } from '@sveltejs/kit';
import { correoRepositorio } from '#lib/server/repositorios/index.ts';
import type { RequestHandler } from './$types';

/**
 * GET /api/cobranza/cuentas
 *
 * Remitentes disponibles para el modal de envío de estados de cuenta. Es de
 * SOLO LECTURA a propósito: administrar las cuentas SMTP (alta, clave, alias)
 * es una acción de Configuración → Correo. Si Cobranza usara /api/correo/cuentas,
 * un operador de cobranza podría crear o modificar credenciales.
 */
export const GET: RequestHandler = async () => json(await correoRepositorio.listarCuentasCorreo());
