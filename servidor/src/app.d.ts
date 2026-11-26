// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { UsuarioSesion } from '#lib/server/permisos/acceso.ts';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/**
			 * Usuario resuelto por `hooks.server.ts` para las rutas /api.
			 * La identidad sale de la cookie de sesión, nunca del cuerpo.
			 */
			usuario?: UsuarioSesion | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
