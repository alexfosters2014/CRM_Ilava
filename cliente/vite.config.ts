import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
	// En desarrollo, carga el .env en process.env para que el proxy /api
	// pueda leer API_URL. En producción (contenedor) esa variable la
	// inyecta el runtime de Podman.
	const entorno = loadEnv(mode, process.cwd(), '');
	for (const [clave, valor] of Object.entries(entorno)) {
		process.env[clave] ??= valor;
	}

	return {
		plugins: [
			sveltekit({
				compilerOptions: {
					// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true
				},
				adapter: adapter()
			})
		],
		// En Docker sobre Windows los eventos del sistema de archivos no cruzan
		// el bind mount: sin polling el HMR no se enteraria de los cambios. El
		// overlay de desarrollo define VITE_USE_POLLING=true. Se ignora lo que
		// Vite regenera solo para no saturar el event loop.
		server: {
			watch:
				process.env.VITE_USE_POLLING === 'true'
					? {
							usePolling: true,
							interval: 1000,
							ignored: ['**/.svelte-kit/**', '**/build/**', '**/test-results/**']
						}
					: undefined
		}
	};
});
