/**
 * Capa: Componentes — confirmaciones modales.
 *
 * Servicio global: `confirmar()` abre un diálogo sí/no y resuelve `true` o
 * `false`. El diálogo se monta una sola vez en el layout raíz, así funciona
 * igual sobre una pantalla y sobre otro modal abierto.
 */

export interface OpcionesConfirmacion {
	titulo: string;
	mensaje?: string;
	/** Línea destacada: total, teléfono, alcance de la acción. */
	detalle?: string;
	etiquetaConfirmar?: string;
	etiquetaCancelar?: string;
	tono?: 'primario' | 'peligro';
}

interface EstadoConfirmacion extends OpcionesConfirmacion {
	abierto: boolean;
}

export const confirmacion = $state<EstadoConfirmacion>({
	abierto: false,
	titulo: '',
	tono: 'primario'
});

let resolver: ((valor: boolean) => void) | null = null;

/** Abre el diálogo y resuelve con la decisión del usuario. */
export function confirmar(opciones: OpcionesConfirmacion): Promise<boolean> {
	// Si ya había una confirmación abierta, se cancela para no dejarla colgada.
	resolver?.(false);
	resolver = null;

	confirmacion.titulo = opciones.titulo;
	confirmacion.mensaje = opciones.mensaje;
	confirmacion.detalle = opciones.detalle;
	confirmacion.etiquetaConfirmar = opciones.etiquetaConfirmar ?? 'Confirmar';
	confirmacion.etiquetaCancelar = opciones.etiquetaCancelar ?? 'Cancelar';
	confirmacion.tono = opciones.tono ?? 'primario';
	confirmacion.abierto = true;

	return new Promise<boolean>((resolverNuevo) => {
		resolver = resolverNuevo;
	});
}

/** Cierra el diálogo y resuelve la promesa pendiente. */
export function responderConfirmacion(valor: boolean) {
	const pendiente = resolver;
	resolver = null;
	confirmacion.abierto = false;
	pendiente?.(valor);
}
