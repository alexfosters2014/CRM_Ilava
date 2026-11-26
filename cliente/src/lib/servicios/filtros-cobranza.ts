/**
 * Capa: Servicios (frontend) — filtros de la cartera de cobranza.
 *
 * Funciones puras para poder testearlas sin montar la pantalla.
 */

export interface FiltrableCartera {
	/** Tramo de la deuda más antigua del servicio; `null` si no debe nada. */
	tramoAntiguedad?: string | null;
	pesos: Record<string, string>;
	dolares: Record<string, string>;
	envios: number;
}

export interface FiltrableDocumento {
	excluidoEnvio: boolean;
	vencida: boolean;
}

/**
 * ¿Este comprobante entra en el envío?
 *
 * Con `soloVencidos` activo solo pasan los que ya cumplieron el plazo del
 * servicio. La exclusión temporal siempre gana. Aplica a facturas, notas de
 * crédito, notas de débito y recibos por igual.
 */
export function seEnviaDocumento(documento: FiltrableDocumento, soloVencidos: boolean): boolean {
	return !documento.excluidoEnvio && (!soloVencidos || documento.vencida);
}

export interface DocumentoTotales extends FiltrableDocumento {
	moneda: string;
	importe: string;
	saldoPendiente: string;
}

export interface TotalesEnvio {
	cantidad: number;
	pesos: number;
	dolares: number;
	importePesos: number;
	importeDolares: number;
	equivalentePesos: number;
}

/**
 * Totales de lo que realmente se envía: suma saldos pendientes y descarta los
 * comprobantes con exclusión temporal y, con `soloVencidos`, los que todavía no
 * vencieron. El equivalente en pesos usa la cotización del período.
 */
export function totalesEnvio(
	documentos: DocumentoTotales[],
	soloVencidos: boolean,
	cotizacionUsd: number
): TotalesEnvio {
	const totales: TotalesEnvio = {
		cantidad: 0,
		pesos: 0,
		dolares: 0,
		importePesos: 0,
		importeDolares: 0,
		equivalentePesos: 0
	};
	for (const documento of documentos) {
		if (!seEnviaDocumento(documento, soloVencidos)) continue;
		totales.cantidad += 1;
		const saldo = Number(documento.saldoPendiente);
		const importe = Number(documento.importe);
		if (documento.moneda.toUpperCase() === 'USD') {
			totales.dolares += saldo;
			totales.importeDolares += importe;
		} else {
			totales.pesos += saldo;
			totales.importePesos += importe;
		}
	}
	totales.equivalentePesos = totales.pesos + totales.dolares * cotizacionUsd;
	return totales;
}

/**
 * El filtro es EXCLUYENTE: un servicio coincide con un tramo solo si ese es el
 * tramo de su deuda más antigua. Así +90 son los que deben algo de +90, y
 * 1–30 solo los que únicamente deben facturas recientes. `TODOS` siempre coincide.
 */
export function coincideTramo(servicio: FiltrableCartera, tramo: string): boolean {
	if (tramo === 'TODOS') return true;
	return servicio.tramoAntiguedad === tramo;
}

/**
 * Filtro por cantidad de envíos: `TODOS`, un número exacto (`0`..`3`) o `MAS_4`
 * para cuatro o más.
 */
export function coincideEnvios(envios: number, filtro: string): boolean {
	if (filtro === 'TODOS') return true;
	if (filtro === 'MAS_4') return envios >= 4;
	return envios === Number(filtro);
}
