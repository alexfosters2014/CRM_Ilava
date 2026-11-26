<script lang="ts">
	import { Inicio } from '#lib/pantallas/index.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>CRM — Inicio</title>
</svelte:head>

<Inicio usuario={data.usuario} />
