<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { page } from '$app/state';
	import { CopiaGlobal, PanelUsuarios } from '#lib/componentes/index.ts';
	import { iconos } from '#lib/componentes/iconos.ts';
	import { confirmar } from '#lib/componentes/confirmacion.svelte.ts';
	import {
		APARIENCIA_POR_DEFECTO,
		aplicarAparienciaLocal,
		borrarAparienciaLocal,
		guardarAparienciaLocal,
		leerAparienciaLocal
	} from '#lib/servicios/apariencia.ts';
	import { formatearFechaHora } from '#lib/servicios/fechas.ts';
	import { puedeVer } from '#lib/servicios/sesion.ts';
	import { guardarTema, leerTema, type Tema } from '#lib/servicios/tema.ts';
	import {
		conectarWhatsApp as conectarSesionWhatsApp,
		desconectarWhatsApp as desconectarSesionWhatsApp,
		obtenerEstadoWhatsApp,
		actualizarGrupo,
		actualizarValorCatalogo,
		crearGrupo,
		crearValorCatalogo,
		actualizarGrupoCobranza,
		crearGrupoCobranza,
		eliminarCuentaCorreo,
		desconectarCuentaGmail,
		guardarConfiguracionFacturacion,
		guardarCuentaCorreo,
		listarConfiguracion,
		listarCuentasCorreo,
		listarCuentasGmail,
		probarCuentaCorreo,
		sincronizarCuentaGmail,
		sincronizarTodasGmail,
		urlConectarGmail,
		verificarCuentaCorreo,
		verificarCuentaGmail,
		type Apariencia,
		type CatalogoAdmin,
		type Configuracion,
		type CuentaCorreo,
		type EstadoSesionWhatsApp,
		type GmailCuentaVista,
		type GrupoAdmin,
		type SesionWhatsAppVista,
		type ValorCatalogo
	} from '#lib/servicios-datos-api/index.ts';

	/**
	 * Pantalla: Configuración.
	 *
	 * Catálogos de las importaciones (alta, edición y habilitado), grupos con
	 * sus colores y apariencia global de tablas y listas.
	 */

	type Seccion =
		| 'catalogos'
		| 'grupos'
		| 'apariencia'
		| 'facturacion'
		| 'correo'
		| 'whatsapp'
		| 'usuarios';

	/**
	 * Las pestañas se filtran por los permisos que devuelve la API. Agregar una
	 * opción nueva es agregar su clave en el catálogo del servidor y su entrada
	 * acá: la clave `configuracion.<id>` tiene que existir en ambos lados.
	 */
	const PESTANAS: { id: Seccion; texto: string }[] = [
		{ id: 'catalogos', texto: 'Catálogos' },
		{ id: 'grupos', texto: 'Grupos' },
		{ id: 'apariencia', texto: 'Apariencia' },
		{ id: 'facturacion', texto: 'Facturación' },
		{ id: 'correo', texto: 'Correo' },
		{ id: 'whatsapp', texto: 'WhatsApp' },
		{ id: 'usuarios', texto: 'Usuarios' }
	];

	const sesion = $derived(page.data as unknown as { admin: boolean; permisos: string[] });
	const pestanasVisibles = $derived(
		PESTANAS.filter((item) => puedeVer(sesion, `configuracion.${item.id}`))
	);

	// Si la sección activa no está habilitada (o no existe), cae en la primera
	// permitida. Cubre también el enlace directo ?seccion=correo sin permiso.
	$effect(() => {
		if (pestanasVisibles.length > 0 && !pestanasVisibles.some((item) => item.id === seccion)) {
			seccion = pestanasVisibles[0].id;
		}
	});

	// Apariencia de tablas/listas: se guarda en este navegador. Si no hay nada
	// guardado se usa la que define el servidor; si tampoco hay, la de fábrica.
	const aparienciaBase = (page.data.apariencia as Apariencia | undefined) ?? APARIENCIA_POR_DEFECTO;

	const CATALOGOS: { clave: CatalogoAdmin; etiqueta: string }[] = [
		{ clave: 'tipos-comprobantes', etiqueta: 'Tipos de comprobante' },
		{ clave: 'monedas', etiqueta: 'Monedas' },
		{ clave: 'tipos-precios', etiqueta: 'Tipos de precio' },
		{ clave: 'tipos-gestion', etiqueta: 'Tipos de gestión' },
		{ clave: 'tipos-cliente', etiqueta: 'Tipos de cliente' },
		{ clave: 'modalidades-cobranza', etiqueta: 'Modalidades de cobranza' },
		{ clave: 'tipos-gestion-facturacion', etiqueta: 'Gestión de facturación' },
		{ clave: 'articulos', etiqueta: 'Artículos' }
	];

	const CLAVES: Record<CatalogoAdmin, keyof Configuracion['catalogos']> = {
		'tipos-comprobantes': 'tiposComprobantes',
		'tipos-precios': 'tiposPrecios',
		monedas: 'monedas',
		'tipos-gestion': 'tiposGestion',
		'tipos-cliente': 'tiposCliente',
		'modalidades-cobranza': 'modalidadesCobranza',
		'tipos-gestion-facturacion': 'tiposGestionFacturacion',
		articulos: 'articulos'
	};

	// Arranca en Catálogos y el efecto de abajo la corrige si esa opción no está
	// habilitada. No se inicializa con `pestanasVisibles` para no capturar el
	// valor inicial de un derivado.
	let seccion = $state<Seccion>('catalogos');
	let catalogoActivo = $state<CatalogoAdmin>('tipos-comprobantes');
	let config = $state<Configuracion | null>(null);
	let cargando = $state(true);
	let guardando = $state(false);
	let error = $state<string | null>(null);
	let aviso = $state<string | null>(null);

	// --- Correo: cuentas SMTP y alias de envío ---
	let cuentasCorreo = $state<CuentaCorreo[]>([]);
	let cargandoCorreo = $state(false);
	let destinoPrueba = $state('');
	let probandoCuenta = $state<number | null>(null);
	let verificandoCuenta = $state<number | null>(null);

	// --- Correo: cuentas Gmail conectadas por OAuth (seguimientos y tickets) ---
	let gmailCuentas = $state<GmailCuentaVista[]>([]);
	let gmailConfigurado = $state(true);
	let gmailTiempoReal = $state(false);
	let cargandoGmail = $state(false);
	let verificandoGmail = $state<number | null>(null);
	let sincronizandoGmail = $state<number | 'todas' | null>(null);
	let gmailAviso = $state('');
	let gmailError = $state('');

	// --- WhatsApp Web: sesión única de la empresa (Baileys) ---
	let whatsapp = $state<SesionWhatsAppVista | null>(null);
	let cargandoWhatsapp = $state(false);
	let accionWhatsapp = $state<'conectar' | 'desconectar' | 'cerrar' | null>(null);
	let errorWhatsapp = $state('');
	let avisoWhatsapp = $state('');
	let consultandoWhatsapp = false;
	let temporizadorWhatsapp: ReturnType<typeof setInterval> | null = null;

	let modalCuenta = $state<null | {
		id?: number;
		nombre: string;
		email: string;
		host: string;
		puerto: number;
		seguro: boolean;
		usuario: string;
		clave: string;
		activo: boolean;
		predeterminada: boolean;
		aliasTexto: string;
	}>(null);

	function aliasATexto(cuenta?: CuentaCorreo) {
		return (cuenta?.alias ?? [])
			.map((item) => (item.nombreVisible ? `${item.email} | ${item.nombreVisible}` : item.email))
			.join('\n');
	}

	async function cargarCorreo() {
		cargandoCorreo = true;
		try {
			cuentasCorreo = await listarCuentasCorreo();
		} catch (e) {
			error = (e as Error).message;
		} finally {
			cargandoCorreo = false;
		}
	}

	async function cargarGmail() {
		cargandoGmail = true;
		gmailError = '';
		try {
			const resultado = await listarCuentasGmail();
			gmailCuentas = resultado.cuentas;
			gmailConfigurado = resultado.configurado;
			gmailTiempoReal = resultado.tiempoReal;
		} catch (e) {
			gmailError = (e as Error).message;
		} finally {
			cargandoGmail = false;
		}
	}

	function conectarGmail() {
		window.location.href = urlConectarGmail();
	}

	async function verificarGmail(cuenta: GmailCuentaVista) {
		verificandoGmail = cuenta.id;
		gmailAviso = '';
		gmailError = '';
		try {
			const resultado = await verificarCuentaGmail(cuenta.id);
			if (resultado.ok) gmailAviso = `Conexión OK con ${resultado.email ?? cuenta.email}`;
			else gmailError = resultado.error ?? 'Google rechazó la conexión';
			await cargarGmail();
		} catch (e) {
			gmailError = (e as Error).message;
		} finally {
			verificandoGmail = null;
		}
	}

	async function sincronizarGmail(cuenta?: GmailCuentaVista) {
		sincronizandoGmail = cuenta ? cuenta.id : 'todas';
		gmailAviso = '';
		gmailError = '';
		try {
			const resultados = cuenta
				? [await sincronizarCuentaGmail(cuenta.id)]
				: await sincronizarTodasGmail();
			const fallas = resultados.filter((item) => item.error);
			const nuevos = resultados.reduce((total, item) => total + item.nuevos, 0);
			gmailAviso = fallas.length
				? `Sincronización con errores: ${fallas.map((item) => `${item.cuenta}: ${item.error}`).join(' · ')}`
				: `Sincronización completa: ${nuevos} mensaje(s) nuevo(s).`;
			if (fallas.length) gmailError = gmailAviso;
			await cargarGmail();
		} catch (e) {
			gmailError = (e as Error).message;
		} finally {
			sincronizandoGmail = null;
		}
	}

	async function desconectarGmail(cuenta: GmailCuentaVista) {
		const confirmado = await confirmar({
			titulo: 'Desconectar cuenta',
			mensaje: `¿Desconectar ${cuenta.email}? El histórico se conserva.`,
			tono: 'peligro',
			etiquetaConfirmar: 'Desconectar'
		});
		if (!confirmado) return;
		try {
			await desconectarCuentaGmail(cuenta.id);
			gmailAviso = `Cuenta ${cuenta.email} desconectada`;
			await cargarGmail();
		} catch (e) {
			gmailError = (e as Error).message;
		}
	}

	// ---------------------------------------------------------------- WhatsApp

	const ETIQUETAS_WHATSAPP: Record<EstadoSesionWhatsApp, string> = {
		DESCONECTADO: 'Desconectado',
		ESPERANDO_QR: 'Esperando vinculación',
		CONECTADO: 'Conectado',
		RECONECTANDO: 'Reconectando',
		CERRADO: 'Sesión cerrada'
	};

	const DESCRIPCIONES_WHATSAPP: Record<EstadoSesionWhatsApp, string> = {
		DESCONECTADO: 'La sesión está apagada. Conectá para vincular o retomar el número.',
		ESPERANDO_QR: 'Escaneá el código desde el teléfono de la empresa.',
		CONECTADO: 'El número puede enviar y recibir mensajes desde el CRM.',
		RECONECTANDO: 'Se perdió la conexión y se está reintentando automáticamente.',
		CERRADO: 'WhatsApp invalidó la sesión. Hace falta un QR nuevo.'
	};

	function formatoTelefonoWhatsApp(numero: string | null): string {
		if (!numero) return 'Sin número vinculado';
		if (numero.startsWith('598') && numero.length === 11) {
			return `+598 ${numero.slice(3, 5)} ${numero.slice(5, 8)} ${numero.slice(8)}`;
		}
		return `+${numero}`;
	}

	function detenerPollingWhatsapp() {
		if (temporizadorWhatsapp) {
			clearInterval(temporizadorWhatsapp);
			temporizadorWhatsapp = null;
		}
	}

	function iniciarPollingWhatsapp() {
		if (temporizadorWhatsapp) return;
		temporizadorWhatsapp = setInterval(() => {
			if (seccion !== 'whatsapp') return;
			void cargarWhatsapp(true);
		}, 2500);
	}

	async function cargarWhatsapp(silencioso = false) {
		if (consultandoWhatsapp) return;
		consultandoWhatsapp = true;
		if (!silencioso) cargandoWhatsapp = true;
		try {
			const estado = await obtenerEstadoWhatsApp();
			whatsapp = estado;
			// El aviso de "escaneá el QR" deja de aplicar apenas el estado cambia
			// (por ejemplo, si el stream se reinicia solo).
			if (estado.estado !== 'ESPERANDO_QR' && avisoWhatsapp.startsWith('Escaneá')) {
				avisoWhatsapp = '';
			}
			if (estado.estado === 'ESPERANDO_QR') iniciarPollingWhatsapp();
			else detenerPollingWhatsapp();
		} catch (e) {
			if (!silencioso) errorWhatsapp = (e as Error).message;
		} finally {
			consultandoWhatsapp = false;
			if (!silencioso) cargandoWhatsapp = false;
		}
	}

	async function conectarWhatsapp() {
		accionWhatsapp = 'conectar';
		errorWhatsapp = '';
		avisoWhatsapp = '';
		try {
			whatsapp = await conectarSesionWhatsApp();
			if (whatsapp.estado === 'ESPERANDO_QR') {
				avisoWhatsapp = 'Escaneá el QR desde WhatsApp del teléfono. Se renueva solo.';
				iniciarPollingWhatsapp();
			} else if (whatsapp.estado === 'CONECTADO') {
				avisoWhatsapp = 'Sesión conectada.';
			}
		} catch (e) {
			errorWhatsapp = (e as Error).message;
		} finally {
			accionWhatsapp = null;
		}
	}

	async function desconectarWhatsapp(cerrarSesion: boolean) {
		if (cerrarSesion) {
			const confirmado = await confirmar({
				titulo: 'Cerrar sesión de WhatsApp',
				mensaje:
					'Se desvincula el dispositivo y hay que escanear un QR nuevo.',
				tono: 'peligro',
				etiquetaConfirmar: 'Cerrar sesión'
			});
			if (!confirmado) return;
		}
		accionWhatsapp = cerrarSesion ? 'cerrar' : 'desconectar';
		errorWhatsapp = '';
		avisoWhatsapp = '';
		try {
			whatsapp = await desconectarSesionWhatsApp(cerrarSesion);
			detenerPollingWhatsapp();
			avisoWhatsapp = cerrarSesion
				? 'Sesión cerrada y credenciales borradas.'
				: 'Conexión pausada. Las credenciales quedan guardadas.';
		} catch (e) {
			errorWhatsapp = (e as Error).message;
		} finally {
			accionWhatsapp = null;
		}
	}

	function abrirCuenta(cuenta?: CuentaCorreo) {
		modalCuenta = cuenta
			? {
					id: cuenta.id,
					nombre: cuenta.nombre,
					email: cuenta.email,
					host: cuenta.host,
					puerto: cuenta.puerto,
					seguro: cuenta.seguro,
					usuario: cuenta.usuario,
					clave: '',
					activo: cuenta.activo,
					predeterminada: cuenta.predeterminada,
					aliasTexto: aliasATexto(cuenta)
				}
			: {
					nombre: '',
					email: '',
					host: 'smtp.gmail.com',
					puerto: 587,
					seguro: false,
					usuario: '',
					clave: '',
					activo: true,
					predeterminada: false,
					aliasTexto: ''
				};
	}

	async function guardarCuentaFormulario() {
		if (!modalCuenta) return;
		guardando = true;
		error = null;
		aviso = null;
		try {
			const alias = modalCuenta.aliasTexto
				.split('\n')
				.map((linea) => linea.trim())
				.filter(Boolean)
				.map((linea) => {
					const [email, nombreVisible] = linea.split('|').map((parte) => parte.trim());
					return { email, nombreVisible: nombreVisible || null, activo: true };
				});
			await guardarCuentaCorreo({
				id: modalCuenta.id,
				nombre: modalCuenta.nombre,
				email: modalCuenta.email,
				host: modalCuenta.host,
				puerto: Number(modalCuenta.puerto) || 587,
				seguro: modalCuenta.seguro,
				usuario: modalCuenta.usuario,
				clave: modalCuenta.clave.trim() || undefined,
				activo: modalCuenta.activo,
				predeterminada: modalCuenta.predeterminada,
				alias
			});
			modalCuenta = null;
			await cargarCorreo();
			aviso = 'Cuenta de correo guardada';
		} catch (e) {
			error = (e as Error).message;
		} finally {
			guardando = false;
		}
	}

	async function borrarCuenta(cuenta: CuentaCorreo) {
		const confirmado = await confirmar({
			titulo: 'Eliminar cuenta',
			mensaje: `¿Eliminar la cuenta ${cuenta.nombre}?`,
			tono: 'peligro',
			etiquetaConfirmar: 'Eliminar'
		});
		if (!confirmado) return;
		try {
			await eliminarCuentaCorreo(cuenta.id);
			await cargarCorreo();
			aviso = 'Cuenta eliminada';
		} catch (e) {
			error = (e as Error).message;
		}
	}

	async function probar(cuenta: CuentaCorreo) {
		probandoCuenta = cuenta.id;
		error = null;
		aviso = null;
		try {
			await probarCuentaCorreo({ destino: destinoPrueba || cuenta.email, cuentaId: cuenta.id });
			aviso = `Correo de prueba enviado desde ${cuenta.email}`;
		} catch (e) {
			error = (e as Error).message;
		} finally {
			probandoCuenta = null;
			await cargarCorreo();
		}
	}

	async function verificar(cuenta: CuentaCorreo) {
		verificandoCuenta = cuenta.id;
		error = null;
		aviso = null;
		try {
			const resultado = await verificarCuentaCorreo(cuenta.id);
			if (resultado.ok) {
				aviso = `Credencial de ${cuenta.email} verificada correctamente`;
			} else {
				error = resultado.error ?? 'La verificación de la credencial falló';
			}
		} catch (e) {
			error = (e as Error).message;
		} finally {
			verificandoCuenta = null;
			await cargarCorreo();
		}
	}

	let modalValor = $state<{
		modo: 'nuevo' | 'editar';
		id?: number;
		nombre: string;
		abreviatura: string;
		descripcion: string;
		monedaId: string;
	} | null>(null);

	let modalGrupo = $state<{
		modo: 'nuevo' | 'editar';
		tipo: 'facturacion' | 'cobranza';
		id?: number;
		nombre: string;
		colorFondo: string;
		colorTexto: string;
		orden: number;
	} | null>(null);

	/** Solapa activa dentro de Grupos: facturación o cobranza. */
	let tipoGrupo = $state<'facturacion' | 'cobranza'>('facturacion');
	let gruposActuales = $derived(
		tipoGrupo === 'facturacion' ? (config?.grupos ?? []) : (config?.gruposCobranza ?? [])
	);

	let apariencia = $state<Apariencia>({ ...aparienciaBase });

	/** Última apariencia guardada en este navegador: avisa si hay cambios sin guardar. */
	let aparienciaOriginal = $state<Apariencia>({ ...aparienciaBase });
	/** Evita aplicar la vista previa antes de leer la apariencia local. */
	let aparienciaLista = $state(false);

	// Facturación: serie de la planilla de multifacturación.
	let serie = $state('A');
	let serieOriginal = $state('A');

	// Tema de la interfaz: por navegador, oscuro por defecto.
	let tema = $state<Tema>('oscuro');

	onMount(() => {
		tema = leerTema();
		// La apariencia es por navegador; si no hay nada guardado queda la del servidor.
		const aparienciaLocal = leerAparienciaLocal();
		if (aparienciaLocal) {
			apariencia = { ...aparienciaLocal };
			aparienciaOriginal = { ...aparienciaLocal };
		}
		aparienciaLista = true;
		void cargar();
		// Enlace directo a una sección: /configuracion?seccion=usuarios
		// (la copia de control interno sigue viviendo en la solapa Correo).
		const solicitada = new URLSearchParams(window.location.search).get('seccion');
		const destino: Seccion | null =
			solicitada === 'cobranza'
				? 'correo'
				: PESTANAS.some((pestana) => pestana.id === solicitada)
					? (solicitada as Seccion)
					: null;

		if (destino && puedeVer(sesion, `configuracion.${destino}`)) {
			seccion = destino;
			if (destino === 'correo') {
				void cargarCorreo();
				void cargarGmail();
			}
			if (destino === 'whatsapp') void cargarWhatsapp();
		}

		const gmail = new URLSearchParams(window.location.search).get('gmail');
		if (gmail === 'ok') gmailAviso = 'Cuenta de Gmail conectada correctamente.';
		else if (gmail === 'cancelado') gmailAviso = 'La autorización de Google se canceló.';
		else if (gmail === 'error') gmailError = 'No se pudo completar la autorización con Google. Revisá los logs del servidor.';

		return detenerPollingWhatsapp;
	});

	onDestroy(detenerPollingWhatsapp);

	async function cargar() {
		cargando = true;
		error = null;
		try {
			config = await listarConfiguracion();
			serie = config.facturacion?.serie ?? 'A';
			serieOriginal = serie;
		} catch (e) {
			error = (e as Error).message;
		} finally {
			cargando = false;
		}
	}

	let valores = $derived(config ? (config.catalogos[CLAVES[catalogoActivo]] ?? []) : []);

	let etiquetaCatalogo = $derived(
		CATALOGOS.find((catalogo) => catalogo.clave === catalogoActivo)?.etiqueta ?? ''
	);

	/** Campos extra según el catálogo. */
	function esComprobante() {
		return catalogoActivo === 'tipos-comprobantes';
	}
	function esPrecio() {
		return catalogoActivo === 'tipos-precios';
	}
	function usaCodigo() {
		return catalogoActivo === 'monedas' || catalogoActivo === 'articulos';
	}

	function abrirNuevo() {
		modalValor = { modo: 'nuevo', nombre: '', abreviatura: '', descripcion: '', monedaId: '' };
	}

	function abrirEdicion(valor: ValorCatalogo) {
		modalValor = {
			modo: 'editar',
			id: valor.id,
			nombre: valor.nombre,
			abreviatura: valor.abreviatura ?? '',
			descripcion: valor.descripcion ?? '',
			monedaId: valor.monedaId ? String(valor.monedaId) : ''
		};
	}

	async function guardarValor() {
		if (!modalValor) return;
		guardando = true;
		error = null;
		aviso = null;

		const nombre = modalValor.nombre.trim();
		const datos = {
			...(usaCodigo() ? { codigo: nombre } : { nombre }),
			...(esComprobante() ? { abreviatura: modalValor.abreviatura.trim() || null } : {}),
			...(catalogoActivo === 'articulos' ? { descripcion: modalValor.descripcion.trim() || nombre } : {}),
			...(esPrecio() ? { monedaId: modalValor.monedaId ? Number(modalValor.monedaId) : null } : {})
		};

		try {
			if (modalValor.modo === 'nuevo') {
				await crearValorCatalogo(catalogoActivo, datos);
				aviso = 'Valor creado';
			} else {
				await actualizarValorCatalogo(catalogoActivo, modalValor.id!, datos);
				aviso = 'Valor actualizado';
			}
			modalValor = null;
			await cargar();
		} catch (e) {
			error = (e as Error).message;
		} finally {
			guardando = false;
		}
	}

	async function alternarValor(valor: ValorCatalogo, activo: boolean) {
		guardando = true;
		error = null;
		try {
			await actualizarValorCatalogo(catalogoActivo, valor.id, { activo });
			await cargar();
		} catch (e) {
			error = (e as Error).message;
		} finally {
			guardando = false;
		}
	}

	// ---------- Grupos ----------

	function abrirNuevoGrupo() {
		modalGrupo = {
			modo: 'nuevo',
			tipo: tipoGrupo,
			nombre: '',
			colorFondo: '#3346b8',
			colorTexto: '#ffffff',
			orden: 0
		};
	}

	function abrirEdicionGrupo(grupo: GrupoAdmin) {
		modalGrupo = {
			modo: 'editar',
			tipo: tipoGrupo,
			id: grupo.id,
			nombre: grupo.nombre,
			colorFondo: grupo.colorFondo,
			colorTexto: grupo.colorTexto,
			orden: 'orden' in grupo ? Number(grupo.orden) : 0
		};
	}

	async function guardarGrupo() {
		if (!modalGrupo) return;
		guardando = true;
		error = null;
		aviso = null;

		const datos = {
			nombre: modalGrupo.nombre.trim(),
			colorFondo: modalGrupo.colorFondo,
			colorTexto: modalGrupo.colorTexto
		};

		try {
			if (modalGrupo.tipo === 'cobranza') {
				const datosCobranza = { ...datos, orden: Number(modalGrupo.orden) || 0 };
				if (modalGrupo.modo === 'nuevo') {
					await crearGrupoCobranza(datosCobranza);
					aviso = 'Grupo de cobranza creado';
				} else {
					await actualizarGrupoCobranza(modalGrupo.id!, datosCobranza);
					aviso = 'Grupo de cobranza actualizado';
				}
			} else if (modalGrupo.modo === 'nuevo') {
				await crearGrupo(datos);
				aviso = 'Grupo creado';
			} else {
				await actualizarGrupo(modalGrupo.id!, datos);
				aviso = 'Grupo actualizado';
			}
			modalGrupo = null;
			await cargar();
		} catch (e) {
			error = (e as Error).message;
		} finally {
			guardando = false;
		}
	}

	async function alternarGrupo(grupo: GrupoAdmin, activo: boolean, tipo: 'facturacion' | 'cobranza') {
		guardando = true;
		error = null;
		try {
			if (tipo === 'cobranza') await actualizarGrupoCobranza(grupo.id, { activo });
			else await actualizarGrupo(grupo.id, { activo });
			await cargar();
		} catch (e) {
			error = (e as Error).message;
		} finally {
			guardando = false;
		}
	}

	// ---------- Apariencia ----------

	const PROPS_APARIENCIA = [
		'--fila-par-fondo',
		'--fila-par-texto',
		'--fila-impar-fondo',
		'--fila-impar-texto',
		'--tabla-linea-color',
		'--tabla-linea-grosor',
		'--fila-padding-y',
		'--lista-linea-color',
		'--lista-linea-grosor'
	] as const;

	/** Quita la vista previa en línea para que manden los tokens del tema. */
	function limpiarAparienciaInline() {
		const raiz = document.documentElement;
		for (const prop of PROPS_APARIENCIA) raiz.style.removeProperty(prop);
	}

	/** Cambia el tema y lo guarda para este navegador. */
	function cambiarTema(nuevo: Tema) {
		tema = nuevo;
		guardarTema(nuevo);
		if (nuevo === 'oscuro') limpiarAparienciaInline();
	}

	/**
	 * Aplica los colores al instante. La apariencia de filas es del modo claro:
	 * en oscuro se limpian para que manden los tokens del tema.
	 */
	function aplicarVistaPrevia() {
		const raiz = document.documentElement;
		if (tema !== 'claro') {
			limpiarAparienciaInline();
			return;
		}
		raiz.style.setProperty('--fila-par-fondo', apariencia.filaParFondo);
		raiz.style.setProperty('--fila-par-texto', apariencia.filaParTexto);
		raiz.style.setProperty('--fila-impar-fondo', apariencia.filaImparFondo);
		raiz.style.setProperty('--fila-impar-texto', apariencia.filaImparTexto);
		raiz.style.setProperty('--tabla-linea-color', apariencia.tablaLineaColor);
		raiz.style.setProperty('--tabla-linea-grosor', `${apariencia.tablaLineaGrosor}px`);
		raiz.style.setProperty('--fila-padding-y', `${apariencia.filaPaddingY}px`);
		raiz.style.setProperty('--lista-linea-color', apariencia.listaLineaColor);
		raiz.style.setProperty('--lista-linea-grosor', `${apariencia.listaLineaGrosor}px`);
	}

	/**
	 * La vista previa va en un `$effect` y no en `oninput`: Svelte ejecuta el
	 * listener de `oninput` ANTES de actualizar `bind:value`, así que pintar ahí
	 * dejaba la app con el color anterior (el usuario elegía un color y no veía
	 * ningún cambio, como si no se hubiera guardado).
	 */
	$effect(() => {
		if (!aparienciaLista) return;
		aplicarVistaPrevia();
	});

	/** Hay colores en pantalla que todavía no se guardaron en la base. */
	let hayCambios = $derived(
		apariencia.filaParFondo !== aparienciaOriginal.filaParFondo ||
			apariencia.filaParTexto !== aparienciaOriginal.filaParTexto ||
			apariencia.filaImparFondo !== aparienciaOriginal.filaImparFondo ||
			apariencia.filaImparTexto !== aparienciaOriginal.filaImparTexto ||
			apariencia.tablaLineaColor !== aparienciaOriginal.tablaLineaColor ||
			apariencia.tablaLineaGrosor !== aparienciaOriginal.tablaLineaGrosor ||
			apariencia.filaPaddingY !== aparienciaOriginal.filaPaddingY ||
			apariencia.listaLineaColor !== aparienciaOriginal.listaLineaColor ||
			apariencia.listaLineaGrosor !== aparienciaOriginal.listaLineaGrosor
	);

	function guardarColores() {
		guardarAparienciaLocal(apariencia);
		limpiarAparienciaInline();
		aplicarAparienciaLocal(apariencia);
		aparienciaOriginal = { ...apariencia };
		aviso = 'Apariencia guardada en este navegador';
	}

	function restablecerColores() {
		borrarAparienciaLocal();
		limpiarAparienciaInline();
		aplicarAparienciaLocal(null);
		apariencia = { ...aparienciaBase };
		aparienciaOriginal = { ...aparienciaBase };
		aviso = 'Apariencia restablecida a la predeterminada';
	}

	// ---------- Facturación ----------

	let hayCambiosSerie = $derived(serie.trim() !== serieOriginal);

	async function guardarSerie() {
		guardando = true;
		error = null;
		aviso = null;
		try {
			await guardarConfiguracionFacturacion({ serie: serie.trim() });
			serieOriginal = serie.trim();
			serie = serie.trim();
			aviso = 'Serie guardada';
		} catch (e) {
			error = (e as Error).message;
		} finally {
			guardando = false;
		}
	}
