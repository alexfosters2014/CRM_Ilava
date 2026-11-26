import { auth } from './auth.ts';

/**
 * Capa: Autenticación — identidad del usuario que hace la petición.
 *
 * Los registros de auditoría (envíos, exclusiones, eliminaciones) necesitan
 * saber quién actuó. No se puede confiar solo en un `usuario` del cuerpo: el
 * navegador no lo manda y, si lo mandara, cualquiera podría escribir otro
 * nombre. La identidad real sale de la cookie de sesión de Better Auth (el
 * proxy del frontend reenvía las cookies tal cual).
 *
 * El valor del cuerpo queda como respaldo para llamadas sin sesión, como
 * scripts o pruebas de integración.
 */
export async function usuarioDePeticion(
	request: Request,
	respaldo?: string | null
): Promise<string | undefined> {
	try {
		const sesion = await auth.api.getSession({ headers: request.headers });
		const usuario = sesion?.user?.email?.trim() || sesion?.user?.name?.trim();
		if (usuario) return usuario;
	} catch {
		// Sin sesión válida seguimos con el respaldo: la operación no se bloquea
		// por no poder identificar al usuario, pero queda registrada sin él.
	}
	const limpio = respaldo?.trim();
	return limpio || undefined;
}
