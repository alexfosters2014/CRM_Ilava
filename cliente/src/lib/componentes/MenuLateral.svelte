<script lang="ts">
	import { page } from '$app/state';
	import { iconos } from '#lib/componentes/iconos.ts';
	import { iniciales, type PantallaVisible, type Usuario } from '#lib/servicios/sesion.ts';

	/**
	 * Capa: Componentes — Menú lateral de navegación.
	 *
	 * Réplica de la spec "Menú de Navegación Lateral — FacturaPro":
	 * - Estado colapsado (default): 88px, solo iconos con tooltips nativos.
	 * - Estado expandido: 270px, muestra etiquetas, badges y perfil.
	 * - Fijo (position: fixed), alto máximo 98vh (no excede la pantalla).
	 * - Animación: transition 250ms cubic-bezier(0.4, 0, 0.2, 1).
	 *
	 * El estado lo controla el padre (layout) para que persista al navegar.
	 */
	interface Props {
		expandido?: boolean;
		usuario: Usuario | null;
		/** Pantallas habilitadas por el administrador, ya filtradas por la API. */
		pantallas?: PantallaVisible[];
		onCerrarSesion?: () => void;
		onExpandir?: () => void;
		onColapsar?: () => void;
	}

	let {
		expandido = false,
		usuario,
		pantallas = [],
		onCerrarSesion,
		onExpandir,
		onColapsar
	}: Props = $props();

	interface Item {
		icono: string;
		etiqueta: string;
		ruta: string;
	}

	// El menú se arma con el catálogo que devuelve la API: no hay una segunda
	// lista de pantallas que mantener acá. Si el backend agrega una, aparece sola.
	const navegacion = $derived<Item[]>(
		pantallas
			.filter((pantalla) => pantalla.ruta)
			.map((pantalla) => ({
				icono: pantalla.icono ?? 'centro',
				etiqueta: pantalla.etiqueta,
				ruta: pantalla.ruta as string
			}))
	);

	// Estado de demostración del PAC (en producción vendría de un endpoint real).
	const latenciaPAC = 18;
</script>

<nav
	class="menu"
	class:expandido
	aria-label="Navegación principal"
	onmouseenter={() => !expandido && onExpandir?.()}
	onmouseleave={() => expandido && onColapsar?.()}
