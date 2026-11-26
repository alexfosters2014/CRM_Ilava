<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { iconos } from '#lib/componentes/iconos.ts';
	import { confirmar } from './confirmacion.svelte.ts';
	import {
		actualizarArea,
		actualizarUsuario,
		crearArea,
		crearUsuario,
		darDeBajaArea,
		darDeBajaUsuario,
		listarAreas,
		listarCatalogoPermisos,
		listarUsuarios,
		restaurarArea,
		restaurarUsuario,
		type AreaAdmin,
		type GrupoPermisos,
		type UsuarioAdmin
	} from '#lib/servicios-datos-api/index.ts';

	/**
	 * Panel de administración de usuarios y áreas (Configuración → Usuarios).
	 *
	 * Solo lo ve un ADMIN: la pestaña es `soloAdmin` en el catálogo y la API
	 * vuelve a validar el rol. Los permisos son por pantalla/opción, con
	 * switches; las áreas son organizativas y no otorgan acceso.
	 */

	type Rol = 'ADMIN' | 'OPERADOR';

	interface Formulario {
		modo: 'nuevo' | 'editar';
		id: string | null;
		nombre: string;
		correo: string;
		rol: Rol;
		areaId: number | null;
		pantallas: string[];
	}

	let usuarios = $state<UsuarioAdmin[]>([]);
	let areas = $state<AreaAdmin[]>([]);
	let catalogo = $state<GrupoPermisos[]>([]);
	let incluirInactivos = $state(false);
	let cargando = $state(true);
	let guardando = $state(false);
	let error = $state<string | null>(null);
	let aviso = $state<string | null>(null);
	let formulario = $state<Formulario | null>(null);
	let modalArea = $state<{
		id: number | null;
		nombre: string;
		protegida: boolean;
		activo: boolean;
		usuariosActivos: number;
	} | null>(null);

	const yo = $derived(
		((page.data as unknown as { usuario?: { email?: string } }).usuario?.email ?? '').toLowerCase()
	);

	const hojas = $derived(catalogo.flatMap((grupo) => grupo.hojas));
	const adminsActivos = $derived(
		usuarios.filter((usuario) => usuario.rol === 'ADMIN' && usuario.activo).length
	);
	const esAdminForm = $derived(formulario?.rol === 'ADMIN');

	function etiquetaDe(clave: string): string {
		return hojas.find((hoja) => hoja.clave === clave)?.etiqueta ?? clave;
	}

	async function cargar(): Promise<void> {
		cargando = true;
		error = null;
		try {
			[usuarios, areas, catalogo] = await Promise.all([
				listarUsuarios(incluirInactivos),
				listarAreas(),
				catalogo.length > 0 ? Promise.resolve(catalogo) : listarCatalogoPermisos()
			]);
		} catch (e) {
			error = e instanceof Error ? e.message : 'No se pudieron cargar los usuarios';
		} finally {
			cargando = false;
		}
	}

	onMount(cargar);

	function limpiarMensajes() {
		error = null;
		aviso = null;
	}

	function nuevo(): void {
		limpiarMensajes();
		formulario = {
			modo: 'nuevo',
			id: null,
			nombre: '',
			correo: '',
			rol: 'OPERADOR',
			areaId: areas.find((area) => area.nombre === 'TODOS')?.id ?? null,
			pantallas: hojas.filter((hoja) => hoja.clave === 'inicio').map((hoja) => hoja.clave)
		};
	}

	function editar(usuario: UsuarioAdmin): void {
		limpiarMensajes();
		formulario = {
			modo: 'editar',
			id: usuario.id,
			nombre: usuario.nombre,
			correo: usuario.correo,
			rol: usuario.rol,
			areaId: usuario.area?.id ?? null,
			pantallas: [...usuario.pantallas]
		};
	}

	function cerrarFormulario(): void {
		formulario = null;
	}

	function tiene(clave: string): boolean {
		if (!formulario) return false;
		if (esAdminForm) return true;
		return formulario.pantallas.includes(clave);
	}

	function alternar(clave: string): void {
		if (!formulario || esAdminForm) return;
		formulario.pantallas = formulario.pantallas.includes(clave)
			? formulario.pantallas.filter((item) => item !== clave)
			: [...formulario.pantallas, clave];
	}

	function todasGrupo(grupo: GrupoPermisos): boolean {
		if (esAdminForm) return true;
		return grupo.hojas.every((hoja) => tiene(hoja.clave));
	}

	function alternarGrupo(grupo: GrupoPermisos): void {
		if (!formulario || esAdminForm) return;
		const claves = grupo.hojas.map((hoja) => hoja.clave);
		formulario.pantallas = todasGrupo(grupo)
			? formulario.pantallas.filter((clave) => !claves.includes(clave))
			: [...new Set([...formulario.pantallas, ...claves])];
	}

	function pantallasParaGuardar(): string[] {
		if (esAdminForm) return hojas.map((hoja) => hoja.clave);
		return formulario?.pantallas ?? [];
	}

	async function guardar(): Promise<void> {
		if (!formulario || guardando) return;
		limpiarMensajes();

		if (!formulario.nombre.trim()) {
			error = 'El nombre es obligatorio';
			return;
		}
		if (!formulario.correo.trim()) {
			error = 'El correo es obligatorio';
			return;
		}

		const pantallas = pantallasParaGuardar();
		if (formulario.rol === 'OPERADOR' && pantallas.length === 0) {
			error = 'Un operador necesita al menos una pantalla habilitada';
			return;
		}

		guardando = true;
		try {
			const datos = {
				nombre: formulario.nombre.trim(),
				correo: formulario.correo.trim().toLowerCase(),
				rol: formulario.rol,
				areaId: formulario.areaId,
				pantallas
			};

			if (formulario.modo === 'nuevo') {
				const resultado = await crearUsuario(datos);
				aviso = resultado.reactivado
					? 'El correo pertenecía a un usuario dado de baja: se reactivó con los datos nuevos.'
					: 'Usuario creado. Ya puede ingresar con un código a su correo.';
			} else {
				await actualizarUsuario(formulario.id!, datos);
				aviso = 'Usuario guardado.';
			}

			formulario = null;
			await cargar();
		} catch (e) {
			error = e instanceof Error ? e.message : 'No se pudo guardar el usuario';
		} finally {
			guardando = false;
		}
	}

	async function baja(usuario: UsuarioAdmin): Promise<void> {
		const confirmado = await confirmar({
			titulo: 'Dar de baja usuario',
			mensaje: `¿Dar de baja a ${usuario.correo}?`,
			detalle:
				'No va a poder ingresar y se cierran sus sesiones. La fila se conserva y se puede restaurar.',
			tono: 'peligro',
			etiquetaConfirmar: 'Dar de baja'
		});
		if (!confirmado) return;

		limpiarMensajes();
		try {
			await darDeBajaUsuario(usuario.id);
			aviso = 'Usuario dado de baja.';
			if (formulario?.id === usuario.id) formulario = null;
			await cargar();
		} catch (e) {
			error = e instanceof Error ? e.message : 'No se pudo dar de baja el usuario';
		}
	}

	async function restaurar(usuario: UsuarioAdmin): Promise<void> {
		limpiarMensajes();
		try {
			await restaurarUsuario(usuario.id);
			aviso = 'Usuario restaurado.';
			await cargar();
		} catch (e) {
			error = e instanceof Error ? e.message : 'No se pudo restaurar el usuario';
		}
	}

	function puedeDarDeBaja(usuario: UsuarioAdmin): boolean {
		if (!usuario.activo) return false;
		if (usuario.correo.toLowerCase() === yo) return false;
		if (usuario.rol === 'ADMIN' && adminsActivos <= 1) return false;
		return true;
	}

	// --- Áreas ---------------------------------------------------------------

	function areaSeleccionada(): AreaAdmin | undefined {
		return areas.find((area) => area.id === formulario?.areaId);
	}

	function abrirAreaNueva(): void {
		limpiarMensajes();
		modalArea = { id: null, nombre: '', protegida: false, activo: true, usuariosActivos: 0 };
	}

	function abrirAreaEditar(): void {
		const area = areaSeleccionada();
		if (!area) return;
		limpiarMensajes();
		modalArea = {
			id: area.id,
			nombre: area.nombre,
			protegida: area.protegida,
			activo: area.activo,
			usuariosActivos: area.usuariosActivos
		};
	}

	async function guardarArea(): Promise<void> {
		if (!modalArea || guardando) return;
		limpiarMensajes();

		if (!modalArea.nombre.trim()) {
			error = 'El nombre del área es obligatorio';
			return;
		}

		guardando = true;
		try {
			if (modalArea.id === null) {
				const creada = await crearArea(modalArea.nombre.trim());
				if (formulario) formulario.areaId = creada.id;
				aviso = 'Área creada.';
			} else {
				await actualizarArea(modalArea.id, { nombre: modalArea.nombre.trim() });
				aviso = 'Área renombrada.';
			}
			modalArea = null;
			areas = await listarAreas();
		} catch (e) {
			error = e instanceof Error ? e.message : 'No se pudo guardar el área';
		} finally {
			guardando = false;
		}
	}

	async function bajaArea(): Promise<void> {
		if (!modalArea?.id) return;
		const confirmado = await confirmar({
			titulo: 'Dar de baja área',
			mensaje: `¿Dar de baja el área "${modalArea.nombre}"?`,
			tono: 'peligro',
			etiquetaConfirmar: 'Dar de baja'
		});
		if (!confirmado) return;

		limpiarMensajes();
		guardando = true;
		try {
			await darDeBajaArea(modalArea.id);
			modalArea = null;
			areas = await listarAreas();
			aviso = 'Área dada de baja.';
		} catch (e) {
			error = e instanceof Error ? e.message : 'No se pudo dar de baja el área';
		} finally {
			guardando = false;
		}
	}

	async function restaurarAreaSeleccionada(): Promise<void> {
		if (!modalArea?.id) return;
		limpiarMensajes();
		guardando = true;
		try {
			await restaurarArea(modalArea.id);
			modalArea = null;
			areas = await listarAreas();
			aviso = 'Área restaurada.';
		} catch (e) {
			error = e instanceof Error ? e.message : 'No se pudo restaurar el área';
		} finally {
			guardando = false;
		}
	}
