/**
 * Capa: Componentes — tipos del modal de documento.
 *
 * Una plantilla y una factura se editan con el mismo modal, así que la pantalla
 * las normaliza a esta forma antes de pasárselas.
 */

export interface Articulo {
	id: number;
	codigo: string;
	descripcion: string;
	activo: boolean;
}

export interface LineaDocumento {
	id: number;
	codigo: string;
	descripcion: string;
	detalle: string | null;
	cantidad: string;
	importeUnitario: string;
	comentario: string | null;
}

export interface DocumentoEditable {
	id: number;
	titulo: string;
	subtitulo: string;
	moneda: string | null;
	tipoComprobante: string | null;
	tipoPrecio: string | null;
	idCliente: number | null;
	fecha: string | null;
	serie: string | null;
	numero: string | null;
	comentarioGeneral: string | null;
	idCompra: string | null;
	detalleAuxiliar: string | null;
	uteVencimiento: string | null;
	informacionAdicional: string | null;
	lineas: LineaDocumento[];
}

/** Campos de cabecera que el modal puede cambiar. */
export type CampoDocumento =
	| 'moneda'
	| 'tipoComprobante'
	| 'tipoPrecio'
	| 'idCliente'
	| 'fecha'
	| 'serie'
	| 'numero'
	| 'comentarioGeneral'
	| 'idCompra'
	| 'detalleAuxiliar'
	| 'uteVencimiento'
	| 'informacionAdicional';

/** Cambios posibles sobre una línea. */
export interface CambiosLineaDocumento {
	codigo?: string;
	cantidad?: number;
	importeUnitario?: number;
	detalle?: string | null;
	comentario?: string | null;
}
