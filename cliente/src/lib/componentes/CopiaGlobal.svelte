<script lang="ts">
	import { onMount } from 'svelte';
	import {
		guardarConfiguracionCobranza,
		obtenerConfiguracionCobranza,
		type ConfiguracionCobranza
	} from '#lib/servicios-datos-api/index.ts';

	/**
	 * Copia global de control interno para los correos de cobranza.
	 *
	 * Se guarda en el servidor y aplica a los envíos individuales y masivos.
	 * `CC` deja la copia visible para el cliente; `CCO` la mantiene oculta.
	 */
	let abierto = $state(true);
	let copiaActiva = $state(false);
	let copiaEmails = $state('');
	let copiaTipo = $state<'CC' | 'CCO'>('CC');
	let guardando = $state(false);
	let error = $state('');
	let aviso = $state('');

	let cantidad = $derived(
		copiaEmails
			.split(/[,;\n]/)
			.map((email) => email.trim())
			.filter(Boolean).length
	);

	onMount(async () => {
		try {
			const config: ConfiguracionCobranza = await obtenerConfiguracionCobranza();
			copiaActiva = config.copiaActiva;
			copiaEmails = config.copiaEmails;
			copiaTipo = config.copiaTipo;
		} catch (e) {
			error = (e as Error).message;
		}
	});

	async function guardar() {
		guardando = true;
		error = '';
		aviso = '';
		try {
			const config = await guardarConfiguracionCobranza({ copiaActiva, copiaEmails, copiaTipo });
			copiaActiva = config.copiaActiva;
			copiaEmails = config.copiaEmails;
			copiaTipo = config.copiaTipo;
			aviso = 'Copia global guardada';
		} catch (e) {
			error = (e as Error).message;
		} finally {
			guardando = false;
		}
	}
</script>

<section class="copia">
	<header>
		<div class="titulo">
			<strong>Copia global de control interno</strong>
			<small>Se aplica a avisos individuales y masivos.</small>
		</div>
		<span class="chip">{copiaTipo} · {cantidad} copia{cantidad === 1 ? '' : 's'}</span>
		<button type="button" class="plegar" onclick={() => (abierto = !abierto)} aria-label={abierto ? 'Colapsar copia global' : 'Expandir copia global'}>
			{abierto ? '⌃' : '⌄'}
		</button>
	</header>

	{#if abierto}
		<div class="cuerpo">
			<label class="check">
				<input type="checkbox" bind:checked={copiaActiva} />
				Activar copia global
			</label>
			<label class="campo-emails">
				<span>Emails de copia</span>
				<input bind:value={copiaEmails} placeholder="control@empresa.com, otro@empresa.com" />
			</label>
			<label class="campo-tipo">
				<span>Tipo de copia</span>
				<select bind:value={copiaTipo}>
					<option value="CC">CC · visible</option>
					<option value="CCO">CCO · oculta</option>
				</select>
			</label>
			<button type="button" class="guardar" onclick={guardar} disabled={guardando}>
				{guardando ? 'Guardando…' : 'Guardar copia global'}
			</button>
			<p class="nota">En modo CC el cliente verá los correos internos copiados. En CCO permanecerán ocultos.</p>
			{#if error}<p class="error" role="alert">{error}</p>{/if}
			{#if aviso}<p class="ok">{aviso}</p>{/if}
		</div>
	{/if}
</section>

<style>
	.copia { border: 1px solid var(--borde-suave); border-radius: .8rem; background: var(--superficie-alta); }
	header { display: flex; align-items: center; gap: .7rem; padding: .7rem .85rem; }
	.titulo { display: grid; gap: .1rem; margin-right: auto; }
	.titulo strong { font-size: .8rem; color: var(--texto); }
	.titulo small { color: var(--texto-suave); font-size: .68rem; }
	.chip { display: inline-flex; padding: .2rem .55rem; border-radius: 999px; background: var(--exito-tenue); color: var(--exito-texto); font-size: .64rem; font-weight: 800; white-space: nowrap; }
	.plegar { border: 1px solid var(--borde); border-radius: .5rem; background: var(--superficie); color: var(--texto-suave); width: 1.8rem; height: 1.8rem; cursor: pointer; }
	.cuerpo { display: grid; gap: .6rem; padding: 0 .85rem .85rem; border-top: 1px solid var(--borde-suave); padding-top: .7rem; }
	.check { display: flex; align-items: center; gap: .45rem; font-size: .74rem; color: var(--texto-suave); }
	.check input { width: 1.15rem; height: 1.15rem; min-width: 1.15rem; accent-color: var(--foco); }
	.campo-emails, .campo-tipo { display: grid; gap: .25rem; font-size: .64rem; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; color: var(--texto-suave); }
	.campo-emails input, .campo-tipo select { border: 1px solid var(--borde); border-radius: .55rem; padding: .55rem .6rem; background: var(--superficie); font: inherit; font-size: .76rem; text-transform: none; letter-spacing: 0; }
	.guardar { justify-self: start; border: 0; border-radius: .6rem; padding: .55rem .9rem; background: var(--primario); color: var(--texto-inverso); font: inherit; font-size: .72rem; font-weight: 750; cursor: pointer; }
	.guardar:disabled { opacity: .6; cursor: progress; }
	.nota { margin: 0; color: var(--texto-suave); font-size: .68rem; }
	.error { margin: 0; color: var(--peligro-texto); font-size: .7rem; }
	.ok { margin: 0; color: var(--exito-texto); font-size: .7rem; }
</style>
