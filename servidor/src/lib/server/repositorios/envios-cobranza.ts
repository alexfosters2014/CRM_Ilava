import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import {
	auditoriaCobranza,
	comprobantesCobranza,
	cuentasCorreo,
	cuentasCorreoAlias,
	db,
	enviosCobranza,
	periodosCobranza,
	plantillasCobranza,
	servicios
} from '../base-datos/index.ts';
import { enviarConCuenta, ErrorEnvioCorreo, verificarCuentaCorreo } from './correo.ts';
import { copiasParaEnvio } from './cobranzas.ts';
import { emailsParaEnvio } from './emails-servicio.ts';
import {
	cuerpoHtml,
	fechaCorta,
	tablaHtml,
	tablaTexto,
	type FilaEstadoCuenta
} from '../servicios/estado-cuenta.ts';
import { calcularDiasAging, plantillaListaComprobantes } from '../servicios/cobranzas.ts';
import { cartaConFondo, generarPdf } from '../servicios/pdf.ts';

/**
 * Repositorio: envíos de estado de cuenta.
 *
 * Un envío congela lo que se mandó (destinatarios, totales y comprobantes
 * incluidos/excluidos). Los comprobantes con `excluidoEnvio` quedan fuera del
 * total y del detalle; al completarse el envío esas marcas se limpian solas.
 */

export interface ComprobanteEnvio {
	id: number;
	tipoComprobante: string;
	serie: string;
	numero: string;
	fechaEmision: string;
	vencimiento: string | null;
	moneda: string;
	importe: string;
	saldo: string;
	incluido: boolean;
}

export interface EnvioCobranzaListado {
	id: number;
	periodo: string;
	creadoEn: string;
	enviadoEn: string | null;
	usuario: string | null;
	plantilla: string | null;
	cuenta: string | null;
	alias: string | null;
	destinatarios: string[];
	asunto: string;
	estado: string;
	error: string | null;
	errorTipo: string | null;
	totales: { pesos: string; dolares: string; equivalentePesos: string; cantidad: number } | null;
	comprobantes: ComprobanteEnvio[] | null;
}

const dinero = (valor: number, moneda: 'UYU' | 'USD') =>
	new Intl.NumberFormat('es-UY', {
		style: 'currency',
		currency: moneda,
		currencyDisplay: 'narrowSymbol',
		minimumFractionDigits: 2
	}).format(valor);

function reemplazar(plantilla: string, valores: Record<string, string>): string {
	return plantilla.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (original, clave: string) => valores[clave.toLowerCase()] ?? original);
}

export async function listarEnviosServicio(servicioId: number): Promise<EnvioCobranzaListado[]> {
	const filas = await db
		.select({
			envio: enviosCobranza,
			plantilla: plantillasCobranza.nombre,
			cuenta: cuentasCorreo.nombre,
			alias: cuentasCorreoAlias.email
		})
		.from(enviosCobranza)
		.leftJoin(plantillasCobranza, eq(enviosCobranza.plantillaId, plantillasCobranza.id))
		.leftJoin(cuentasCorreo, eq(enviosCobranza.cuentaId, cuentasCorreo.id))
		.leftJoin(cuentasCorreoAlias, eq(enviosCobranza.aliasId, cuentasCorreoAlias.id))
		.where(eq(enviosCobranza.servicioId, servicioId))
		.orderBy(desc(enviosCobranza.creadoEn));

	return filas.map((fila) => ({
		id: fila.envio.id,
		periodo: fila.envio.periodo,
		creadoEn: fila.envio.creadoEn.toISOString(),
		enviadoEn: fila.envio.enviadoEn ? fila.envio.enviadoEn.toISOString() : null,
		usuario: fila.envio.usuario,
		plantilla: fila.plantilla,
		cuenta: fila.cuenta,
		alias: fila.alias,
		destinatarios: (fila.envio.destinatarios as string[]) ?? [],
		asunto: fila.envio.asunto,
		estado: fila.envio.estado,
		error: fila.envio.error,
		errorTipo: fila.envio.errorTipo,
		totales: fila.envio.totales as EnvioCobranzaListado['totales'],
		comprobantes: fila.envio.comprobantes as ComprobanteEnvio[] | null
	}));
}

export interface DatosEnvioEstadoCuenta {
	servicioId: number;
	periodo: string;
	plantillaId: number;
	cuentaId: number;
	aliasId?: number | null;
	usuario?: string;
	/**
	 * Envía únicamente los comprobantes cuyo plazo de pago ya venció. Requiere
	 * que la plantilla incluya `{{estado_cuenta_general}}` en el cuerpo o en la
	 * carta, porque es el listado que se filtra.
	 */
	soloVencidos?: boolean;
	/**
	 * Verifica conexión y credencial SMTP antes de enviar. La cola lo apaga
	 * porque el lote ya se validó al crearse y no quiere una conexión extra
	 * por cada mail.
	 */
	verificarCredencial?: boolean;
}

