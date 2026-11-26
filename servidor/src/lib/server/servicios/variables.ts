/**
 * Capa: Servicios — variables de plantilla.
 *
 * En los textos las variables viajan como `{{nombre}}`; en la UI se muestran
 * sin llaves. El valor no se persiste: al pasar la factura a Bandeja se
 * sustituye dentro del comentario y desaparece el placeholder.
 */

/** Encuentra los nombres de variable usados en un texto, sin repetir. */
export function variablesEnTexto(texto: string | null | undefined): string[] {
	if (!texto) return [];

	const nombres: string[] = [];
	const vistos = new Set<string>();
	const patron = /\{\{\s*([^{}]+?)\s*\}\}/g;
	for (const coincidencia of texto.matchAll(patron)) {
		const nombre = coincidencia[1].trim();
		const clave = nombre.toLowerCase();
		if (clave && !vistos.has(clave)) {
			vistos.add(clave);
			nombres.push(nombre);
		}
	}
	return nombres;
}

/** Los nombres de variable no distinguen mayúsculas de minúsculas. */
function claveVariable(nombre: string): string {
	return nombre.trim().toLowerCase();
}

/** Índice de valores por nombre normalizado. */
function indiceValores(valores: Record<string, string>): Map<string, string> {
	const mapa = new Map<string, string>();
	for (const [nombre, valor] of Object.entries(valores)) {
		mapa.set(claveVariable(nombre), valor);
	}
	return mapa;
}

/**
 * Reemplaza cada `{{nombre}}` por el valor provisto. Si falta el valor, deja el
 * placeholder intacto: la validación previa decide si eso bloquea el pasaje.
 */
export function sustituirVariables(texto: string | null, valores: Record<string, string>): string | null {
	if (texto === null) return null;

	const indice = indiceValores(valores);
	return texto.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (original, nombreCrudo: string) => {
		const valor = indice.get(claveVariable(nombreCrudo));
		return valor === undefined ? original : valor;
	});
}

/** Variables usadas en los textos que todavía no tienen valor asignado. */
export function variablesFaltantes(
	textos: (string | null | undefined)[],
	valores: Record<string, string>
): string[] {
	const indice = indiceValores(valores);
	const faltantes: string[] = [];
	const vistos = new Set<string>();

	for (const texto of textos) {
		for (const nombre of variablesEnTexto(texto)) {
			const clave = claveVariable(nombre);
			const valor = indice.get(clave);
			if ((valor === undefined || valor.trim() === '') && !vistos.has(clave)) {
				vistos.add(clave);
				faltantes.push(nombre);
			}
		}
	}
	return faltantes;
}

/** Normaliza el valor que tipea el usuario antes de sustituirlo. */
export function normalizarValorVariable(valor: string): string {
	return valor.trim();
}

/** Línea de factura con lo mínimo necesario para reconstruir sus textos. */
export interface LineaSnapshotVariables {
	id: number;
	detalle: string | null;
	comentario: string | null;
}

/**
 * Copia de los textos ANTES de sustituir las variables. Se guarda al pasar la
 * factura a Bandeja para que "Devolver a Facturador" pueda restaurar los
 * `{{clave}}` exactos, aunque el valor sustituido aparezca naturalmente en el
 * texto (un año, un nombre de cliente, etc.).
 */
export interface SnapshotVariables {
	/** Valores aplicados, con la clave normalizada (minúsculas). */
	valores: Record<string, string>;
	comentarioGeneral: string | null;
	detalleAuxiliar: string | null;
	informacionAdicional: string | null;
	lineas: LineaSnapshotVariables[];
}

export function crearSnapshotVariables(
	documento: {
		comentarioGeneral: string | null;
		detalleAuxiliar: string | null;
		informacionAdicional: string | null;
	},
	lineas: LineaSnapshotVariables[],
	valores: Record<string, string>
): SnapshotVariables {
	return {
		valores: Object.fromEntries(
			Object.entries(valores).map(([nombre, valor]) => [claveVariable(nombre), valor])
		),
		comentarioGeneral: documento.comentarioGeneral,
		detalleAuxiliar: documento.detalleAuxiliar,
		informacionAdicional: documento.informacionAdicional,
		lineas: lineas.map((linea) => ({
			id: linea.id,
			detalle: linea.detalle,
			comentario: linea.comentario
		}))
	};
}

/** Textos originales que hay que reponer al volver de Bandeja a Facturador. */
export function textosDesdeSnapshot(snapshot: SnapshotVariables): {
	comentarioGeneral: string | null;
	detalleAuxiliar: string | null;
	informacionAdicional: string | null;
	lineas: LineaSnapshotVariables[];
} {
	return {
		comentarioGeneral: snapshot.comentarioGeneral,
		detalleAuxiliar: snapshot.detalleAuxiliar,
		informacionAdicional: snapshot.informacionAdicional,
		lineas: snapshot.lineas.map((linea) => ({ ...linea }))
	};
}
