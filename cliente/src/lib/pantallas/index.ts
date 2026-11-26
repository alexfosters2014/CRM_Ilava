/**
 * Capa: Pantallas
 *
 * Composición de componentes para cada pantalla.
 * Una pantalla agrupa los componentes de la capa `componentes` y los orquesta
 * con los servicios (`servicios` / `servicios-datos-api`). No contiene lógica de
 * negocio ni peticiones HTTP directas: solo compone y delega.
 *
 * Cada pantalla se monta desde una ruta de `src/routes` (p. ej. +page.svelte).
 */
export { default as Login } from './Login.svelte';
export { default as Inicio } from './Inicio.svelte';
export { default as Plantillas } from './Plantillas.svelte';
export { default as Facturador } from './Facturador.svelte';
export { default as Servicios } from './Servicios.svelte';
export { default as Configuracion } from './Configuracion.svelte';
export { default as Cobranza } from './Cobranza.svelte';
export { default as Tickets } from './Tickets.svelte';
export { default as Seguimientos } from './Seguimientos.svelte';
