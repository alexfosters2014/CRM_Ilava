<script lang="ts">
	import favicon from '#lib/assets/favicon.svg';
	import '#lib/estilos/base.css';
	import '#lib/estilos/tema-oscuro.css';
	import '#lib/estilos/tema-claro.css';
	import { onMount } from 'svelte';
	import ModalConfirmar from '#lib/componentes/ModalConfirmar.svelte';
	import Toast from '#lib/componentes/Toast.svelte';
	import { aplicarAparienciaLocal, leerAparienciaLocal } from '#lib/servicios/apariencia.ts';
	import type { LayoutProps } from './$types';

	// Layout base (común a todas las rutas): favicon + CSS global.
	// El shell autenticado (Banner + MenuLateral) vive en routes/(app)/+layout.svelte.
	let { children, data }: LayoutProps = $props();

	// Apariencia global de tablas y listas: se inyecta como variables CSS desde
	// el servidor, así se aplica a todos los usuarios y sin parpadeo al cargar.
	const apariencia = $derived(data.apariencia);

	// Los valores viajan desde la API y se interpolan en un {@html}: se validan
	// y acotan acá para que un dato corrupto no pueda inyectar CSS.
	const HEX = /^#[0-9a-fA-F]{6}$/;
	const color = (valor: string, respaldo: string) => (HEX.test(valor ?? '') ? valor : respaldo);
	const px = (valor: number, maximo: number, respaldo: number) => {
		const numero = Number(valor);
		const acotado = Number.isFinite(numero)
			? Math.min(Math.max(Math.round(numero), 0), maximo)
			: respaldo;
		return `${acotado}px`;
	};

	const estilos = $derived.by(() => {
		const a = apariencia;
		return [
			`[data-tema="claro"]{`,
			`--fila-par-fondo:${color(a.filaParFondo, '#e2e9f7')};`,
			`--fila-par-texto:${color(a.filaParTexto, '#111827')};`,
			`--fila-impar-fondo:${color(a.filaImparFondo, '#ffffff')};`,
			`--fila-impar-texto:${color(a.filaImparTexto, '#111827')};`,
			`--tabla-linea-color:${color(a.tablaLineaColor, '#e3e8f4')};`,
			`--tabla-linea-grosor:${px(a.tablaLineaGrosor, 4, 1)};`,
			`--fila-padding-y:${px(a.filaPaddingY, 24, 2)};`,
			`--lista-linea-color:${color(a.listaLineaColor, '#e3e8f4')};`,
			`--lista-linea-grosor:${px(a.listaLineaGrosor, 4, 1)};`,
			`}`
		].join('');
	});

	// La apariencia guardada en este navegador pisa el fallback del servidor.
	onMount(() => {
		aplicarAparienciaLocal(leerAparienciaLocal());
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	{@html `<style>${estilos}</style>`}
</svelte:head>

{@render children()}

<ModalConfirmar />
<Toast />
