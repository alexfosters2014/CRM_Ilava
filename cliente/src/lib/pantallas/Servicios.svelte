<script lang="ts">
	import { onMount } from 'svelte';
	import { iconos } from '#lib/componentes/iconos.ts';
	import ModalPanel from '#lib/componentes/ModalPanel.svelte';
	import { confirmar } from '#lib/componentes/confirmacion.svelte.ts';
	import {
		actualizarServicio,
		agregarEmailsServicio,
		cambiarUsoEmail,
		eliminarEmailServicio,
		importarServiciosDesdeArchivo,
		listarCatalogos,
		listarEmailsServicio,
		listarGruposCobranza,
		listarServicios,
		unificarEmailsServicio,
		type Catalogos,
		type EmailServicio,
		type GrupoCobranzaAdmin,
		type ModoEmails,
		type ResumenImportacionServicios,
		type ServicioListado,
		type TipoNumeracion,
		type UsoEmail
	} from '#lib/servicios-datos-api/index.ts';
	import {
		descargarPlantillaServicios,
		type ParametrosPlantillaServicios
	} from '#lib/servicios/importacion.ts';

	/**
	 * Pantalla: Servicios.
	 *
	 * Tabla con los servicios (contactos facturables), switch de
	 * habilitado/deshabilitado, edición por modal e importación desde su propio
	 * Excel. La importación no duplica y no auto-crea catálogos.
	 */

	let busqueda = $state('');
	let servicios = $state<ServicioListado[]>([]);
	let catalogos = $state<Catalogos | null>(null);
	let gruposCobranza = $state<GrupoCobranzaAdmin[]>([]);
	let cargando = $state(true);
	let importando = $state(false);
	let guardando = $state(false);
	let error = $state<string | null>(null);
	let resumen = $state<ResumenImportacionServicios | null>(null);
	let inputArchivo: HTMLInputElement | undefined = $state();
	let modalImportacion = $state(false);
	let limiteFilas = $state(100);

	let editando = $state<ServicioListado | null>(null);
	let edicion = $state({
		nombreFantasia: '',
		numeracion: '',
		tipoNumeracion: 'SIN_NUMERACION' as TipoNumeracion,
		grupoId: 0,
		grupoCobranzaId: '' as number | '',
		cantidadDiasVencimiento: 30,
		celular: '',
		comentarioGestionFacturacion: ''
	});

	// Emails del servicio: se guardan al instante, no con el botón Guardar.
	let emails = $state<EmailServicio[]>([]);
	let modoEmails = $state<ModoEmails>('VACIO');
	let cargandoEmails = $state(false);
	let guardandoEmail = $state(false);
	let errorEmails = $state<string | null>(null);
	let mensajeEmails = $state('');
	let nuevoEmail = $state('');
	let nuevoUso = $state<UsoEmail>('COBRANZA');

	const textoModo: Record<ModoEmails, string> = {
		VACIO: 'Sin emails',
		COMPARTIDO: 'Mismo listado para facturación y cobranza',
		SEPARADO: 'Listados separados',
		MIXTO: 'Listado mixto'
	};

	onMount(() => {
		void cargar();
	});

	async function cargar() {
		cargando = true;
		error = null;
		try {
			const [datos, catalogosApi, gruposApi] = await Promise.all([
				listarServicios(),
				listarCatalogos(),
				listarGruposCobranza()
			]);
			servicios = datos;
			catalogos = catalogosApi;
			gruposCobranza = gruposApi;
		} catch (e) {
			error = (e as Error).message;
		} finally {
			cargando = false;
		}
	}

	let visibles = $derived(
		servicios.filter((servicio) => {
			const texto = `${servicio.contactoFacturacion} ${servicio.nombreFantasia ?? ''} ${servicio.numeracion ?? ''} ${servicio.grupoNombre} ${servicio.tipoGestion} ${servicio.tipoCliente} ${servicio.modalidadCobranza} ${servicio.tipoGestionFacturacion}`.toLowerCase();
			return texto.includes(busqueda.trim().toLowerCase());
		})
	);
	let serviciosMostrados = $derived(visibles.slice(0, limiteFilas));

	async function importar(evento: Event) {
		const entrada = evento.currentTarget as HTMLInputElement;
		const archivo = entrada.files?.[0];
		if (!archivo) return;

		importando = true;
		error = null;
		resumen = null;
		try {
			resumen = await importarServiciosDesdeArchivo(archivo);
			await cargar();
		} catch (e) {
			error = (e as Error).message;
		} finally {
			importando = false;
			entrada.value = '';
		}
	}

	function abrirImportacion() {
		modalImportacion = true;
	}

	function cerrarImportacion() {
		modalImportacion = false;
	}

	/** Cierra el modal y delega en el selector de archivo del sistema. */
	function elegirArchivo() {
		modalImportacion = false;
		inputArchivo?.click();
	}

	function parametrosPlantilla(): ParametrosPlantillaServicios | null {
		if (!catalogos) return null;
		const activos = (lista: { nombre: string; activo?: boolean }[]) =>
			lista.filter((item) => item.activo !== false).map((item) => item.nombre);
		return {
			grupo: activos(catalogos.grupos),
			tipoGestion: activos(catalogos.tiposGestion),
			tipoCliente: activos(catalogos.tiposCliente),
			modalidadCobranza: activos(catalogos.modalidadesCobranza),
			gestionFacturacion: activos(catalogos.tiposGestionFacturacion)
		};
	}

	function descargarModelo() {
		const parametros = parametrosPlantilla();
		if (!parametros) {
			error = 'Los catálogos todavía se están cargando. Intentá de nuevo en un momento.';
			return;
		}
		error = null;
		descargarPlantillaServicios(parametros);
	}

	async function alternarHabilitado(servicio: ServicioListado, habilitado: boolean) {
		guardando = true;
		error = null;
		try {
			await actualizarServicio(servicio.id, { habilitado });
			await cargar();
		} catch (e) {
			error = (e as Error).message;
		} finally {
			guardando = false;
		}
	}

	function abrirEdicion(servicio: ServicioListado) {
		editando = servicio;
		emails = [];
		modoEmails = 'VACIO';
		nuevoEmail = '';
		nuevoUso = 'COBRANZA';
		errorEmails = null;
		mensajeEmails = '';
		void cargarEmails(servicio.id);
		edicion = {
			nombreFantasia: servicio.nombreFantasia ?? '',
			numeracion: servicio.numeracion ?? '',
			tipoNumeracion: servicio.tipoNumeracion as TipoNumeracion,
			grupoId: servicio.grupoId,
			grupoCobranzaId: servicio.grupoCobranzaId ?? '',
			cantidadDiasVencimiento: servicio.cantidadDiasVencimiento ?? 30,
			celular: servicio.celular ?? '',
			comentarioGestionFacturacion: servicio.comentarioGestionFacturacion ?? ''
		};
	}

	async function guardarEdicion() {
		if (!editando) return;
		guardando = true;
		error = null;
		try {
			const numeracionLimpia = edicion.numeracion.trim();
			await actualizarServicio(editando.id, {
				nombreFantasia: edicion.nombreFantasia.trim() || null,
				numeracion: numeracionLimpia || null,
				tipoNumeracion: numeracionLimpia ? edicion.tipoNumeracion : 'SIN_NUMERACION',
				grupoId: edicion.grupoId,
				grupoCobranzaId: edicion.grupoCobranzaId === '' ? null : Number(edicion.grupoCobranzaId),
				cantidadDiasVencimiento: Math.min(365, Math.max(0, Math.trunc(Number(edicion.cantidadDiasVencimiento) || 0))),
				celular: edicion.celular.trim() || null,
				comentarioGestionFacturacion: edicion.comentarioGestionFacturacion.trim() || null
			});
			editando = null;
			await cargar();
		} catch (e) {
			error = (e as Error).message;
		} finally {
			guardando = false;
		}
	}

	async function cargarEmails(servicioId: number) {
		cargandoEmails = true;
		try {
			const datos = await listarEmailsServicio(servicioId);
			// Si el usuario ya abrió otro servicio, no pisar la vista.
			if (editando?.id !== servicioId) return;
			emails = datos.emails;
			modoEmails = datos.modo;
		} catch (e) {
			errorEmails = (e as Error).message;
		} finally {
			cargandoEmails = false;
		}
	}

	async function refrescarEmails() {
		if (!editando) return;
		await cargarEmails(editando.id);
	}

	async function agregarEmail() {
		if (!editando || !nuevoEmail.trim() || guardandoEmail) return;
		guardandoEmail = true;
		errorEmails = null;
		mensajeEmails = '';
		try {
			const resultado = await agregarEmailsServicio(editando.id, nuevoEmail, nuevoUso);
			nuevoEmail = '';
			await refrescarEmails();
			const partes = [`${resultado.agregados} mail${resultado.agregados === 1 ? '' : 's'} agregado${resultado.agregados === 1 ? '' : 's'}`];
			if (resultado.compartidos > 0) partes.push(`${resultado.compartidos} pasó a recibir ambos`);
			if (resultado.existentes > 0) partes.push(`${resultado.existentes} ya estaba registrado`);
			mensajeEmails = partes.join(' · ');
		} catch (e) {
			errorEmails = (e as Error).message;
		} finally {
			guardandoEmail = false;
		}
	}

	async function cambiarDestino(email: EmailServicio, uso: UsoEmail) {
		if (guardandoEmail) return;
		guardandoEmail = true;
		errorEmails = null;
		mensajeEmails = '';
		try {
			await cambiarUsoEmail(email.id, uso);
			await refrescarEmails();
		} catch (e) {
			errorEmails = (e as Error).message;
			// El select ya muestra la opción elegida: recargar la deja en el valor real.
			await refrescarEmails();
		} finally {
			guardandoEmail = false;
		}
	}

	async function quitarEmail(email: EmailServicio) {
		if (guardandoEmail) return;
		const alcance =
			email.uso === 'COMPARTIDO'
				? `${email.email} recibe facturas y estados de cuenta. ¿Eliminarlo de ambos?`
				: `¿Eliminar ${email.email}?`;
		const confirmado = await confirmar({
			titulo: 'Eliminar email',
			mensaje: alcance,
			tono: 'peligro',
			etiquetaConfirmar: 'Eliminar'
		});
		if (!confirmado) return;
		guardandoEmail = true;
		errorEmails = null;
		mensajeEmails = '';
		try {
			await eliminarEmailServicio(email.id);
			await refrescarEmails();
			mensajeEmails = `${email.email} eliminado`;
		} catch (e) {
			errorEmails = (e as Error).message;
		} finally {
			guardandoEmail = false;
		}
	}

	async function unificarListas() {
		if (!editando || guardandoEmail) return;
		const soloUna = emails.filter((email) => email.uso !== 'COMPARTIDO').length;
		const confirmado = await confirmar({
			titulo: 'Unificar listas',
			mensaje: `Los ${emails.length} mails pasan a recibir facturas y estados de cuenta. Se pierde la clasificación actual de ${soloUna} mail(s), no las direcciones.`,
			etiquetaConfirmar: 'Continuar'
		});
		if (!confirmado) return;
		guardandoEmail = true;
		errorEmails = null;
		mensajeEmails = '';
		try {
			const resultado = await unificarEmailsServicio(editando.id);
			await refrescarEmails();
			mensajeEmails = resultado.actualizados > 0
				? `${resultado.actualizados} mail(s) ahora reciben ambos`
				: 'Los mails ya estaban unificados';
		} catch (e) {
			errorEmails = (e as Error).message;
		} finally {
			guardandoEmail = false;
		}
	}