/**
 * Envía el estado de cuenta del servicio con la plantilla elegida.
 * Excluye los comprobantes marcados como exclusión temporal y, si el envío
 * sale bien, limpia esas marcas (vuelven a quedar incluidos).
 */
export async function enviarEstadoCuenta(datos: DatosEnvioEstadoCuenta): Promise<EnvioCobranzaListado> {
	if (datos.verificarCredencial !== false) {
		const verificacion = await verificarCuentaCorreo(datos.cuentaId);
		if (!verificacion.ok) throw new Error(verificacion.clasificacion.explicacion);
	}
	const [periodoDb] = await db.select().from(periodosCobranza).where(eq(periodosCobranza.periodo, datos.periodo));
	if (!periodoDb) throw new Error(`El período ${datos.periodo} no existe`);

	const [servicio] = await db
		.select({
			id: servicios.id,
			contacto: servicios.contactoFacturacion,
			cantidadDiasVencimiento: servicios.cantidadDiasVencimiento
		})
		.from(servicios)
		.where(and(eq(servicios.id, datos.servicioId), isNull(servicios.eliminadoEn)));
	if (!servicio) throw new Error('El servicio no existe');

	const [plantilla] = await db.select().from(plantillasCobranza).where(eq(plantillasCobranza.id, datos.plantillaId));
	if (!plantilla) throw new Error('La plantilla no existe');

	const soloVencidos = datos.soloVencidos === true;
	if (soloVencidos && !plantillaListaComprobantes(plantilla)) {
		throw new Error(
			'La plantilla no lista comprobantes: agregá {{estado_cuenta_general}}, {{estado_cuenta_pesos}} o {{estado_cuenta_dolares}}'
		);
	}

	const destinatarios = await emailsParaEnvio(datos.servicioId, 'COBRANZA');
	if (destinatarios.length === 0) {
		throw new Error('El servicio no tiene destinatarios de cobranza cargados');
	}

	const documentos = await db
		.select()
		.from(comprobantesCobranza)
		.where(
			and(
				eq(comprobantesCobranza.periodoId, periodoDb.id),
				eq(comprobantesCobranza.servicioId, datos.servicioId),
				eq(comprobantesCobranza.activo, true),
				isNull(comprobantesCobranza.eliminadoEn)
			)
		)
		.orderBy(asc(comprobantesCobranza.fechaEmision));
	if (documentos.length === 0) throw new Error('El servicio no tiene comprobantes pendientes en este período');

	const hoy = new Date().toISOString().slice(0, 10);
	const comprobantes: ComprobanteEnvio[] = documentos.map((documento) => {
		const dias = calcularDiasAging(documento.fechaEmision, hoy);
		const vencida = dias > servicio.cantidadDiasVencimiento;
		return {
			id: documento.id,
			tipoComprobante: documento.tipoComprobante,
			serie: documento.serie,
			numero: documento.numero,
			fechaEmision: documento.fechaEmision,
			vencimiento: documento.fechaVencimiento,
			moneda: documento.moneda.toUpperCase() === 'USD' ? 'USD' : 'UYU',
			importe: documento.importe,
			saldo: documento.saldoPendiente,
			incluido: !documento.excluidoEnvio && (!soloVencidos || vencida)
		};
	});

	const incluidos = comprobantes.filter((item) => item.incluido);
	if (incluidos.length === 0) {
		throw new Error(
			soloVencidos
				? 'No hay comprobantes vencidos para enviar en este período'
				: 'Todos los comprobantes están excluidos del envío'
		);
	}

	const cotizacion = Number(periodoDb.cotizacionUsd);
	let pesos = 0;
	let dolares = 0;
	for (const item of incluidos) {
		if (item.moneda === 'USD') dolares += Number(item.saldo);
		else pesos += Number(item.saldo);
	}
	const totales = {
		pesos: pesos.toFixed(2),
		dolares: dolares.toFixed(2),
		equivalentePesos: (pesos + dolares * cotizacion).toFixed(2),
		cantidad: incluidos.length
	};

	const filas = incluidos as unknown as FilaEstadoCuenta[];
	const filasPesos = filas.filter((fila) => fila.moneda !== 'USD');
	const filasDolares = filas.filter((fila) => fila.moneda === 'USD');

	const valores: Record<string, string> = {
		fecha_hoy: fechaCorta(new Date().toISOString().slice(0, 10)),
		nombre_servicio: servicio.contacto,
		periodo: datos.periodo,
		cantidad_comprobantes: String(incluidos.length),
		cantidad_facturas: String(incluidos.length),
		total_pesos: dinero(pesos, 'UYU'),
		total_dolares: dinero(dolares, 'USD')
	};
	const textoPesos = filasPesos.length > 0 ? tablaTexto(filasPesos, 'UYU') : '';
	const textoDolares = filasDolares.length > 0 ? tablaTexto(filasDolares, 'USD') : '';
	const htmlPesos = filasPesos.length > 0 ? tablaHtml(filasPesos, 'UYU') : '';
	const htmlDolares = filasDolares.length > 0 ? tablaHtml(filasDolares, 'USD') : '';

	const valoresTexto: Record<string, string> = {
		...valores,
		estado_cuenta_general: [textoPesos, textoDolares].filter(Boolean).join('\n\n'),
		estado_cuenta_pesos: textoPesos || 'Sin comprobantes en UYU.',
		estado_cuenta_dolares: textoDolares || 'Sin comprobantes en USD.'
	};

	const asunto = reemplazar(plantilla.asunto, valoresTexto);
	const texto = reemplazar(plantilla.cuerpo, valoresTexto);

	// El correo siempre lleva HTML: el cuerpo con las tablas de estado de cuenta.
	const tablasHtml = {
		pesos: htmlPesos || tablaHtml([], 'UYU'),
		dolares: htmlDolares || tablaHtml([], 'USD'),
		general: [htmlPesos, htmlDolares].filter(Boolean).join('')
	};
	let html = cuerpoHtml(plantilla.cuerpo, valores, tablasHtml);

	// Carta PDF adjunta. Si la generación falla, la carta va en el cuerpo para
	// no perder el envío.
	const adjuntos: { filename: string; content: Buffer; contentType: string }[] = [];
	if (plantilla.cartaHabilitada && plantilla.cartaHtml) {
		const cartaRender = reemplazar(plantilla.cartaHtml, {
			...valores,
			estado_cuenta_general: tablasHtml.general,
			estado_cuenta_pesos: tablasHtml.pesos,
			estado_cuenta_dolares: tablasHtml.dolares
		});
		try {
			const pdf = await generarPdf(cartaConFondo(cartaRender, plantilla.cartaFondo));
			const nombreArchivo = servicio.contacto
				.normalize('NFD')
				.replace(/[\u0300-\u036f]/g, '')
				.replace(/[^a-zA-Z0-9]+/g, '-')
				.replace(/^-+|-+$/g, '')
				.slice(0, 60)
				.toLowerCase();
			adjuntos.push({
				filename: `estado-de-cuenta-${nombreArchivo || 'servicio'}.pdf`,
				content: pdf,
				contentType: 'application/pdf'
			});
			console.info(`[correo] carta PDF adjunta: ${Math.round(pdf.length / 1024)} KB`);
		} catch (error) {
			console.error('[correo] no se pudo generar el PDF de la carta:', (error as Error).message);
			html += `<hr>${cartaRender}`;
		}
	}

	const [envio] = await db
		.insert(enviosCobranza)
		.values({
			servicioId: datos.servicioId,
			periodo: datos.periodo,
			cuentaId: datos.cuentaId,
			aliasId: datos.aliasId ?? null,
			plantillaId: datos.plantillaId,
			usuario: datos.usuario,
			destinatarios,
			asunto,
			estado: 'ENVIANDO',
			totales,
			comprobantes
		})
		.returning();

	try {
		// Copia global de control interno (CC visible o CCO oculta).
		const copias = await copiasParaEnvio(destinatarios);
		const messageId = await enviarConCuenta({
			cuentaId: datos.cuentaId,
			aliasId: datos.aliasId ?? null,
			para: destinatarios,
			asunto,
			texto,
			html,
			cc: copias.cc,
			bcc: copias.bcc,
			adjuntos
		});

		await db
			.update(enviosCobranza)
			.set({ estado: 'ENVIADO', messageId, enviadoEn: new Date() })
			.where(eq(enviosCobranza.id, envio.id));

		// El envío ya salió: la exclusión temporal cumplió su función.
		await db
			.update(comprobantesCobranza)
			.set({ excluidoEnvio: false, excluidoEnvioEn: null, excluidoEnvioPor: null })
			.where(
				and(
					eq(comprobantesCobranza.periodoId, periodoDb.id),
					eq(comprobantesCobranza.servicioId, datos.servicioId),
					eq(comprobantesCobranza.excluidoEnvio, true)
				)
			);

		await db.insert(auditoriaCobranza).values({
			servicioId: datos.servicioId,
			accion: 'ENVIO',
			usuario: datos.usuario,
			detalle: { envioId: envio.id, plantillaId: datos.plantillaId, cuentaId: datos.cuentaId, totales, soloVencidos }
		});

		return (await listarEnviosServicio(datos.servicioId)).find((item) => item.id === envio.id)!;
	} catch (error) {
		if (error instanceof ErrorEnvioCorreo) {
			await db
				.update(enviosCobranza)
				.set({
					estado: 'ERROR',
					error: error.clasificacion.mensaje,
					errorTipo: error.clasificacion.tipo
				})
				.where(eq(enviosCobranza.id, envio.id));
			throw error;
		}
		const mensaje = error instanceof Error ? error.message : 'No se pudo enviar el correo';
		await db
			.update(enviosCobranza)
			.set({ estado: 'ERROR', error: mensaje, errorTipo: null })
			.where(eq(enviosCobranza.id, envio.id));
		throw new Error(mensaje);
	}
}
