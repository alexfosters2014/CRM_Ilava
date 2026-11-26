<script lang="ts">
	/**
	 * Componente: CampoArticulo.
	 *
	 * Input de código de artículo con tres ayudas:
	 * - debajo, en tamaño minúsculo, la descripción del código exacto;
	 * - borde rojo cuando el código tipeado no existe en el catálogo;
	 * - F2 / Ctrl+K abre un panel chico con los códigos para elegir con el
	 *   teclado sin dejar de poder escribirlo a mano.
	 */
	interface Articulo {
		id: number;
		codigo: string;
		descripcion: string;
		activo: boolean;
	}

	interface Props {
		codigo: string;
		articulos: Articulo[];
		disabled?: boolean;
		ariaLabel?: string;
		oncommit?: (codigo: string) => void;
	}

	let {
		codigo,
		articulos,
		disabled = false,
		ariaLabel = 'Código de artículo',
		oncommit
	}: Props = $props();

	// svelte-ignore state_referenced_locally
	let valor = $state(codigo);
	let enfocado = $state(false);
	let panel = $state(false);
	let indice = $state(0);
	let sucio = $state(false);
	// svelte-ignore state_referenced_locally
	let codigoProp = codigo;
	let contenedor: HTMLDivElement | undefined = $state();
	let entrada: HTMLInputElement | undefined = $state();

	// Solo se sincroniza cuando el valor del padre cambia de verdad: así el texto
	// tipeado no parpadea mientras viaja el guardado.
	$effect(() => {
		if (codigo === codigoProp) return;
		codigoProp = codigo;
		if (!enfocado) valor = codigo;
	});

	let activos = $derived(articulos.filter((articulo) => articulo.activo));

	let coincidencia = $derived(
		activos.find(
			(articulo) => articulo.codigo.toLowerCase() === valor.trim().toLowerCase()
		) ?? null
	);

	let inexistente = $derived(valor.trim() !== '' && !coincidencia);

	let sugerencias = $derived.by(() => {
		const texto = valor.trim().toLowerCase();
		const base = texto
			? activos.filter(
					(articulo) =>
						articulo.codigo.toLowerCase().includes(texto) ||
						articulo.descripcion.toLowerCase().includes(texto)
				)
			: activos;
		return base.slice(0, 40);
	});

	function confirmar() {
		if (!sucio) return;
		sucio = false;
		const limpio = valor.trim();
		panel = false;
		if (!limpio || limpio === codigo) return;
		oncommit?.(limpio);
	}

	function elegir(articulo: Articulo) {
		valor = articulo.codigo;
		sucio = false;
		panel = false;
		if (articulo.codigo !== codigo) oncommit?.(articulo.codigo);
	}

	function abrirPanel() {
		if (disabled) return;
		panel = true;
		indice = 0;
		entrada?.focus();
	}

	function alTeclear(evento: KeyboardEvent) {
		if (evento.key === 'F2' || ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 'k')) {
			evento.preventDefault();
			abrirPanel();
			return;
		}

		if (evento.key === 'ArrowDown' && panel) {
			evento.preventDefault();
			indice = Math.min(indice + 1, sugerencias.length - 1);
			return;
		}

		if (evento.key === 'ArrowUp' && panel) {
			evento.preventDefault();
			indice = Math.max(indice - 1, 0);
			return;
		}

		if (evento.key === 'Enter') {
			evento.preventDefault();
			if (panel && sugerencias[indice]) {
				elegir(sugerencias[indice]);
			} else {
				confirmar();
				entrada?.blur();
			}
			return;
		}

		if (evento.key === 'Escape') {
			if (panel) {
				evento.preventDefault();
				evento.stopPropagation();
				panel = false;
			} else {
				valor = codigo;
				sucio = false;
				entrada?.blur();
			}
		}
	}
</script>

<svelte:window
	onclick={(evento) => {
		if (panel && contenedor && !contenedor.contains(evento.target as Node)) panel = false;
	}}
/>

