<script lang="ts">
	/**
	 * Modal: Enviados a facturar.
	 *
	 * Histórico de las facturas que ya salieron de la Bandeja: cuándo, por qué
	 * vía, con qué número, servicio, cantidad de ítems (con detalle al pasar el
	 * mouse) y la adenda.
	 */
	import { onMount } from 'svelte';
	import ModalPanel from './ModalPanel.svelte';
	import { listarFacturas, marcarEnviosVistos, type FacturaListado } from '#lib/servicios-datos-api/index.ts';
	import { formatearFecha, formatearHora } from '#lib/servicios/fechas.ts';
	import { formatearNumero } from '#lib/servicios/numeros.ts';
	import { confirmar } from './confirmacion.svelte.ts';

	interface Props {
		onCerrar: () => void;
	}

	let { onCerrar }: Props = $props();

	let enviadas = $state<FacturaListado[]>([]);
	let cargando = $state(true);
	let error = $state<string | null>(null);
	/** Por defecto solo se muestran los envíos nuevos (no vistos). */
	let verVistos = $state(false);
	let limpiando = $state(false);

	let visibles = $derived(
		verVistos ? enviadas : enviadas.filter((factura) => !factura.facturadoVisto)
	);

	let globo = $state<{ factura: FacturaListado; x: number; y: number; arriba: boolean } | null>(null);

	onMount(() => {
		void cargar();
	});

	async function cargar() {
		cargando = true;
		error = null;
		try {
			const [facturadas, cobradas] = await Promise.all([
				listarFacturas('FACTURADO'),
				listarFacturas('COBRADO')
			]);

			// Los cobrados entran solo si pasaron por el envío (tienen fecha de facturación).
			enviadas = [...facturadas, ...cobradas.filter((factura) => factura.facturadoEn)].sort((a, b) =>
				(b.facturadoEn ?? '').localeCompare(a.facturadoEn ?? '')
			);
		} catch (e) {
			error = (e as Error).message;
		} finally {
			cargando = false;
		}
	}

	function etiquetaVia(via: FacturaListado['facturadoPor']): string {
		const etiquetas = {
			MULTIFACTURACION: 'Multifacturación',
			API: 'API',
			MANUAL: 'Manual'
		} as const;
		return via ? etiquetas[via] ?? via : '—';
	}

	function claseVia(via: FacturaListado['facturadoPor']): string {
		return via ? `via-${via.toLowerCase()}` : 'via-sin';
	}

	function numeroFactura(factura: FacturaListado): string {
		if (!factura.numero) return 'S/N';
		return factura.serie ? `${factura.serie}-${factura.numero}` : factura.numero;
	}

	function formatearImporte(valor: string, moneda: string | null): string {
		const numero = Number(valor);
		if (!Number.isFinite(numero)) return valor;
		const simbolo = moneda === 'USD' ? 'US$' : '$';
		return `${simbolo} ${formatearNumero(numero)}`;
	}

	/** Globo con el detalle de las líneas, posicionado junto al contador. */
	function abrirGlobo(evento: Event, factura: FacturaListado) {
		const rect = (evento.currentTarget as HTMLElement).getBoundingClientRect();
		const ancho = 360;
		const x = Math.max(8, Math.min(rect.left, window.innerWidth - ancho - 16));
		const arriba = rect.bottom + 240 > window.innerHeight;
		globo = { factura, x, y: arriba ? rect.top - 8 : rect.bottom + 8, arriba };
	}

	function cerrarGlobo() {
		globo = null;
	}

	/** Marca los envíos visibles como vistos: dejan de mostrarse. */
	async function limpiar() {
		const ids = visibles.map((factura) => factura.id);
		if (ids.length === 0) return;

		const confirmado = await confirmar({
			titulo: 'Ocultar del histórico',
			mensaje:
				ids.length === 1
					? '¿Ocultar este envío del histórico?'
					: `¿Ocultar los ${ids.length} envíos del histórico?`,
			detalle: 'Los datos no se borran: solo dejan de mostrarse.',
			etiquetaConfirmar: 'Ocultar'
		});
		if (!confirmado) return;

		limpiando = true;
		error = null;
		try {
			await marcarEnviosVistos(ids);
			await cargar();
		} catch (e) {
			error = (e as Error).message;
		} finally {
			limpiando = false;
		}
	}
