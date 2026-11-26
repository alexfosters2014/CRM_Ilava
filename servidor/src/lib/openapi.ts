/**
 * Especificación OpenAPI 3.0 de la Web API del CRM.
 * Se sirve en GET /api/openapi.json y la visualiza GET /api/docs (Swagger UI).
 */
export const especificacionOpenApi = {
	openapi: '3.0.3',
	info: {
		title: 'API CRM',
		description:
			'Web API del CRM construida con SvelteKit y PostgreSQL. Frontend SvelteKit consumidor: http://localhost:4173 (usa un proxy propio /api para evitar CORS).',
		version: '1.0.0'
	},
	servers: [
		{ url: 'http://localhost:8080', description: 'Servidor local (Podman)' },
		{ url: 'http://localhost:5173', description: 'Desarrollo local (vite dev)' }
	],
	tags: [
		{ name: 'salud' },
		{ name: 'clientes', description: 'Clientes facturables (NO son usuarios del sistema)' },
		{ name: 'autenticacion', description: 'Login OTP de usuarios del CRM (Better Auth)' },
		{ name: 'catalogos', description: 'Datos de referencia para plantillas' },
		{ name: 'plantillas', description: 'Plantillas de facturación mensual' },
		{ name: 'servicios', description: 'Servicios (contactos facturables) y su importación' },
		{ name: 'facturador', description: 'Facturas del multifacturador (copia de la plantilla)' },
		{ name: 'variables', description: 'Nombres de variables de plantilla' },
		{ name: 'configuracion', description: 'Catálogos, grupos y apariencia global' }
	],
	paths: {
		'/api/salud': {
			get: {
				tags: ['salud'],
				summary: 'Estado de la API y de PostgreSQL',
				responses: {
					'200': {
						description: 'API operativa y base de datos conectada',
						content: {
							'application/json': {
								schema: { $ref: '#/components/schemas/Salud' }
							}
						}
					},
					'503': {
						description: 'API operativa pero sin conexión a PostgreSQL',
						content: {
							'application/json': {
								schema: { $ref: '#/components/schemas/Salud' }
							}
						}
					}
				}
			}
		},
		'/api/clientes': {
			get: {
				tags: ['clientes'],
				summary: 'Lista todos los clientes',
				responses: {
					'200': {
						description: 'Listado de clientes',
						content: {
							'application/json': {
								schema: {
									type: 'array',
									items: { $ref: '#/components/schemas/Cliente' }
								}
							}
						}
					}
				}
			},
			post: {
				tags: ['clientes'],
				summary: 'Crea un cliente nuevo',
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: { $ref: '#/components/schemas/ClienteEntrada' }
						}
					}
				},
				responses: {
					'201': {
						description: 'Cliente creado',
						content: {
							'application/json': {
								schema: { $ref: '#/components/schemas/Cliente' }
							}
						}
					},
					'400': { description: 'Faltan campos obligatorios' },
					'409': { description: 'Ya existe un cliente con ese email' }
				}
			}
		},
		'/api/clientes/{id}': {
			parameters: [
				{
					name: 'id',
					in: 'path',
					required: true,
					schema: { type: 'integer' },
					description: 'Identificador del cliente'
				}
			],
			get: {
				tags: ['clientes'],
				summary: 'Obtiene un cliente por su id',
				responses: {
					'200': {
						description: 'Cliente encontrado',
						content: {
							'application/json': {
								schema: { $ref: '#/components/schemas/Cliente' }
							}
						}
					},
					'404': { description: 'Cliente no encontrado' }
				}
			},
			put: {
				tags: ['clientes'],
				summary: 'Actualiza un cliente',
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: { $ref: '#/components/schemas/ClienteParcial' }
						}
					}
				},
				responses: {
					'200': {
						description: 'Cliente actualizado',
						content: {
							'application/json': {
								schema: { $ref: '#/components/schemas/Cliente' }
							}
						}
					},
					'404': { description: 'Cliente no encontrado' }
				}
			},
			delete: {
				tags: ['clientes'],
				summary: 'Elimina un cliente',
				responses: {
					'200': { description: 'Cliente eliminado' },
					'404': { description: 'Cliente no encontrado' }
				}
			}
		},
		'/api/auth/email-otp/send-verification-otp': {
			post: {
				tags: ['autenticacion'],
				summary: 'Envía un código OTP de 6 dígitos al correo del usuario',
				description:
					'Genera el código y lo envía por SMTP. Si el SMTP falla, Better Auth igualmente responde 200: el diagnóstico queda en el log del servidor ([correo] ERROR SMTP ...).',
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								required: ['email', 'type'],
								properties: {
									email: { type: 'string', format: 'email', example: 'usuario@empresa.com' },
									type: {
										type: 'string',
										enum: ['sign-in', 'email-verification', 'forget-password'],
										example: 'sign-in'
									}
								}
							}
						}
					}
				},
				responses: {
					'200': {
						description: 'Código generado',
						content: {
							'application/json': {
								schema: { type: 'object', properties: { success: { type: 'boolean', example: true } } }
							}
						}
					},
					'400': { description: 'Datos inválidos' }
				}
			}
		},
		'/api/auth/sign-in/email-otp': {
			post: {
				tags: ['autenticacion'],
				summary: 'Inicia sesión con el código OTP recibido por correo',
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								required: ['email', 'otp'],
								properties: {
									email: { type: 'string', format: 'email' },
									otp: { type: 'string', minLength: 6, maxLength: 6, example: '123456' }
								}
							}
						}
					}
				},
				responses: {
					'200': {
						description: 'Sesión creada. Devuelve set-cookie con el token de sesión.',
						content: {
							'application/json': {
								schema: { $ref: '#/components/schemas/Sesion' }
							}
						}
					},
					'400': { description: 'Código inválido o expirado' },
					'403': { description: 'Origen no confiable (CSRF)' }
				}
			}
		},
		'/api/auth/get-session': {
			get: {
				tags: ['autenticacion'],
				summary: 'Devuelve la sesión activa del usuario',
				responses: {
					'200': {
						description: 'Sesión activa, o `null` si no hay cookie válida',
						content: {
							'application/json': {
								schema: {
									oneOf: [{ $ref: '#/components/schemas/Sesion' }, { type: 'object', nullable: true }]
								}
							}
						}
					}
				}
			}
		},
		'/api/auth/sign-out': {
			post: {
				tags: ['autenticacion'],
				summary: 'Cierra la sesión del usuario',
				responses: {
					'200': { description: 'Sesión cerrada' }
				}
			}
		},
		'/api/catalogos': {
			get: {
				tags: ['catalogos'],
				summary: 'Lista todos los catálogos',
				description:
					'Grupos de facturación, artículos, tipos de comprobante, tipos de precio, monedas, tipos de gestión, tipos de cliente y modalidades de cobranza.',
				responses: {
					'200': {
						description: 'Catálogos completos',
						content: {
							'application/json': {
								schema: { $ref: '#/components/schemas/Catalogos' }
							}
						}
					}
				}
			}
		},
		'/api/plantillas': {
			get: {
				tags: ['plantillas'],
				summary: 'Lista las plantillas agrupadas por grupo de facturación',
				responses: {
					'200': {
						description: 'Grupos con sus plantillas y líneas',
						content: {
							'application/json': {
								schema: {
									type: 'array',
									items: { $ref: '#/components/schemas/GrupoPlantillas' }
								}
							}
						}
					}
				}
			}
		},
		'/api/plantillas/eliminar': {
			post: {
				tags: ['plantillas'],
				summary: 'Elimina (borrado lógico) un lote de plantillas',
				description:
					'Marca `eliminado_en` en las plantillas indicadas. No se borran filas ni líneas: la plantilla deja de listarse en GET /api/plantillas, pero se conserva para auditoría y restauración.',
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								required: ['ids'],
								properties: {
									ids: {
										type: 'array',
										minItems: 1,
										maxItems: 500,
										items: { type: 'integer', example: 12 }
									}
								}
							}
						}
					}
				},
				responses: {
					'200': {
						description: 'Resultado del borrado lógico',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: { eliminadas: { type: 'integer', example: 3 } }
								}
							}
						}
					},
					'400': { description: 'Selección inválida' }
				}
			}
		},
		'/api/plantillas/importar': {
			post: {
				tags: ['plantillas'],
				summary: 'Importa plantillas desde las filas de una planilla Excel',
				description:
					'El frontend lee el .xlsx con SheetJS y envía las filas normalizadas como JSON. La identidad de una plantilla es servicio + número agrupador: reimportar el mismo archivo no duplica plantillas. Los catálogos (moneda, tipo de comprobante, tipo de precio, artículo) NO se auto-crean: un valor faltante rechaza el archivo con 422. Las filas cuyo servicio no existe (o está deshabilitado) no se importan y vuelven en `serviciosOmitidos`.',
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: { $ref: '#/components/schemas/ImportacionEntrada' }
						}
					}
				},
				responses: {
					'201': {
						description: 'Importación completada',
						content: {
							'application/json': {
								schema: { $ref: '#/components/schemas/ResumenImportacion' }
							}
						}
					},
					'400': {
						description: 'Filas inválidas',
						content: {
							'application/json': {
								schema: { $ref: '#/components/schemas/ErrorValidacion' }
							}
						}
					}
				}
			}
		},
		'/api/plantillas/{id}': {
			patch: {
				tags: ['plantillas'],
				summary: 'Edita los chips de la plantilla',
				description:
					'Moneda, tipo de comprobante, tipo de precio e ID de cliente de la plantilla (por id de catálogo).',
				parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: { $ref: '#/components/schemas/PlantillaChips' }
						}
					}
				},
				responses: {
					'200': { description: 'Plantilla actualizada' },
					'404': { description: 'Plantilla no encontrada' }
				}
			}
		},
		'/api/plantillas/{id}/lineas': {
			post: {
				tags: ['plantillas'],
				summary: 'Agrega una línea de facturación a la plantilla',
				description:
					'La línea queda persistida y es independiente de las facturas ya creadas. El código se valida contra el catálogo de artículos (400 si no existe).',
				parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								required: ['codigo'],
								properties: {
									codigo: { type: 'string', example: '1001' },
									cantidad: { type: 'number', example: 1 },
									importeUnitario: { type: 'number', example: 0 },
									detalle: { type: 'string', nullable: true },
									comentario: { type: 'string', nullable: true }
								}
							}
						}
					}
				},
				responses: {
					'201': {
						description: 'Línea creada',
						content: {
							'application/json': {
								schema: { $ref: '#/components/schemas/LineaPlantilla' }
							}
						}
					},
					'400': { description: 'Código inexistente o datos inválidos' }
				}
			}
		},
		'/api/plantillas/{id}/lineas/{lineaId}': {
			patch: {
				tags: ['plantillas'],
				summary: 'Edición rápida de una línea de la plantilla',
				description:
					'Código, cantidad, importe unitario, detalle y comentario de la línea. Un código inexistente devuelve 400.',
				parameters: [
					{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
					{ name: 'lineaId', in: 'path', required: true, schema: { type: 'integer' } }
				],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: { $ref: '#/components/schemas/LineaPlantillaParcial' }
						}
					}
				},
				responses: {
					'200': {
						description: 'Línea actualizada',
						content: {
							'application/json': {
								schema: { $ref: '#/components/schemas/LineaPlantilla' }
							}
						}
					},
					'400': { description: 'Datos inválidos' },
					'404': { description: 'Línea no encontrada' }
				}
			},
			delete: {
				tags: ['plantillas'],
				summary: 'Elimina una línea de la plantilla de forma definitiva',
				description: 'La plantilla no puede quedar sin líneas (400).',
				parameters: [
					{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
					{ name: 'lineaId', in: 'path', required: true, schema: { type: 'integer' } }
				],
				responses: {
					'200': { description: 'Línea eliminada' },
					'400': { description: 'Es la última línea o no existe' }
				}
			}
		},
		'/api/servicios': {
			get: {
				tags: ['servicios'],
				summary: 'Lista los servicios con sus catálogos resueltos',
				responses: {
					'200': {
						description: 'Servicios ordenados por contacto',
						content: {
							'application/json': {
								schema: { type: 'array', items: { $ref: '#/components/schemas/ServicioListado' } }
							}
						}
					}
				}
			},
			post: {
				tags: ['servicios'],
				summary: 'Importa servicios desde su propio archivo Excel',
				description:
					'Valida catálogos (no auto-crea), valida numeración/tipo y no importa duplicados (dentro del archivo o en la base): los duplicados se informan.',
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: { $ref: '#/components/schemas/ServiciosImportacion' }
						}
					}
				},
				responses: {
					'201': {
						description: 'Importación completada',
						content: {
							'application/json': {
								schema: { $ref: '#/components/schemas/ResumenImportacionServicios' }
							}
						}
					},
					'400': { description: 'Filas inválidas' },
					'422': { description: 'Faltan valores de catálogo' }
				}
			}
		},
		'/api/servicios/{id}': {
			patch: {
				tags: ['servicios'],
				summary: 'Edita un servicio (switch, numeración, grupo, gestión)',
				parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: { $ref: '#/components/schemas/ServicioParcial' }
						}
					}
				},
				responses: {
					'200': { description: 'Servicio actualizado' },
					'404': { description: 'Servicio no encontrado' }
				}
			}
		},
		'/api/configuracion': {
			get: {
				tags: ['configuracion'],
				summary: 'Catálogos (con habilitado), grupos y apariencia',
				responses: {
					'200': {
						description: 'Configuración completa',
						content: {
							'application/json': {
								schema: { $ref: '#/components/schemas/Configuracion' }
							}
						}
					}
				}
			}
		},
		'/api/configuracion/apariencia': {
			get: {
				tags: ['configuracion'],
				summary: 'Colores globales de las filas alternadas',
				responses: {
					'200': {
						description: 'Apariencia actual',
						content: {
							'application/json': {
								schema: { $ref: '#/components/schemas/Apariencia' }
							}
						}
					}
				}
			},
			put: {
				tags: ['configuracion'],
				summary: 'Guarda los colores globales',
				requestBody: {
					required: true,
					content: {
						'application/json': { schema: { $ref: '#/components/schemas/Apariencia' } }
					}
				},
				responses: { '200': { description: 'Apariencia guardada' } }
			}
		},
		'/api/configuracion/facturacion': {
			get: {
				tags: ['configuracion'],
				summary: 'Serie, período en proceso y fecha general de facturación',
				responses: {
					'200': {
						description: 'Configuración de facturación',
						content: {
							'application/json': {
								schema: { $ref: '#/components/schemas/ConfiguracionFacturacion' }
							}
						}
					}
				}
			},
			put: {
				tags: ['configuracion'],
				summary: 'Guarda parámetros de facturación (parcial: serie, período o fecha general)',
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: { $ref: '#/components/schemas/ConfiguracionFacturacionEntrada' }
						}
					}
				},
				responses: {
					'200': {
						description: 'Configuración guardada',
						content: {
							'application/json': {
								schema: { $ref: '#/components/schemas/ConfiguracionFacturacion' }
							}
						}
					},
					'400': { description: 'Datos inválidos' }
				}
			}
		},
		'/api/configuracion/grupos': {
			get: {
				tags: ['configuracion'],
				summary: 'Lista los grupos con sus colores',
				responses: {
					'200': {
						description: 'Grupos',
						content: {
							'application/json': {
								schema: { type: 'array', items: { $ref: '#/components/schemas/GrupoAdmin' } }
							}
						}
					}
				}
			},
			post: {
				tags: ['configuracion'],
				summary: 'Crea un grupo',
				requestBody: {
					required: true,
					content: {
						'application/json': { schema: { $ref: '#/components/schemas/GrupoAdminEntrada' } }
					}
				},
				responses: {
					'201': { description: 'Grupo creado' },
					'409': { description: 'Nombre duplicado' }
				}
			}
		},
		'/api/configuracion/grupos/{id}': {
			patch: {
				tags: ['configuracion'],
				summary: 'Edita un grupo (nombre, colores, habilitado)',
				parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
				requestBody: {
					required: true,
					content: {
						'application/json': { schema: { $ref: '#/components/schemas/GrupoAdminEntrada' } }
					}
				},
				responses: { '200': { description: 'Grupo actualizado' } }
			}
		},
		'/api/configuracion/catalogos/{catalogo}': {
			post: {
				tags: ['configuracion'],
				summary: 'Crea un valor de catálogo',
				parameters: [
					{
						name: 'catalogo',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
							enum: [
								'tipos-comprobantes',
								'tipos-precios',
								'monedas',
								'tipos-gestion',
								'tipos-cliente',
								'modalidades-cobranza',
								'tipos-gestion-facturacion',
								'articulos'
							]
						}
					}
				],
				requestBody: {
					required: true,
					content: {
						'application/json': { schema: { $ref: '#/components/schemas/ValorCatalogoEntrada' } }
					}
				},
				responses: {
					'201': { description: 'Valor creado' },
					'409': { description: 'Nombre o código duplicado' }
				}
			}
		},
		'/api/configuracion/catalogos/{catalogo}/{id}': {
			patch: {
				tags: ['configuracion'],
				summary: 'Edita un valor de catálogo o lo habilita/deshabilita',
				parameters: [
					{
						name: 'catalogo',
						in: 'path',
						required: true,
						schema: { type: 'string' }
					},
					{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }
				],
				requestBody: {
					required: true,
					content: {
						'application/json': { schema: { $ref: '#/components/schemas/ValorCatalogoEntrada' } }
					}
				},
				responses: { '200': { description: 'Valor actualizado' } }
			}
		},
		'/api/facturas': {
			get: {
				tags: ['facturador'],
				summary: 'Lista las facturas vivas con sus líneas',
				parameters: [
					{
						name: 'estado',
						in: 'query',
						required: false,
						schema: {
							type: 'string',
							enum: ['PROCESO', 'PENDIENTE', 'BANDEJA', 'FACTURADO', 'COBRADO']
						}
					}
				],
				responses: {
					'200': {
						description: 'Facturas ordenadas por id',
						content: {
							'application/json': {
								schema: { type: 'array', items: { $ref: '#/components/schemas/FacturaListado' } }
							}
						}
					}
				}
			},
			post: {
				tags: ['facturador'],
				summary: 'Copia plantillas al Facturador (crea facturas en estado PROCESO)',
				description:
					'La factura es una copia: guarda snapshot del servicio, la moneda, la fecha global del lote, los importes y los comentarios. Si la plantilla ya fue copiada en ese período no se duplica (se informa en `omitidas`).',
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: { $ref: '#/components/schemas/FacturaCreacion' }
						}
					}
				},
				responses: {
					'201': {
						description: 'Copia realizada',
						content: {
							'application/json': {
								schema: { $ref: '#/components/schemas/ResumenCopia' }
							}
						}
					},
					'400': { description: 'Plantillas o período inválidos' }
				}
			}
		},
		'/api/facturas/{id}': {
			patch: {
				tags: ['facturador'],
				summary: 'Edita la cabecera de la factura',
				parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: { $ref: '#/components/schemas/FacturaParcial' }
						}
					}
				},
				responses: {
					'200': { description: 'Factura actualizada' },
					'404': { description: 'Factura no encontrada' }
				}
			}
		},
		'/api/facturas/{id}/estado': {
			post: {
				tags: ['facturador'],
				summary: 'Mueve la factura de estado',
				description:
					'PENDIENTE exige `motivo`. BANDEJA sustituye todas las variables de los comentarios (422 si falta algún valor) y usa la fecha que ya tiene la factura; `fecha` en el body solo hace falta si la factura no tiene. FACTURADO y COBRADO no piden datos: el facturador real es externo.',
				parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: { $ref: '#/components/schemas/CambioEstadoFactura' }
						}
					}
				},
				responses: {
					'200': { description: 'Estado actualizado' },
					'400': { description: 'Transición inválida' },
					'422': { description: 'Faltan valores de variables' }
				}
			}
		},
		'/api/facturas/{id}/lineas': {
			post: {
				tags: ['facturador'],
				summary: 'Agrega una línea de facturación a la factura',
				description:
					'La línea queda persistida en la factura y es independiente de la plantilla de origen. Solo se puede editar en PROCESO o PENDIENTE. El código se valida contra el catálogo (400 si no existe).',
				parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								required: ['codigo'],
								properties: {
									codigo: { type: 'string', example: '1001' },
									cantidad: { type: 'number', example: 1 },
									importeUnitario: { type: 'number', example: 0 },
									detalle: { type: 'string', nullable: true },
									comentario: { type: 'string', nullable: true }
								}
							}
						}
					}
				},
				responses: {
					'201': {
						description: 'Línea creada',
						content: {
							'application/json': {
								schema: { $ref: '#/components/schemas/LineaFactura' }
							}
						}
					},
					'400': { description: 'Código inexistente, factura no editable o datos inválidos' }
				}
			}
		},
		'/api/facturas/{id}/lineas/{lineaId}': {
			patch: {
				tags: ['facturador'],
				summary: 'Edición rápida de una línea de factura',
				description:
					'Si llega `codigo`, se valida contra el catálogo de artículos: un código inexistente devuelve 400 y no se guarda.',
				parameters: [
					{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
					{ name: 'lineaId', in: 'path', required: true, schema: { type: 'integer' } }
				],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: { $ref: '#/components/schemas/LineaFacturaParcial' }
						}
					}
				},
				responses: {
					'200': {
						description: 'Línea actualizada',
						content: {
							'application/json': {
								schema: { $ref: '#/components/schemas/LineaFactura' }
							}
						}
					},
					'400': { description: 'Código inexistente o datos inválidos' },
					'404': { description: 'Línea no encontrada' }
				}
			},
			delete: {
				tags: ['facturador'],
				summary: 'Elimina una línea de la factura de forma definitiva',
				description: 'La factura no puede quedar sin líneas (400) y solo se edita en PROCESO o PENDIENTE.',
				parameters: [
					{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
					{ name: 'lineaId', in: 'path', required: true, schema: { type: 'integer' } }
				],
				responses: {
					'200': { description: 'Línea eliminada' },
					'400': { description: 'Es la última línea, la factura no es editable o no existe' }
				}
			}
		},
		'/api/facturas/devolver': {
			post: {
				tags: ['facturador'],
				summary: 'Devuelve facturas de la Bandeja al Facturador',
				description:
					'Solo las que están en BANDEJA: pasan a PROCESO y pierden el motivo pendiente y el orden manual.',
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								required: ['ids'],
								properties: {
									ids: { type: 'array', minItems: 1, maxItems: 500, items: { type: 'integer' } }
								}
							}
						}
					}
				},
				responses: {
					'200': {
						description: 'Cantidad devuelta',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: { devueltas: { type: 'integer', example: 4 } }
								}
							}
						}
					}
				}
			}
		},
		'/api/facturas/facturado': {
			post: {
				tags: ['facturador'],
				summary: 'Marca como FACTURADO las facturas exportadas',
				description:
					'Se llama después de generar la planilla de multifacturación. Solo aplica a facturas en BANDEJA.',
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								required: ['ids'],
								properties: {
									ids: { type: 'array', minItems: 1, maxItems: 500, items: { type: 'integer' } }
								}
							}
						}
					}
				},
				responses: {
					'200': {
						description: 'Cantidad marcada',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: { marcadas: { type: 'integer', example: 4 } }
								}
							}
						}
					}
				}
			}
		},
		'/api/facturas/envios/visto': {
			post: {
				tags: ['facturador'],
				summary: 'Marca como vistos los envíos a facturar',
				description:
					'Oculta del modal "Enviados a facturar" los envíos indicados. No borra datos: solo cambia la bandera de visto.',
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								required: ['ids'],
								properties: {
									ids: { type: 'array', minItems: 1, maxItems: 500, items: { type: 'integer' } }
								}
							}
						}
					}
				},
				responses: {
					'200': {
						description: 'Cantidad marcada',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: { vistas: { type: 'integer', example: 4 } }
								}
							}
						}
					}
				}
			}
		},
		'/api/facturas/eliminar': {			post: {
				tags: ['facturador'],
				summary: 'Borrado lógico por lote (pasa a ELIMINADO)',
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								required: ['ids'],
								properties: {
									ids: {
										type: 'array',
										minItems: 1,
										maxItems: 500,
										items: { type: 'integer', example: 12 }
									}
								}
							}
						}
					}
				},
				responses: {
					'200': {
						description: 'Resultado del borrado lógico',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: { eliminadas: { type: 'integer', example: 3 } }
								}
							}
						}
					},
					'400': { description: 'Selección inválida' }
				}
			}
		},
		'/api/variables': {
			get: {
				tags: ['variables'],
				summary: 'Lista las variables con su último valor usado',
				responses: {
					'200': {
						description: 'Variables ordenadas por nombre',
						content: {
							'application/json': {
								schema: { type: 'array', items: { $ref: '#/components/schemas/Variable' } }
							}
						}
					}
				}
			},
			post: {
				tags: ['variables'],
				summary: 'Crea una variable (idempotente por nombre)',
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: { $ref: '#/components/schemas/VariableEntrada' }
						}
					}
				},
				responses: {
					'201': {
						description: 'Variable creada o existente',
						content: {
							'application/json': {
								schema: { $ref: '#/components/schemas/Variable' }
							}
						}
					},
					'400': { description: 'Nombre inválido' }
				}
			},
			put: {
				tags: ['variables'],
				summary: 'Guarda el catálogo completo con los últimos valores',
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: { $ref: '#/components/schemas/VariablesGuardarEntrada' }
						}
					}
				},
				responses: {
					'200': {
						description: 'Variables guardadas',
						content: {
							'application/json': {
								schema: { type: 'array', items: { $ref: '#/components/schemas/Variable' } }
							}
						}
					},
					'400': { description: 'Datos inválidos' }
				}
			}
		},
		'/api/variables/{id}': {
			delete: {
				tags: ['variables'],
				summary: 'Elimina el nombre de una variable',
				parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
				responses: {
					'200': { description: 'Variable eliminada' },
					'404': { description: 'Variable no encontrada' }
				}
			}
		}
	},
	components: {
		schemas: {
			Salud: {
				type: 'object',
				properties: {
					ok: { type: 'boolean' },
					mensaje: { type: 'string' },
					base_datos: {
						type: 'object',
						properties: {
							conectada: { type: 'boolean' },
							ahora: { type: 'string', format: 'date-time' },
							version: { type: 'string' },
							error: { type: 'string' }
						}
					}
				}
			},
			Cliente: {
				type: 'object',
				properties: {
					id: { type: 'integer', example: 1 },
					nombre: { type: 'string', example: 'Ana García' },
					email: { type: 'string', format: 'email', example: 'ana.garcia@ejemplo.com' },
					telefono: { type: 'string', nullable: true, example: '+34 600 111 222' },
					creado_en: { type: 'string', format: 'date-time' }
				}
			},
			ClienteEntrada: {
				type: 'object',
				required: ['nombre', 'email'],
				properties: {
					nombre: { type: 'string', example: 'Ana García' },
					email: { type: 'string', format: 'email', example: 'ana.garcia@ejemplo.com' },
					telefono: { type: 'string', nullable: true, example: '+34 600 111 222' }
				}
			},
			ClienteParcial: {
				type: 'object',
				properties: {
					nombre: { type: 'string' },
					email: { type: 'string', format: 'email' },
					telefono: { type: 'string', nullable: true }
				}
			},
			Sesion: {
				type: 'object',
				properties: {
					token: { type: 'string' },
					user: {
						type: 'object',
						properties: {
							id: { type: 'string' },
							name: { type: 'string' },
							email: { type: 'string', format: 'email' },
							emailVerified: { type: 'boolean' },
							image: { type: 'string', nullable: true },
							createdAt: { type: 'string', format: 'date-time' },
							updatedAt: { type: 'string', format: 'date-time' }
						}
					}
				}
			},
			Catalogos: {
				type: 'object',
				properties: {
					grupos: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								id: { type: 'integer', example: 1 },
								nombre: { type: 'string', example: 'FIJOS' },
								color: { type: 'string', example: 'azul' }
							}
						}
					},
					articulos: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								id: { type: 'integer' },
								codigo: { type: 'string', example: '1001' },
								descripcion: { type: 'string', example: 'HORAS DIURNAS' }
							}
						}
					},
					tiposComprobantes: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								id: { type: 'integer' },
								nombre: { type: 'string', example: 'Venta Crédito' },
								abreviatura: { type: 'string', nullable: true, example: 'VTA CRED' }
							}
						}
					},
					tiposPrecios: { type: 'array', items: { $ref: '#/components/schemas/CatalogoSimple' } },
					monedas: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								id: { type: 'integer' },
								codigo: { type: 'string', example: '$' }
							}
						}
					},
					tiposGestion: { type: 'array', items: { $ref: '#/components/schemas/CatalogoSimple' } },
					tiposCliente: { type: 'array', items: { $ref: '#/components/schemas/CatalogoSimple' } },
					modalidadesCobranza: { type: 'array', items: { $ref: '#/components/schemas/CatalogoSimple' } },
					tiposGestionFacturacion: {
						type: 'array',
						items: { $ref: '#/components/schemas/CatalogoSimple' }
					},
					monedasTiposPrecio: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								monedaId: { type: 'integer' },
								tipoPrecioId: { type: 'integer' }
							}
						}
					}
				}
			},
			CatalogoSimple: {
				type: 'object',
				properties: {
					id: { type: 'integer' },
					nombre: { type: 'string', example: 'TRANSFERENCIA' }
				}
			},
			LineaPlantilla: {
				type: 'object',
				properties: {
					id: { type: 'integer' },
					articuloId: { type: 'integer' },
					codigo: { type: 'string', example: '1001' },
					articulo: { type: 'string', example: 'HORAS DIURNAS' },
					detalle: { type: 'string', nullable: true },
					cantidad: { type: 'string', example: '2.000' },
					importeUnitario: { type: 'string', example: '385.59' },
					comentario: { type: 'string', nullable: true }
				}
			},
			PlantillaListado: {
				type: 'object',
				properties: {
					id: { type: 'integer' },
					servicioId: { type: 'integer' },
					contactoFacturacion: { type: 'string', example: 'CONSTRUCTORA EJEMPLO S.A.' },
					agrupador: { type: 'string', example: '15' },
					fecha: { type: 'string', format: 'date', nullable: true },
					serie: { type: 'string', nullable: true, example: 'A' },
					monedaId: { type: 'integer', nullable: true },
					tipoComprobanteId: { type: 'integer', nullable: true },
					tipoPrecioId: { type: 'integer', nullable: true },
					moneda: { type: 'string', nullable: true, example: '$' },
					tipoComprobante: { type: 'string', nullable: true, example: 'Venta Crédito' },
					tipoPrecio: { type: 'string', nullable: true, example: '30 dias' },
					idCliente: { type: 'integer', nullable: true, example: 200 },
					comentarioGeneral: { type: 'string', nullable: true },
					idCompra: { type: 'string', nullable: true, example: 'OC-4482' },
					detalleAuxiliar: { type: 'string', nullable: true },
					uteVencimiento: { type: 'string', format: 'date', nullable: true },
					informacionAdicional: { type: 'string', nullable: true },
					lineas: { type: 'array', items: { $ref: '#/components/schemas/LineaPlantilla' } }
				}
			},
			GrupoPlantillas: {
				type: 'object',
				properties: {
					id: { type: 'integer' },
					nombre: { type: 'string', example: 'FIJOS' },
					colorFondo: { type: 'string', example: '#3346b8' },
					colorTexto: { type: 'string', example: '#ffffff' },
					plantillas: { type: 'array', items: { $ref: '#/components/schemas/PlantillaListado' } }
				}
			},
			FilaImportacion: {
				type: 'object',
				required: ['contacto', 'agrupador', 'articuloCodigo'],
				properties: {
					contacto: { type: 'string', example: 'CONSTRUCTORA EJEMPLO S.A.' },
					agrupador: { type: 'string', example: '15' },
					fecha: { type: 'string', format: 'date', nullable: true },
					serie: { type: 'string', nullable: true, example: 'A' },
					moneda: { type: 'string', nullable: true, example: '$' },
					tipoComprobante: { type: 'string', nullable: true, example: 'Venta Crédito' },
					tipoPrecio: { type: 'string', nullable: true, example: '30 dias' },
					articuloCodigo: { type: 'string', example: '1001' },
					cantidad: { type: 'number', nullable: true, example: 2 },
					importeUnitario: { type: 'number', nullable: true, example: 385.59 },
					comentario: { type: 'string', nullable: true },
					detalle: { type: 'string', nullable: true },
					informacionAdicional: { type: 'string', nullable: true },
					idCompra: { type: 'string', nullable: true },
					vencimiento: { type: 'string', format: 'date', nullable: true },
					idCliente: {
						type: 'string',
						nullable: true,
						description: 'Numérico, opcional',
						example: '200'
					}
				}
			},
			ImportacionEntrada: {
				type: 'object',
				required: ['filas'],
				properties: {
					filas: {
						type: 'array',
						minItems: 1,
						items: { $ref: '#/components/schemas/FilaImportacion' }
					}
				}
			},
			ResumenImportacion: {
				type: 'object',
				properties: {
					filas: { type: 'integer', example: 324 },
					plantillasNuevas: { type: 'integer', example: 66 },
					plantillasReutilizadas: { type: 'integer', example: 0 },
					lineasInsertadas: { type: 'integer', example: 324 },
					serviciosOmitidos: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								contacto: { type: 'string', example: 'EMPRESA EJEMPLO S.A.' },
								motivo: { type: 'string', enum: ['NO_EXISTE', 'DESHABILITADO'] }
							}
						}
					}
				}
			},
			PlantillaChips: {
				type: 'object',
				properties: {
					monedaId: { type: 'integer', nullable: true },
					tipoComprobanteId: { type: 'integer', nullable: true },
					tipoPrecioId: { type: 'integer', nullable: true },
					idCliente: { type: 'integer', nullable: true },
					comentarioGeneral: { type: 'string', nullable: true }
				}
			},
			LineaPlantillaParcial: {
				type: 'object',
				properties: {
					codigo: { type: 'string', example: '1001' },
					cantidad: { type: 'number', example: 2 },
					importeUnitario: { type: 'number', example: 385.59 },
					detalle: { type: 'string', nullable: true },
					comentario: { type: 'string', nullable: true }
				}
			},
			FilaServicio: {
				type: 'object',
				required: ['contacto'],
				properties: {
					contacto: { type: 'string', example: 'EMPRESA EJEMPLO S.A.' },
					numeracion: { type: 'string', nullable: true, example: '12155454566' },
					tipo: { type: 'string', nullable: true, example: 'OTROS' },
					tipoGestion: { type: 'string', nullable: true, example: 'NORMAL' },
					tipoCliente: { type: 'string', nullable: true, example: 'EMPRESA' },
					modalidadCobranza: { type: 'string', nullable: true, example: 'TRANSFERENCIA' },
					grupo: { type: 'string', nullable: true, example: 'VARIABLES' },
					tipoGestionFacturacion: { type: 'string', nullable: true, example: 'OC_MENSUAL' }
				}
			},
			ServiciosImportacion: {
				type: 'object',
				required: ['filas'],
				properties: {
					filas: {
						type: 'array',
						minItems: 1,
						items: { $ref: '#/components/schemas/FilaServicio' }
					}
				}
			},
			ResumenImportacionServicios: {
				type: 'object',
				properties: {
					filas: { type: 'integer', example: 7 },
					creados: { type: 'integer', example: 7 },
					duplicados: { type: 'array', items: { type: 'string' }, example: ['EMPRESA EJEMPLO S.A.'] }
				}
			},
			ServicioListado: {
				type: 'object',
				properties: {
					id: { type: 'integer' },
					contactoFacturacion: { type: 'string', example: 'EMPRESA EJEMPLO S.A.' },
					nombreFantasia: { type: 'string', nullable: true },
					numeracion: { type: 'string', nullable: true, example: '12155454566' },
					tipoNumeracion: {
						type: 'string',
						enum: ['RUT', 'CEDULA', 'OTROS', 'SIN_NUMERACION'],
						example: 'OTROS'
					},
					grupoId: { type: 'integer' },
					grupoNombre: { type: 'string', example: 'VARIABLES' },
					tipoGestion: { type: 'string', example: 'NORMAL' },
					tipoCliente: { type: 'string', example: 'EMPRESA' },
					modalidadCobranza: { type: 'string', example: 'TRANSFERENCIA' },
					tipoGestionFacturacion: { type: 'string', example: 'OC_MENSUAL' },
					comentarioGestionFacturacion: { type: 'string', nullable: true },
					habilitado: { type: 'boolean', example: true }
				}
			},
			ServicioParcial: {
				type: 'object',
				properties: {
					nombreFantasia: { type: 'string', nullable: true },
					numeracion: { type: 'string', nullable: true },
					tipoNumeracion: { type: 'string', enum: ['RUT', 'CEDULA', 'OTROS', 'SIN_NUMERACION'] },
					grupoId: { type: 'integer' },
					tipoGestionId: { type: 'integer' },
					tipoClienteId: { type: 'integer' },
					modalidadCobranzaId: { type: 'integer' },
					tipoGestionFacturacionId: { type: 'integer' },
					comentarioGestionFacturacion: { type: 'string', nullable: true },
					habilitado: { type: 'boolean' }
				}
			},
			Apariencia: {
				type: 'object',
				required: [
					'filaParFondo',
					'filaParTexto',
					'filaImparFondo',
					'filaImparTexto',
					'tablaLineaColor',
					'tablaLineaGrosor',
					'filaPaddingY',
					'listaLineaColor',
					'listaLineaGrosor'
				],
				properties: {
					filaParFondo: { type: 'string', example: '#e2e9f7' },
					filaParTexto: { type: 'string', example: '#111827' },
					filaImparFondo: { type: 'string', example: '#ffffff' },
					filaImparTexto: { type: 'string', example: '#111827' },
					tablaLineaColor: { type: 'string', example: '#e3e8f4' },
					tablaLineaGrosor: { type: 'integer', minimum: 0, maximum: 4, example: 1 },
					filaPaddingY: { type: 'integer', minimum: 0, maximum: 24, example: 2 },
					listaLineaColor: { type: 'string', example: '#e3e8f4' },
					listaLineaGrosor: { type: 'integer', minimum: 0, maximum: 4, example: 1 }
				}
			},
			GrupoAdmin: {
				type: 'object',
				properties: {
					id: { type: 'integer' },
					nombre: { type: 'string', example: 'FIJOS' },
					colorFondo: { type: 'string', example: '#3346b8' },
					colorTexto: { type: 'string', example: '#ffffff' },
					activo: { type: 'boolean' }
				}
			},
			GrupoAdminEntrada: {
				type: 'object',
				properties: {
					nombre: { type: 'string', example: 'FIJOS' },
					colorFondo: { type: 'string', example: '#3346b8' },
					colorTexto: { type: 'string', example: '#ffffff' },
					activo: { type: 'boolean' }
				}
			},
			ValorCatalogo: {
				type: 'object',
				properties: {
					id: { type: 'integer' },
					nombre: { type: 'string', example: 'Venta Crédito' },
					activo: { type: 'boolean' },
					abreviatura: { type: 'string', nullable: true, example: 'VTA CRED' },
					descripcion: { type: 'string' },
					monedaId: { type: 'integer', nullable: true },
					moneda: { type: 'string', nullable: true }
				}
			},
			ValorCatalogoEntrada: {
				type: 'object',
				properties: {
					nombre: { type: 'string' },
					codigo: { type: 'string' },
					descripcion: { type: 'string' },
					abreviatura: { type: 'string', nullable: true },
					monedaId: { type: 'integer', nullable: true },
					activo: { type: 'boolean' }
				}
			},
			Configuracion: {
				type: 'object',
				properties: {
					catalogos: {
						type: 'object',
						properties: {
							tiposComprobantes: { type: 'array', items: { $ref: '#/components/schemas/ValorCatalogo' } },
							tiposPrecios: { type: 'array', items: { $ref: '#/components/schemas/ValorCatalogo' } },
							monedas: { type: 'array', items: { $ref: '#/components/schemas/ValorCatalogo' } },
							tiposGestion: { type: 'array', items: { $ref: '#/components/schemas/ValorCatalogo' } },
							tiposCliente: { type: 'array', items: { $ref: '#/components/schemas/ValorCatalogo' } },
							modalidadesCobranza: { type: 'array', items: { $ref: '#/components/schemas/ValorCatalogo' } },
							tiposGestionFacturacion: { type: 'array', items: { $ref: '#/components/schemas/ValorCatalogo' } },
							articulos: { type: 'array', items: { $ref: '#/components/schemas/ValorCatalogo' } }
						}
					},
					grupos: { type: 'array', items: { $ref: '#/components/schemas/GrupoAdmin' } },
					apariencia: { $ref: '#/components/schemas/Apariencia' },
					facturacion: { $ref: '#/components/schemas/ConfiguracionFacturacion' }
				}
			},
			ConfiguracionFacturacion: {
				type: 'object',
				required: ['serie', 'periodo', 'fechaGeneral'],
				properties: {
					serie: { type: 'string', maxLength: 10, example: 'A' },
					periodo: {
						type: 'string',
						nullable: true,
						example: '2026-10',
						description: 'Período en proceso (YYYY-MM), configurado en el Facturador'
					},
					fechaGeneral: {
						type: 'string',
						format: 'date',
						nullable: true,
						example: '2026-10-31',
						description: 'Fecha general que se aplica a las facturas del envío'
					}
				}
			},
			ConfiguracionFacturacionEntrada: {
				type: 'object',
				minProperties: 1,
				properties: {
					serie: { type: 'string', maxLength: 10, example: 'A' },
					periodo: { type: 'string', nullable: true, example: '2026-10' },
					fechaGeneral: { type: 'string', format: 'date', nullable: true, example: '2026-10-31' }
				}
			},
			ErrorValidacion: {
				type: 'object',
				properties: {
					error: { type: 'string' },
					detalles: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								campo: { type: 'string', example: 'filas.0.grupo' },
								mensaje: { type: 'string', example: 'El grupo es obligatorio' }
							}
						}
					}
				}
			},
			LineaFactura: {
				type: 'object',
				properties: {
					id: { type: 'integer' },
					articuloId: { type: 'integer' },
					codigo: { type: 'string', example: '1001' },
					descripcion: { type: 'string', example: 'HORAS DIURNAS' },
					cantidad: { type: 'string', example: '2.000' },
					importeUnitario: { type: 'string', example: '385.59' },
					detalle: { type: 'string', nullable: true },
					comentario: { type: 'string', nullable: true }
				}
			},
			FacturaListado: {
				type: 'object',
				properties: {
					id: { type: 'integer' },
					grupoId: { type: 'integer' },
					grupoNombre: { type: 'string', example: 'FIJOS' },
					grupoColorFondo: { type: 'string', example: '#3346b8' },
					grupoColorTexto: { type: 'string', example: '#ffffff' },
					plantillaId: { type: 'integer' },
					periodo: { type: 'string', example: '2026-10' },
					contactoFacturacion: { type: 'string', example: 'EMPRESA EJEMPLO S.A.' },
					nombreFantasia: { type: 'string', nullable: true },
					numeracion: { type: 'string', nullable: true, example: '12155454566' },
					tipoNumeracion: {
						type: 'string',
						enum: ['RUT', 'CEDULA', 'OTROS', 'SIN_NUMERACION'],
						example: 'OTROS'
					},
					tipoGestion: { type: 'string', example: 'NORMAL' },
					tipoCliente: { type: 'string', example: 'EMPRESA' },
					modalidadCobranza: { type: 'string', example: 'TRANSFERENCIA' },
					tipoGestionFacturacion: { type: 'string', example: 'OC_MENSUAL' },
					comentarioGestionFacturacion: { type: 'string', nullable: true },
					moneda: { type: 'string', enum: ['$', 'USD'], example: '$' },
					tipoComprobante: { type: 'string', nullable: true, example: 'Venta Crédito' },
					tipoPrecio: { type: 'string', nullable: true, example: '30 dias' },
					idCliente: { type: 'integer', nullable: true, example: 200 },
					fecha: { type: 'string', format: 'date', nullable: true },
					estado: {
						type: 'string',
						enum: ['PROCESO', 'PENDIENTE', 'BANDEJA', 'FACTURADO', 'COBRADO']
					},
					motivoPendiente: { type: 'string', nullable: true },
					facturadoEn: { type: 'string', format: 'date-time', nullable: true },
					facturadoPor: {
						type: 'string',
						nullable: true,
						enum: ['MULTIFACTURACION', 'API', 'MANUAL'],
						example: 'MULTIFACTURACION'
					},
					facturadoVisto: { type: 'boolean', example: false },
					serie: { type: 'string', nullable: true },
					numero: { type: 'string', nullable: true },
					comentarioGeneral: { type: 'string', nullable: true },
					ordenManual: {
						type: 'integer',
						nullable: true,
						description: 'Orden manual en la Bandeja; null = sin prioridad',
						example: 1
					},
					idCompra: { type: 'string', nullable: true, example: 'OC-4482' },
					detalleAuxiliar: { type: 'string', nullable: true },
					uteVencimiento: { type: 'string', format: 'date', nullable: true },
					informacionAdicional: { type: 'string', nullable: true },
					lineas: { type: 'array', items: { $ref: '#/components/schemas/LineaFactura' } }
				}
			},
			FacturaCreacion: {
				type: 'object',
				required: ['plantillaIds', 'periodo', 'fecha'],
				properties: {
					plantillaIds: {
						type: 'array',
						minItems: 1,
						maxItems: 500,
						items: { type: 'integer', example: 12 }
					},
					periodo: { type: 'string', example: '2026-10' },
					fecha: {
						type: 'string',
						format: 'date',
						description: 'Fecha global del lote, configurada antes de enviar',
						example: '2026-10-31'
					}
				}
			},
			FacturaParcial: {
				type: 'object',
				properties: {
					comentarioGeneral: { type: 'string', nullable: true },
					moneda: { type: 'string', enum: ['$', 'USD'] },
					tipoComprobante: { type: 'string', nullable: true },
					tipoPrecio: { type: 'string', nullable: true },
					idCliente: { type: 'integer', nullable: true },
					fecha: { type: 'string', format: 'date', nullable: true },
					serie: { type: 'string', nullable: true },
					numero: { type: 'string', nullable: true },
					idCompra: { type: 'string', nullable: true, example: 'OC-4482' },
					detalleAuxiliar: { type: 'string', nullable: true },
					uteVencimiento: { type: 'string', format: 'date', nullable: true },
					informacionAdicional: { type: 'string', nullable: true }
				}
			},
			LineaFacturaParcial: {
				type: 'object',
				properties: {
					codigo: { type: 'string', example: '1001' },
					cantidad: { type: 'number', example: 2 },
					importeUnitario: { type: 'number', example: 385.59 },
					detalle: { type: 'string', nullable: true },
					comentario: { type: 'string', nullable: true }
				}
			},
			CambioEstadoFactura: {
				type: 'object',
				required: ['estado'],
				properties: {
					estado: {
						type: 'string',
						enum: ['PROCESO', 'PENDIENTE', 'BANDEJA', 'FACTURADO', 'COBRADO']
					},
					motivo: { type: 'string', nullable: true },
					fecha: { type: 'string', format: 'date', nullable: true },
					variables: {
						type: 'object',
						additionalProperties: { type: 'string' },
						example: { 'mes-anio': 'OCTUBRE 2026' }
					}
				}
			},
			ResumenCopia: {
				type: 'object',
				properties: {
					facturasCreadas: { type: 'integer', example: 7 },
					omitidas: { type: 'integer', example: 0 }
				}
			},
			Variable: {
				type: 'object',
				properties: {
					id: { type: 'integer' },
					nombre: { type: 'string', example: 'mes-anio' },
					valor: { type: 'string', nullable: true, example: 'OCTUBRE 2026' }
				}
			},
			VariableEntrada: {
				type: 'object',
				required: ['nombre'],
				properties: {
					nombre: { type: 'string', example: 'mes-anio' }
				}
			},
			VariablesGuardarEntrada: {
				type: 'object',
				required: ['variables'],
				properties: {
					variables: {
						type: 'array',
						maxItems: 100,
						items: {
							type: 'object',
							required: ['nombre'],
							properties: {
								nombre: { type: 'string', example: 'mes-anio' },
								valor: { type: 'string', nullable: true, example: 'OCTUBRE 2026' }
							}
						}
					}
				}
			}
		}
	}
} as const;
