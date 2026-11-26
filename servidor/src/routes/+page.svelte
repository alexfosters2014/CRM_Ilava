<script lang="ts">
	let estado = $state<{ ok?: boolean; mensaje?: string; version?: string }>({});

	$effect(() => {
		fetch('/api/salud')
			.then((r) => r.json())
			.then((datos) => {
				estado = { ok: datos.ok, mensaje: datos.mensaje, version: datos.base_datos?.version };
			})
			.catch((e) => {
				estado = { ok: false, mensaje: String(e) };
			});
	});
</script>

<main>
	<h1>API del CRM</h1>
	<p>Servidor SvelteKit expuesto como Web API sobre PostgreSQL.</p>

	<ul>
		<li><code>GET /api/salud</code> — estado de la API y de la base de datos</li>
		<li><code>GET /api/clientes</code> — lista de clientes</li>
		<li><code>POST /api/clientes</code> — crea un cliente</li>
		<li><code>GET|PUT|DELETE /api/clientes/:id</code> — operaciones sobre un cliente</li>
	</ul>

	<p>
		Estado:
		{#if estado.ok === undefined}
			comprobando…
		{:else if estado.ok}
			✅ {estado.mensaje} (PostgreSQL {estado.version})
		{:else}
			⚠️ {estado.mensaje}
		{/if}
	</p>
</main>

<style>
	main {
		font-family: system-ui, sans-serif;
		max-width: 40rem;
		margin: 3rem auto;
		padding: 0 1rem;
	}
	code {
		background: #f0f0f0;
		padding: 0.1rem 0.3rem;
		border-radius: 4px;
	}
</style>