</script>

{#snippet acciones()}
	<label class="ver-vistos">
		<input type="checkbox" bind:checked={verVistos} />
		Ver también los ya vistos
	</label>
	<button
		type="button"
		class="btn-limpiar"
		disabled={limpiando || visibles.length === 0}
		onclick={limpiar}
	>
		{limpiando ? 'Limpiando…' : `Limpiar (${visibles.length})`}
	</button>
{/snippet}

<ModalPanel
	etiqueta="Bandeja"
	titulo="Enviados a facturar"
	subtitulo="Facturas que ya salieron de la cola, con su fecha, vía y número."
	{onCerrar}
	acciones={acciones}
>
	{#if cargando}
		<p class="estado">Cargando envíos…</p>
	{:else if error}
		<p class="estado error" role="alert">{error}</p>
	{:else if visibles.length === 0}
		<p class="estado">
			{enviadas.length === 0
				? 'Todavía no se envió ninguna factura a facturar.'
				: 'No hay envíos nuevos para revisar. Marcá «Ver también los ya vistos» para consultar el histórico.'}
		</p>
	{:else}
		<table class="tabla">
			<thead>
				<tr>
					<th>Fecha</th>
					<th>Hora</th>
					<th>Vía</th>
					<th>Factura</th>
					<th>Servicio</th>
					<th class="centro">Ítems</th>
					<th>Adenda</th>
				</tr>
			</thead>
			<tbody>
				{#each visibles as factura (factura.id)}
					<tr>
						<td class="ahora">{formatearFecha(factura.facturadoEn) || '—'}</td>
						<td class="ahora">{formatearHora(factura.facturadoEn) || '—'}</td>
						<td>
							<span class="via {claseVia(factura.facturadoPor)}">
								{etiquetaVia(factura.facturadoPor)}
							</span>
						</td>
						<td class="numero">{numeroFactura(factura)}</td>
						<td class="servicio">{factura.contactoFacturacion}</td>
						<td class="centro">
							<button
								type="button"
								class="items"
								aria-label={`Ver el detalle de ${factura.lineas.length} ítems`}
								onmouseenter={(evento) => abrirGlobo(evento, factura)}
								onmouseleave={cerrarGlobo}
								onfocus={(evento) => abrirGlobo(evento, factura)}
								onblur={cerrarGlobo}
							>
								{factura.lineas.length}
							</button>
						</td>
						<td class="adenda" title={factura.comentarioGeneral ?? ''}>
							{factura.comentarioGeneral ?? '—'}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</ModalPanel>

{#if globo}
	<div
		class="globo"
		class:arriba={globo.arriba}
		style="left: {globo.x}px; top: {globo.y}px"
		role="tooltip"
	>
		<header>
			<strong>{globo.factura.contactoFacturacion}</strong>
			<span>{globo.factura.lineas.length} {globo.factura.lineas.length === 1 ? 'ítem' : 'ítems'}</span>
		</header>
		<table>
			<thead>
				<tr>
					<th>Código</th>
					<th>Detalle</th>
					<th class="centro">Cant.</th>
					<th class="der">Precio</th>
				</tr>
			</thead>
			<tbody>
				{#each globo.factura.lineas as linea (linea.id)}
					<tr>
						<td class="codigo">{linea.codigo}</td>
						<td class="detalle">{linea.detalle || linea.descripcion}</td>
						<td class="centro">{formatearNumero(linea.cantidad)}</td>
						<td class="der">{formatearImporte(linea.importeUnitario, globo.factura.moneda)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<style>
	.estado {
		margin: 2rem 0;
		text-align: center;
		font-size: 0.78rem;
		color: var(--texto-suave);
	}

	.estado.error {
		color: var(--peligro-texto);
	}

	.ver-vistos {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-right: auto;
		font-size: 0.68rem;
		color: var(--texto-suave);
		cursor: pointer;
	}

	.ver-vistos input {
		accent-color: var(--foco);
	}

	.btn-limpiar {
		padding: 0.45rem 0.9rem;
		border: 1px solid var(--peligro-borde);
		border-radius: 0.55rem;
		background: var(--peligro-tenue);
		color: var(--peligro-texto);
		font: inherit;
		font-size: 0.7rem;
		font-weight: 700;
		cursor: pointer;
	}

	.btn-limpiar:hover:not(:disabled) {
		background: var(--peligro-tenue);
	}

	.btn-limpiar:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.tabla {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.72rem;
	}

	.tabla th {
		position: sticky;
		top: 0;
		z-index: 1;
		padding: 0.5rem 0.55rem;
		border-bottom: 1px solid var(--borde-suave);
		background: var(--superficie-suave);
		color: var(--texto-suave);
		font-size: 0.58rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		text-align: left;
		white-space: nowrap;
	}

	.tabla td {
		padding: 0.45rem 0.55rem;
		border-bottom: 1px solid var(--borde-suave);
		color: var(--texto);
		vertical-align: middle;
	}

	.tabla tbody tr:hover {
		background: var(--fila-hover-fondo, var(--superficie-alta));
	}

	.centro {
		text-align: center;
	}

	.der {
		text-align: right;
	}

	.ahora,
	.numero {
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}

	.servicio {
		font-weight: 700;
		color: var(--texto);
	}

	.adenda {
		max-width: 22rem;
		color: var(--texto-suave);
		display: -webkit-box;
		line-clamp: 2;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.via {
		display: inline-block;
		padding: 0.1rem 0.45rem;
		border: 1px solid transparent;
		border-radius: 0.45rem;
		font-size: 0.58rem;
		font-weight: 800;
		white-space: nowrap;
	}

	.via-multifacturacion {
		border-color: var(--primario-borde);
		background: var(--primario-tenue);
		color: var(--primario-texto);
	}

	.via-api {
		border-color: var(--exito-borde);
		background: var(--exito-tenue);
		color: var(--exito-texto);
	}

	.via-manual {
		border-color: var(--alerta-borde);
		background: var(--alerta-tenue);
		color: var(--alerta-texto);
	}

	.via-sin {
		border-color: var(--borde-suave);
		background: var(--superficie-alta);
		color: var(--texto-suave);
	}

	.items {
		display: inline-grid;
		place-items: center;
		min-width: 1.7rem;
		padding: 0.1rem 0.4rem;
		border: 1px solid var(--borde-suave);
		border-radius: 0.45rem;
		background: var(--superficie);
		color: var(--primario-texto);
		font: inherit;
		font-weight: 800;
		cursor: help;
	}

	.items:hover,
	.items:focus {
		border-color: var(--primario-borde);
		background: var(--primario-tenue);
		outline: none;
	}

	.globo {
		position: fixed;
		z-index: 100;
		width: 22rem;
		max-height: 18rem;
		overflow: auto;
		padding: 0.55rem 0.65rem;
		border: 1px solid var(--borde-suave);
		border-radius: 0.6rem;
		background: var(--superficie);
		box-shadow: 0 18px 40px rgba(19, 27, 56, 0.25);
	}

	.globo.arriba {
		transform: translateY(-100%);
	}

	.globo header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.35rem;
	}

	.globo header strong {
		font-size: 0.66rem;
		color: var(--texto);
	}

	.globo header span {
		font-size: 0.56rem;
		color: var(--texto-suave);
	}

	.globo table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.6rem;
	}

	.globo th {
		padding: 0.2rem 0.25rem;
		border-bottom: 1px solid var(--borde-suave);
		color: var(--texto-suave);
		font-size: 0.52rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		text-align: left;
		white-space: nowrap;
	}

	.globo td {
		padding: 0.22rem 0.25rem;
		border-bottom: 1px solid var(--borde-suave);
		color: var(--texto);
		vertical-align: top;
	}

	.globo .codigo {
		white-space: nowrap;
		font-weight: 700;
	}

	.globo .detalle {
		color: var(--texto-suave);
	}
</style>
