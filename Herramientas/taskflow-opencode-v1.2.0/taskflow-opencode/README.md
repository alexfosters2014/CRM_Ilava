# TaskFlow Supervisor v1.2.0 — OpenCode Desktop

TaskFlow es un monitor de tareas para OpenCode Desktop. **No sustituye** a Gentle AI, OpenSpec o al agente principal. Presenta únicamente el nombre de cada tarea y subtarea con un indicador circular blanco de estado.

## Qué cambia en v1.2.0

- **Panel simplificado:** icono de carpeta para tarea principal, icono de hoja para subtareas, círculos blancos: vacío (pendiente), con punto (ejecutando), con check (terminada), X (fallo) y raya (bloqueada).
- **Check por cada subtarea:** el agente debe verificar su trabajo y llamar `taskflow.update` con `status=done` y evidencia. El círculo se marca inmediatamente. Las tareas agrupadoras reciben check cuando todos sus pasos hoja están completos.
- **Foco explícito:** `taskflow.focus({id,intent})` marca la subtarea actual una sola vez. Las operaciones posteriores se asocian con ese paso.
- **Foco inferido conservador:** si solo existe una subtarea que puede ejecutarse, TaskFlow puede marcarla en curso. No atribuye trabajos a pasos ambiguos.
- **Actividad automática oculta:** el plugin escucha operaciones antes y después de herramientas y guarda su estado/duración. El detalle queda en «Diagnóstico técnico», no ocupa el panel habitual.
- **Subagentes:** intenta vincular operaciones y llamadas TaskFlow de subagentes a la sesión principal de OpenCode.
- **Supervisión oculta:** pausa, reanudación, instrucciones, foco manual, prioridad y bloqueo siguen disponibles dentro del desplegable «Supervisión».
- **Compatible con el estado de v1.1:** conserva los planes por proyecto y sesión. Las subtareas ya completadas no se inventan ni se alteran.

### Limitaciones importantes

- Las herramientas se registran **automáticamente**, pero ejecutar una herramienta no demuestra que una subtarea terminó. Solo aparece el check cuando el agente marca `done` con evidencia. No se marcan tareas por suposiciones.
- El seguimiento de `focus` depende de que el agente llame la herramienta o de que exista una única subtarea elegible. Si hay varias candidatas y ninguna está activa, TaskFlow muestra actividad sin asignar una subtarea arbitrariamente.
- El plugin no ve el razonamiento interno del modelo. Las operaciones registradas son únicamente las que pasan por hooks compatibles de OpenCode.
- La pausa es **cooperativa**, no interrumpe inmediatamente una herramienta ya iniciada.
- La API gráfica de OpenCode continúa siendo experimental. El instalador compila el panel en tu PC para verificar compatibilidad antes de usarlo.

## Actualización en Windows desde v1.1.0

1. Cerrá OpenCode Desktop después de terminar el trabajo en curso.
2. Descomprimí el ZIP y entrá a la carpeta `taskflow-opencode`.
3. Escribí `powershell` en la barra de direcciones del Explorador y presioná Enter.
4. Ejecutá:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\instalar.ps1
```

5. Si compilación y pruebas finalizan correctamente, abrí OpenCode Desktop y el panel TaskFlow.

El instalador utiliza la ruta estable `%USERPROFILE%\.config\opencode\taskflow-v1`. Si v1.1 ya la usaba, **no necesitás modificar `opencode.json`**. La skill se copia automáticamente a `%USERPROFILE%\.config\opencode\skills\taskflow\SKILL.md`.

**No borres las carpetas antiguas ni cambies Gentle AI.** Si el instalador advierte que no pudo registrar el plugin por JSONC, conservá la entrada previa que apunte a `.../.config/opencode/taskflow-v1`; esa ruta no cambia.

## Probar la nueva versión

Usá una conversación nueva y pedí una tarea normal, sin mencionar TaskFlow, por ejemplo:

> Revisá la validación de un formulario, corregí el problema y verificá el resultado.

En TaskFlow deberías observar:

- una tarea principal y sus pasos con iconos diferentes;
- el **círculo blanco con un punto** en la subtarea actual (si se declaró `focus` o puede inferirse inequívocamente);
- un **check blanco** cuando termina cada subtarea verificada;
- el **check de la tarea principal** solo cuando todas sus hijas estén completas.

Para comprobar observación automática, abrí **Diagnóstico técnico** y revisá las herramientas registradas. No es necesario llamar la skill por nombre. Si el agente no marca un paso, no habrá check: pedile «actualizá TaskFlow con evidencia de cada subtarea al terminarla» y compartí el resultado para depurar su cumplimiento.

## Archivos y datos

- `src/index.ts`: herramientas, hooks y RPC.
- `src/tracking.ts`: asignación de foco y comprobación de dependencias.
- `src/state.ts`: estado persistente por proyecto/sesión.
- `src/gui.tsx`: panel ligero.
- `skill/SKILL.md`: protocolo del agente.
- `scripts/instalar.ps1`: instalación.
- `tests/`: pruebas de integridad y comportamiento.

Planes guardados localmente en `%USERPROFILE%\.config\opencode\taskflow-supervisor\v1\...`.

No se graban comandos completos ni secretos de argumentos en el historial de actividad. Los nombres de tareas y evidencias sí se guardan localmente: no incluyas secretos en sus textos.

### Documentación oficial

- https://opencode.ai/docs/build/plugins/server/
- https://opencode.ai/docs/build/plugins/gui/
- https://opencode.ai/docs/build/plugins/rpc/
