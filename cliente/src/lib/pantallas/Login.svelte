<script lang="ts">
	import { onMount } from 'svelte';
	import { Boton, CampoTexto } from '#lib/componentes/index.ts';
	import { iconos } from '#lib/componentes/iconos.ts';
	import { enviarCodigo, entrarConCodigo } from '#lib/servicios-datos-api/index.ts';

	// Pantalla de login por código de 6 dígitos (OTP) enviado al correo.
	// Réplica del diseño: panel oscuro de marca a la izquierda + formulario a la
	// derecha. La card ocupa el 75% del alto de pantalla y la página no hace scroll.
	const CLAVE_CORREO = 'crm:ultimo-email';

	let paso: 'correo' | 'codigo' = $state('correo');
	let correo = $state('');
	let codigo = $state('');
	let cargando = $state(false);
	let error = $state<string | null>(null);
	let aviso = $state<string | null>(null);
	let reenvio = $state(0); // segundos restantes para poder reenviar
	let cajaCodigo: HTMLInputElement | undefined = $state();

	// Recordar el último correo usado: no es una credencial, solo evita tipearlo.
	onMount(() => {
		const guardado = localStorage.getItem(CLAVE_CORREO);
		if (guardado && !correo) correo = guardado;
	});

	// Cuenta atrás para habilitar el reenvío del código.
	$effect(() => {
		if (reenvio <= 0) return;
		const id = setInterval(() => {
			reenvio = reenvio - 1;
		}, 1000);
		return () => clearInterval(id);
	});

	function soloDigitos(valor: string): string {
		return valor.replace(/\D/g, '').slice(0, 6);
	}

	// Cajas visibles del código (6). El input real queda superpuesto y oculto.
	let cajas = $derived(codigo.padEnd(6, ' ').split(''));

	async function pedirCodigo(destino = correo) {
		if (!destino) return;
		cargando = true;
		error = null;
		aviso = null;
		const { error: err } = await enviarCodigo(destino);
		cargando = false;
		if (err) {
			error = err.message ?? 'No se pudo enviar el código.';
			return;
		}
		paso = 'codigo';
		codigo = '';
		reenvio = 60;
		localStorage.setItem(CLAVE_CORREO, destino);
		aviso = `Si ${destino} está registrado, recibirás un código de 6 dígitos.`;
		setTimeout(() => cajaCodigo?.focus(), 50);
	}

	async function verificarCodigo() {
		if (codigo.length !== 6) return;
		cargando = true;
		error = null;
		const { error: err } = await entrarConCodigo(correo, codigo);
		cargando = false;
		if (err) {
			error = err.message ?? 'Código incorrecto o expirado.';
			return;
		}
		// Login OK: recargamos para que el servidor resuelva la sesión y el
		// layout reaccione al usuario autenticado.
		location.href = '/principal';
	}

	function volver() {
		paso = 'correo';
		error = null;
		aviso = null;
		codigo = '';
	}

	function enfocarCajas() {
		cajaCodigo?.focus();
	}
</script>