<div class="campo-articulo" bind:this={contenedor}>
	<div class="entrada-envoltorio">
		<input
			bind:this={entrada}
			bind:value={valor}
			class="entrada"
			class:invalido={inexistente}
			disabled={disabled}
			placeholder="Código"
			aria-label={ariaLabel}
			aria-keyshortcuts="F2 Control+K"
			aria-invalid={inexistente}
			autocomplete="off"
			onfocus={() => (enfocado = true)}
			onblur={() => {
				enfocado = false;
				panel = false;
				confirmar();
			}}
			oninput={() => {
				sucio = true;
				panel = true;
				indice = 0;
			}}
			onkeydown={alTeclear}
		/>
		{#if !disabled}
			<button
				type="button"
				class="btn-panel"
				tabindex="-1"
				aria-label="Buscar código de artículo (F2)"
				title="Buscar código (F2)"
				onmousedown={(evento) => {
					evento.preventDefault();
					abrirPanel();
				}}
			>
				⌄
			</button>
		{/if}
	</div>

	<span class="pista" class:invalido={inexistente}>
		{#if inexistente}
			No existe
		{:else if coincidencia}
			{coincidencia.descripcion}
		{:else}
			&nbsp;
		{/if}
	</span>

	{#if panel && !disabled && sugerencias.length > 0}
		<div class="panel" role="listbox" aria-label="Artículos">
			{#each sugerencias as articulo, posicion (articulo.id)}
				<button
					type="button"
					class="opcion"
					class:activa={posicion === indice}
					role="option"
					aria-selected={posicion === indice}
					onmousedown={(evento) => {
						evento.preventDefault();
						elegir(articulo);
					}}
					onmouseenter={() => (indice = posicion)}
				>
					<strong>{articulo.codigo}</strong>
					<span>{articulo.descripcion}</span>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.campo-articulo {
		position: relative;
		display: grid;
		gap: 0.1rem;
		min-width: 0;
	}

	.entrada-envoltorio {
		display: flex;
		align-items: center;
		gap: 0.15rem;
	}

	.entrada {
		width: 100%;
		min-width: 0;
		padding: 0.3rem 0.4rem;
		border: 1px solid var(--borde-suave);
		border-radius: 0.4rem;
		background: var(--superficie);
		color: var(--texto);
		font: inherit;
		font-size: 0.72rem;
	}

	.entrada:focus {
		outline: none;
		border-color: var(--primario);
		box-shadow: 0 0 0 2px rgba(79, 99, 210, 0.15);
	}

	.entrada.invalido {
		border-color: var(--peligro);
		box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.12);
	}

	.btn-panel {
		flex: 0 0 auto;
		width: 1.1rem;
		height: 1.3rem;
		padding: 0;
		border: 1px solid var(--borde-suave);
		border-radius: 0.3rem;
		background: var(--superficie-alta);
		color: var(--texto-suave);
		font-size: 0.6rem;
		line-height: 1;
		cursor: pointer;
	}

	.btn-panel:hover {
		background: var(--primario-tenue);
	}

	.pista {
		font-size: 0.55rem;
		line-height: 1.2;
		color: var(--texto-suave);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.pista.invalido {
		color: var(--peligro-texto);
		font-weight: 600;
	}

	.panel {
		position: absolute;
		z-index: 40;
		top: calc(100% - 0.15rem);
		left: 0;
		width: 15rem;
		max-height: 12rem;
		overflow-y: auto;
		padding: 0.2rem;
		border: 1px solid var(--borde-suave);
		border-radius: 0.5rem;
		background: var(--superficie);
		box-shadow: 0 12px 30px rgba(19, 27, 56, 0.22);
	}

	.opcion {
		display: grid;
		width: 100%;
		padding: 0.25rem 0.35rem;
		border: 0;
		border-radius: 0.35rem;
		background: transparent;
		text-align: left;
		cursor: pointer;
	}

	.opcion + .opcion {
		border-top: var(--lista-linea-grosor, 1px) solid var(--lista-linea-color, var(--borde-suave));
	}

	.opcion.activa {
		background: var(--primario-tenue);
	}

	.opcion strong {
		font-size: 0.68rem;
		color: var(--texto);
	}

	.opcion span {
		font-size: 0.58rem;
		color: var(--texto-suave);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
