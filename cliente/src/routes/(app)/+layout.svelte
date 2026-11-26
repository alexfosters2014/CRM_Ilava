<script lang="ts">
	import { Banner, MenuLateral } from '#lib/componentes/index.ts';
	import { salir } from '#lib/servicios-datos-api/index.ts';
	import type { LayoutProps } from './$types';

	/**
	 * Shell autenticado: Banner superior + Menú lateral colapsable + contenido.
	 * Envuelve todas las rutas de (app)/. El estado de expansión del menú vive
	 * acá para que persista al navegar entre pantallas.
	 */
	let { children, data }: LayoutProps = $props();

	let menuExpandido = $state(false);

	async function cerrarSesion() {
		await salir();
		location.href = '/login';
	}
</script>

<Banner usuario={data.usuario} />
<MenuLateral
	expandido={menuExpandido}
	usuario={data.usuario}
	pantallas={data.pantallas}
	onCerrarSesion={cerrarSesion}
	onExpandir={() => (menuExpandido = true)}
	onColapsar={() => (menuExpandido = false)}
/> 

<div class="contenido {menuExpandido ? 'menu-abierto' : ''}">
	{@render children()}
</div>

<style>
	/* Deja espacio para el menú fijo (88px colapsado / 270px expandido) y el
	   banner. El padding mantiene el contenido dentro del 98% de la pantalla. */
	.contenido {
		margin-left: calc(88px + 1.5rem);
		padding: 1.75rem 3vw 2.5rem;
		min-height: calc(100dvh - 3.75rem);
		transition: margin-left 250ms cubic-bezier(0.4, 0, 0.2, 1);
	}

	.contenido.menu-abierto {
		margin-left: calc(270px + 1.5rem);
	}

	@media (max-width: 48rem) {
		.contenido {
			margin-left: calc(64px + 1rem);
			padding: 1.25rem 4vw 2rem;
		}

		/* En pantallas chicas el menú expandido se superpone: no hay ancho
		   útil para correr todo el contenido 270px. */
		.contenido.menu-abierto {
			margin-left: calc(64px + 1rem);
		}
	}
</style>
