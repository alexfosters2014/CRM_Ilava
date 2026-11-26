---
name: taskflow
description: Seguimiento granular y visual de toda tarea ejecutable en OpenCode Desktop, con planificación ligera, observación automática y supervisión cooperativa. Compatible con Gentle AI y OpenSpec.
---

# TaskFlow Supervisor v1.2 — Skill de seguimiento granular

**Objetivo:** mostrar qué se está haciendo y qué falta, sin reemplazar a los agentes ni sus métodos. El **plugin** ya observa las herramientas automáticamente. Esta skill describe cómo relacionar esa actividad con el plan cuando el agente decide usarlo.

## Activación

- El plugin añade instrucciones ligeras a los ciclos del agente, por lo que **el usuario no necesita mencionar esta skill**.
- Toda tarea ejecutable, incluso sencilla, merece seguimiento.
- Para explicaciones inmediatas sin acciones, no crear planes artificiales.
- Si el usuario pide expresamente no usar TaskFlow, respetar esa preferencia para la planificación; el registro observador seguirá activo mientras el plugin esté habilitado.

## Secuencia recomendada

1. **Respetar el flujo existente.** Gentle AI, OpenSpec y el agente principal siguen tomando las decisiones de diseño y ejecución.
2. **Plan mínimo justo al comenzar:** llamar `taskflow.plan` con `goal` y las tareas. Para acciones sencillas usar 1–3 tareas. Para tareas medianas 3–6 pasos concretos. Para trabajos por fases, es **obligatorio** crear todas las fases y al menos dos subtareas concretas de cada fase, enlazadas con `parentId`, en la misma llamada inicial a `taskflow.plan`. No alcanza con crear 4 o 5 títulos llamados «Fase».
3. Las fases son contenedores: **nunca ejecutar ni marcar `done` directamente una fase que tiene hijos**. Su porcentaje y estado se calculan de las subtareas hoja. Antes de empezar una subtarea hoja, llamar **una vez** a `taskflow.gate` con su `id`. Si `allowed=false`, no arrancar el paso; revisar pausa, dependencias e instrucciones.
4. Llamar **una vez** a `taskflow.focus` con `id` e `intent` antes de comenzar; esto ilumina el círculo de la subtarea actual en el panel. También se acepta `taskflow.update` con `status=active` por compatibilidad.
5. Ejecutar normalmente. El plugin observará llamadas a herramientas sin que tengas que informar cada lectura o comando.
6. **Al terminar CADA paso**, llamar inmediatamente `taskflow.update` con `status=done` y evidencia concreta: archivo revisado, test, compilación o inspección. Así el círculo blanco cambia a check sin esperar a que termine toda la fase. Si falló, usar `failed`/`blocked` con motivo; nunca inventar evidencia.
7. Si aparecen necesidades nuevas, **agregar** con `taskflow.append`; no reemplazar el plan y borrar progreso.
8. Elegir la siguiente tarea pendiente, respetando las dependencias y la prioridad (1 es la mayor), sin usar `taskflow.status` de forma repetitiva.
9. Resumir el resultado al final sin inventar verificación ni cifras.

## Diseño de tareas

- ID corto, único y estable: `api-rutas`, `ui-formulario`, `pruebas`.
- Título con verbo claro: `Validar autorización del endpoint`.
- Criterio de aceptación observable; evitar frases abstractas como “mejorar código”.
- Agrupación jerárquica obligatoria para fases complejas con `parentId`; prioridad de 1 (alta) a 5 (baja).
- No subdividir por subdividir. Una acción simple puede resolverse en un solo paso. Cuando se habla de fases, sí deben existir tareas hijas reales para observar qué se hace en cada etapa.
- **Granularidad práctica:** hojas de trabajo pequeñas, verificables, típicamente una acción concreta (ejemplo: crear la migración, exponer un endpoint, conectar un componente, ejecutar una prueba). No generar centenares de tareas ni inventar trabajo.

## Registros y progreso

