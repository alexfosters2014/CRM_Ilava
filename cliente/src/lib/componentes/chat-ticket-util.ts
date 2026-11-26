/**
 * Capa: Componentes — utilidades del chat de tickets.
 *
 * Piezas puras compartidas por la pantalla de Tickets y el modal del
 * seguimiento, para que la conversación se vea y se comporte igual en ambos.
 */
import { formatearFechaHora } from '#lib/servicios/fechas.ts';
import { iniciales } from '#lib/servicios/sesion.ts';
import type { MensajeTicket } from '#lib/servicios-datos-api/tickets.ts';

/** Normaliza para buscar sin acentos ni signos. */
export function normalizarBusqueda(valor: string): string {
	return valor
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '');
}

/** Clase de color estable para el avatar según el autor. */
export function avatarClase(id: string | null | undefined): string {
	const clases = ['indigo', 'teal', 'ambar', 'violeta', 'rosa', 'cian', 'gris'];
	let hash = 0;
	for (const caracter of id ?? '') hash = (hash * 31 + caracter.charCodeAt(0)) % 997;
	return clases[hash % clases.length];
}

export function inicialesDe(nombre: string | null | undefined): string {
	return iniciales({ name: nombre ?? '' });
}

export function fechaDia(iso: string): string {
	return formatearFechaHora(iso).split(' ')[0] ?? '';
}

/** Escapa el texto y resalta las menciones @algo. */
export function contenidoHtml(texto: string): string {
	const escapado = texto.replace(
		/[&<>"']/g,
		(caracter) =>
			({
				'&': '&amp;',
				'<': '&lt;',
				'>': '&gt;',
				'"': '&quot;',
				"'": '&#39;'
			})[caracter] ?? caracter
	);
	return escapado
		.replace(/@([\p{L}\p{N}_]+)/gu, '<span class="mencion">@$1</span>')
		.replace(/\n/g, '<br>');
}

export interface MensajeChat {
	mensaje: MensajeTicket;
	fecha: string;
	nuevoDia: boolean;
	primero: boolean;
	ultimo: boolean;
}

/** Ordena y agrupa mensajes consecutivos del mismo autor y día. */
export function agruparMensajesChat(mensajes: MensajeTicket[]): MensajeChat[] {
	const ordenados = mensajes
		.map((mensaje) => ({ fecha: mensaje.fechaHora, mensaje }))
		.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

	const claveAutor = (mensaje: MensajeTicket) =>
		`${mensaje.autorUsuarioId ?? mensaje.autorEmail ?? 'externo'}|${mensaje.canal ?? ''}`;

	return ordenados.map((item, indice) => {
		const anterior = ordenados[indice - 1];
		const siguiente = ordenados[indice + 1];
		const mismoDiaAnterior = anterior ? fechaDia(anterior.fecha) === fechaDia(item.fecha) : false;
		const mismoDiaSiguiente = siguiente
			? fechaDia(siguiente.fecha) === fechaDia(item.fecha)
			: false;
		return {
			...item,
			nuevoDia: !anterior || !mismoDiaAnterior,
			primero:
				!anterior || !mismoDiaAnterior || claveAutor(anterior.mensaje) !== claveAutor(item.mensaje),
			ultimo:
				!siguiente || !mismoDiaSiguiente || claveAutor(siguiente.mensaje) !== claveAutor(item.mensaje)
		};
	});
}
