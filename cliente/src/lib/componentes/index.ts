/**
 * Capa: Componentes
 *
 * Presentación, eventos visuales y componentes reutilizables.
 * Cada componente es una pieza aislada y sin dependencia de datos remotos:
 * recibe props y emite eventos. El estilo (CSS propio, sin frameworks)
 * va co-located junto al componente (.svelte o .css importado).
 *
 * Ejemplo de uso desde una pantalla:
 *   import { Boton } from '#lib/componentes';
 */
export { default as Boton } from './Boton.svelte';
export { default as CampoTexto } from './CampoTexto.svelte';
export { default as Banner } from './Banner.svelte';
export { default as CampanaNotificaciones } from './CampanaNotificaciones.svelte';
export { default as BarraLotes } from './BarraLotes.svelte';
export { default as CopiaGlobal } from './CopiaGlobal.svelte';
export { default as MenuLateral } from './MenuLateral.svelte';
export { default as CampoArticulo } from './CampoArticulo.svelte';
export { default as ChipAuxiliar } from './ChipAuxiliar.svelte';
export { default as ChipSelect } from './ChipSelect.svelte';
export { default as ModalDocumento } from './ModalDocumento.svelte';
export { default as ModalPanel } from './ModalPanel.svelte';
export { default as ModalEnviadosFacturar } from './ModalEnviadosFacturar.svelte';
export { default as ConversacionTicket } from './ConversacionTicket.svelte';
export { default as CompositorTicket } from './CompositorTicket.svelte';
export { default as ModalConfirmar } from './ModalConfirmar.svelte';
export { default as Toast } from './Toast.svelte';
export { default as PanelUsuarios } from './PanelUsuarios.svelte';
export type {
	Articulo,
	CambiosLineaDocumento,
	CampoDocumento,
	DocumentoEditable,
	LineaDocumento
} from './documento.ts';