- El panel principal muestra solo tareas, subtareas y círculos blancos (pendiente, activo o completado). El detalle de actividad queda oculto en «Diagnóstico técnico».
- El porcentaje lo calculan las subtareas hoja marcadas como `done`; **no mide duración, esfuerzo ni número de herramientas**.
- `done` exige un texto de evidencia. Ese texto lo reporta el agente; no es una certificación externa.
- No pasar un test fallido como exitoso ni marcar la tarea finalizada por haber ejecutado un comando.
- No registrar contenido completo de comandos ni secretos en la evidencia.

## Controles supervisados

- `Pausar` es **cooperativo**: bloquea el siguiente `gate`, pero no interrumpe herramientas ya iniciadas ni impide por sí solo comandos de un agente que ignore el protocolo.
- Las instrucciones guardadas en el panel se entregan mediante `gate`/`status` y el agente las aplica en el siguiente paso.
- Prioridades y bloqueos afectan las tareas futuras, no necesariamente la operación actual.
- El panel y las herramientas apuntan al estado de la **sesión y proyecto** actuales.

## Ejemplo de plan simple

- `inspeccion`: Encontrar el componente del botón. Aceptación: ruta identificada.
- `correccion`: Corregir el evento. Depende de `inspeccion`. Aceptación: cambio confirmado.
- `prueba`: Verificar el resultado. Depende de `correccion`. Aceptación: evidencia de prueba.


## Ejemplo obligatorio para solicitudes complejas

La llamada inicial a `taskflow.plan` debe incluir **tanto las fases como las subtareas**. Cada fase tiene `id` y título; cada hoja tiene `parentId` con el ID de su fase. Las dependencias se declaran entre hojas reales.

| ID | Título | parentId | dependsOn |
| --- | --- | --- | --- |
| `f1` | Fase 1 - Analizar seguimiento | — | `[]` |
| `f1-a` | Localizar servicios de seguimiento | `f1` | `[]` |
| `f1-b` | Documentar entidades existentes | `f1` | `["f1-a"]` |
| `f2` | Fase 2 - Implementar backend | — | `[]` |
| `f2-a` | Crear migración SQL | `f2` | `["f1-b"]` |
| `f2-b` | Implementar endpoint | `f2` | `["f2-a"]` |

Si la herramienta devuelve error de desglose insuficiente, **corregí el plan y volvé a llamarla**, no sigas ejecutando sin subtareas registradas.

## Compatibilidad con planes anteriores

- Los planes antiguos pueden contener solamente fases sin hijos. El panel mostrará la advertencia "Sin subtareas"; no hay detalles que recuperar por inferencia.
- No fabriques historial ni evidencias retroactivas de fases ya terminadas. En el siguiente trabajo creá el plan granular desde el inicio.
- Si una fase aún está pendiente y necesita detalle, usá `taskflow.append` con `parentId` antes de ejecutarla.
- Las operaciones observadas quedan vinculadas a la hoja activa cuando existe exactamente una; si hay varias hojas activas, las operaciones permanecerán en la actividad general para evitar asignaciones falsas.

## Protocolo de foco y check (v1.2)

- Cada subtarea ejecutable tiene un `id`; las fases agrupadoras no pueden ser ejecutadas directamente.
- Al cambiar de subtarea, llamar **una sola vez** `taskflow.focus({id,intent})`. No repetir en cada herramienta.
- TaskFlow observa las llamadas a herramientas reales y las relaciona con el foco mientras este siga activo.
- La IA marca el círculo mediante `taskflow.update({id,status:"done",evidence:"..."})` **inmediatamente** después de verificar el resultado.
- Un grupo muestra check automáticamente solo cuando **todas** sus subtareas hoja están completadas.
- Si no se declaró foco y hay una sola subtarea habilitada, el plugin puede inferir cuál está activa. Si hay varias opciones, muestra actividad sin atribuirla a ninguna.
- La ejecución de una herramienta no significa que la subtarea se haya completado: los checks exigen una transición explícita con evidencia.
- En la UI principal se ven únicamente iconos de tarea principal, iconos de subtarea, nombres y círculos de estado; la supervisión y el diagnóstico van en secciones plegables.
