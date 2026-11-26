<script lang="ts">
	/**
	 * Componente: ModalDocumento.
	 *
	 * Modal único para editar una plantilla o una factura completa:
	 * cabecera, campos auxiliares de EFactura y líneas de facturación. Cada
	 * campo guarda al salir (blur) o al cambiar (select), así lo que se ve en el
	 * modal es lo que quedó persistido.
	 *
	 * Alta y baja de líneas son inmediatas y definitivas: las maneja el padre
	 * contra la API (POST/DELETE).
	 */
	import CampoArticulo from './CampoArticulo.svelte';
	import { iconos } from './iconos.ts';
	import { confirmar } from './confirmacion.svelte.ts';
	import type {
		Articulo,
		CampoDocumento,
		CambiosLineaDocumento,
		DocumentoEditable,
		LineaDocumento
	} from './documento.ts';
	import { formatearFecha, parsearFecha } from '#lib/servicios/fechas.ts';
	import { formatearNumero } from '#lib/servicios/numeros.ts';

	interface Props {
		documento: DocumentoEditable;
		articulos: Articulo[];
		opcionesMoneda: string[];
		opcionesComprobante: string[];
		opcionesPrecio: string[];
		soloLectura?: boolean;
		ocupado?: boolean;
		error?: string | null;
		onCerrar: () => void;
		onCabecera: (campo: CampoDocumento, valor: string | number | null) => void;
		onLinea: (lineaId: number, cambios: CambiosLineaDocumento) => void;
		onAgregar: (datos: {
			codigo: string;
			cantidad: number;
			importeUnitario: number;
			detalle?: string | null;
			comentario?: string | null;
		}) => void;
		onEliminar: (lineaId: number) => void;
		/** Datos de contexto de solo lectura (gestión, cliente, cobranza, etc.). */
		etiquetas?: { etiqueta: string; valor: string }[];
		/** La plantilla no maneja fecha: la define el envío al Facturador. */
		mostrarFecha?: boolean;
		/** Acciones extra del pie (solo en el Facturador). */
		onMarcarPendiente?: () => void;
		onEliminarDocumento?: () => void;
	}

	let {
		documento,
		articulos,
		opcionesMoneda,
		opcionesComprobante,
		opcionesPrecio,
		soloLectura = false,
		ocupado = false,
		error = null,
		onCerrar,
		onCabecera,
		onLinea,
		onAgregar,
		onEliminar,
		etiquetas = [],
		mostrarFecha = true,
		onMarcarPendiente,
		onEliminarDocumento
	}: Props = $props();

	// Alta de línea: borrador local hasta que se agrega.
	let nuevoCodigo = $state('');
	let nuevaCantidad = $state('1');
	let nuevoImporte = $state('0');
	let claveAlta = $state(0);
	let errorAlta = $state<string | null>(null);

	let total = $derived(
		documento.lineas.reduce((suma, linea) => {
			const cantidad = Number(linea.cantidad);
			const importe = Number(linea.importeUnitario);
			if (!Number.isFinite(cantidad) || !Number.isFinite(importe)) return suma;
			return suma + cantidad * importe;
		}, 0)
	);

	let simbolo = $derived(documento.moneda === 'USD' ? 'US$' : '$');

	function formatearImporte(valor: number): string {
		return `${simbolo} ${formatearNumero(valor)}`;
	}

	/** Guarda un texto al salir, solo si cambió. */
	function guardarTexto(campo: CampoDocumento, valor: string, original: string | null) {
		if (soloLectura) return;
		const limpio = valor.trim();
		if (limpio === (original ?? '').trim()) return;
		onCabecera(campo, limpio === '' ? null : limpio);
	}

	/** Guarda una fecha dd/mm/aaaa al salir. */
	function guardarFecha(valor: string, original: string | null) {
		if (soloLectura) return;
		if (valor.trim() === formatearFecha(original)) return;
		const fecha = parsearFecha(valor);
		if (fecha.error) {
			errorAlta = fecha.error;
			return;
		}
		onCabecera('fecha', fecha.iso);
	}

	/** Guarda la UTE fecha de vencimiento (dd/mm/aaaa). */
	function guardarVencimiento(valor: string, original: string | null) {
		if (soloLectura) return;
		if (valor.trim() === formatearFecha(original)) return;
		const fecha = parsearFecha(valor);
		if (fecha.error) {
			errorAlta = fecha.error;
			return;
		}
		onCabecera('uteVencimiento', fecha.iso);
	}

	function guardarNumeroTexto(
		campo: 'cantidad' | 'importeUnitario' | 'detalle',
		lineaId: number,
		valor: string,
		original: string | null
	) {
		if (soloLectura) return;
		if (campo === 'detalle') {
			const limpio = valor.trim();
			if (limpio === (original ?? '').trim()) return;
			onLinea(lineaId, { detalle: limpio === '' ? null : limpio });
			return;
		}
		const numero = Number(valor.replace(',', '.'));
		if (!Number.isFinite(numero) || numero < 0) {
			errorAlta = 'El valor debe ser un número mayor o igual a 0';
			return;
		}
		if (numero === Number(original)) return;
		onLinea(lineaId, campo === 'cantidad' ? { cantidad: numero } : { importeUnitario: numero });
	}

	function agregarLinea() {
		errorAlta = null;
		const codigo = nuevoCodigo.trim();
		if (!codigo) {
			errorAlta = 'Escribí el código del artículo';
			return;
		}
		const cantidad = Number(nuevaCantidad.replace(',', '.'));
		const importe = Number(nuevoImporte.replace(',', '.'));
		if (!Number.isFinite(cantidad) || cantidad < 0) {
			errorAlta = 'La cantidad debe ser un número mayor o igual a 0';
			return;
		}
		if (!Number.isFinite(importe) || importe < 0) {
			errorAlta = 'El importe debe ser un número mayor o igual a 0';
			return;
		}

		onAgregar({ codigo, cantidad, importeUnitario: importe });
		nuevoCodigo = '';
		nuevaCantidad = '1';
		nuevoImporte = '0';
		claveAlta += 1;
	}

	/** Duplica una línea existente como una línea nueva al final. */
	function copiarLinea(linea: LineaDocumento) {
		if (soloLectura || ocupado) return;
		errorAlta = null;
		const cantidad = Number(linea.cantidad);
		const importe = Number(linea.importeUnitario);
		if (!Number.isFinite(cantidad) || !Number.isFinite(importe)) {
			errorAlta = 'La línea tiene valores inválidos y no se puede copiar';
			return;
		}
		onAgregar({
			codigo: linea.codigo,
			cantidad,
			importeUnitario: importe,
			detalle: linea.detalle,
			comentario: linea.comentario
		});
	}

	async function confirmarBaja(linea: LineaDocumento) {
		if (soloLectura) return;
		if (documento.lineas.length <= 1) {
			errorAlta = 'El documento tiene que tener al menos una línea';
			return;
		}
		const confirmado = await confirmar({
			titulo: 'Eliminar línea',
			mensaje: `¿Eliminar definitivamente la línea ${linea.codigo}? Esta acción no se puede deshacer.`,
			tono: 'peligro',
			etiquetaConfirmar: 'Eliminar'
		});
		if (confirmado) onEliminar(linea.id);
	}
