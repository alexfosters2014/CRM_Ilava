/**
 * Capa: Componentes — notificaciones flotantes.
 *
 * Servicio global para los avisos de una línea (éxito, error o información).
 * El toast se monta una vez en el layout raíz y se posiciona arriba al centro.
 */

export type TipoNotificacion = 'exito' | 'error' | 'info';

interface EstadoNotificacion {
	visible: boolean;
	mensaje: string;
	tipo: TipoNotificacion;
}

export const notificacion = $state<EstadoNotificacion>({
	visible: false,
	mensaje: '',
	tipo: 'exito'
});

let temporizador: ReturnType<typeof setTimeout> | null = null;

/** Muestra un aviso y lo oculta solo a los `duracion` ms. */
export function notificar(
	mensaje: string,
	tipo: TipoNotificacion = 'exito',
	duracion = 4500
): void {
	notificacion.mensaje = mensaje;
	notificacion.tipo = tipo;
	notificacion.visible = true;
	if (temporizador) clearTimeout(temporizador);
	temporizador = setTimeout(() => {
		notificacion.visible = false;
	}, duracion);
}

export function cerrarNotificacion(): void {
	if (temporizador) clearTimeout(temporizador);
	temporizador = null;
	notificacion.visible = false;
}