</script>

<svelte:head>
	<title>CRM — Configuración</title>
</svelte:head>

<section class="pantalla">
	<nav class="pestanas" aria-label="Configuración">
		{#each pestanasVisibles as item}
			<button
				type="button"
				class:seleccionada={seccion === item.id}
				onclick={() => {
					seccion = item.id;
					if (seccion === 'correo') {
						if (cuentasCorreo.length === 0) void cargarCorreo();
						if (gmailCuentas.length === 0) void cargarGmail();
					}
					if (seccion === 'whatsapp' && !whatsapp) void cargarWhatsapp();
					if (seccion !== 'whatsapp') detenerPollingWhatsapp();
				}}
			>
				{item.texto}
			</button>
		{/each}
	</nav>

	{#if error}
		<p class="mensaje error-mensaje" role="alert">{error}</p>
	{/if}
	{#if aviso}
		<p class="mensaje ok-mensaje" role="status">{aviso}</p>
	{/if}

	{#if cargando}
		<div class="estado-vacio"><p>Cargando configuración…</p></div>
	{:else if seccion === 'catalogos'}
		<div class="barra-herramientas">
			<div class="subpestanas">
				{#each CATALOGOS as catalogo}
					<button
						type="button"
						class:seleccionada={catalogoActivo === catalogo.clave}
						onclick={() => (catalogoActivo = catalogo.clave)}
					>
						{catalogo.etiqueta}
					</button>
				{/each}
			</div>
			<button type="button" class="btn-primario" onclick={abrirNuevo}>Nuevo valor</button>
		</div>

		<div class="tabla" role="table" aria-label={etiquetaCatalogo}>
			<div class="cabecera-tabla" class:con-extra={esComprobante() || esPrecio() || catalogoActivo === 'articulos'}>
				<span>Estado</span>
				<span>{usaCodigo() ? 'Código' : 'Nombre'}</span>
				{#if esComprobante()}<span>Abreviatura</span>{/if}
				{#if esPrecio()}<span>Moneda</span>{/if}
				{#if catalogoActivo === 'articulos'}<span>Descripción</span>{/if}
				<span aria-hidden="true"></span>
			</div>

			{#each valores as valor, indice (valor.id)}
				<div class="fila" class:con-extra={esComprobante() || esPrecio() || catalogoActivo === 'articulos'} class:par={indice % 2 === 1}>
					<span class="celda">
						<label class="switch" title={valor.activo ? 'Deshabilitar' : 'Habilitar'}>
							<input
								type="checkbox"
								checked={valor.activo}
								disabled={guardando}
								onchange={(evento) => alternarValor(valor, evento.currentTarget.checked)}
								aria-label={`Habilitado: ${valor.nombre}`}
							/>
							<span class="pista"></span>
						</label>
					</span>
					<span class="celda"><strong>{valor.nombre}</strong></span>
					{#if esComprobante()}<span class="celda">{valor.abreviatura ?? '—'}</span>{/if}
					{#if esPrecio()}<span class="celda">{valor.moneda ?? '—'}</span>{/if}
					{#if catalogoActivo === 'articulos'}<span class="celda">{valor.descripcion ?? '—'}</span>{/if}
					<span class="celda acciones-fila">
						<button
							type="button"
							class="btn-icono"
							aria-label={`Editar ${valor.nombre}`}
							title="Editar"
							onclick={() => abrirEdicion(valor)}
						>
							{@html iconos.lapiz}
						</button>
					</span>
				</div>
			{/each}
		</div>
	{:else if seccion === 'grupos'}
		<div class="barra-herramientas">
			<div class="subpestanas">
				<button type="button" class:seleccionada={tipoGrupo === 'facturacion'} onclick={() => (tipoGrupo = 'facturacion')}>
					Facturación
				</button>
				<button type="button" class:seleccionada={tipoGrupo === 'cobranza'} onclick={() => (tipoGrupo = 'cobranza')}>
					Cobranza
				</button>
			</div>
			<button type="button" class="btn-primario" onclick={abrirNuevoGrupo}>Nuevo grupo</button>
		</div>
		<p class="texto-ayuda">
			{tipoGrupo === 'facturacion'
				? 'El color de la cabecera se aplica en las tablas de Plantillas y Facturador.'
				: 'Los grupos de cobranza son independientes: agrupan la cartera por cobrador, zona o campaña. El orden define la posición del bloque.'}
		</p>

		<div class="tabla" role="table" aria-label={tipoGrupo === 'facturacion' ? 'Grupos de facturación' : 'Grupos de cobranza'}>
			<div class="cabecera-tabla">
				<span>Estado</span>
				<span>Grupo</span>
				<span>Fondo</span>
				<span>Letra</span>
				<span aria-hidden="true"></span>
			</div>

			{#each gruposActuales as grupo, indice (grupo.id)}
				<div class="fila" class:par={indice % 2 === 1}>
					<span class="celda">
						<label class="switch" title={grupo.activo ? 'Deshabilitar' : 'Habilitar'}>
							<input
								type="checkbox"
								checked={grupo.activo}
								disabled={guardando}
								onchange={(evento) => alternarGrupo(grupo, evento.currentTarget.checked, tipoGrupo)}
								aria-label={`Habilitado: ${grupo.nombre}`}
							/>
							<span class="pista"></span>
						</label>
					</span>
					<span class="celda">
						<span class="muestra-grupo" style="background: {grupo.colorFondo}; color: {grupo.colorTexto}">
							{grupo.nombre}
						</span>
					</span>
					<span class="celda"><span class="swatch" style="background: {grupo.colorFondo}"></span> {grupo.colorFondo}</span>
					<span class="celda"><span class="swatch" style="background: {grupo.colorTexto}"></span> {grupo.colorTexto}</span>
					<span class="celda acciones-fila">
						<button
							type="button"
							class="btn-icono"
							aria-label={`Editar ${grupo.nombre}`}
							title="Editar grupo"
							onclick={() => abrirEdicionGrupo(grupo)}
						>
							{@html iconos.lapiz}
						</button>
					</span>
				</div>
			{/each}
		</div>
	{:else if seccion === 'apariencia'}
		<div class="panel-apariencia">
			<section class="grupo-ajustes">
				<h3>Tema de la interfaz</h3>
				<p class="texto-ayuda">
					Se guarda en este navegador. El modo oscuro es el predeterminado.
				</p>
				<div class="rejilla-temas">
					<button
						type="button"
						class="tema-opcion"
						class:activo={tema === 'oscuro'}
						aria-pressed={tema === 'oscuro'}
						onclick={() => cambiarTema('oscuro')}
					>
						<span class="tema-muestra tema-muestra-oscuro" aria-hidden="true"><i></i><i></i><i></i></span>
						<span class="tema-texto"><strong>Oscuro</strong><small>Predeterminado</small></span>
					</button>
					<button
						type="button"
						class="tema-opcion"
						class:activo={tema === 'claro'}
						aria-pressed={tema === 'claro'}
						onclick={() => cambiarTema('claro')}
					>
						<span class="tema-muestra tema-muestra-claro" aria-hidden="true"><i></i><i></i><i></i></span>
						<span class="tema-texto"><strong>Claro</strong><small>Paleta original</small></span>
					</button>
				</div>
			</section>

			<p class="texto-ayuda">
				Los colores de filas y líneas se aplican al instante en modo claro. En oscuro, la
				tabla usa la paleta del tema. La apariencia se guarda en este navegador: cada uno
				puede tener la suya.
			</p>

			<section class="grupo-ajustes">
				<h3>Colores de las filas · modo claro</h3>
				<div class="rejilla-colores">
					<label class="campo">
						<span>Fila par · fondo</span>
						<div class="fila-color">
							<input type="color" bind:value={apariencia.filaParFondo} />
							<code>{apariencia.filaParFondo}</code>
						</div>
					</label>
					<label class="campo">
						<span>Fila par · letra</span>
						<div class="fila-color">
							<input type="color" bind:value={apariencia.filaParTexto} />
							<code>{apariencia.filaParTexto}</code>
						</div>
					</label>
					<label class="campo">
						<span>Fila impar · fondo</span>
						<div class="fila-color">
							<input type="color" bind:value={apariencia.filaImparFondo} />
							<code>{apariencia.filaImparFondo}</code>
						</div>
					</label>
					<label class="campo">
						<span>Fila impar · letra</span>
						<div class="fila-color">
							<input type="color" bind:value={apariencia.filaImparTexto} />
							<code>{apariencia.filaImparTexto}</code>
						</div>
					</label>
				</div>
			</section>

			<section class="grupo-ajustes">
				<h3>Línea y espaciado de la tabla</h3>
				<p class="texto-ayuda">Se aplica a las tablas de Plantillas, Facturador y Bandeja.</p>
				<div class="rejilla-colores">
					<label class="campo">
						<span>Línea · color</span>
						<div class="fila-color">
							<input type="color" bind:value={apariencia.tablaLineaColor} />
							<code>{apariencia.tablaLineaColor}</code>
						</div>
					</label>
					<label class="campo">
						<span>Línea · grosor</span>
						<div class="fila-rango">
							<input
								type="range"
								min="0"
								max="4"
								step="1"
								bind:value={apariencia.tablaLineaGrosor}
							/>
							<code>{apariencia.tablaLineaGrosor} px</code>
						</div>
					</label>
					<label class="campo">
						<span>Espaciado vertical de la fila</span>
						<div class="fila-rango">
							<input
								type="range"
								min="0"
								max="20"
								step="1"
								bind:value={apariencia.filaPaddingY}
							/>
							<code>{apariencia.filaPaddingY} px</code>
						</div>
					</label>
				</div>
			</section>

			<section class="grupo-ajustes">
				<h3>Línea de los ítems de lista</h3>
				<div class="rejilla-colores">
					<label class="campo">
						<span>Lista · color</span>
						<div class="fila-color">
							<input type="color" bind:value={apariencia.listaLineaColor} />
							<code>{apariencia.listaLineaColor}</code>
						</div>
					</label>
					<label class="campo">
						<span>Lista · grosor</span>
						<div class="fila-rango">
							<input
								type="range"
								min="0"
								max="4"
								step="1"
								bind:value={apariencia.listaLineaGrosor}
							/>
							<code>{apariencia.listaLineaGrosor} px</code>
						</div>
					</label>
				</div>
			</section>

			<div class="vista-previa">
				<div
					class="fila-demo"
					style="background: {apariencia.filaImparFondo}; color: {apariencia.filaImparTexto}; padding-block: {apariencia.filaPaddingY}px; border-bottom: {apariencia.tablaLineaGrosor}px solid {apariencia.tablaLineaColor}"
				>
					Fila impar
				</div>
				<div
					class="fila-demo"
					style="background: {apariencia.filaParFondo}; color: {apariencia.filaParTexto}; padding-block: {apariencia.filaPaddingY}px; border-bottom: {apariencia.tablaLineaGrosor}px solid {apariencia.tablaLineaColor}"
				>
					Fila par
				</div>
				<div
					class="fila-demo"
					style="background: {apariencia.filaImparFondo}; color: {apariencia.filaImparTexto}; padding-block: {apariencia.filaPaddingY}px; border-bottom: {apariencia.tablaLineaGrosor}px solid {apariencia.tablaLineaColor}"
				>
					Fila impar
				</div>
				<ul class="lista-demo">
					{#each ['Ítem de lista 1', 'Ítem de lista 2', 'Ítem de lista 3'] as texto}
						<li
							style="border-bottom: {apariencia.listaLineaGrosor}px solid {apariencia.listaLineaColor}"
						>
							{texto}
						</li>
					{/each}
				</ul>
			</div>

			<div class="acciones">
				{#if hayCambios}
					<span class="cambios-pendientes">Cambios sin guardar</span>
				{/if}
				<button type="button" class="btn-secundario" onclick={restablecerColores} disabled={guardando}>
					Restablecer
				</button>
				<button type="button" class="btn-primario" onclick={guardarColores} disabled={guardando}>
					{guardando ? 'Guardando…' : 'Guardar apariencia'}
				</button>
			</div>
		</div>
	{:else if seccion === 'facturacion'}
		<div class="panel-apariencia">
			<p class="texto-ayuda">
				Serie que se imprime en la planilla de multifacturación (columna <strong>Serie</strong>).
				Viene con «A» por defecto.
			</p>

			<label class="campo">
				<span>Serie</span>
				<input type="text" maxlength="10" bind:value={serie} placeholder="A" />
			</label>

			<div class="acciones">
				{#if hayCambiosSerie}
					<span class="cambios-pendientes">Cambios sin guardar</span>
				{/if}
				<button type="button" class="btn-primario" onclick={guardarSerie} disabled={guardando}>
					{guardando ? 'Guardando…' : 'Guardar serie'}
				</button>
			</div>
		</div>

	{:else if seccion === 'correo'}
		<section class="gmail-panel">
			<div class="gmail-cab">
				<div>
					<span class="kicker">GMAIL API · OAUTH</span>
					<h2>Cuentas conectadas</h2>
					<p>
						Se usan para enviar y leer respuestas de seguimientos y tickets. Los envíos masivos de
						cobranza siguen por SMTP.
					</p>
					<p class="modo-gmail" class:ok={gmailTiempoReal}>
						{gmailTiempoReal
							? 'Recepción en tiempo real activa · Gmail Pub/Sub'
							: 'Recepción por sondeo cada 2 minutos'}
					</p>
				</div>
				<div class="gmail-acciones">
					<button
						type="button"
						class="btn-secundario"
						disabled={!gmailConfigurado || sincronizandoGmail !== null || gmailCuentas.length === 0}
						onclick={() => sincronizarGmail()}
					>
						{sincronizandoGmail === 'todas' ? 'Sincronizando…' : 'Sincronizar todas'}
					</button>
					<button type="button" class="btn-primario" disabled={!gmailConfigurado} onclick={conectarGmail}>
						Conectar Gmail
					</button>
				</div>
			</div>

			{#if !gmailConfigurado}
				<div class="aviso-config">
					Faltan <code>GMAIL_CLIENT_ID</code> y <code>GMAIL_CLIENT_SECRET</code>. Configurá el proyecto de
					Google Cloud y reiniciá la API. La guía está en <strong>GMAIL-API.md</strong>.
				</div>
			{/if}
			{#if gmailAviso}<div class="aviso ok">{gmailAviso}</div>{/if}
			{#if gmailError}<div class="aviso error">{gmailError}</div>{/if}

			{#if cargandoGmail}
				<div class="estado-vacio"><p>Cargando cuentas de Gmail…</p></div>
			{:else if gmailCuentas.length === 0}
				<div class="estado-vacio">
					<h1>Sin cuentas de Gmail</h1>
					<p>Conectá una casilla de Workspace para habilitar el envío con hilo y la lectura de respuestas.</p>
				</div>
			{:else}
				<div class="cuentas">
					{#each gmailCuentas as cuenta (cuenta.id)}
						<article class="cuenta gmail" class:inactiva={!cuenta.activo}>
							<div class="cuenta-info">
								<strong>{cuenta.nombre ?? cuenta.email}</strong>
								<span>{cuenta.email}</span>
								<small>
									{#if cuenta.ultimaSincronizacion}
										Última sincronización: {formatearFechaHora(cuenta.ultimaSincronizacion)}
									{:else}
										Sin sincronizar todavía
									{/if}
									{#if cuenta.historyId} · cursor {cuenta.historyId}{/if}
								</small>
								<small>
									{#if cuenta.watchExpiraEn}
										Tiempo real hasta {formatearFechaHora(cuenta.watchExpiraEn)}
									{:else}
										Sondeo periódico
									{/if}
								</small>
								{#if cuenta.ultimoError}
									<small class="credencial-error" title={cuenta.ultimoError}>{cuenta.ultimoError}</small>
								{/if}
							</div>
							<div class="cuenta-estado">
								<span class="chip" class:apagada={!cuenta.activo}>{cuenta.activo ? 'Conectada' : 'Desconectada'}</span>
								<span class="chip">OAuth</span>
							</div>
							<div class="cuenta-acciones">
								<button
									type="button"
									class="btn-secundario"
									disabled={verificandoGmail === cuenta.id || !cuenta.activo}
									onclick={() => verificarGmail(cuenta)}
								>
									{verificandoGmail === cuenta.id ? 'Verificando…' : 'Verificar'}
								</button>
								<button
									type="button"
									class="btn-secundario"
									disabled={sincronizandoGmail !== null || !cuenta.activo}
									onclick={() => sincronizarGmail(cuenta)}
								>
									{sincronizandoGmail === cuenta.id ? 'Sincronizando…' : 'Sincronizar'}
								</button>
								{#if cuenta.activo}
									<button type="button" class="btn-secundario peligro" onclick={() => desconectarGmail(cuenta)}>
										Desconectar
									</button>
								{:else}
									<button type="button" class="btn-secundario" onclick={conectarGmail}>Reconectar</button>
								{/if}
							</div>
						</article>
					{/each}
				</div>
			{/if}
		</section>

		<div class="barra-herramientas">
			<div class="subpestanas"><span>Cuentas SMTP para envíos de cobranza</span></div>
			<div class="controles">
				<input bind:value={destinoPrueba} placeholder="Destino de prueba (opcional)" aria-label="Destino de prueba" />
				<button type="button" class="btn-primario" onclick={() => abrirCuenta()}>Nueva cuenta</button>
			</div>
		</div>

		{#if cargandoCorreo}
			<div class="estado-vacio"><p>Cargando cuentas de correo…</p></div>
		{:else if cuentasCorreo.length === 0}
			<div class="estado-vacio">
				<h1>Sin cuentas de correo</h1>
				<p>Agregá una cuenta SMTP para enviar los estados de cuenta de cobranza.</p>
			</div>
		{:else}
			<div class="cuentas">
				{#each cuentasCorreo as cuenta (cuenta.id)}
					<article class="cuenta">
						<div class="cuenta-info">
							<strong>{cuenta.nombre}</strong>
							<span>{cuenta.email}</span>
							<small>{cuenta.host}:{cuenta.puerto} · {cuenta.seguro ? 'SSL' : 'STARTTLS'}</small>
							{#if cuenta.alias.length}
								<small>Alias: {cuenta.alias.map((item) => item.email).join(', ')}</small>
							{/if}
							{#if cuenta.credencialEstado === 'RECHAZADA' && cuenta.credencialError}
								<small class="credencial-error" title={cuenta.credencialError}>{cuenta.credencialError}</small>
							{/if}
						</div>
						<div class="cuenta-estado">
							{#if cuenta.predeterminada}<span class="chip">Predeterminada</span>{/if}
							<span class="chip" class:apagada={!cuenta.activo}>{cuenta.activo ? 'Activa' : 'Inactiva'}</span>
							{#if !cuenta.tieneClave}<span class="chip apagada">Sin clave</span>{/if}
							{#if cuenta.credencialEstado === 'RECHAZADA'}
								<span class="chip rechazada" title="Actualizá la contraseña en esta cuenta">Contraseña rechazada</span>
							{:else if cuenta.credencialEstado === 'OK'}
								<span class="chip ok" title={cuenta.credencialVerificadaEn ? `Verificada ${formatearFechaHora(cuenta.credencialVerificadaEn)}` : 'Credencial verificada'}>Credencial OK</span>
							{:else}
								<span class="chip apagada">Sin verificar</span>
							{/if}
						</div>
						<div class="cuenta-acciones">
							<button
								type="button"
								class="btn-secundario"
								disabled={verificandoCuenta === cuenta.id}
								onclick={() => verificar(cuenta)}
								title="Comprueba la conexión y la contraseña sin enviar un correo"
							>
								{verificandoCuenta === cuenta.id ? 'Verificando…' : 'Verificar'}
							</button>
							<button
								type="button"
								class="btn-secundario"
								disabled={probandoCuenta === cuenta.id}
								onclick={() => probar(cuenta)}
							>
								{probandoCuenta === cuenta.id ? 'Probando…' : 'Probar'}
							</button>
							<button type="button" class="btn-secundario" onclick={() => abrirCuenta(cuenta)}>Editar</button>
							<button type="button" class="btn-secundario peligro" onclick={() => borrarCuenta(cuenta)}>Eliminar</button>
						</div>
					</article>
				{/each}
			</div>
		{/if}

		<div class="copia-global">
			<CopiaGlobal />
		</div>
	{:else if seccion === 'whatsapp'}
		<section class="gmail-panel">
			<div class="gmail-cab">
				<div>
					<span class="kicker">WHATSAPP WEB · BAILEYS</span>
					<h2>Sesión de la empresa</h2>
					<p>
						Un único número vinculado como dispositivo. Desde acá se conecta, se renueva el QR y se
						cierra la sesión.
					</p>
					<p class="nota">
						Los mensajes se guardan solo si el número pertenece a un seguimiento activo. El resto se
						descarta sin almacenar contenido.
					</p>
				</div>
				<div class="gmail-acciones">
					{#if whatsapp?.estado === 'CONECTADO' || whatsapp?.estado === 'ESPERANDO_QR' || whatsapp?.estado === 'RECONECTANDO'}
						<button
							type="button"
							class="btn-secundario"
							disabled={accionWhatsapp !== null}
							onclick={() => desconectarWhatsapp(false)}
						>
							{accionWhatsapp === 'desconectar' ? 'Desconectando…' : 'Desconectar'}
						</button>
					{:else}
						<button
							type="button"
							class="btn-primario"
							disabled={accionWhatsapp !== null}
							onclick={conectarWhatsapp}
						>
							{accionWhatsapp === 'conectar' ? 'Conectando…' : 'Conectar WhatsApp'}
						</button>
					{/if}
				</div>
			</div>

			{#if errorWhatsapp}<div class="aviso error">{errorWhatsapp}</div>{/if}
			{#if avisoWhatsapp}<div class="aviso ok">{avisoWhatsapp}</div>{/if}

			{#if cargandoWhatsapp && !whatsapp}
				<div class="estado-vacio"><p>Consultando la sesión…</p></div>
			{:else if whatsapp}
				<div class="cuentas">
					<article class="cuenta" class:inactiva={!whatsapp.conectado}>
						<div class="cuenta-info">
							<strong>{formatoTelefonoWhatsApp(whatsapp.numeroTelefono)}</strong>
							<span>{DESCRIPCIONES_WHATSAPP[whatsapp.estado]}</span>
							{#if whatsapp.conectadoEn}
								<small>Conectado desde {formatearFechaHora(whatsapp.conectadoEn)}</small>
							{/if}
							{#if whatsapp.ultimoError}
								<small class="credencial-error" title={whatsapp.ultimoError}>{whatsapp.ultimoError}</small>
							{/if}
						</div>
						<div class="cuenta-estado">
							<span class="chip" class:apagada={!whatsapp.conectado}>
								{ETIQUETAS_WHATSAPP[whatsapp.estado]}
							</span>
							<span class="chip">Baileys</span>
						</div>
						<div class="cuenta-acciones">
							{#if whatsapp.estado === 'CONECTADO'}
								<button
									type="button"
									class="btn-secundario peligro"
									disabled={accionWhatsapp !== null}
									onclick={() => desconectarWhatsapp(true)}
								>
									{accionWhatsapp === 'cerrar' ? 'Cerrando…' : 'Cerrar sesión y desvincular'}
								</button>
							{:else if whatsapp.estado === 'CERRADO'}
								<button
									type="button"
									class="btn-secundario"
									disabled={accionWhatsapp !== null}
									onclick={conectarWhatsapp}
								>
									Vincular de nuevo
								</button>
							{/if}
						</div>
					</article>
				</div>

				{#if whatsapp.estado === 'ESPERANDO_QR'}
					<div class="whatsapp-qr">
						{#if whatsapp.qrDataUrl}
							<img
								src={whatsapp.qrDataUrl}
								alt="Código QR para vincular WhatsApp"
								width="320"
								height="320"
							/>
						{:else}
							<p class="nota">Generando código QR…</p>
						{/if}
						<div>
							<h3>Vincular el número</h3>
							<ol>
								<li>Abrí WhatsApp en el teléfono de la empresa.</li>
								<li>Entrá a <strong>Dispositivos vinculados</strong>.</li>
								<li>Elegí <strong>Vincular un dispositivo</strong> y escaneá este código.</li>
							</ol>
							<p class="nota">
								El código se renueva cada ~20 segundos. Si queda esperando demasiado, volvé a
								Conectar.
							</p>
						</div>
					</div>
				{/if}

				{#if whatsapp.estado === 'RECONECTANDO'}
					<div class="aviso-config">
						Se está reintentando la conexión automáticamente. Si el teléfono estuvo apagado o sin
						internet, puede tardar hasta un minuto.
					</div>
				{/if}
			{/if}
		</section>
	{:else if seccion === 'usuarios'}
		<PanelUsuarios />
	{/if}

	<!-- Modal de cuenta de correo -->
	{#if modalCuenta}
		<div
			class="fondo-modal"
			role="presentation"
			tabindex="-1"
			onclick={() => (modalCuenta = null)}
			onkeydown={(evento) => {
				if (evento.key === 'Escape') modalCuenta = null;
			}}
		>
			<div
				class="modal"
				role="dialog"
				aria-modal="true"
				tabindex="-1"
				aria-label="Cuenta de correo"
				onclick={(evento) => evento.stopPropagation()}
				onkeydown={(evento) => evento.stopPropagation()}
			>
				<header class="modal-cabecera">
					<h2>{modalCuenta.id ? 'Editar cuenta de correo' : 'Nueva cuenta de correo'}</h2>
					<button type="button" class="btn-cerrar" aria-label="Cerrar" onclick={() => (modalCuenta = null)}>×</button>
				</header>

				<div class="modal-cuerpo">
					<label class="campo">
						<span>Nombre</span>
						<input bind:value={modalCuenta.nombre} placeholder="Cobranza Empresa Ejemplo" />
					</label>
					<label class="campo">
						<span>Email remitente</span>
						<input bind:value={modalCuenta.email} placeholder="cobranza@empresa.com" />
					</label>
					<div class="campos-en-linea">
						<label class="campo">
							<span>Servidor SMTP</span>
							<input bind:value={modalCuenta.host} placeholder="smtp.gmail.com" />
						</label>
						<label class="campo">
							<span>Puerto</span>
							<input type="number" bind:value={modalCuenta.puerto} />
						</label>
					</div>
					<label class="check">
						<input type="checkbox" bind:checked={modalCuenta.seguro} />
						Conexión SSL (normalmente puerto 465)
					</label>
					<label class="campo">
						<span>Usuario SMTP</span>
						<input bind:value={modalCuenta.usuario} placeholder="usuario@gmail.com" />
					</label>
					<label class="campo">
						<span>Contraseña o app password</span>
						<input
							type="password"
							bind:value={modalCuenta.clave}
							placeholder={modalCuenta.id ? 'Dejar vacío para conservar la actual' : 'Obligatoria'}
						/>
					</label>
					<label class="campo">
						<span>Alias (uno por línea: email | nombre visible)</span>
						<textarea rows="3" bind:value={modalCuenta.aliasTexto} placeholder="cobranza@empresa.com | Cobranzas"></textarea>
					</label>
					<label class="check">
						<input type="checkbox" bind:checked={modalCuenta.activo} />
						Cuenta activa
					</label>
					<label class="check">
						<input type="checkbox" bind:checked={modalCuenta.predeterminada} />
						Usar como predeterminada
					</label>
					<p class="nota">
						Para usar mails propios de la empresa (Google Workspace o Gmail con dominio propio), cargá
						la cuenta con su usuario completo y app password, y agregá acá cada dirección de la empresa.
						Antes deben estar verificadas en el proveedor: Gmail → Configuración → Cuentas → «Enviar como».
					</p>
				</div>

				<footer class="modal-pie">
					<button type="button" class="btn-secundario" onclick={() => (modalCuenta = null)} disabled={guardando}>Cancelar</button>
					<button type="button" class="btn-primario" onclick={guardarCuentaFormulario} disabled={guardando}>
						{guardando ? 'Guardando…' : 'Guardar'}
					</button>
				</footer>
			</div>
		</div>
	{/if}

	<!-- Modal de valor de catálogo -->
	{#if modalValor}
		<div
			class="fondo-modal"
			role="presentation"
			tabindex="-1"
			onclick={() => (modalValor = null)}
			onkeydown={(evento) => {
				if (evento.key === 'Escape') modalValor = null;
			}}
		>
			<div
				class="modal"
				role="dialog"
				aria-modal="true"
				tabindex="-1"
				aria-label="Valor de catálogo"
				onclick={(evento) => evento.stopPropagation()}
				onkeydown={(evento) => evento.stopPropagation()}
			>
				<header class="modal-cabecera">
					<h2>{modalValor.modo === 'nuevo' ? 'Nuevo valor' : 'Editar valor'} · {etiquetaCatalogo}</h2>
					<button type="button" class="btn-cerrar" aria-label="Cerrar" onclick={() => (modalValor = null)}>×</button>
				</header>

				<div class="modal-cuerpo">
					<label class="campo">
						<span>{usaCodigo() ? 'Código' : 'Nombre'}</span>
						<input bind:value={modalValor.nombre} placeholder={usaCodigo() ? 'Ej. 1001' : 'Nombre del valor'} />
					</label>

					{#if esComprobante()}
						<label class="campo">
							<span>Abreviatura (máx. 8)</span>
							<input bind:value={modalValor.abreviatura} maxlength="8" placeholder="VTA CRED" />
						</label>
					{/if}

					{#if catalogoActivo === 'articulos'}
						<label class="campo">
							<span>Descripción</span>
							<input bind:value={modalValor.descripcion} placeholder="HORAS DIURNAS" />
						</label>
					{/if}

					{#if esPrecio()}
						<label class="campo">
							<span>Moneda asociada</span>
							<select bind:value={modalValor.monedaId}>
								<option value="">Sin moneda</option>
								{#each config?.catalogos.monedas ?? [] as moneda}
									<option value={String(moneda.id)}>{moneda.nombre}</option>
								{/each}
							</select>
						</label>
					{/if}
				</div>

				<footer class="modal-pie">
					<button type="button" class="btn-secundario" onclick={() => (modalValor = null)} disabled={guardando}>
						Cancelar
					</button>
					<button type="button" class="btn-primario" onclick={guardarValor} disabled={guardando}>
						{guardando ? 'Guardando…' : 'Guardar'}
					</button>
				</footer>
			</div>
		</div>
	{/if}

	<!-- Modal de grupo -->
	{#if modalGrupo}
		<div
			class="fondo-modal"
			role="presentation"
			tabindex="-1"
			onclick={() => (modalGrupo = null)}
			onkeydown={(evento) => {
				if (evento.key === 'Escape') modalGrupo = null;
			}}
		>
			<div
				class="modal"
				role="dialog"
				aria-modal="true"
				tabindex="-1"
				aria-label="Grupo de facturación"
				onclick={(evento) => evento.stopPropagation()}
				onkeydown={(evento) => evento.stopPropagation()}
			>
				<header class="modal-cabecera">
					<h2>
						{modalGrupo.modo === 'nuevo' ? 'Nuevo grupo' : 'Editar grupo'}{modalGrupo.tipo === 'cobranza'
							? ' de cobranza'
							: ''}
					</h2>
					<button type="button" class="btn-cerrar" aria-label="Cerrar" onclick={() => (modalGrupo = null)}>×</button>
				</header>

				<div class="modal-cuerpo">
					<label class="campo">
						<span>Nombre</span>
						<input bind:value={modalGrupo.nombre} placeholder="FIJOS" />
					</label>

					<div class="campos-en-linea">
						<label class="campo">
							<span>Color de fondo</span>
							<div class="fila-color">
								<input type="color" bind:value={modalGrupo.colorFondo} />
								<code>{modalGrupo.colorFondo}</code>
							</div>
						</label>
						<label class="campo">
							<span>Color de letra</span>
							<div class="fila-color">
								<input type="color" bind:value={modalGrupo.colorTexto} />
								<code>{modalGrupo.colorTexto}</code>
							</div>
						</label>
					</div>

					{#if modalGrupo.tipo === 'cobranza'}
						<label class="campo">
							<span>Orden del bloque</span>
							<input type="number" bind:value={modalGrupo.orden} placeholder="0" />
						</label>
					{/if}

					<div class="vista-grupo" style="background: {modalGrupo.colorFondo}; color: {modalGrupo.colorTexto}">
						{modalGrupo.nombre || 'Vista previa del grupo'}
					</div>
				</div>

				<footer class="modal-pie">
					<button type="button" class="btn-secundario" onclick={() => (modalGrupo = null)} disabled={guardando}>
						Cancelar
					</button>
					<button type="button" class="btn-primario" onclick={guardarGrupo} disabled={guardando}>
						{guardando ? 'Guardando…' : 'Guardar'}
					</button>
				</footer>
			</div>
		</div>
	{/if}
</section>

<style>
	.pantalla { min-width: 0; color: var(--texto); }
	.pestanas { display: flex; width: min(36rem, 100%); margin: 0 auto 1.1rem; padding: .22rem; border: 1px solid var(--borde); border-radius: .9rem; background: var(--superficie); box-shadow: 0 8px 20px rgba(35, 48, 110, .14); overflow-x: auto; }
	.pestanas button { flex: 1 0 auto; border: 0; border-radius: .65rem; padding: .48rem .7rem; background: transparent; color: var(--texto); font: inherit; font-size: .74rem; font-weight: 800; cursor: pointer; white-space: nowrap; }
	.pestanas button.seleccionada { background: var(--primario); color: var(--texto-inverso); box-shadow: 0 8px 16px rgba(80,72,245,.25); }
	.barra-herramientas { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1.1rem; padding: .85rem 1rem; border: 1px solid var(--borde); border-radius: 1rem; background: var(--superficie-panel); }
	.subpestanas { display: flex; flex-wrap: wrap; gap: .35rem; }
	.subpestanas button { border: 1px solid var(--borde-suave); border-radius: 999px; padding: .35rem .7rem; background: var(--superficie-alta); color: var(--texto-suave); font: inherit; font-size: .66rem; font-weight: 700; cursor: pointer; }
	.subpestanas button.seleccionada { background: var(--primario); border-color: var(--primario); color: var(--texto-inverso); }
	.texto-ayuda { margin: 0; color: var(--texto-suave); font-size: .74rem; }
	.mensaje { margin: 0 0 1rem; padding: .7rem .9rem; border-radius: .7rem; font-size: .74rem; }
	.error-mensaje { border: 1px solid var(--peligro-borde); background: var(--peligro-tenue); color: var(--peligro-texto); }
	.ok-mensaje { border: 1px solid var(--exito-borde); background: var(--exito-tenue); color: var(--exito-texto); }

	.tabla { overflow: visible; border: 1px solid var(--borde); border-radius: 1rem; background: var(--superficie-panel); box-shadow: 0 12px 30px rgba(49, 64, 129, .08); }
	.cabecera-tabla, .fila { display: grid; grid-template-columns: 4.5rem 1fr 3.7rem; align-items: center; }
	.cabecera-tabla.con-extra, .fila.con-extra { grid-template-columns: 4.5rem minmax(10rem, 1fr) minmax(8rem, 1fr) 3.7rem; }
	.cabecera-tabla { min-height: 2.9rem; padding: 0 .8rem; border-radius: 1rem 1rem 0 0; background: var(--tabla-gradiente); color: var(--texto-inverso); font-size: .62rem; font-weight: 800; text-transform: uppercase; }
	.cabecera-tabla span:not(:first-child) { padding-left: .45rem; }
	.fila { min-height: 2.6rem; padding: 2px .8rem; border-bottom: 1px solid var(--borde-suave); font-size: .72rem; background: var(--fila-impar-fondo, var(--superficie)); color: var(--fila-impar-texto, var(--texto)); }
	.fila.par { background: var(--fila-par-fondo, var(--superficie-suave)); color: var(--fila-par-texto, var(--texto)); }
	.fila .celda { padding-left: .45rem; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.acciones-fila { display: flex; justify-content: center; }
	.btn-icono { display: grid; place-items: center; width: 2.15rem; height: 2.15rem; border: 1px solid var(--borde); border-radius: .65rem; background: transparent; color: var(--texto-suave); font-size: .95rem; cursor: pointer; }
	.btn-icono:hover { background: var(--primario-tenue); border-color: var(--borde-fuerte); color: var(--primario-texto); }

	.switch { position: relative; display: inline-block; width: 2.3rem; height: 1.25rem; }
	.switch input { opacity: 0; width: 0; height: 0; }
	.pista { position: absolute; inset: 0; border-radius: 999px; background: var(--borde-fuerte); cursor: pointer; transition: background 150ms ease; }
	.pista::before { content: ''; position: absolute; top: .15rem; left: .18rem; width: .95rem; height: .95rem; border-radius: 50%; background: var(--superficie); box-shadow: 0 1px 3px rgba(15, 23, 42, .35); transition: transform 150ms ease; }
	.switch input:checked + .pista { background: var(--exito); }
	.switch input:checked + .pista::before { transform: translateX(1.05rem); }
	.switch input:focus-visible + .pista { outline: 2px solid var(--foco); outline-offset: 2px; }
	.switch input:disabled + .pista { opacity: .7; cursor: progress; }

	.muestra-grupo { display: inline-block; padding: .28rem .7rem; border-radius: .55rem; font-weight: 800; font-size: .68rem; }
	.swatch { display: inline-block; width: .85rem; height: .85rem; border: 1px solid var(--borde); border-radius: .25rem; vertical-align: -2px; }

	.panel-apariencia { display: grid; gap: 1.2rem; padding: 1.2rem; border: 1px solid var(--borde); border-radius: 1rem; background: var(--superficie-panel); }
	.grupo-ajustes { display: grid; gap: .7rem; }
	.grupo-ajustes h3 { margin: 0; color: var(--texto-suave); font-size: .68rem; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; }
	.rejilla-temas { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: .8rem; }
	.tema-opcion { display: flex; align-items: center; gap: .75rem; padding: .7rem .8rem; border: 1px solid var(--borde); border-radius: .7rem; background: var(--superficie); color: var(--texto); font: inherit; text-align: left; cursor: pointer; }
	.tema-opcion.activo { border-color: var(--primario); box-shadow: 0 0 0 2px var(--primario-borde); }
	.tema-muestra { display: flex; flex-direction: column; justify-content: center; gap: 3px; width: 3rem; height: 2.1rem; padding: .35rem; border: 1px solid var(--borde); border-radius: .45rem; }
	.tema-muestra i { display: block; height: 3px; border-radius: 2px; }
	.tema-muestra-oscuro { background: #070d1a; }
	.tema-muestra-oscuro i { background: #8b5cf6; }
	.tema-muestra-oscuro i:nth-child(2) { background: #1e4fd8; }
	.tema-muestra-claro { background: #f1f5f9; }
	.tema-muestra-claro i { background: #5048f5; }
	.tema-muestra-claro i:nth-child(2) { background: #078ddf; }
	.tema-texto { display: grid; gap: .1rem; }
	.tema-texto strong { font-size: .78rem; }
	.tema-texto small { color: var(--texto-suave); font-size: .66rem; }
	.rejilla-colores { display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); gap: .9rem; }
	.campo { display: grid; gap: 1px; }
	.campo span { color: var(--texto-suave); font-size: .6rem; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; }
	.campo input, .campo select { padding: .55rem .65rem; border: 1px solid var(--borde); border-radius: .7rem; background: var(--superficie); color: var(--texto); font: inherit; font-size: .74rem; }
	.campo select { min-height: 2.5rem; appearance: none; padding-right: 2rem; background-image: var(--chevron-select); background-repeat: no-repeat; background-position: right .7rem center; background-size: .65rem; }
	.fila-color { display: flex; align-items: center; gap: .5rem; }
	.fila-color input[type='color'] { width: 2.6rem; height: 2rem; padding: .1rem; cursor: pointer; }
	.fila-rango { display: flex; align-items: center; gap: .6rem; }
	.fila-rango input[type='range'] { flex: 1; min-width: 0; padding: 0; border: 0; background: transparent; accent-color: var(--foco); cursor: pointer; }
	code { padding: .1rem .3rem; border-radius: .3rem; background: var(--primario-tenue); font-family: ui-monospace, monospace; font-size: .66rem; }
	.vista-previa { display: grid; border: 1px solid var(--borde); border-radius: .7rem; overflow: hidden; }
	.fila-demo { padding: .5rem .8rem; font-size: .72rem; }
	.lista-demo { margin: 0; padding: 0; background: var(--superficie); list-style: none; }
	.lista-demo li { padding: .45rem .8rem; color: var(--texto); font-size: .72rem; }
	.lista-demo li:last-child { border-bottom: 0 !important; }
	.acciones { display: flex; align-items: center; justify-content: flex-end; gap: .55rem; }
	.cambios-pendientes { margin-right: auto; padding: .15rem .5rem; border: 1px solid var(--alerta-borde); border-radius: .45rem; background: var(--alerta-tenue); color: var(--alerta-texto); font-size: .62rem; font-weight: 800; text-transform: uppercase; }

	.estado-vacio { display: grid; place-items: center; min-height: 14rem; border: 1px solid var(--borde); border-radius: 1rem; background: var(--superficie-panel); color: var(--texto-suave); font-size: .85rem; }

	.btn-primario { border: 0; border-radius: .7rem; padding: .62rem 1rem; background: var(--primario); color: var(--texto-inverso); font: inherit; font-size: .72rem; font-weight: 700; cursor: pointer; }
	.btn-secundario { border: 1px solid var(--borde); border-radius: .7rem; padding: .62rem 1rem; background: var(--superficie-alta); color: var(--texto-suave); font: inherit; font-size: .72rem; font-weight: 700; cursor: pointer; }
	.btn-primario:disabled, .btn-secundario:disabled { opacity: .55; cursor: progress; }

	.fondo-modal { position: fixed; inset: 0; z-index: 70; display: grid; place-items: center; padding: 1.5rem; background: var(--velo-modal); }
	.modal { display: grid; width: min(30rem, 100%); max-height: 88vh; overflow: auto; border-radius: 1rem; background: var(--modal-fondo); box-shadow: var(--sombra-modal); }
	.modal-cabecera { display: flex; align-items: start; justify-content: space-between; gap: 1rem; padding: 1.1rem 1.25rem; border-bottom: 1px solid var(--borde-suave); }
	.modal-cabecera h2 { margin: 0; font-size: .95rem; }
	.btn-cerrar { border: 0; background: transparent; color: var(--texto-suave); font-size: 1.3rem; line-height: 1; cursor: pointer; }
	.modal-cuerpo { display: grid; gap: .85rem; padding: 1.1rem 1.25rem; }
	.modal-pie { display: flex; justify-content: flex-end; gap: .55rem; padding: 1rem 1.25rem; border-top: 1px solid var(--borde-suave); }
	.campos-en-linea { display: grid; grid-template-columns: 1fr 1fr; gap: .7rem; }
	.vista-grupo { padding: .6rem .8rem; border-radius: .55rem; font-weight: 800; font-size: .74rem; }

	.cuentas { display: grid; gap: .6rem; }
	.whatsapp-qr { display: grid; grid-template-columns: auto minmax(14rem, 1fr); gap: 1.2rem; align-items: center; padding: 1rem; border: 1px solid var(--borde-suave); border-radius: .8rem; background: var(--superficie); }
	.whatsapp-qr img { width: 260px; height: 260px; padding: .5rem; border-radius: .6rem; background: #fff; }
	.whatsapp-qr h3 { margin: 0 0 .35rem; font-size: .85rem; }
	.whatsapp-qr ol { display: grid; gap: .25rem; margin: 0 0 .5rem 1.1rem; padding: 0; color: var(--texto-suave); font-size: .75rem; }
	.gmail-panel { display: grid; gap: .7rem; margin-bottom: 1.1rem; padding: .9rem 1rem; border: 1px solid var(--borde-suave); border-radius: .9rem; background: var(--superficie-alta); }
	.gmail-cab { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
	.gmail-cab h2 { margin: .15rem 0 .1rem; font-size: 1rem; }
	.gmail-cab p { color: var(--texto-suave); font-size: .72rem; max-width: 46rem; }
	.gmail-cab .modo-gmail { display: inline-flex; margin-top: .25rem; padding: .15rem .45rem; border-radius: 999px; background: var(--superficie-suave); color: var(--texto-suave); font-size: .62rem; font-weight: 750; }
	.gmail-cab .modo-gmail.ok { background: var(--exito-tenue); color: var(--exito-texto); }
	.gmail-acciones { display: flex; gap: .45rem; flex-wrap: wrap; }
	.aviso-config { padding: .55rem .7rem; border: 1px solid var(--alerta-borde); border-radius: .6rem; background: var(--alerta-tenue); color: var(--alerta-texto); font-size: .72rem; }
	.aviso-config code { font-size: .68rem; background: var(--alerta-tenue); padding: .05rem .25rem; border-radius: .25rem; }
	.aviso.ok { padding: .55rem .7rem; border: 1px solid var(--exito-borde); border-radius: .6rem; background: var(--exito-tenue); color: var(--exito-texto); font-size: .72rem; }
	.aviso.error { padding: .55rem .7rem; border: 1px solid var(--peligro-borde); border-radius: .6rem; background: var(--peligro-tenue); color: var(--peligro-texto); font-size: .72rem; }
	.cuenta.gmail.inactiva { opacity: .72; background: var(--superficie-suave); }
	.copia-global { margin-top: 1rem; }
	.cuenta { display: grid; grid-template-columns: minmax(12rem, 1.4fr) auto auto; gap: 1rem; align-items: center; padding: .85rem 1rem; border: 1px solid var(--borde-suave); border-radius: .8rem; background: var(--superficie); }
	.cuenta-info { display: grid; gap: .12rem; min-width: 0; }
	.cuenta-info strong { font-size: .82rem; }
	.cuenta-info span { color: var(--texto-suave); font-size: .75rem; overflow-wrap: anywhere; }
	.cuenta-info small { color: var(--texto-suave); font-size: .68rem; overflow-wrap: anywhere; }
	.cuenta-estado { display: flex; gap: .35rem; flex-wrap: wrap; justify-content: flex-end; }
	.cuenta-acciones { display: flex; gap: .4rem; flex-wrap: wrap; }
	.chip { display: inline-flex; padding: .2rem .5rem; border-radius: 999px; background: var(--primario-tenue); color: var(--primario-texto); font-size: .64rem; font-weight: 700; }
	.chip.apagada { background: var(--superficie-suave); color: var(--texto-suave); }
	.chip.ok { background: var(--exito-tenue); color: var(--exito-texto); }
	.chip.rechazada { background: var(--peligro-tenue); color: var(--peligro-texto); }
	.credencial-error { display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; color: var(--peligro-texto) !important; }
	.btn-secundario.peligro { border-color: var(--peligro-borde); background: var(--peligro-tenue); color: var(--peligro-texto); }
	.controles { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
	.controles input { min-width: 14rem; }
	.check { display: flex; align-items: center; flex-direction: row; gap: .45rem; text-transform: none; letter-spacing: 0; font-size: .72rem; }
	.check input { min-width: auto; }
	.nota { color: var(--alerta-texto); font-size: .7rem; }

	@media (max-width: 60rem) {
		.barra-herramientas { flex-direction: column; align-items: stretch; }
		.tabla { overflow-x: auto; }
		.cabecera-tabla, .fila { min-width: 34rem; }
		.cuenta { grid-template-columns: 1fr; }
		.cuenta-estado { justify-content: flex-start; }
		.whatsapp-qr { grid-template-columns: 1fr; justify-items: center; text-align: center; }
		.whatsapp-qr ol { text-align: left; }
	}
</style>