</script>

<svelte:window
	onkeydown={(evento) => {
		if (evento.key === 'Escape') {
			evento.preventDefault();
			onCerrar();
		}
	}}
/>

<div
	class="fondo-modal"
	role="presentation"
	onclick={onCerrar}
	onkeydown={(evento) => {
		if (evento.key === 'Escape') onCerrar();
	}}
>
	<div
		class="modal"
		role="dialog"
		aria-modal="true"
		aria-label={`Editar ${documento.titulo}`}
		tabindex="-1"
		onclick={(evento) => evento.stopPropagation()}
		onkeydown={(evento) => {
			if (evento.key === 'Escape') onCerrar();
		}}
	>
		<header class="modal-cabecera">
			<div>
				<h2>{documento.titulo}</h2>
				<p class="subtitulo">{documento.subtitulo}</p>
			</div>
			<button type="button" class="btn-cerrar" aria-label="Cerrar" onclick={onCerrar}>×</button>
		</header>

		<div class="modal-cuerpo">
			{#if error}
				<p class="mensaje error" role="alert">{error}</p>
			{/if}
			{#if errorAlta}
				<p class="mensaje error" role="alert">{errorAlta}</p>
			{/if}

			{#if etiquetas.length > 0}
				<div class="etiquetas">
					{#each etiquetas as etiqueta (etiqueta.etiqueta)}
						<span class="etiqueta-info"><b>{etiqueta.etiqueta}</b> {etiqueta.valor}</span>
					{/each}
				</div>
			{/if}

			<section class="bloque">
				<h3>Datos de facturación</h3>
				<div class="grilla">
					{#if mostrarFecha}
						<label class="campo">
							<span>Fecha</span>
							<input
								type="text"
								inputmode="numeric"
								value={formatearFecha(documento.fecha)}
								disabled={soloLectura}
								placeholder="dd/mm/aaaa"
								onblur={(evento) => guardarFecha(evento.currentTarget.value, documento.fecha)}
							/>
						</label>
					{/if}

					<label class="campo">
						<span>Tipo de comprobante</span>
						<select
							value={documento.tipoComprobante ?? ''}
							disabled={soloLectura}
							onchange={(evento) => onCabecera('tipoComprobante', evento.currentTarget.value || null)}
						>
							<option value="">Sin comprobante</option>
							{#each opcionesComprobante as comprobante}
								<option value={comprobante}>{comprobante}</option>
							{/each}
						</select>
					</label>

					<label class="campo">
						<span>Tipo de precio</span>
						<select
							value={documento.tipoPrecio ?? ''}
							disabled={soloLectura}
							onchange={(evento) => onCabecera('tipoPrecio', evento.currentTarget.value || null)}
						>
							<option value="">Sin precio</option>
							{#each opcionesPrecio as precio}
								<option value={precio}>{precio}</option>
							{/each}
						</select>
					</label>

					<label class="campo">
						<span>Serie</span>
						<input
							type="text"
							value={documento.serie ?? ''}
							disabled={soloLectura}
							onblur={(evento) => guardarTexto('serie', evento.currentTarget.value, documento.serie)}
						/>
					</label>

					<label class="campo">
						<span>Moneda</span>
						<select
							value={documento.moneda ?? ''}
							disabled={soloLectura}
							onchange={(evento) => onCabecera('moneda', evento.currentTarget.value || null)}
						>
							{#each opcionesMoneda as moneda}
								<option value={moneda}>{moneda}</option>
							{/each}
						</select>
					</label>
				</div>

				<label class="campo">
					<span>Adenda / comentario general</span>
					<textarea
						rows="2"
						disabled={soloLectura}
						value={documento.comentarioGeneral ?? ''}
						onblur={(evento) =>
							guardarTexto('comentarioGeneral', evento.currentTarget.value, documento.comentarioGeneral)}
					></textarea>
				</label>
			</section>

			<section class="bloque">
				<h3>Líneas de facturación</h3>
				<div class="tabla-lineas">
					<div class="fila-linea cabecera">
						<span>Código</span>
						<span>Detalle</span>
						<span class="numero">Cantidad</span>
						<span class="numero">Importe</span>
						<span aria-hidden="true"></span>
					</div>

					{#each documento.lineas as linea (linea.id)}
						<div class="fila-linea">
							<span class="celda-codigo">
								<CampoArticulo
									codigo={linea.codigo}
									{articulos}
									disabled={soloLectura}
									ariaLabel={`Código de la línea ${linea.codigo}`}
									oncommit={(codigo) => onLinea(linea.id, { codigo })}
								/>
							</span>
							<span>
								<input
									type="text"
									class="entrada"
									value={linea.detalle ?? ''}
									disabled={soloLectura}
									placeholder={linea.descripcion}
									onblur={(evento) =>
										guardarNumeroTexto('detalle', linea.id, evento.currentTarget.value, linea.detalle)}
								/>
							</span>
							<span>
								<input
									type="text"
									class="entrada numero"
									inputmode="decimal"
									value={linea.cantidad}
									disabled={soloLectura}
									onblur={(evento) =>
										guardarNumeroTexto('cantidad', linea.id, evento.currentTarget.value, linea.cantidad)}
								/>
							</span>
							<span>
								<input
									type="text"
									class="entrada numero"
									inputmode="decimal"
									value={linea.importeUnitario}
									disabled={soloLectura}
									onblur={(evento) =>
										guardarNumeroTexto(
											'importeUnitario',
											linea.id,
											evento.currentTarget.value,
											linea.importeUnitario
										)}
								/>
							</span>
							<span class="acciones">
								<button
									type="button"
									class="btn-copiar"
									aria-label={`Copiar la línea ${linea.codigo}`}
									title="Copiar línea"
									disabled={soloLectura || ocupado}
									onclick={() => copiarLinea(linea)}
								>
									{@html iconos.copiar}
								</button>
								<button
									type="button"
									class="btn-baja"
									aria-label={`Eliminar la línea ${linea.codigo}`}
									title="Eliminar línea definitivamente"
									disabled={soloLectura || ocupado}
									onclick={() => confirmarBaja(linea)}
								>
									×
								</button>
							</span>
						</div>
					{/each}
				</div>

				{#if !soloLectura}
					<div class="alta">
						<strong>Agregar línea</strong>
						<div class="alta-grilla">
							<div class="campo-alta">
								{#key claveAlta}
									<CampoArticulo
										codigo={nuevoCodigo}
										{articulos}
										disabled={ocupado}
										ariaLabel="Código de la nueva línea"
										oncommit={(codigo) => (nuevoCodigo = codigo)}
									/>
								{/key}
							</div>
							<input
								type="text"
								class="entrada numero"
								inputmode="decimal"
								bind:value={nuevaCantidad}
								aria-label="Cantidad de la nueva línea"
								placeholder="Cantidad"
							/>
							<input
								type="text"
								class="entrada numero"
								inputmode="decimal"
								bind:value={nuevoImporte}
								aria-label="Importe unitario de la nueva línea"
								placeholder="Importe"
							/>
							<button type="button" class="btn-agregar" disabled={ocupado} onclick={agregarLinea}>
								Agregar
							</button>
						</div>
					</div>
				{/if}
			</section>

			<section class="bloque auxiliares">
				<h3>Campos auxiliares</h3>
				<p class="ayuda">Se envían a EFactura y no se imprimen en el cuerpo de la factura.</p>
				<div class="grilla">
					<label class="campo">
						<span>EFactura: ID Compra</span>
						<input
							type="text"
							maxlength="80"
							value={documento.idCompra ?? ''}
							disabled={soloLectura}
							onblur={(evento) => guardarTexto('idCompra', evento.currentTarget.value, documento.idCompra)}
						/>
					</label>

					<label class="campo">
						<span>UTE fecha vencimiento</span>
						<input
							type="text"
							inputmode="numeric"
							value={formatearFecha(documento.uteVencimiento)}
							disabled={soloLectura}
							placeholder="dd/mm/aaaa"
							onblur={(evento) =>
								guardarVencimiento(evento.currentTarget.value, documento.uteVencimiento)}
						/>
					</label>

					<label class="campo">
						<span>Detalle</span>
						<input
							type="text"
							value={documento.detalleAuxiliar ?? ''}
							disabled={soloLectura}
							onblur={(evento) =>
								guardarTexto('detalleAuxiliar', evento.currentTarget.value, documento.detalleAuxiliar)}
						/>
					</label>

					<label class="campo">
						<span>Información adicional</span>
						<input
							type="text"
							value={documento.informacionAdicional ?? ''}
							disabled={soloLectura}
							onblur={(evento) =>
								guardarTexto(
									'informacionAdicional',
									evento.currentTarget.value,
									documento.informacionAdicional
								)}
						/>
					</label>
				</div>
			</section>
		</div>

		<footer class="modal-pie">
			<span class="total">Total: <strong>{formatearImporte(total)}</strong></span>
			<div class="acciones-pie">
				{#if onMarcarPendiente}
					<button type="button" class="btn-pie" disabled={ocupado} onclick={onMarcarPendiente}>
						Marcar pendiente
					</button>
				{/if}
				{#if onEliminarDocumento}
					<button type="button" class="btn-pie peligro" disabled={ocupado} onclick={onEliminarDocumento}>
						Eliminar factura
					</button>
				{/if}
				<button type="button" class="btn-cerrar-pie" onclick={onCerrar}>Cerrar</button>
			</div>
		</footer>
	</div>
</div>

<style>
	.fondo-modal {
		position: fixed;
		inset: 0;
		z-index: 70;
		display: grid;
		place-items: center;
		padding: 1.2rem;
		background: var(--velo-modal);
	}

	.modal {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		width: min(64rem, 100%);
		max-height: 92vh;
		border-radius: 1rem;
		background: var(--modal-fondo);
		box-shadow: var(--sombra-modal);
	}

	.modal-cabecera {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid var(--borde-suave);
	}

	.modal-cabecera h2 {
		margin: 0;
		font-size: 0.98rem;
		color: var(--texto);
	}

	.subtitulo {
		margin: 0.15rem 0 0;
		font-size: 0.66rem;
		color: var(--texto-suave);
	}

	.btn-cerrar,
	.btn-cerrar-pie {
		border: 1px solid var(--borde-suave);
		border-radius: 0.5rem;
		background: var(--superficie);
		color: var(--texto-suave);
		cursor: pointer;
	}

	.btn-cerrar {
		width: 1.8rem;
		height: 1.8rem;
		font-size: 1rem;
		line-height: 1;
	}

	.btn-cerrar-pie {
		padding: 0.4rem 0.9rem;
		font-size: 0.72rem;
	}

	.modal-cuerpo {
		display: grid;
		gap: 1rem;
		padding: 1rem 1.25rem;
		overflow-y: auto;
	}

	.bloque {
		display: grid;
		gap: 0.55rem;
		padding: 0.8rem 0.9rem;
		border: 1px solid var(--borde-suave);
		border-radius: 0.7rem;
		background: var(--superficie-alta);
	}

	.bloque h3 {
		margin: 0;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--texto-suave);
	}

	.bloque.auxiliares {
		background: var(--primario-tenue);
		border-color: var(--primario-borde);
	}

	.ayuda {
		margin: 0;
		font-size: 0.6rem;
		color: var(--texto-suave);
	}

	.grilla {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: minmax(0, 1fr);
		gap: 0.55rem;
	}

	@media (max-width: 60rem) {
		.grilla {
			grid-auto-flow: row;
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	.campo {
		display: grid;
		gap: 1px;
		min-width: 0;
	}

	.campo > span {
		font-size: 0.6rem;
		font-weight: 800;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--texto-suave);
	}

	.entrada,
	.campo input,
	.campo select,
	.campo textarea {
		width: 100%;
		min-width: 0;
		padding: 0.3rem 0.45rem;
		border: 1px solid var(--borde-suave);
		border-radius: 0.4rem;
		background: var(--superficie);
		color: var(--texto);
		font: inherit;
		font-size: 0.72rem;
	}

	.campo select {
		border-color: var(--borde);
		border-radius: 0.55rem;
		appearance: none;
		padding-right: 1.6rem;
		background-image: var(--chevron-select);
		background-repeat: no-repeat;
		background-position: right 0.4rem center;
		background-size: 0.6rem;
	}

	.campo textarea {
		resize: vertical;
	}

	.entrada.numero {
		text-align: right;
	}

	.mensaje.error {
		margin: 0;
		padding: 0.5rem 0.65rem;
		border-radius: 0.45rem;
		background: var(--peligro-tenue);
		color: var(--peligro-texto);
		font-size: 0.68rem;
	}

	.etiquetas {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}

	.etiqueta-info {
		padding: 0.15rem 0.45rem;
		border: 1px solid var(--borde-suave);
		border-radius: 0.4rem;
		background: var(--superficie-alta);
		color: var(--texto-suave);
		font-size: 0.58rem;
	}

	.etiqueta-info b {
		color: var(--texto);
	}

	.tabla-lineas {
		display: grid;
		gap: 0.2rem;
	}

	.fila-linea {
		display: grid;
		grid-template-columns: 1.4fr 1.7fr 0.6fr 0.85fr 2.9rem;
		gap: 0.35rem;
		align-items: start;
	}

	.fila-linea.cabecera {
		align-items: center;
		font-size: 0.56rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--texto-suave);
	}

	.fila-linea.cabecera .numero {
		text-align: right;
	}

	.celda-codigo {
		min-width: 0;
	}

	.acciones {
		display: flex;
		justify-content: center;
		gap: 0.2rem;
		padding-top: 0.15rem;
	}

	.btn-copiar {
		display: grid;
		place-items: center;
		width: 1.3rem;
		height: 1.3rem;
		padding: 0;
		border: 1px solid var(--borde-suave);
		border-radius: 0.35rem;
		background: var(--superficie-alta);
		color: var(--primario-texto);
		font-size: 0.7rem;
		cursor: pointer;
	}

	.btn-copiar:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.btn-baja {
		width: 1.3rem;
		height: 1.3rem;
		border: 1px solid var(--peligro-borde);
		border-radius: 0.35rem;
		background: var(--peligro-tenue);
		color: var(--peligro-texto);
		font-size: 0.8rem;
		line-height: 1;
		cursor: pointer;
	}

	.btn-baja:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.alta {
		display: grid;
		gap: 0.4rem;
		margin-top: 0.4rem;
		padding-top: 0.6rem;
		border-top: 1px dashed var(--borde-suave);
	}

	.alta > strong {
		font-size: 0.62rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--texto-suave);
	}

	.alta-grilla {
		display: grid;
		grid-template-columns: 1.6fr 0.7fr 0.9fr auto;
		gap: 0.35rem;
		align-items: start;
	}

	.campo-alta {
		min-width: 0;
	}

	.btn-agregar {
		padding: 0.32rem 0.8rem;
		border: 1px solid var(--primario);
		border-radius: 0.45rem;
		background: var(--primario);
		color: var(--texto-inverso);
		font-size: 0.68rem;
		font-weight: 600;
		cursor: pointer;
	}

	.btn-agregar:disabled {
		opacity: 0.6;
		cursor: default;
	}

	.modal-pie {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.85rem 1.25rem;
		border-top: 1px solid var(--borde-suave);
	}

	.total {
		font-size: 0.72rem;
		color: var(--texto-suave);
	}

	.total strong {
		color: var(--texto);
	}

	.acciones-pie {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.btn-pie {
		padding: 0.4rem 0.85rem;
		border: 1px solid var(--borde-suave);
		border-radius: 0.5rem;
		background: var(--superficie);
		color: var(--texto-suave);
		font-size: 0.72rem;
		cursor: pointer;
	}

	.btn-pie.peligro {
		border-color: var(--peligro-borde);
		background: var(--peligro-tenue);
		color: var(--peligro-texto);
	}

	.btn-pie:disabled,
	.btn-cerrar-pie:disabled {
		opacity: 0.6;
		cursor: default;
	}
</style>