<section class="pantalla">
	<div class="card">
		<!-- Panel izquierdo: marca -->
		<aside class="marca">
			<div class="marca-top">
				<span class="logo">{@html iconos.rayo}</span>
				<span class="nombre">FacturaPro</span>
			</div>

			<div class="marca-cuerpo">
				<h1>Tu facturación,<br />sin fricción.</h1>
				<p class="lema">
					Accede a tu espacio de emisión fiscal de forma rápida, segura y sin contraseñas que
					recordar.
				</p>

				<ul class="beneficios">
					<li><span class="b-ico">{@html iconos.candado}</span> Acceso protegido con código de un solo uso</li>
					<li><span class="b-ico">{@html iconos.rayo}</span> Sesión cifrada de extremo a extremo</li>
					<li><span class="b-ico">{@html iconos.centro}</span> Disponible para todos tus comprobantes</li>
				</ul>
			</div>

			<footer class="marca-pie">FacturaPro · CFDI 4.0 Suite · V2.0</footer>
		</aside>

		<!-- Panel derecho: formulario -->
		<main class="form-panel">
			<div class="form-caja">
				<p class="cejilla">Acceso seguro</p>

				{#if paso === 'correo'}
					<h2>Introduce tu correo</h2>
					<p class="ayuda">
						Te enviamos un código de 6 dígitos a tu correo registrado. Escribí tu dirección para
						comenzar.
					</p>

					<form
						onsubmit={(e) => {
							e.preventDefault();
							pedirCodigo();
						}}
					>
						<div class="campo-correo">
							<span class="c-ico">{@html iconos.correo}</span>
							<input
								type="email"
								bind:value={correo}
								placeholder="tu@correo.com"
								autocomplete="email"
								required
							/>
						</div>

						{#if error}<p class="error">{error}</p>{/if}

						<Boton deshabilitado={cargando || !correo}>
							{cargando ? 'Enviando…' : 'Enviar código'}
						</Boton>
					</form>

					<p class="pie-nota">{@html iconos.candado} Tus datos están protegidos y nunca compartimos tu correo.</p>
				{:else}
					<h2>Introduce tu código</h2>
					<p class="ayuda">
						Hemos enviado un código de 6 dígitos a tu correo. Usalos para continuar.
					</p>

					<div class="chip-correo">
						<span class="c-ico">{@html iconos.correo}</span>
						<span>{correo}</span>
						<button type="button" class="cambiar" onclick={volver}>Cambiar</button>
					</div>

					{#if aviso}<p class="aviso">{aviso}</p>{/if}

					<form
						onsubmit={(e) => {
							e.preventDefault();
							verificarCodigo();
						}}
					>
						<label class="etiqueta-codigo" for="campo-codigo">Código de acceso</label>

						<div class="cajas" onclick={enfocarCajas} onkeydown={enfocarCajas} role="button" tabindex="-1">
							{#each cajas as c, i (i)}
								<span class="caja" class:llena={c !== ' '}>{c === ' ' ? '·' : c}</span>
							{/each}
							<input
								bind:this={cajaCodigo}
								bind:value={codigo}
								oninput={(e) => (codigo = soloDigitos(e.currentTarget.value))}
								inputmode="numeric"
								autocomplete="one-time-code"
								maxlength="6"
								id="campo-codigo"
								aria-label="Código de 6 dígitos"
							/>
						</div>

						<p class="caduca">El código caduca en 5 minutos.</p>

						{#if error}<p class="error">{error}</p>{/if}

						<Boton deshabilitado={cargando || codigo.length !== 6}>
							{cargando ? 'Verificando…' : 'Continuar'}
						</Boton>
					</form>

					<p class="reenviar">
						¿No recibiste el código?
						<button
							type="button"
							class="enlace"
							disabled={reenvio > 0 || cargando}
							onclick={() => pedirCodigo(correo)}
						>
							{reenvio > 0 ? `Reenviar en ${String(reenvio).padStart(2, '0')}s` : 'Reenviar código'}
						</button>
					</p>

					<button type="button" class="enlace volver" onclick={volver}>
						← Usar otro correo electrónico
					</button>

					<p class="pie-nota">{@html iconos.candado} Tus datos están protegidos y nunca compartimos tu correo.</p>
				{/if}
			</div>
		</main>
	</div>
</section>

<style>
	/* Página a pantalla completa, sin scroll: la card se ajusta a su contenido. */
	.pantalla {
		height: 100dvh;
		min-height: 100dvh;
		display: grid;
		place-items: center;
		padding: clamp(1rem, 3vh, 2rem);
		background: var(--gris-100, var(--superficie-suave));
		overflow: hidden;
	}

	.card {
		height: auto;
		max-height: 100%;
		min-height: 0;
		width: min(72rem, 100%);
		display: grid;
		grid-template-columns: 1.05fr 1fr;
		border-radius: var(--radio-lg, 1.25rem);
		overflow: hidden;
		box-shadow: var(--sombra-card, 0 20px 45px rgba(15, 23, 42, 0.14));
		background: var(--superficie);
	}

	/* --- Panel de marca (izquierda) --- */
	.marca {
		position: relative;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: 1rem;
		padding: 2rem;
		color: var(--texto-inverso);
		/* Fondo tecnológico: degradado navy + brillos, sin asset externo. */
		background:
			radial-gradient(120% 90% at 85% 15%, rgba(34, 211, 238, 0.16), transparent 55%),
			radial-gradient(90% 80% at 10% 90%, rgba(99, 102, 241, 0.22), transparent 60%),
			linear-gradient(155deg, var(--navy-900, #050b1f), var(--navy-700, #101d4a));
		overflow: hidden;
	}

	.marca::after {
		content: '';
		position: absolute;
		inset: 0;
		background-image: radial-gradient(rgba(148, 163, 184, 0.14) 1px, transparent 1px);
		background-size: 26px 26px;
		opacity: 0.5;
		pointer-events: none;
	}

	.marca > * {
		position: relative;
		z-index: 1;
	}

	.marca-top {
		display: flex;
		align-items: center;
		gap: 0.65rem;
	}

	.logo {
		display: grid;
		place-items: center;
		width: 2.4rem;
		height: 2.4rem;
		border-radius: 0.7rem;
		background: var(--superficie);
		color: var(--indigo-600, var(--primario-texto));
		font-size: 1.25rem;
	}

	.nombre {
		font-size: 1.15rem;
		font-weight: 700;
		letter-spacing: -0.01em;
	}

	.marca-cuerpo h1 {
		margin: 0 0 0.9rem;
		font-size: clamp(1.8rem, 3vw, 2.5rem);
		line-height: 1.1;
		letter-spacing: -0.02em;
	}

	.lema {
		margin: 0 0 1.5rem;
		max-width: 26rem;
		color: rgba(226, 232, 240, 0.82);
		font-size: 0.95rem;
		line-height: 1.6;
	}

	.beneficios {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}

	.beneficios li {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.9rem;
		color: rgba(226, 232, 240, 0.92);
	}

	.b-ico {
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		flex-shrink: 0;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.1);
		color: var(--cyan-300, #67e8f9);
		font-size: 1rem;
	}

	.marca-pie {
		font-size: 0.75rem;
		color: rgba(148, 163, 184, 0.75);
	}

	/* --- Panel de formulario (derecha) --- */
	.form-panel {
		display: grid;
		place-items: center;
		padding: clamp(1.5rem, 4vh, 2.5rem);
		overflow: hidden;
	}

	.form-caja {
		width: min(26rem, 100%);
	}

	.cejilla {
		margin: 0 0 0.5rem;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--indigo-600, var(--primario-texto));
	}

	.form-caja h2 {
		margin: 0 0 0.6rem;
		font-size: clamp(1.6rem, 2.6vw, 2.1rem);
		letter-spacing: -0.02em;
		color: var(--gris-900, var(--texto));
	}

	.ayuda {
		margin: 0 0 1.5rem;
		color: var(--gris-500, var(--texto-suave));
		font-size: 0.92rem;
		line-height: 1.55;
		overflow-wrap: anywhere;
	}

	/* Correo (paso 1) */
	.campo-correo {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		padding: 0.7rem 0.9rem;
		border: 1.5px solid var(--gris-200, var(--borde-suave));
		border-radius: 0.7rem;
		background: var(--gris-50, var(--superficie-suave));
		transition: border-color 150ms ease;
	}

	.campo-correo:focus-within {
		border-color: var(--indigo-500, var(--primario));
	}

	.c-ico {
		display: grid;
		place-items: center;
		color: var(--indigo-600, var(--primario-texto));
		font-size: 1.05rem;
	}

	.campo-correo input {
		flex: 1;
		border: none;
		background: transparent;
		font: inherit;
		color: var(--gris-900, var(--texto));
		outline: none;
		min-width: 0;
	}

	/* Chip correo (paso 2) */
	.chip-correo {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		padding: 0.6rem 0.9rem;
		border: 1px solid var(--gris-200, var(--borde-suave));
		border-radius: 999px;
		background: var(--gris-50, var(--superficie-suave));
		font-size: 0.88rem;
		color: var(--indigo-700, var(--primario-texto));
		overflow-wrap: anywhere;
	}

	.chip-correo span:nth-child(2) {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.cambiar {
		border: none;
		background: none;
		color: var(--gris-500, var(--texto-suave));
		font-size: 0.78rem;
		text-decoration: underline;
		cursor: pointer;
		font: inherit;
	}

	.aviso {
		margin: 0.75rem 0 0;
		font-size: 0.82rem;
		color: var(--gris-500, var(--texto-suave));
	}

	/* Cajas del código */
	.etiqueta-codigo {
		display: block;
		margin: 1.1rem 0 0.5rem;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--gris-700, var(--texto));
	}

	.cajas {
		position: relative;
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: 0.55rem;
	}

	.caja {
		display: grid;
		place-items: center;
		aspect-ratio: 1;
		border: 1.5px solid var(--gris-200, var(--borde-suave));
		border-radius: 0.7rem;
		background: var(--gris-50, var(--superficie-suave));
		font-size: 1.35rem;
		font-weight: 700;
		color: var(--gris-900, var(--texto));
		transition:
			border-color 150ms ease,
			background 150ms ease;
	}

	.caja.llena {
		border-color: var(--indigo-500, var(--primario));
		background: var(--superficie);
	}

	.cajas input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		border: none;
		background: transparent;
		font-size: 1.35rem;
		letter-spacing: 2rem;
		cursor: pointer;
		outline: none;
	}

	.caduca {
		margin: 0.6rem 0 0;
		font-size: 0.78rem;
		color: var(--gris-500, var(--texto-suave));
	}

	.error {
		margin: 0.6rem 0 0;
		font-size: 0.85rem;
		color: var(--peligro-texto);
	}

	/* Botón Continuar ocupa todo el ancho */
	.form-caja form :global(button[type='submit']) {
		width: 100%;
		margin-top: 1.1rem;
	}

	.reenviar {
		margin: 1rem 0 0;
		text-align: center;
		font-size: 0.85rem;
		color: var(--gris-500, var(--texto-suave));
	}

	.enlace {
		border: none;
		background: none;
		padding: 0;
		font: inherit;
		color: var(--indigo-600, var(--primario-texto));
		text-decoration: underline;
		cursor: pointer;
	}

	.enlace:disabled {
		color: var(--gris-400, var(--texto-tenue));
		cursor: not-allowed;
		text-decoration: none;
	}

	.volver {
		display: block;
		margin: 0.8rem auto 0;
	}

	.pie-nota {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		margin: 1.2rem 0 0;
		font-size: 0.76rem;
		color: var(--gris-400, var(--texto-tenue));
	}

	@media (max-width: 60rem) {
		.card {
			grid-template-columns: 1fr;
			height: auto;
			max-height: 100%;
		}

		.marca {
			display: none;
		}
	}

	/* Pantallas muy bajas: se permite scroll antes que recortar el formulario. */
	@media (max-height: 40rem) {
		.pantalla {
			align-items: start;
			overflow-y: auto;
		}
	}
</style>