</script>

<div class="panel">
	<div class="barra">
		<label class="check">
			<input type="checkbox" bind:checked={incluirInactivos} onchange={cargar} />
			Incluir dados de baja
		</label>
		<button type="button" class="btn-primario" onclick={nuevo}>
			{@html iconos.mas} Nuevo usuario
		</button>
	</div>

	{#if error}<p class="mensaje error-mensaje" role="alert">{error}</p>{/if}
	{#if aviso}<p class="mensaje ok-mensaje" role="status">{aviso}</p>{/if}

	{#if cargando}
		<div class="estado-vacio"><p>Cargando usuarios…</p></div>
	{:else if usuarios.length === 0}
		<div class="estado-vacio">
			<h1>Sin usuarios</h1>
			<p>Creá el primero con el botón «Nuevo usuario».</p>
		</div>
	{:else}
		<div class="tabla">
			<div class="cabecera">
				<span>Nombre</span>
				<span>Correo</span>
				<span>Área</span>
				<span>Rol</span>
				<span>Pantallas</span>
				<span>Estado</span>
				<span></span>
			</div>
			{#each usuarios as usuario (usuario.id)}
				<div class="fila" class:inactivo={!usuario.activo}>
					<span class="celda nombre">{usuario.nombre || '—'}</span>
					<span class="celda correo" title={usuario.correo}>{usuario.correo}</span>
					<span class="celda">{usuario.area?.nombre ?? '—'}</span>
					<span class="celda"><span class="chip" class:admin={usuario.rol === 'ADMIN'}>{usuario.rol}</span></span>
					<span class="celda" title={usuario.rol === 'ADMIN' ? 'Todas las pantallas' : usuario.pantallas.map(etiquetaDe).join(', ')}>
						{usuario.rol === 'ADMIN' ? 'Todas' : usuario.pantallas.length}
					</span>
					<span class="celda">
						<span class="chip" class:activo={usuario.activo} class:baja={!usuario.activo}>
							{usuario.activo ? 'Activo' : 'Inactivo'}
						</span>
					</span>
					<span class="acciones-fila">
						<button type="button" class="btn-icono" title="Editar" onclick={() => editar(usuario)}>
							{@html iconos.lapiz}
						</button>
						{#if usuario.activo}
							<button
								type="button"
								class="btn-icono peligro"
								title={puedeDarDeBaja(usuario)
									? 'Dar de baja'
									: 'No podés darte de baja a vos mismo ni dejar el sistema sin administradores'}
								disabled={!puedeDarDeBaja(usuario)}
								onclick={() => baja(usuario)}
							>
								{@html iconos.papelera}
							</button>
						{:else}
							<button
								type="button"
								class="btn-icono"
								title="Restaurar"
								onclick={() => restaurar(usuario)}
							>
								{@html iconos.recargar}
							</button>
						{/if}
					</span>
				</div>
			{/each}
		</div>
	{/if}

	{#if formulario}
		<div
			class="fondo-modal"
			role="presentation"
			tabindex="-1"
			onclick={() => {
				if (!guardando) cerrarFormulario();
			}}
			onkeydown={(evento) => {
				if (evento.key === 'Escape' && !guardando) cerrarFormulario();
			}}
		>
			<div
				class="modal modal-usuario"
				role="dialog"
				aria-modal="true"
				tabindex="-1"
				aria-label={formulario.modo === 'nuevo' ? 'Nuevo usuario' : 'Editar usuario'}
				onclick={(evento) => evento.stopPropagation()}
				onkeydown={(evento) => evento.stopPropagation()}
			>
				<header class="modal-cabecera">
					<h2>{formulario.modo === 'nuevo' ? 'Nuevo usuario' : `Editar ${formulario.nombre || formulario.correo}`}</h2>
					<button type="button" class="btn-cerrar" aria-label="Cerrar" onclick={cerrarFormulario}>×</button>
				</header>

				<div class="modal-cuerpo cuerpo-usuario">
					<div class="campos">
				<label class="campo">
					<span>Nombre</span>
					<input bind:value={formulario.nombre} placeholder="Nombre y apellido" />
				</label>
				<label class="campo">
					<span>Correo</span>
					<input
						bind:value={formulario.correo}
						placeholder="persona@vector.com.uy"
						autocomplete="off"
					/>
				</label>
				<label class="campo">
					<span>Rol</span>
					<select bind:value={formulario.rol} disabled={formulario.id !== null && formulario.correo.toLowerCase() === yo}>
						<option value="OPERADOR">Operador</option>
						<option value="ADMIN">Administrador</option>
					</select>
				</label>
				<div class="campo">
					<span>Área</span>
					<div class="area-fila">
						<select bind:value={formulario.areaId}>
							<option value={null}>Sin área</option>
							{#each areas as area (area.id)}
								<option value={area.id}>
									{area.nombre}{area.activo ? '' : ' (dada de baja)'}
								</option>
							{/each}
						</select>
						<button type="button" class="btn-secundario" onclick={abrirAreaNueva}>Nueva</button>
						<button
							type="button"
							class="btn-icono"
							title="Renombrar el área seleccionada"
							disabled={!areaSeleccionada()}
							onclick={abrirAreaEditar}
						>
							{@html iconos.lapiz}
						</button>
					</div>
				</div>
			</div>

			<div class="permisos">
				<div class="permisos-cabecera">
					<h3>Pantallas habilitadas</h3>
					{#if esAdminForm}
						<p class="nota">Un administrador tiene acceso total: los switches no se editan.</p>
					{:else if formulario.pantallas.length === 0}
						<p class="nota alerta">Sin pantallas: el usuario podría ingresar y no ver nada.</p>
					{/if}
				</div>

				<div class="grupos">
					{#each catalogo as grupo (grupo.clave)}
						{#if grupo.hojas.length === 1 && grupo.hojas[0].clave === grupo.clave}
							<label class="switch-linea simple">
								<input
									type="checkbox"
									checked={tiene(grupo.clave)}
									disabled={esAdminForm}
									onchange={() => alternar(grupo.clave)}
								/>
								<span>{grupo.etiqueta}</span>
							</label>
						{:else}
							<fieldset class="grupo">
								<legend>
									<label class="switch-linea">
										<input
											type="checkbox"
											checked={todasGrupo(grupo)}
											disabled={esAdminForm}
											onchange={() => alternarGrupo(grupo)}
										/>
										<strong>{grupo.etiqueta}</strong>
									</label>
								</legend>
								<div class="grupo-hojas">
									{#each grupo.hojas as hoja (hoja.clave)}
										<label class="switch-linea">
											<input
												type="checkbox"
												checked={tiene(hoja.clave)}
												disabled={esAdminForm}
												onchange={() => alternar(hoja.clave)}
											/>
											<span>{hoja.etiqueta}</span>
										</label>
									{/each}
								</div>
							</fieldset>
						{/if}
					{/each}
				</div>
			</div>
				</div>

				<footer class="modal-pie">
				{#if formulario.modo === 'editar' && formulario.id}
					<button
						type="button"
						class="btn-secundario peligro"
						disabled={guardando || !usuarios.find((usuario) => usuario.id === formulario?.id && puedeDarDeBaja(usuario))}
						onclick={() => {
							const usuario = usuarios.find((item) => item.id === formulario?.id);
							if (usuario) void baja(usuario);
						}}
					>
						Dar de baja
					</button>
				{/if}
				<span class="espacio"></span>
				<button type="button" class="btn-secundario" onclick={cerrarFormulario} disabled={guardando}>
					Cancelar
				</button>
				<button type="button" class="btn-primario" onclick={guardar} disabled={guardando}>
					{guardando ? 'Guardando…' : formulario.modo === 'nuevo' ? 'Crear usuario' : 'Guardar cambios'}
				</button>
			</footer>
			</div>
		</div>
	{/if}
</div>

{#if modalArea}
	<div
		class="fondo-modal"
		role="presentation"
		tabindex="-1"
		onclick={() => (modalArea = null)}
		onkeydown={(evento) => {
			if (evento.key === 'Escape') modalArea = null;
		}}
	>
		<div
			class="modal"
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			aria-label="Área"
			onclick={(evento) => evento.stopPropagation()}
			onkeydown={(evento) => evento.stopPropagation()}
		>
			<header class="modal-cabecera">
				<h2>{modalArea.id === null ? 'Nueva área' : 'Editar área'}</h2>
				<button type="button" class="btn-cerrar" aria-label="Cerrar" onclick={() => (modalArea = null)}>×</button>
			</header>

			<div class="modal-cuerpo">
				<label class="campo">
					<span>Nombre</span>
					<input bind:value={modalArea.nombre} placeholder="Cobranzas" />
				</label>
				{#if modalArea.id !== null}
					<p class="nota">
						{modalArea.protegida
							? 'El área TODOS es del sistema: no se puede renombrar ni dar de baja.'
							: modalArea.usuariosActivos > 0
								? `Tiene ${modalArea.usuariosActivos} usuario(s) activo(s): reasignalos antes de darla de baja.`
								: 'Sin usuarios activos: se puede dar de baja.'}
					</p>
				{/if}
			</div>

			<footer class="modal-pie">
				{#if modalArea.id !== null && !modalArea.protegida && modalArea.usuariosActivos === 0}
					<button
						type="button"
						class="btn-secundario peligro"
						disabled={guardando}
						onclick={bajaArea}
					>
						Dar de baja
					</button>
				{/if}
				{#if modalArea.id !== null && !modalArea.activo}
					<button type="button" class="btn-secundario" disabled={guardando} onclick={restaurarAreaSeleccionada}>
						Restaurar
					</button>
				{/if}
				<span class="espacio"></span>
				<button type="button" class="btn-secundario" onclick={() => (modalArea = null)} disabled={guardando}>
					Cancelar
				</button>
				<button type="button" class="btn-primario" onclick={guardarArea} disabled={guardando}>
					{guardando ? 'Guardando…' : 'Guardar'}
				</button>
			</footer>
		</div>
	</div>
{/if}

<style>
	.panel { display: grid; gap: .9rem; color: var(--texto); }
	.barra { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .8rem 1rem; border: 1px solid var(--borde); border-radius: 1rem; background: var(--superficie-panel); }
	.check { display: flex; align-items: center; gap: .45rem; font-size: .72rem; color: var(--texto-suave); }

	.mensaje { margin: 0; padding: .7rem .9rem; border-radius: .7rem; font-size: .74rem; }
	.error-mensaje { border: 1px solid var(--peligro-borde); background: var(--peligro-tenue); color: var(--peligro-texto); }
	.ok-mensaje { border: 1px solid var(--exito-borde); background: var(--exito-tenue); color: var(--exito-texto); }

	.tabla { overflow-x: auto; border: 1px solid var(--borde); border-radius: 1rem; background: var(--superficie-panel); box-shadow: 0 12px 30px rgba(49, 64, 129, .08); }
	.cabecera, .fila { display: grid; grid-template-columns: minmax(9rem, 1.2fr) minmax(12rem, 1.6fr) minmax(7rem, .9fr) 6.5rem 5.5rem 5.5rem 5.4rem; align-items: center; min-width: 56rem; }
	.cabecera { min-height: 2.9rem; padding: 0 .8rem; border-radius: 1rem 1rem 0 0; background: var(--tabla-gradiente); color: var(--texto-inverso); font-size: .62rem; font-weight: 800; text-transform: uppercase; }
	.cabecera span:not(:first-child) { padding-left: .45rem; }
	.fila { min-height: 2.8rem; padding: 2px .8rem; border-bottom: 1px solid var(--borde-suave); font-size: .72rem; background: var(--fila-impar-fondo, var(--superficie)); color: var(--fila-impar-texto, var(--texto)); }
	.fila:nth-child(even) { background: var(--fila-par-fondo, var(--superficie-suave)); color: var(--fila-par-texto, var(--texto)); }
	.fila.inactivo { opacity: .62; }
	.celda { padding-left: .45rem; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.celda.nombre { font-weight: 700; }
	.acciones-fila { display: flex; justify-content: flex-end; gap: .25rem; }

	.chip { display: inline-flex; padding: .18rem .5rem; border-radius: 999px; background: var(--primario-tenue); color: var(--primario-texto); font-size: .62rem; font-weight: 800; }
	.chip.admin { background: var(--primario-tenue); color: var(--primario-texto); }
	.chip.activo { background: var(--exito-tenue); color: var(--exito-texto); }
	.chip.baja { background: var(--peligro-tenue); color: var(--peligro-texto); }

	.btn-primario { display: inline-flex; align-items: center; gap: .35rem; border: 0; border-radius: .7rem; padding: .58rem .9rem; background: var(--primario); color: var(--texto-inverso); font: inherit; font-size: .72rem; font-weight: 700; cursor: pointer; }
	.btn-secundario { border: 1px solid var(--borde); border-radius: .7rem; padding: .55rem .8rem; background: var(--superficie-alta); color: var(--texto-suave); font: inherit; font-size: .72rem; font-weight: 700; cursor: pointer; }
	.btn-secundario.peligro { border-color: var(--peligro-borde); background: var(--peligro-tenue); color: var(--peligro-texto); }
	.btn-icono { display: grid; place-items: center; width: 2.1rem; height: 2.1rem; border: 1px solid var(--borde); border-radius: .6rem; background: transparent; color: var(--texto-suave); font-size: .9rem; cursor: pointer; }
	.btn-icono:hover:not(:disabled) { background: var(--primario-tenue); border-color: var(--borde-fuerte); color: var(--primario-texto); }
	.btn-icono.peligro:hover:not(:disabled) { background: var(--peligro-tenue); border-color: var(--peligro-borde); color: var(--peligro-texto); }
	.btn-icono:disabled, .btn-primario:disabled, .btn-secundario:disabled { opacity: .5; cursor: not-allowed; }

	.estado-vacio { display: grid; place-items: center; min-height: 12rem; border: 1px solid var(--borde); border-radius: 1rem; background: var(--superficie-panel); color: var(--texto-suave); font-size: .85rem; text-align: center; }
	.estado-vacio h1 { margin: 0 0 .3rem; font-size: 1rem; color: var(--texto-suave); }

	.modal.modal-usuario { width: min(72rem, 100%); max-height: 92vh; overflow: auto; }
	.cuerpo-usuario { display: grid; gap: 1rem; padding: 1.1rem 1.25rem; }
	.modal-usuario .campos { grid-template-columns: repeat(4, minmax(0, 1fr)); }
	.btn-cerrar { border: 0; background: transparent; color: var(--texto-suave); font-size: 1.3rem; line-height: 1; cursor: pointer; }

	.campos { display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); gap: .8rem; }
	.campo { display: grid; gap: 1px; }
	.campo > span { color: var(--texto-suave); font-size: .6rem; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; }
	.campo input, .campo select { width: 100%; padding: .55rem .65rem; border: 1px solid var(--borde); border-radius: .7rem; background: var(--superficie); color: var(--texto); font: inherit; font-size: .74rem; }
	.campo select { min-height: 2.5rem; appearance: none; padding-right: 2rem; background-image: var(--chevron-select); background-repeat: no-repeat; background-position: right .7rem center; background-size: .65rem; }
	.area-fila { display: flex; align-items: center; gap: .35rem; }
	.area-fila select { flex: 1; min-width: 0; }

	.permisos { display: grid; gap: .7rem; padding-top: .9rem; border-top: 1px solid var(--borde-suave); }
	.permisos-cabecera h3 { margin: 0; color: var(--texto-suave); font-size: .68rem; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; }
	.nota { margin: .25rem 0 0; color: var(--texto-suave); font-size: .7rem; }
	.nota.alerta { color: var(--alerta-texto); }
	.grupos { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: .7rem; }
	.grupo { margin: 0; padding: .6rem .75rem .7rem; border: 1px solid var(--borde-suave); border-radius: .75rem; background: var(--superficie-alta); }
	.grupo legend { padding: 0 .3rem; }
	.grupo-hojas { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: .3rem .8rem; margin-top: .35rem; }
	.switch-linea { display: flex; align-items: center; gap: .45rem; font-size: .72rem; color: var(--texto); cursor: pointer; }
	.switch-linea.simple { padding: .55rem .75rem; border: 1px solid var(--borde-suave); border-radius: .75rem; background: var(--superficie-alta); }
	.switch-linea input { accent-color: var(--foco); }

	.espacio { flex: 1; }

	.fondo-modal { position: fixed; inset: 0; z-index: 70; display: grid; place-items: center; padding: 1.5rem; background: var(--velo-modal); }
	.modal { display: grid; width: min(26rem, 100%); border-radius: 1rem; background: var(--modal-fondo); box-shadow: var(--sombra-modal); }
	.modal-cabecera { display: flex; align-items: start; justify-content: space-between; gap: 1rem; padding: 1rem 1.2rem; border-bottom: 1px solid var(--borde-suave); }
	.modal-cabecera h2 { margin: 0; font-size: .95rem; }
	.modal-cuerpo { display: grid; gap: .8rem; padding: 1rem 1.2rem; }
	.modal-pie { display: flex; align-items: center; gap: .55rem; padding: .9rem 1.2rem; border-top: 1px solid var(--borde-suave); }
</style>
