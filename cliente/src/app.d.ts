// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}

		// adapter-node inyecta el request crudo de Node en `event.platform.req`.
		// Lo usamos en el proxy /api para conocer el protocolo REAL de la
		// conexión (http vs https): event.url del frontend viene contaminado
		// (adapter-node asume https si no hay proxy headers ni paths.origin).
		interface Platform {
			req?: import('node:http').IncomingMessage;
		}
	}
}

export {};
