<script lang="ts">
	import { iconos } from '#lib/componentes/iconos.ts';
	import { iniciales, type Usuario } from '#lib/servicios/sesion.ts';
	import CampanaNotificaciones from './CampanaNotificaciones.svelte';

	/**
	 * Capa: Componentes — Banner superior.
	 *
	 * Barra superior presente en todas las pantallas del área autenticada.
	 * Muestra la marca a la izquierda y, a la derecha, la campana general de
	 * notificaciones y el avatar circular de perfil.
	 */
	interface Props {
		usuario: Usuario | null;
	}

	let { usuario }: Props = $props();
</script>

<header class="banner">
	<div class="marca">
		<span class="logo">{@html iconos.rayo}</span>
		<span class="nombre">FacturaPro</span>
		<span class="suite">CFDI 4.0 SUITE</span>
	</div>

	<div class="acciones">
		{#if usuario}
			<CampanaNotificaciones />
		{/if}

		<span class="avatar" title="Perfil">{iniciales(usuario)}</span>
	</div>
</header>

<style>
	.banner {
		position: sticky;
		top: 0;
		z-index: 40;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		height: 3.75rem;
		padding: 0 1.25rem;
		background: var(--superficie);
		border-bottom: 1px solid var(--gris-200, var(--borde-suave));
	}

	.marca {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.logo {
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		border-radius: 0.55rem;
		background: var(--indigo-600, var(--primario));
		color: var(--texto-inverso);
		font-size: 1.1rem;
	}

	.nombre {
		font-weight: 700;
		letter-spacing: -0.01em;
	}

	.suite {
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		color: var(--gris-500, var(--texto-suave));
	}

	.acciones {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.avatar {
		display: grid;
		place-items: center;
		width: 2.4rem;
		height: 2.4rem;
		border-radius: 50%;
		background: var(--indigo-600, var(--primario));
		color: var(--texto-inverso);
		font-size: 0.85rem;
		font-weight: 700;
		cursor: default;
	}
</style>
