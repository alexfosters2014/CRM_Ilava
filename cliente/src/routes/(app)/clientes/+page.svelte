<script lang="ts">
	import { notificar } from '#lib/componentes/notificaciones.svelte.ts';

	type Cliente = { id: number; nombre: string; email: string; telefono: string | null };

	let estadoApi = $state<'cargando' | 'ok' | 'error'>('cargando');
	let clientes = $state<Cliente[]>([]);
	let errorApi = $state<string | null>(null);
	let nombre = $state('');
	let email = $state('');
	let telefono = $state('');

	$effect(() => {
		cargar();
	});

	async function cargar() {
		estadoApi = 'cargando';
		errorApi = null;
		try {
			const res = await fetch('/api/salud');
			const datos = await res.json();
			if (!res.ok || !datos.ok) throw new Error(datos.mensaje ?? 'La API no responde');
			estadoApi = 'ok';
			const lista = await fetch('/api/clientes');
			clientes = (await lista.json()) as Cliente[];
		} catch (e) {
			estadoApi = 'error';
			errorApi = (e as Error).message;
		}
	}

	async function crearCliente(e: SubmitEvent) {
		e.preventDefault();
		const res = await fetch('/api/clientes', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ nombre, email, telefono: telefono || null })
		});
		if (res.ok) {
			nombre = '';
			email = '';
			telefono = '';
			await cargar();
		} else {
			const datos = await res.json();
			notificar(datos.error ?? 'Error al crear el cliente', 'error');
		}
	}
</script>

<svelte:head>
	<title>CRM — Clientes</title>
</svelte:head>

<div class="cabecera">
	<h1>Clientes</h1>
	<p>Gestión de clientes del CRM (consumiendo la Web API).</p>
</div>

<section class="estado">
	{#if estadoApi === 'cargando'}
		<span>⏳ Comprobando conexión con la API…</span>
	{:else if estadoApi === 'ok'}
		<span>✅ Conectado con la API</span>
		<button onclick={cargar}>🔄 Actualizar</button>
	{:else}
		<span>⚠️ Sin conexión con la API: {errorApi}</span>
		<button onclick={cargar}>🔄 Reintentar</button>
	{/if}
</section>

<section>
	<h2>Nuevo cliente</h2>
	<form onsubmit={crearCliente}>
		<input bind:value={nombre} placeholder="Nombre" required />
		<input bind:value={email} type="email" placeholder="Email" required />
		<input bind:value={telefono} placeholder="Teléfono" />
		<button type="submit">➕ Añadir</button>
	</form>
</section>

<section>
	<h2>Clientes ({clientes.length})</h2>
	{#if clientes.length === 0}
		<p>No hay clientes todavía.</p>
	{:else}
		<table>
			<thead>
				<tr><th>#</th><th>Nombre</th><th>Email</th><th>Teléfono</th></tr>
			</thead>
			<tbody>
				{#each clientes as c (c.id)}
					<tr>
						<td>{c.id}</td>
						<td>{c.nombre}</td>
						<td>{c.email}</td>
						<td>{c.telefono ?? '—'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<style>
	.cabecera {
		margin-bottom: 1.5rem;
	}

	.cabecera h1 {
		margin: 0 0 0.25rem;
		font-size: 1.6rem;
	}

	.cabecera p {
		margin: 0;
		color: var(--gris-500, var(--texto-suave));
		font-size: 0.9rem;
	}

	section {
		margin-bottom: 1.75rem;
	}

	.estado {
		display: flex;
		gap: 1rem;
		align-items: center;
		padding: 0.75rem 1rem;
		border-radius: var(--radio-md, 0.75rem);
		background: var(--superficie);
		border: 1px solid var(--gris-200, var(--borde-suave));
	}

	form {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	input {
		padding: 0.5rem;
		border: 1px solid var(--gris-200, var(--borde-suave));
		border-radius: 0.5rem;
		flex: 1 1 10rem;
		font: inherit;
	}

	button {
		padding: 0.5rem 1rem;
		border: none;
		border-radius: 0.5rem;
		background: var(--indigo-600, var(--primario));
		color: var(--texto-inverso);
		cursor: pointer;
		font: inherit;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		background: var(--superficie);
		border: 1px solid var(--gris-200, var(--borde-suave));
		border-radius: var(--radio-md, 0.75rem);
		overflow: hidden;
	}

	th,
	td {
		text-align: left;
		padding: 0.6rem 0.75rem;
		border-bottom: 1px solid var(--gris-200, var(--borde-suave));
	}

	th {
		background: var(--gris-50, var(--superficie-suave));
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--gris-500, var(--texto-suave));
	}

	tbody tr:last-child td {
		border-bottom: none;
	}
</style>
