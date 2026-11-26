<script lang="ts">
	/**
	 * Componente: ChipSelect.
	 *
	 * Chip con forma de píldora que abre un desplegable con buscador. Muestra la
	 * ABREVIATURA del valor elegido (o el texto si no tiene) y en la lista
	 * muestra siempre el nombre completo.
	 */
	interface Opcion {
		valor: string;
		etiqueta: string;
		abreviatura?: string | null;
	}

	interface Props {
		valor: string;
		opciones: Opcion[];
		placeholder: string;
		/** Etiqueta visible arriba del control en la variante normal. */
		etiqueta?: string;
		variante?: 'comprobante' | 'moneda' | 'precio';
		/** `compacto` para celdas de tabla; `normal` para barras de filtros. */
		tamano?: 'compacto' | 'normal';
		onchange: (valor: string) => void;
		disabled?: boolean;
		ariaLabel?: string;
	}

	let {
		valor,
		opciones,
		placeholder,
		etiqueta = placeholder,
		variante = 'comprobante',
		tamano = 'compacto',
		onchange,
		disabled = false,
		ariaLabel = placeholder
	}: Props = $props();

	let abierto = $state(false);
	let busqueda = $state('');
	let contenedor: HTMLDivElement | undefined = $state();

	let seleccionada = $derived(opciones.find((opcion) => opcion.valor === valor) ?? null);
	let texto = $derived(seleccionada ? seleccionada.abreviatura || seleccionada.etiqueta : placeholder);

	let filtradas = $derived.by(() => {
		const textoBusqueda = busqueda.trim().toLowerCase();
		if (!textoBusqueda) return opciones;
		return opciones.filter(
			(opcion) =>
				opcion.etiqueta.toLowerCase().includes(textoBusqueda) ||
				(opcion.abreviatura ?? '').toLowerCase().includes(textoBusqueda)
		);
	});

	function alternar() {
		if (disabled) return;
		abierto = !abierto;
		busqueda = '';
	}

	function elegir(opcion: Opcion) {
		abierto = false;
		onchange(opcion.valor);
	}
</script>

<svelte:window
	onclick={(evento) => {
		if (abierto && contenedor && !contenedor.contains(evento.target as Node)) abierto = false;
	}}
/>

<div class="envoltorio {tamano}" bind:this={contenedor}>
	{#if tamano === 'normal'}<span class="etiqueta">{etiqueta}</span>{/if}
	<div class="control">
		<button
			type="button"
			class="chip {tamano === 'compacto' ? variante : ''} {tamano}"
			class:abierto
			disabled={disabled}
			onclick={alternar}
			aria-label={ariaLabel}
			aria-expanded={abierto}
			aria-haspopup="listbox"
			title={seleccionada ? `${ariaLabel}: ${seleccionada.etiqueta}` : ariaLabel}
		>
			<span class="texto">{texto}</span>
			<svg class="flecha" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M6 9l6 6 6-6" />
			</svg>
		</button>

		{#if abierto}
			<div class="menu">
				{#if opciones.length > 6}
					<input bind:value={busqueda} placeholder="Buscar…" aria-label="Buscar en la lista" />
				{/if}
				<ul>
					{#each filtradas as opcion (opcion.valor)}
						<li>
							<button type="button" class:activa={opcion.valor === valor} onclick={() => elegir(opcion)}>
								{opcion.etiqueta}
							</button>
						</li>
					{:else}
						<li class="vacio">Sin coincidencias</li>
					{/each}
				</ul>
			</div>
		{/if}
	</div>
</div>

<style>
	.envoltorio {
		position: relative;
		display: inline-block;
	}

	.envoltorio.normal {
		display: grid;
		gap: 1px;
		min-width: 7rem;
	}

	.control {
		position: relative;
		display: inline-block;
	}

	.envoltorio.normal .control {
		display: block;
	}

	.etiqueta {
		color: var(--texto-suave);
		font-size: 0.6rem;
		font-weight: 800;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		max-width: 9rem;
		padding: 0.16rem 0.45rem 0.16rem 0.55rem;
		border: 1px solid;
		border-radius: 999px;
		background: transparent;
		font: inherit;
		font-size: 0.6rem;
		font-weight: 700;
		line-height: 1.2;
		white-space: nowrap;
		cursor: pointer;
	}

	/* Barra de filtros: etiqueta arriba y caja tipo select. */
	.chip.normal {
		width: 100%;
		height: 2.5rem;
		max-width: none;
		justify-content: space-between;
		gap: 0.4rem;
		padding: 0 0.7rem 0 0.75rem;
		border-color: var(--borde);
		border-radius: 0.7rem;
		background: var(--superficie);
		color: var(--texto);
		font-size: 0.74rem;
		font-weight: 600;
	}

	.chip.normal .texto {
		text-align: left;
	}

	.chip.normal .flecha {
		opacity: 0.6;
	}

	.chip.normal.abierto {
		border-color: var(--primario);
		box-shadow: 0 0 0 1px var(--primario-borde);
	}

	.texto {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.flecha {
		flex: 0 0 auto;
		width: 0.6rem;
		height: 0.6rem;
		opacity: 0.75;
		transition: transform 0.15s ease;
	}

	.chip.abierto .flecha {
		transform: rotate(180deg);
	}

	/* Colores explícitos: el texto tiene que verse sobre el fondo claro. */
	.chip.comprobante {
		border-color: var(--info-borde);
		background: var(--info-tenue);
		color: var(--info-texto);
	}
	.chip.moneda {
		border-color: var(--exito-borde);
		background: var(--exito-tenue);
		color: var(--exito-texto);
	}
	.chip.precio {
		border-color: var(--alerta-borde);
		background: var(--alerta-tenue);
		color: var(--alerta-texto);
	}
	.chip:disabled {
		opacity: 0.75;
		cursor: default;
	}
	.chip:focus-visible {
		outline: 2px solid var(--foco);
		outline-offset: 2px;
	}

	.menu {
		position: absolute;
		top: calc(100% + 0.25rem);
		left: 0;
		z-index: 60;
		display: grid;
		gap: 0.3rem;
		width: 15rem;
		padding: 0.4rem;
		border: 1px solid var(--borde);
		border-radius: 0.6rem;
		background: var(--superficie);
		box-shadow: 0 14px 30px rgba(30, 43, 96, 0.18);
	}

	.menu input {
		width: 100%;
		padding: 0.35rem 0.45rem;
		border: 1px solid var(--borde);
		border-radius: 0.45rem;
		background: var(--superficie-alta);
		color: var(--texto);
		font: inherit;
		font-size: 0.68rem;
	}

	.menu ul {
		display: grid;
		gap: 0;
		max-height: 12rem;
		margin: 0;
		padding: 0;
		overflow: auto;
		list-style: none;
	}

	.menu li + li {
		border-top: var(--lista-linea-grosor, 1px) solid var(--lista-linea-color, var(--borde-suave));
	}

	.menu li button {
		display: block;
		width: 100%;
		padding: 0.35rem 0.45rem;
		border: 0;
		border-radius: 0.4rem;
		background: transparent;
		color: var(--texto);
		text-align: left;
		font: inherit;
		font-size: 0.68rem;
		cursor: pointer;
	}
	.menu li button:hover,
	.menu li button.activa {
		background: var(--primario-tenue);
		color: var(--primario-texto);
	}
	.menu li.vacio {
		padding: 0.35rem 0.45rem;
		color: var(--texto-suave);
		font-size: 0.66rem;
		text-align: center;
	}
</style>
