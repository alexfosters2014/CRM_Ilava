import type { LayoutServerLoad } from './$types';

/**
 * Carga la configuración visual global (colores de filas alternadas, líneas y
 * espaciado de tablas/listas) para inyectarla como variables CSS en el layout
 * raíz.
 *
 * El frontend no accede a la base: se la pide a la Web API, igual que el proxy
 * de /api. Si la API no responde, se usan los valores por defecto para que el
 * login nunca dependa de esto.
 */
const APARIENCIA_POR_DEFECTO = {
	filaParFondo: '#e2e9f7',
	filaParTexto: '#111827',
	filaImparFondo: '#ffffff',
	filaImparTexto: '#111827',
	tablaLineaColor: '#e3e8f4',
	tablaLineaGrosor: 1,
	filaPaddingY: 2,
	listaLineaColor: '#e3e8f4',
	listaLineaGrosor: 1
};

const apiBase = () => process.env.API_URL ?? 'http://localhost:8080';

export const load: LayoutServerLoad = async ({ fetch }) => {
	try {
		const res = await fetch(`${apiBase()}/api/configuracion/apariencia`);
		if (!res.ok) return { apariencia: APARIENCIA_POR_DEFECTO };
		const apariencia = await res.json();
		return { apariencia };
	} catch {
		return { apariencia: APARIENCIA_POR_DEFECTO };
	}
};