>
	<header class="cabecera">
		{#if expandido}
			<span class="logo">{@html iconos.rayo}</span>
			<div class="marca">
				<strong>FacturaPro</strong>
				<small>CFDI 4.0 SUITE</small>
			</div>
			<button
				type="button"
				class="colapsar"
				aria-label="Colapsar menú"
				title="Colapsar menú"
				onclick={() => onColapsar?.()}
			>
				{@html iconos.chevron}
			</button>
		{:else}
			<button
				type="button"
				class="expandir"
				aria-label="Expandir menú"
				title="Expandir menú"
				onclick={() => onExpandir?.()}
			>
				{@html iconos.rayo}
			</button>
		{/if}
	</header>

	{#if expandido}
		<p class="seccion">Navegación principal</p>
	{/if}

	<ul class="lista">
		{#each navegacion as item}
			<li>
				<a
					href={item.ruta}
					class="item"
					class:activo={page.url.pathname === item.ruta}
					title={expandido ? undefined : item.etiqueta}
					onclick={() => onColapsar?.()}
				>
					<span class="ico">{@html iconos[item.icono] ?? iconos.centro}</span>
					{#if expandido}
						<span class="etiqueta">{item.etiqueta}</span>
					{/if}
				</a>
			</li>
		{/each}
	</ul>

	<footer class="pie">
		{#if expandido}
			<div class="pac">
				<span class="punto"></span>
				<div class="pac-texto">
					<small>PAC SAT</small>
					<strong>Conectado</strong>
				</div>
				<span class="latencia">{latenciaPAC}ms</span>
			</div>
		{/if}

		<div class="perfil">
			<span class="avatar">{iniciales(usuario)}</span>
			{#if expandido}
				<div class="perfil-texto">
					<strong>{(usuario?.name || usuario?.email || 'Usuario').split('@')[0]}</strong>
					<small>{usuario?.email ?? 'Sin correo'}</small>
				</div>
			{/if}
			<button
				type="button"
				class="salir"
				aria-label="Cerrar sesión"
				title={expandido ? 'Cerrar sesión' : 'Cerrar sesión'}
				onclick={() => onCerrarSesion?.()}
			>
				{@html iconos.salir}
			</button>
		</div>
	</footer>
</nav>

<style>
	.menu {
		position: fixed;
		top: 4.5rem; /* debajo del banner */
		bottom: 1vh; /* deja respirar: no excede el 98% del alto */
		left: 0.75rem;
		z-index: 60;
		display: flex;
		flex-direction: column;
		width: 88px;
		padding: 1rem 0.75rem;
		border-radius: 1.5rem;
		background: linear-gradient(160deg, var(--indigo-600, var(--primario)), var(--indigo-700, #4338ca));
		color: var(--texto-inverso);
		box-shadow: 0 18px 40px rgba(79, 70, 229, 0.35);
		overflow: hidden;
		transition: width 250ms cubic-bezier(0.4, 0, 0.2, 1);
	}

	.menu.expandido {
		width: 270px;
	}

	/* Cabecera */
	.cabecera {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-bottom: 1rem;
	}

	.logo,
	.expandir {
		display: grid;
		place-items: center;
		flex-shrink: 0;
		width: 2.5rem;
		height: 2.5rem;
		border: none;
		border-radius: 0.75rem;
		background: rgba(255, 255, 255, 0.16);
		color: var(--texto-inverso);
		font-size: 1.15rem;
		cursor: pointer;
	}

	.expandir:hover {
		background: rgba(255, 255, 255, 0.28);
	}

	.marca {
		display: flex;
		flex-direction: column;
		line-height: 1.15;
		white-space: nowrap;
	}

	.marca strong {
		font-size: 0.98rem;
	}

	.marca small {
		font-size: 0.62rem;
		letter-spacing: 0.09em;
		opacity: 0.75;
	}

	.colapsar {
		margin-left: auto;
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		border: none;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.14);
		color: var(--texto-inverso);
		font-size: 1.1rem;
		cursor: pointer;
		transition: transform 250ms cubic-bezier(0.4, 0, 0.2, 1);
	}

	.colapsar:hover {
		background: rgba(255, 255, 255, 0.26);
	}

	.seccion {
		margin: 0 0 0.6rem;
		padding-left: 0.5rem;
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.6);
		white-space: nowrap;
	}

	.lista {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden;
	}

	.item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		height: 2.75rem;
		padding: 0 0.7rem;
		border-radius: 0.8rem;
		color: rgba(255, 255, 255, 0.92);
		text-decoration: none;
		font-size: 0.875rem;
		white-space: nowrap;
		transition: background 200ms cubic-bezier(0.4, 0, 0.2, 1);
	}

	.item:hover {
		background: rgba(255, 255, 255, 0.14);
	}

	.item.activo {
		/* El item activo usa el mismo contenedor translúcido que el icono superior. */
		background: rgba(255, 255, 255, 0.16);
		color: var(--texto-inverso);
		font-weight: 600;
	}

	.ico {
		display: grid;
		place-items: center;
		flex-shrink: 0;
		font-size: 1.15rem;
	}

	.etiqueta {
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Pie: PAC + perfil */
	.pie {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin-top: 0.75rem;
	}

	.pac {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		padding: 0.55rem 0.7rem;
		border-radius: 0.8rem;
		background: rgba(255, 255, 255, 0.12);
		white-space: nowrap;
	}

	.punto {
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 50%;
		background: var(--verde-500, var(--exito));
		box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.28);
		flex-shrink: 0;
	}

	.pac-texto {
		display: flex;
		flex-direction: column;
		line-height: 1.15;
	}

	.pac-texto small {
		font-size: 0.6rem;
		letter-spacing: 0.06em;
		opacity: 0.75;
	}

	.pac-texto strong {
		font-size: 0.78rem;
	}

	.latencia {
		margin-left: auto;
		padding: 0.1rem 0.4rem;
		border-radius: 999px;
		background: rgba(34, 197, 94, 0.25);
		font-size: 0.62rem;
		font-weight: 700;
	}

	.perfil {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.55rem 0.6rem;
		border-radius: 0.9rem;
		background: rgba(255, 255, 255, 0.14);
		white-space: nowrap;
	}

	.avatar {
		display: grid;
		place-items: center;
		flex-shrink: 0;
		width: 2.1rem;
		height: 2.1rem;
		border-radius: 50%;
		background: var(--superficie-panel);
		color: var(--indigo-700, var(--primario-texto));
		font-size: 0.72rem;
		font-weight: 700;
	}

	.perfil-texto {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		line-height: 1.2;
	}

	.perfil-texto strong {
		font-size: 0.8rem;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.perfil-texto small {
		font-size: 0.62rem;
		opacity: 0.75;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.salir {
		margin-left: auto;
		display: grid;
		place-items: center;
		flex-shrink: 0;
		width: 1.9rem;
		height: 1.9rem;
		border: none;
		border-radius: 0.55rem;
		background: rgba(255, 255, 255, 0.12);
		color: var(--texto-inverso);
		font-size: 1rem;
		cursor: pointer;
	}

	.salir:hover {
		background: rgba(255, 255, 255, 0.24);
	}

	/* Colapsado: dejar espacio solo para los iconos centrados */
	.menu:not(.expandido) .cabecera {
		justify-content: center;
	}

	.menu:not(.expandido) .item {
		justify-content: center;
		padding: 0;
	}

	.menu:not(.expandido) .perfil {
		justify-content: center;
		padding: 0.5rem;
	}

	/* En estado colapsado el pie muestra únicamente el avatar centrado. */
	.menu:not(.expandido) .salir {
		display: none;
	}
</style>
