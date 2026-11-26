import { db } from './conexion.ts';
import {
	areas,
	articulos,
	clientes,
	configuracionFacturacion,
	gruposFacturacion,
	modalidadesCobranza,
	monedas,
	tiposCliente,
	tiposComprobantes,
	tiposGestion,
	tiposGestionFacturacion,
	tiposPrecios,
	ticketCategorias
} from './esquemas/index.ts';
import { AREA_TODOS } from './esquemas/areas.ts';

/**
 * Seed de datos iniciales (reemplaza al `INSERT ... ON CONFLICT DO NOTHING` de
 * init.sql). Son datos de ejemplo/curados, NO datos falsos aleatorios.
 *
 * Idempotente: se puede ejecutar en cada arranque sin duplicar filas, gracias
 * a `onConflictDoNothing` sobre la restricción única de `email`.
 */
const CLIENTES_SEED = [
	{ nombre: 'Ana García', email: 'ana.garcia@ejemplo.com', telefono: '+34 600 111 222' },
	{ nombre: 'Luis Martínez', email: 'luis.martinez@ejemplo.com', telefono: '+34 600 333 444' },
	{ nombre: 'Carmen Ruiz', email: 'carmen.ruiz@ejemplo.com', telefono: null }
];

const TIPOS_COMPROBANTES_SEED = [
	['.e-Recibo de cobro', 'e-RECIBO'],
	['Compra Contado', 'CMP CONT'],
	['Compra Crédito', 'CMP CRED'],
	['Nota de Crédito', 'NC'],
	['Nota de Crédito Alarma', 'NC ALARM'],
	['Nota de Crédito Alarma USD', 'NC ALUSD'],
	['Nota de Credito Exenta', 'NC EXENT'],
	['Nota de Crédito Tecnologia', 'NC TECNO'],
	['Nota de débito', 'ND'],
	['Recibo de Cobro manual', 'REC MAN'],
	['Venta a Credito Exenta', 'VC EXENT'],
	['Venta Contado', 'VTA CONT'],
	['Venta Contado Tarjeta $', 'VC TAR $'],
	['Venta Contado Tarjetas USD', 'VC T USD'],
	['Venta Crédito', 'VTA CRED'],
	['Venta Crédito Alarma $', 'VC AL $'],
	['Venta crédito manual', 'VC MAN'],
	['Venta Crédito Tecnología', 'VC TECNO']
].map(([nombre, abreviatura]) => ({ nombre, abreviatura }));

const TIPOS_PRECIOS_SEED = ['90 días', '30 dias', '45 dias', '60 dias', '30 dias.', '45 días'].map((nombre) => ({ nombre }));
const MONEDAS_SEED = [{ codigo: '$' }, { codigo: 'USD' }];
const TIPOS_GESTION_SEED = ['NORMAL', 'CONCORDATO', 'ACUERDO', 'LEGAL', 'INCOBRABLE'].map((nombre) => ({ nombre }));
const TIPOS_CLIENTE_SEED = ['EMPRESA', 'PERSONAL'].map((nombre) => ({ nombre }));
const MODALIDADES_COBRANZA_SEED = ['DEB AUT', 'TRANSFERENCIA', 'CHEQUES'].map((nombre) => ({ nombre }));
const TIPOS_GESTION_FACTURACION_SEED = ['NORMAL', 'CONFORMIDAD', 'OC_MENSUAL', 'OC_PERIODO', 'PLATAFORMA'].map(
	(nombre) => ({ nombre })
);

const ARTICULOS_SEED = [
	['109', 'CAMARAS'],
	['1010', '1010 CONTROL DE ACCESO'],
	['1011', 'CONTROL DE ACCESO'],
	['1013', 'SISTEMA DE DETECCION DE INCENDIO'],
	['1020', 'DETALLE'],
	['10023', 'INSTALACIONES'],
	['1024', 'MANTENIMIENTO'],
	['1025', 'ARRENDAMIENTO'],
	['1009', 'CCTV CAMARAS'],
	['1019', 'CONTROL DE ACCESO'],
	['1021', 'HARDWARE EN GRAL EXENTO'],
	['1012', 'HW HARDWARE EN GRAL.'],
	['1014', 'INSUMOS'],
	['1001', 'HORAS DIURNAS'],
	['1005', 'HORAS DIURNAS EX'],
	['1006', 'HORAS NOCTURNAS EX'],
	['1007', 'MENSUAL EXENTO'],
	['1015', 'SERVICIOS ESPECIALES'],
	['1016', 'INSUMOS EXENTO'],
	['1017', '*INSTALACIONES'],
	['1018', 'MANTENIMIENTO EXENTO'],
	['1050', '*MATERIALES'],
	['1051', '*MANO DE OBRA'],
	['10020', 'OBSERVACIONES'],
	['1111', 'SERVICIO TECNICO Y OTROS EXENTO'],
	['3008', 'MONITOREO EXENTO'],
	['3011', 'SERVICIO ESPECIAL EXENTO'],
	['10024', 'INSTALACIONES EXENTAS'],
	['1030', 'ARRENDAMIENTO EXENTO'],
	['4002', 'Alarma exento'],
	['4006', 'Vigilancia mensual exento'],
	['1003', 'MENSUAL'],
	['1004', 'SERVICIO ESPECIAL'],
	['1022', 'INSTALACION'],
	['3001', 'LIMPIEZA DIURNA'],
	['3002', 'LIMPIEZA NOCTURNA'],
	['3003', 'LIMPIEZA MENSUAL'],
	['3004', 'SERVICIO ESPECIAL'],
	['3005', 'ARRENDAMIENTO TECNOLOGIA'],
	['3007', 'MONITOREO'],
	['3010', 'ARRENDAMIENTO'],
	['4001', 'Alarma'],
	['4005', 'Vigilancia mensual'],
	['1002', 'HORAS NOCTURNAS'],
	['1008', 'CAMARAS'],
	['1108', 'MATERIALES'],
	['1109', 'MANO DE OBRA'],
	['1110', 'SERVICIO TECNICO Y OTROS'],
	['3000', 'Vehiculo']
].map(([codigo, descripcion]) => ({ codigo, descripcion }));