</script>

<svelte:head>
	<title>CRM — Servicios</title>
</svelte:head>

<section class="pantalla">
	<div class="barra-herramientas">
		<label class="buscador">
			<span>{@html iconos.buscar}</span>
			<input bind:value={busqueda} oninput={() => (limiteFilas = 100)} placeholder="Buscar contacto, RUT/CI o grupo..." aria-label="Buscar servicios" />
		</label>
		<div class="controles">
			<span class="leyenda"><i class="punto punto-activo"></i>Habilitado</span>
			<span class="leyenda"><i class="punto punto-inactivo"></i>Deshabilitado</span>
			<button type="button" class="btn-importar" disabled={importando} onclick={abrirImportacion}>
				{importando ? 'Importando…' : 'Importar Excel'}
			</button>
			<input
				bind:this={inputArchivo}
				type="file"
				accept=".xlsx,.xls"
				class="oculto"
				onchange={importar}
				aria-label="Seleccionar planilla de servicios"
			/>
		</div>
	</div>

	{#if error}
		<p class="mensaje error-mensaje" role="alert">{error}</p>
	{/if}
	{#if resumen}
		<p class="mensaje ok-mensaje" role="status">
			Importación completada: {resumen.creados} {resumen.creados === 1 ? 'servicio creado' : 'servicios creados'} de {resumen.filas} filas.
			{#if resumen.duplicados.length > 0}
				· {resumen.duplicados.length} {resumen.duplicados.length === 1 ? 'duplicado omitido' : 'duplicados omitidos'}
			{/if}
		</p>
	{/if}

	{#if cargando}
		<div class="estado-vacio"><p>Cargando servicios…</p></div>
	{:else if visibles.length === 0}
		<div class="estado-vacio">
			<span class="estado-icono">{@html iconos.clientes}</span>
			<h1>{servicios.length === 0 ? 'Sin servicios' : 'Sin resultados'}</h1>
			<p>
				{servicios.length === 0
					? 'Importá el archivo de servicios para dar de alta los contactos facturables.'
					: 'Ajustá la búsqueda.'}
			</p>
			{#if servicios.length === 0}
				<button type="button" class="btn-importar" disabled={importando} onclick={abrirImportacion}>
					Importar Excel
				</button>
			{/if}
		</div>
	{:else}
		<div class="tabla" role="table" aria-label="Servicios">
			<div class="cabecera-tabla" role="row">
				<span>Estado</span>
				<span>Contacto</span>
				<span>RUT/CI</span>
				<span>Grupo</span>
				<span>Gestión</span>
				<span>Cliente</span>
				<span>Cobranza</span>
				<span>Facturación</span>
				<span aria-hidden="true"></span>
			</div>

			{#each serviciosMostrados as servicio, indice (servicio.id)}
				<div class="fila" class:par={indice % 2 === 1} role="row">
					<span class="celda">
						<label class="switch" title={servicio.habilitado ? 'Deshabilitar servicio' : 'Habilitar servicio'}>
							<input
								type="checkbox"
								checked={servicio.habilitado}
								disabled={guardando}
								onchange={(evento) => alternarHabilitado(servicio, evento.currentTarget.checked)}
								aria-label={`Habilitado: ${servicio.contactoFacturacion}`}
							/>
							<span class="pista"></span>
						</label>
					</span>

					<span class="celda">
						<strong class="contacto">{servicio.contactoFacturacion}</strong>
						{#if servicio.nombreFantasia}<span class="meta">{servicio.nombreFantasia}</span>{/if}
					</span>

					<span class="celda">
						{#if servicio.numeracion}
							<span class="numeracion">{servicio.numeracion}</span>
							<span class="meta">{servicio.tipoNumeracion}</span>
						{:else}
							<span class="meta">SIN_NUMERACION</span>
						{/if}
					</span>

					<span class="celda">
						{servicio.grupoNombre}
						{#if servicio.grupoCobranza}<span class="meta">Cobranza: {servicio.grupoCobranza}</span>{/if}
					</span>
					<span class="celda">{servicio.tipoGestion}</span>
					<span class="celda">{servicio.tipoCliente}</span>
					<span class="celda">{servicio.modalidadCobranza}</span>
					<span class="celda">
						{servicio.tipoGestionFacturacion}
						{#if servicio.comentarioGestionFacturacion}
							<span class="meta" title={servicio.comentarioGestionFacturacion}>{servicio.comentarioGestionFacturacion}</span>
						{/if}
					</span>

					<span class="celda acciones-fila">
						<button
							type="button"
							class="btn-icono"
							aria-label={`Editar ${servicio.contactoFacturacion}`}
							title="Editar servicio"
							onclick={() => abrirEdicion(servicio)}
						>
							{@html iconos.lapiz}
						</button>
					</span>
				</div>
			{/each}
		</div>
		{#if serviciosMostrados.length < visibles.length}
			<div class="paginacion-servicios">
				<span>Mostrando {serviciosMostrados.length} de {visibles.length} servicios</span>
				<button type="button" class="btn-secundario" onclick={() => (limiteFilas += 100)}>Mostrar 100 más</button>
			</div>
		{/if}
	{/if}

	<!-- Modal de edición del servicio -->
	{#if editando}
		<div
			class="fondo-modal"
			role="presentation"
			tabindex="-1"
			onclick={() => (editando = null)}
			onkeydown={(evento) => {
				if (evento.key === 'Escape') editando = null;
			}}
		>
			<div
				class="modal"
				role="dialog"
				aria-modal="true"
				tabindex="-1"
				aria-label="Editar servicio"
				onclick={(evento) => evento.stopPropagation()}
				onkeydown={(evento) => evento.stopPropagation()}
			>
				<header class="modal-cabecera">
					<div>
						<h2>{editando.contactoFacturacion}</h2>
						<p class="meta">RUT/CI y datos del servicio</p>
					</div>
					<button type="button" class="btn-cerrar" aria-label="Cerrar" onclick={() => (editando = null)}>×</button>
				</header>

				<div class="modal-cuerpo">
					<label class="campo">
						<span>Nombre de fantasía</span>
						<input bind:value={edicion.nombreFantasia} placeholder="Opcional" />
					</label>
					<div class="campos-en-linea">
						<label class="campo">
							<span>RUT/CI</span>
							<input bind:value={edicion.numeracion} placeholder="Sin numeración" />
						</label>
						<label class="campo">
							<span>Tipo</span>
							<select bind:value={edicion.tipoNumeracion}>
								<option value="RUT">RUT</option>
								<option value="CEDULA">CEDULA</option>
								<option value="OTROS">OTROS</option>
								<option value="SIN_NUMERACION">SIN_NUMERACION</option>
							</select>
						</label>
					</div>
					<label class="campo">
						<span>Grupo de facturación</span>
						<select bind:value={edicion.grupoId}>
							{#each (catalogos?.grupos ?? []).filter((grupo) => grupo.activo || grupo.id === edicion.grupoId) as grupo}
								<option value={grupo.id}>{grupo.nombre}</option>
							{/each}
						</select>
					</label>
					<label class="campo">
						<span>Grupo de cobranza</span>
						<select bind:value={edicion.grupoCobranzaId}>
							<option value="">Sin grupo</option>
							{#each gruposCobranza.filter((grupo) => grupo.activo || grupo.id === edicion.grupoCobranzaId) as grupo}
								<option value={grupo.id}>{grupo.nombre}</option>
							{/each}
						</select>
					</label>
					<label class="campo">
						<span>Días de vencimiento</span>
						<input type="number" min="0" max="365" step="1" bind:value={edicion.cantidadDiasVencimiento} />
						<small>Días entre la emisión y el vencimiento (plazo de pago).</small>
					</label>
					<label class="campo">
						<span>Celular WhatsApp</span>
						<input bind:value={edicion.celular} placeholder="099 123 456" inputmode="tel" />
						<small>Móvil uruguayo. Se copia al abrir un seguimiento y es la llave para recibir sus respuestas.</small>
					</label>
					<label class="campo">
						<span>Comentario de gestión de facturación</span>
						<textarea rows="2" bind:value={edicion.comentarioGestionFacturacion} placeholder="Opcional"></textarea>
					</label>

					<div class="seccion-emails">
						<div class="emails-cabecera">
							<h3>Emails</h3>
							<span class="modo-emails" class:compartido={modoEmails === 'COMPARTIDO'} class:mixto={modoEmails === 'MIXTO'}>
								{textoModo[modoEmails]}
							</span>
						</div>
						<p class="ayuda">
							Cada mail define qué recibe. Se guardan al instante; no dependen del botón Guardar.
						</p>

						{#if cargandoEmails}
							<p class="ayuda">Cargando emails…</p>
						{:else}
							{#if emails.length === 0}
								<p class="ayuda">Sin emails registrados para este servicio.</p>
							{:else}
								<ul class="lista-emails">
									{#each emails as email (email.id)}
										<li>
											<span class="email">{email.email}</span>
											<div class="controles-email">
												<select
													value={email.uso}
													disabled={guardandoEmail}
													aria-label={`Destino de ${email.email}`}
													onchange={(evento) => cambiarDestino(email, evento.currentTarget.value as UsoEmail)}
												>
													<option value="COMPARTIDO">Factura y cobranza</option>
													<option value="FACTURACION">Solo facturación</option>
													<option value="COBRANZA">Solo cobranza</option>
												</select>
												<button
													type="button"
													class="btn-quitar-email"
													title="Eliminar email"
													aria-label={`Eliminar ${email.email}`}
													disabled={guardandoEmail}
													onclick={() => quitarEmail(email)}
												>{@html iconos.papelera}</button>
											</div>
										</li>
									{/each}
								</ul>

								{#if emails.length > 1 && emails.some((email) => email.uso !== 'COMPARTIDO')}
									<button type="button" class="btn-unificar" disabled={guardandoEmail} onclick={unificarListas}>
										Unificar listas: todos reciben ambos
									</button>
								{/if}
							{/if}

							<div class="alta-email">
								<input
									bind:value={nuevoEmail}
									placeholder="compras@cliente.com; pagos@cliente.com"
									aria-label="Nuevos emails (separados por punto y coma)"
									onkeydown={(evento) => { if (evento.key === 'Enter') agregarEmail(); }}
								/>
								<select bind:value={nuevoUso} aria-label="Destino de los nuevos emails">
									<option value="COBRANZA">Solo cobranza</option>
									<option value="FACTURACION">Solo facturación</option>
									<option value="COMPARTIDO">Factura y cobranza</option>
								</select>
								<button type="button" class="btn-agregar-email" disabled={guardandoEmail || !nuevoEmail.trim()} onclick={agregarEmail}>Agregar</button>
							</div>
						{/if}

						{#if errorEmails}<p class="aviso error-mensaje">{errorEmails}</p>{/if}
						{#if mensajeEmails}<p class="aviso ok-mensaje">{mensajeEmails}</p>{/if}
					</div>
				</div>

				<footer class="modal-pie">
					<button type="button" class="btn-secundario" onclick={() => (editando = null)} disabled={guardando}>
						Cancelar
					</button>
					<button type="button" class="btn-primario" onclick={guardarEdicion} disabled={guardando}>
						{guardando ? 'Guardando…' : 'Guardar'}
					</button>
				</footer>
			</div>
		</div>
	{/if}

	<!-- Dos caminos: descargar la plantilla con parámetros o importar la planilla. -->
	{#if modalImportacion}
		<ModalPanel
			titulo="Importar servicios"
			subtitulo="Descargá la plantilla con parámetros o subí tu planilla."
			etiqueta="SERVICIOS"
			compacto
			onCerrar={cerrarImportacion}
		>
			<div class="importar-opciones">
				<button type="button" class="importar-opcion" onclick={descargarModelo}>
					<span class="importar-icono">{@html iconos.descargar}</span>
					<span>
						<strong>Descargar plantilla</strong>
						<small>Datos de ejemplo y hoja Parámetros con los catálogos activos.</small>
					</span>
				</button>
				<button
					type="button"
					class="importar-opcion"
					disabled={importando}
					onclick={elegirArchivo}
				>
					<span class="importar-icono">{@html iconos.clientes}</span>
					<span>
						<strong>Importar planilla</strong>
						<small>Se lee la hoja “Servicios a importar”.</small>
					</span>
				</button>
			</div>
			<p class="importar-nota">
				La hoja <strong>Servicios a importar</strong> es la única que se procesa; <strong>Parámetros</strong>
				es de referencia. Borrá las filas de ejemplo antes de importar.
			</p>
		</ModalPanel>
	{/if}
</section>

<style>
	.pantalla { min-width: 0; color: var(--texto); }
	.barra-herramientas { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1.15rem; padding: 1rem 1.15rem; border: 1px solid var(--borde); border-radius: 1rem; background: var(--superficie-panel); }
	.buscador { display: flex; align-items: center; gap: .65rem; width: min(22rem, 100%); padding: .68rem .8rem; border: 1px solid var(--borde); border-radius: .75rem; background: var(--superficie-alta); color: var(--texto); }
	.buscador span { display: grid; width: 1rem; place-items: center; font-size: .8rem; }
	.buscador input { width: 100%; border: 0; outline: 0; background: transparent; color: var(--texto); font: inherit; font-size: .75rem; }
	.controles { display: flex; align-items: center; gap: 1rem; color: var(--texto-suave); font-size: .68rem; white-space: nowrap; }
	.leyenda { display: inline-flex; align-items: center; gap: .35rem; }
	.punto { width: .62rem; height: .62rem; border-radius: 50%; }
	.punto-activo { background: var(--exito); }
	.punto-inactivo { background: var(--borde-fuerte); }
	.btn-importar { border: 0; border-radius: .7rem; padding: .68rem 1rem; background: var(--primario); color: white; font: inherit; font-size: .72rem; font-weight: 700; cursor: pointer; box-shadow: 0 8px 16px rgba(80,72,245,.25); }
	.btn-importar:disabled { opacity: .6; cursor: progress; }
	.importar-opciones { display: grid; gap: .7rem; }
	.importar-opcion { display: flex; align-items: flex-start; gap: .85rem; width: 100%; padding: .9rem 1rem; border: 1px solid var(--borde); border-radius: .8rem; background: var(--superficie-alta); color: var(--texto); font: inherit; text-align: left; cursor: pointer; transition: border-color 150ms ease, background 150ms ease, box-shadow 150ms ease; }
	.importar-opcion:hover { border-color: var(--primario); background: var(--superficie); box-shadow: 0 8px 18px rgba(80,72,245,.12); }
	.importar-opcion:disabled { opacity: .6; cursor: progress; }
	.importar-icono { display: grid; flex: 0 0 auto; width: 2.2rem; height: 2.2rem; place-items: center; border-radius: .6rem; background: var(--primario-tenue); color: var(--primario-texto); font-size: 1.15rem; }
	.importar-opcion strong { display: block; margin-bottom: .15rem; font-size: .82rem; }
	.importar-opcion small { display: block; color: var(--texto-suave); font-size: .7rem; line-height: 1.4; }
	.importar-nota { margin: .95rem 0 0; padding: .7rem .8rem; border-left: 3px solid var(--primario-borde); border-radius: .45rem; background: var(--superficie-alta); color: var(--texto-suave); font-size: .71rem; line-height: 1.5; }
	.importar-nota strong { color: var(--texto); }
	.oculto { display: none; }
	.mensaje { margin: 0 0 1rem; padding: .7rem .9rem; border-radius: .7rem; font-size: .74rem; }
	.error-mensaje { border: 1px solid var(--peligro-borde); background: var(--peligro-tenue); color: var(--peligro-texto); }
	.ok-mensaje { border: 1px solid var(--exito-borde); background: var(--exito-tenue); color: var(--exito-texto); }
	.tabla { overflow: visible; border: 1px solid var(--borde); border-radius: 1rem 1rem 0 0; background: var(--superficie-panel); box-shadow: 0 12px 30px rgba(49, 64, 129, .08); }
	.paginacion-servicios { display: flex; align-items: center; justify-content: space-between; gap: .8rem; padding: .8rem 1rem; border: 1px solid var(--borde); border-top: 0; border-radius: 0 0 1rem 1rem; background: var(--superficie-alta); color: var(--texto-suave); font-size: .72rem; }
	.cabecera-tabla, .fila { display: grid; grid-template-columns: 4.2rem minmax(15rem, 1.4fr) 9.5rem 7rem 7.5rem 7rem 8.5rem 11rem 3.7rem; align-items: center; }
	.cabecera-tabla { min-height: 3.1rem; padding: 0 .8rem; border-radius: 1rem 1rem 0 0; background: var(--tabla-gradiente); color: white; font-size: .62rem; font-weight: 800; text-transform: uppercase; }
	.cabecera-tabla span:not(:first-child) { padding-left: .45rem; }
	.fila { position: relative; min-height: 3rem; padding: 2px .8rem; border-bottom: 1px solid var(--borde-suave); font-size: .72rem; }
	.fila { background: var(--fila-impar-fondo, var(--superficie)); color: var(--fila-impar-texto, var(--texto)); }
	.fila.par { background: var(--fila-par-fondo, var(--superficie-suave)); color: var(--fila-par-texto, var(--texto)); }
	.fila .celda { padding-left: .45rem; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
	.contacto { display: block; font-weight: 700; font-size: .72rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.numeracion { display: block; font-weight: 600; }
	.meta { display: block; color: var(--texto-suave); font-size: .62rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

	.switch { position: relative; display: inline-block; width: 2.3rem; height: 1.25rem; }
	.switch input { opacity: 0; width: 0; height: 0; }
	.pista { position: absolute; inset: 0; border-radius: 999px; background: var(--borde-fuerte); cursor: pointer; transition: background 150ms ease; }
	.pista::before { content: ''; position: absolute; top: .15rem; left: .18rem; width: .95rem; height: .95rem; border-radius: 50%; background: var(--superficie); box-shadow: 0 1px 3px rgba(15, 23, 42, .35); transition: transform 150ms ease; }
	.switch input:checked + .pista { background: var(--exito); }
	.switch input:checked + .pista::before { transform: translateX(1.05rem); }
	.switch input:focus-visible + .pista { outline: 2px solid var(--foco); outline-offset: 2px; }
	.switch input:disabled + .pista { cursor: progress; opacity: .7; }

	.acciones-fila { position: relative; display: flex; justify-content: center; }
	.btn-icono { display: grid; place-items: center; width: 2.15rem; height: 2.15rem; border: 1px solid var(--borde); border-radius: .65rem; background: transparent; color: var(--texto-suave); font-size: .95rem; cursor: pointer; }
	.btn-icono:hover { background: var(--primario-tenue); border-color: var(--borde-fuerte); color: var(--primario-texto); }

	.estado-vacio { display: grid; place-items: center; gap: .35rem; min-height: 20rem; padding: 2rem; border: 1px solid var(--borde); border-radius: 1rem; background: var(--superficie-panel); text-align: center; }
	.estado-icono { color: var(--primario-texto); font-size: 2rem; } .estado-vacio h1 { margin: .5rem 0 0; font-size: 1.4rem; } .estado-vacio p { color: var(--texto-suave); font-size: .85rem; }

	.fondo-modal { position: fixed; inset: 0; z-index: 70; display: grid; place-items: center; padding: 1.5rem; background: var(--velo-modal); }
	.modal { display: grid; width: min(30rem, 100%); max-height: 88vh; overflow: auto; border-radius: 1rem; background: var(--modal-fondo); box-shadow: var(--sombra-modal); }
	.modal-cabecera { display: flex; align-items: start; justify-content: space-between; gap: 1rem; padding: 1.1rem 1.25rem; border-bottom: 1px solid var(--borde-suave); }
	.modal-cabecera h2 { margin: 0; font-size: .95rem; }
	.btn-cerrar { border: 0; background: transparent; color: var(--texto-suave); font-size: 1.3rem; line-height: 1; cursor: pointer; }
	.modal-cuerpo { display: grid; gap: .85rem; padding: 1.1rem 1.25rem; }
	.campo { display: grid; gap: 1px; }
	.campo span { color: var(--texto-suave); font-size: .6rem; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; }
	.campo input, .campo select, .campo textarea { padding: .55rem .65rem; border: 1px solid var(--borde); border-radius: .7rem; background: var(--superficie); color: var(--texto); font: inherit; font-size: .74rem; }
	.campo select { min-height: 2.5rem; appearance: none; padding-right: 2rem; background-image: var(--chevron-select); background-repeat: no-repeat; background-position: right .7rem center; background-size: .65rem; }
	.campos-en-linea { display: grid; grid-template-columns: 1fr 1fr; gap: .6rem; }
	.modal-pie { display: flex; justify-content: flex-end; gap: .55rem; padding: 1rem 1.25rem; border-top: 1px solid var(--borde-suave); }
	.btn-primario { border: 0; border-radius: .7rem; padding: .62rem 1rem; background: var(--primario); color: var(--texto-inverso); font: inherit; font-size: .72rem; font-weight: 700; cursor: pointer; }
	.btn-secundario { border: 1px solid var(--borde); border-radius: .7rem; padding: .62rem 1rem; background: var(--superficie-alta); color: var(--texto-suave); font: inherit; font-size: .72rem; font-weight: 700; cursor: pointer; }
	.btn-primario:disabled, .btn-secundario:disabled { opacity: .55; cursor: progress; }

	.seccion-emails { display: grid; gap: .55rem; padding: .75rem; border: 1px solid var(--borde-suave); border-radius: .7rem; background: var(--superficie-alta); }
	.emails-cabecera { display: flex; align-items: center; justify-content: space-between; gap: .5rem; }
	.emails-cabecera h3 { margin: 0; font-size: .8rem; color: var(--texto); }
	.modo-emails { padding: .12rem .5rem; border-radius: 999px; background: var(--primario-tenue); color: var(--primario-texto); font-size: .58rem; font-weight: 800; text-align: right; }
	.modo-emails.mixto { background: var(--alerta-tenue); color: var(--alerta-texto); }
	.seccion-emails .ayuda { margin: 0; color: var(--texto-suave); font-size: .64rem; }
	.lista-emails { display: grid; gap: .35rem; margin: 0; padding: 0; list-style: none; }
	.lista-emails li { display: grid; gap: .3rem; padding: .45rem .5rem; border: 1px solid var(--borde-suave); border-radius: .55rem; background: var(--superficie); }
	.lista-emails .email { color: var(--texto); font-size: .72rem; font-weight: 700; overflow-wrap: anywhere; }
	.controles-email { display: flex; align-items: center; gap: .4rem; }
	.controles-email select { flex: 1; padding: .3rem .45rem; border: 1px solid var(--borde); border-radius: .45rem; background: var(--superficie-alta); color: var(--texto); font: inherit; font-size: .66rem; }
	.btn-quitar-email { display: grid; place-items: center; width: 1.7rem; height: 1.7rem; border: 1px solid var(--peligro-borde); border-radius: .45rem; background: var(--peligro-tenue); color: var(--peligro-texto); cursor: pointer; }
	.btn-quitar-email:disabled { opacity: .5; cursor: progress; }
	.btn-unificar { justify-self: start; padding: .4rem .65rem; border: 1px solid var(--primario-borde); border-radius: .5rem; background: var(--primario-tenue); color: var(--primario-texto); font: inherit; font-size: .64rem; font-weight: 700; cursor: pointer; }
	.btn-unificar:disabled { opacity: .55; cursor: progress; }
	.alta-email { display: grid; grid-template-columns: 1fr auto; gap: .4rem; }
	.alta-email input { grid-column: 1 / -1; padding: .45rem .55rem; border: 1px solid var(--borde); border-radius: .5rem; background: var(--superficie); color: var(--texto); font: inherit; font-size: .7rem; }
	.alta-email select { padding: .35rem .45rem; border: 1px solid var(--borde); border-radius: .5rem; background: var(--superficie); color: var(--texto); font: inherit; font-size: .66rem; }
	.btn-agregar-email { padding: .35rem .7rem; border: 0; border-radius: .5rem; background: var(--primario); color: var(--texto-inverso); font: inherit; font-size: .66rem; font-weight: 700; cursor: pointer; }
	.btn-agregar-email:disabled { opacity: .55; cursor: not-allowed; }
	.seccion-emails .aviso { margin: 0; padding: .4rem .55rem; border-radius: .45rem; font-size: .64rem; }

	@media (max-width: 60rem) { .barra-herramientas { align-items: stretch; flex-direction: column; } .tabla { overflow-x: auto; } .cabecera-tabla, .fila { min-width: 68rem; } }
</style>
