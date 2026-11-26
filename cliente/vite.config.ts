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
		]
	};
});