const GRUPOS_FACTURACION_SEED = [
	{ nombre: 'FIJOS', color: 'azul' },
	{ nombre: 'VARIABLES', color: 'verde' },
	{ nombre: 'ALARMAS', color: 'rosa' },
	// Grupo solicitado por la operativa, aunque todavía no aparezca en el Excel.
	{ nombre: 'INDIVIDUAL', color: 'amarillo' }
];

/** Inserta los clientes de ejemplo solo si aún no existen (por email). */
export async function seedearClientes(): Promise<void> {
	await db
		.insert(clientes)
		.values(CLIENTES_SEED)
		.onConflictDoNothing({ target: clientes.email });
}

/** Inserta los catálogos de Importaciones.xlsx y los grupos de facturación. */
export async function seedearCatalogos(): Promise<void> {
	await db.insert(tiposComprobantes).values(TIPOS_COMPROBANTES_SEED).onConflictDoNothing({ target: tiposComprobantes.nombre });
	await db.insert(tiposPrecios).values(TIPOS_PRECIOS_SEED).onConflictDoNothing({ target: tiposPrecios.nombre });
	await db.insert(monedas).values(MONEDAS_SEED).onConflictDoNothing({ target: monedas.codigo });
	await db.insert(articulos).values(ARTICULOS_SEED).onConflictDoNothing({ target: articulos.codigo });
	await db.insert(tiposGestion).values(TIPOS_GESTION_SEED).onConflictDoNothing({ target: tiposGestion.nombre });
	await db.insert(tiposCliente).values(TIPOS_CLIENTE_SEED).onConflictDoNothing({ target: tiposCliente.nombre });
	await db.insert(modalidadesCobranza).values(MODALIDADES_COBRANZA_SEED).onConflictDoNothing({ target: modalidadesCobranza.nombre });
	await db
		.insert(tiposGestionFacturacion)
		.values(TIPOS_GESTION_FACTURACION_SEED)
		.onConflictDoNothing({ target: tiposGestionFacturacion.nombre });
	await db.insert(gruposFacturacion).values(GRUPOS_FACTURACION_SEED).onConflictDoNothing({ target: gruposFacturacion.nombre });
	// Serie de la planilla de multifacturación: por defecto "A".
	await db.insert(configuracionFacturacion).values({ id: 1, serie: 'A' }).onConflictDoNothing();
}

/**
 * Área del sistema. Es el fallback del bootstrap y no se puede renombrar ni dar
 * de baja. Idempotente: la crea la migración 0033 y este seed la repone si
 * alguien la borró a mano.
 */
export async function seedearAreas(): Promise<void> {
	await db
		.insert(areas)
		.values({ nombre: AREA_TODOS, protegida: true })
		.onConflictDoNothing({ target: areas.nombre });
}

/**
 * Categorías iniciales de tickets. La decisión permite un seed inicial y que
 * los administradores las configuren después; no se seedean áreas.
 */
const CATEGORIAS_TICKETS_SEED = [
	'Consulta',
	'Autorización',
	'Incidencia operativa',
	'Diferencia de saldo',
	'Facturación',
	'Parametrización',
	'Accesos',
	'Coordinación entre áreas',
	'Otra'
];

export async function seedearCategoriasTickets(): Promise<void> {
	await db
		.insert(ticketCategorias)
		.values(
			CATEGORIAS_TICKETS_SEED.map((nombre, orden) => ({
				nombre,
				orden: orden * 10
			}))
		)
		.onConflictDoNothing({ target: ticketCategorias.nombre });
}
