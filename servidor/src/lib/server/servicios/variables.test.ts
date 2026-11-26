import { describe, expect, it } from 'vitest';
import {
	crearSnapshotVariables,
	sustituirVariables,
	textosDesdeSnapshot,
	variablesEnTexto,
	variablesFaltantes
} from './variables.ts';

/**
 * Las variables viven en los comentarios como {{nombre}} y se sustituyen al
 * pasar la factura a Bandeja. El valor no se persiste como par: queda escrito.
 */
describe('variablesEnTexto', () => {
	it('encuentra los nombres sin llaves y sin repetir', () => {
		expect(variablesEnTexto('Factura de {{mes-anio}} y {{ mes-anio }} - {{obra}}')).toEqual([
			'mes-anio',
			'obra'
		]);
	});

	it('devuelve vacío cuando no hay variables', () => {
		expect(variablesEnTexto('Sin variables')).toEqual([]);
		expect(variablesEnTexto(null)).toEqual([]);
	});

	it('no distingue mayúsculas al deduplicar', () => {
		expect(variablesEnTexto('{{MES-ANIO}} y {{mes-anio}} y {{Mes-Anio}}')).toEqual(['MES-ANIO']);
	});
});

describe('sustituirVariables', () => {
	it('reemplaza todas las apariciones del placeholder', () => {
		expect(sustituirVariables('Servicio {{mes-anio}} / {{mes-anio}}', { 'mes-anio': 'OCTUBRE 2026' })).toBe(
			'Servicio OCTUBRE 2026 / OCTUBRE 2026'
		);
	});

	it('deja intacto el placeholder sin valor', () => {
		expect(sustituirVariables('Servicio {{mes-anio}}', {})).toBe('Servicio {{mes-anio}}');
	});

	it('sustituye sin distinguir mayúsculas en el nombre', () => {
		expect(sustituirVariables('Servicio {{MES-ANIO}}', { 'mes-anio': 'OCTUBRE 2026' })).toBe(
			'Servicio OCTUBRE 2026'
		);
		expect(sustituirVariables('Servicio {{mes-anio}}', { 'MES-ANIO': 'OCTUBRE 2026' })).toBe(
			'Servicio OCTUBRE 2026'
		);
	});

	it('respeta los textos nulos', () => {
		expect(sustituirVariables(null, { a: 'b' })).toBeNull();
	});
});

describe('variablesFaltantes', () => {
	it('detecta las variables sin valor entre varios textos', () => {
		const faltantes = variablesFaltantes(
			['{{mes-anio}}', null, '{{obra}} y {{mes-anio}}'],
			{ 'mes-anio': 'OCTUBRE 2026', obra: '   ' }
		);

		expect(faltantes).toEqual(['obra']);
	});

	it('no reporta nada cuando todas tienen valor', () => {
		expect(variablesFaltantes(['{{obra}}'], { obra: 'EJEMPLO' })).toEqual([]);
	});

	it('considera completo el valor aunque el nombre venga en otra caja', () => {
		expect(variablesFaltantes(['{{Obra}}'], { obra: 'EJEMPLO' })).toEqual([]);
		expect(variablesFaltantes(['{{obra}}'], { OBRA: 'EJEMPLO' })).toEqual([]);
	});
});

describe('snapshot de variables', () => {
	const documento = {
		comentarioGeneral: 'Servicio {{mes-anio}} - {{obra}}',
		detalleAuxiliar: null,
		informacionAdicional: '{{mes-anio}}'
	};
	const lineas = [
		{ id: 7, detalle: 'Detalle {{obra}}', comentario: 'Comentario {{mes-anio}}' },
		{ id: 8, detalle: null, comentario: null }
	];

	it('guarda los textos ANTES de sustituir, con los placeholders', () => {
		const snapshot = crearSnapshotVariables(documento, lineas, { 'MES-ANIO': 'OCTUBRE 2026' });

		expect(snapshot.comentarioGeneral).toBe('Servicio {{mes-anio}} - {{obra}}');
		expect(snapshot.informacionAdicional).toBe('{{mes-anio}}');
		expect(snapshot.lineas).toEqual([
			{ id: 7, detalle: 'Detalle {{obra}}', comentario: 'Comentario {{mes-anio}}' },
			{ id: 8, detalle: null, comentario: null }
		]);
		expect(snapshot.valores).toEqual({ 'mes-anio': 'OCTUBRE 2026' });
	});

	it('restaura exactamente los textos originales', () => {
		const snapshot = crearSnapshotVariables(documento, lineas, { 'mes-anio': 'OCTUBRE 2026' });
		const restaurado = textosDesdeSnapshot(snapshot);

		expect(restaurado.comentarioGeneral).toBe(documento.comentarioGeneral);
		expect(restaurado.detalleAuxiliar).toBeNull();
		expect(restaurado.informacionAdicional).toBe(documento.informacionAdicional);
		expect(restaurado.lineas).toEqual(lineas);
	});
});
