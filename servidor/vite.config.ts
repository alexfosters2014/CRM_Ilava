import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
			// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
			// See https://svelte.dev/docs/kit/adapters for more information about adapters.
			adapter: adapter()
		})
	],
	// Vite bloquea requests cuyo Host no este en la lista (proteccion contra DNS
	// rebinding). En desarrollo el frontend llama a la API por el nombre de
	// servicio de la red de Docker (`backend`); en produccion corre adapter-node
	// y este check no aplica.
	server: {
		allowedHosts: ['backend', 'localhost', '127.0.0.1'],
		// En Docker sobre Windows los eventos del sistema de archivos no cruzan
		// el bind mount, asi que el HMR no se enteraria de los cambios. El
		// overlay de desarrollo define VITE_USE_POLLING=true. El intervalo es
		// conservador y se ignora lo que Vite regenera solo: un polling agresivo
		// sobre el mount de Windows satura el event loop y el server no responde.
		watch:
			process.env.VITE_USE_POLLING === 'true'
				? {
						usePolling: true,
						interval: 1000,
						ignored: ['**/.svelte-kit/**', '**/build/**', '**/.whatsapp-auth/**']
					}
				: undefined
	}
});
