import { Plugin } from '@opencode/plugin'
import { TaskFlow } from './rpc.js'
import { mutateState, readState, validateTasks, appendHistory, short, leaves,
  taskProgress, validateGranularPlan, type Task, type Status, type State } from './state.js'
import { findFocusTask, inferFocus, readyLeaf, releaseFocus, selectFocus } from './tracking.js'

const schema = (properties: Record<string, unknown>, required: string[]) => ({
  type: 'object', properties, required, additionalProperties: false,
}) as const
const str = { type: 'string' } as const
const taskSchema = schema({
  id: str, title: str, parentId: str,
  dependsOn: { type: 'array', items: str }, priority: { type: 'integer' }, acceptance: str,
}, ['id', 'title', 'dependsOn', 'priority', 'acceptance'])
const toTask = (task: Partial<Task>): Task => ({
  id: short(task.id, 64), title: short(task.title, 180), parentId: task.parentId ? short(task.parentId, 64) : undefined,
  dependsOn: Array.isArray(task.dependsOn) ? task.dependsOn.map(t => short(t, 64)) : [],
  priority: Number(task.priority), acceptance: short(task.acceptance, 500),
  status: 'pending', evidence: '', note: '',
})
const respond = (value: unknown) => ({ content: JSON.stringify(value) })
const isTaskFlow = (tool: string) => /^taskflow[._-]/i.test(tool)
const eventField = (event: unknown, name: string): unknown => (event as Record<string, unknown>)[name]
const eventSession = (event: unknown): string => String(eventField(event, 'sessionID') || '')
const eventTool = (event: unknown): string => String(eventField(event, 'tool') || 'operación')
const eventID = (event: unknown): string => String(eventField(event, 'callID') || eventField(event, 'id') || eventField(event, 'toolCallID') || '')
const eventDetail = (event: unknown): string => {
  // Guardamos solo el tipo y, si está disponible, el nombre del archivo; nunca comandos ni argumentos completos.
  const input = eventField(event, 'input') as Record<string, unknown> | undefined
  const path = input?.filePath || input?.file_path || input?.path
  if (typeof path === 'string') return short(path.replace(/^.*[/\\]/, ''), 100)
  return ''
}
const lastGoal = (text: unknown): string => short(text, 170)

export default Plugin.define({
  id: 'taskflow-supervisor',
  async setup(ctx) {
    const directory = ctx.location.directory || ctx.location.project?.directory || process.cwd()
    const rpc = await ctx.rpc.register(TaskFlow, {
      snapshot: async input => {
        const req = input as { directory: string; sessionID: string }
        const state = await readState(req.directory || directory, req.sessionID)
        return { json: JSON.stringify(state) }
      },
      control: async input => {
        const req = input as { directory: string; sessionID: string; action: string; id: string; value: string }
        try {
          const state = await commit(req.directory || directory, req.sessionID, s => {
            const { action, id, value } = req
            if (action === 'pause') { s.paused = true; appendHistory(s, 'Pausado por el supervisor'); return }
            if (action === 'resume') { s.paused = false; appendHistory(s, 'Reanudado por el supervisor'); return }
            if (action === 'instruction') {
              if (!short(value)) throw new Error('La instrucción está vacía')
              s.instructions.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                text: short(value, 1000), at: new Date().toISOString() })
              s.instructions = s.instructions.slice(-30)
              appendHistory(s, 'Intervención del supervisor')
              return
            }
            if (action === 'focus') {
              selectFocus(s, id, 'manual', value)
              return
            }
            if (action === 'unfocus') {
              if (s.focus?.taskId) {
                const prior = s.tasks.find(t => t.id === s.focus!.taskId)
                if (prior?.status === 'active') prior.status = 'pending'
                appendHistory(s, 'Foco retirado por supervisor: ' + s.focus.taskId)
                s.focus = undefined
              }
              return
            }
            if (action === 'reset') {
              // No borra el historial; conserva una pista de auditoría.
              s.tasks = []; s.goal = ''; s.source = 'observed'; s.paused = false; s.focus = undefined
              appendHistory(s, 'Plan reiniciado manualmente'); return
            }
            const task = s.tasks.find(t => t.id === id)
            if (!task) throw new Error('Tarea desconocida: ' + id)
            if (action === 'priority') {
              const priority = Number(value)
              if (!Number.isInteger(priority) || priority < 1 || priority > 5) throw new Error('Prioridad 1 a 5')
              task.priority = priority; appendHistory(s, `Prioridad ${priority}: ${id}`); return
            }
            if (action === 'block') { releaseFocus(s, id); task.status = 'blocked'; task.note = short(value, 500); appendHistory(s, 'Bloqueada: ' + id); return }
            if (action === 'reopen') { releaseFocus(s, id); task.status = 'pending'; task.evidence = ''; appendHistory(s, 'Reabierta: ' + id); return }
            if (action === 'note') { task.note = short(value, 500); appendHistory(s, 'Nota editada: ' + id); return }
            throw new Error('Acción desconocida: ' + action)
          })
          return { json: JSON.stringify({ ok: true, state }) }
        } catch (error) {
          return { json: JSON.stringify({ ok: false, error: String(error) }) }
        }
      },
    })

    async function commit(dir: string, sid: string, change: (state: State) => void | Promise<void>) {
      if (!sid) throw new Error('Se requiere sessionID para aislar cada conversación')
      const state = await mutateState(dir, sid, change)
      try { await rpc.events.emit('changed', { sessionID: sid, revision: state.revision }) }
      catch { /* La GUI también usa polling de respaldo */ }
      return state
    }
    const location = async (toolContext: unknown) => {
      const sid = String((toolContext as { sessionID?: string } | undefined)?.sessionID || '')
      const { root } = await scope(sid)
      return { dir: directory, sid: root }
    }
    const instructions = (s: State) => s.instructions.slice(-10).map(x => x.text)
    const ready = readyLeaf

    await ctx.tool.transform(editor => {
      editor.namespace({ name: 'taskflow', description: 'Monitor visual: planificación ligera y supervisión de pasos' })
      editor.add({
        name: 'plan', options: { namespace: 'taskflow' },
        description: 'Registrar el plan. Si hay fases, cada fase debe contener 2 o más subtareas reales enlazadas con parentId; registra las fases y todas sus hojas juntas. Para tareas simples, 1-3 pasos. No controlar la ejecución.',
        input: schema({ goal: str, tasks: { type: 'array', items: taskSchema } }, ['goal', 'tasks']),
        execute: async (input, toolCtx) => {
          const { dir, sid } = await location(toolCtx)
          const req = input as { goal: string; tasks: Partial<Task>[] }
          const tasks = req.tasks.map(toTask)
          validateTasks(tasks)
          validateGranularPlan(tasks)
          const state = await commit(dir, sid, s => {
            if (s.tasks.length && s.source === 'agent' && leaves(s.tasks).some(t => t.status !== 'done'))
              throw new Error('Ya existe un plan en ejecución. Usá taskflow.append o conservá el plan actual.')
            s.tasks = tasks; s.goal = lastGoal(req.goal); s.source = 'agent'; s.focus = undefined
            appendHistory(s, `Plan creado: ${tasks.length} tareas`)
          })
          return respond({ ok: true, total: state.tasks.length, revision: state.revision })
        },
      })
      editor.add({
        name: 'append', options: { namespace: 'taskflow' },
        description: 'Agregar subtareas reales con parentId sin borrar el progreso. Ideal para desglosar fases existentes todavía pendientes.',
        input: schema({ tasks: { type: 'array', items: taskSchema } }, ['tasks']),
        execute: async (input, toolCtx) => {
          const { dir, sid } = await location(toolCtx)
          const tasks = (input as { tasks: Partial<Task>[] }).tasks.map(toTask)
          const state = await commit(dir, sid, s => {
            validateTasks(tasks, s.tasks); s.tasks.push(...tasks); s.source = 'agent'
            appendHistory(s, `Agregadas ${tasks.length} subtareas`)
          })
          return respond({ ok: true, total: state.tasks.length })
        },
      })
      editor.add({
        name: 'focus', options: { namespace: 'taskflow' },
        description: 'OBLIGATORIO una vez al empezar cada subtarea: declara qué paso ejecutas y qué intentas hacer; lo marca activo. NO repetir antes de cada herramienta.',
        input: schema({ id: str, intent: str }, ['id', 'intent']),
        execute: async (input, toolCtx) => {
          const { dir, sid } = await location(toolCtx)
          const req = input as { id: string; intent: string }
          const state = await commit(dir, sid, s => { selectFocus(s, req.id, 'agent', req.intent) })
          return respond({ ok: true, focus: state.focus, revision: state.revision })
        },
      })
      editor.add({
        name: 'gate', options: { namespace: 'taskflow' },
        description: 'Consultar pausa, dependencias e intervenciones justo antes de iniciar la siguiente subtarea.',
        input: schema({ id: str }, ['id']),
        execute: async (input, toolCtx) => {
          const { dir, sid } = await location(toolCtx)
          const s = await readState(dir, sid), id = (input as { id: string }).id
          const t = s.tasks.find(x => x.id === id)
          if (!t) return respond({ allowed: false, error: 'Tarea desconocida', paused: s.paused })
          if (s.tasks.some(x => x.parentId === id)) return respond({ allowed: false, error: 'La fase es agrupadora; ejecutá sus subtareas hoja', paused: s.paused })
          return respond({ allowed: !s.paused && t.status === 'pending' && ready(s, t),
            paused: s.paused, task: t, instructions: instructions(s), revision: s.revision })
        },
      })
      editor.add({
        name: 'update', options: { namespace: 'taskflow' },
        description: 'Reportar un cambio real: active al empezar, done al verificar, failed/blocked ante fallo. Nunca inventar evidencia.',
        input: schema({ id: str, status: { type: 'string', enum: ['active', 'done', 'failed', 'blocked'] }, evidence: str },
          ['id', 'status', 'evidence']),
        execute: async (input, toolCtx) => {
          const { dir, sid } = await location(toolCtx)
          const { id, status, evidence } = input as { id: string; status: Status; evidence: string }
          const state = await commit(dir, sid, s => {
            const t = s.tasks.find(x => x.id === id)
            if (!t) throw new Error('Tarea desconocida: ' + id)
            if (s.tasks.some(x => x.parentId === id)) throw new Error('Esta fase agrupa subtareas: actualizá sus pasos hoja, no la fase')
            if (status === 'active') {
              selectFocus(s, id, 'agent', t.title)
              return
            }
            if (status === 'done' && (t.status !== 'active' || short(evidence).length < 8))
              throw new Error('Para completar se requiere tarea activa y evidencia concreta')
            if ((status === 'failed' || status === 'blocked') && !short(evidence)) throw new Error('Describí el impedimento')
            t.status = status; t.evidence = short(evidence, 600); releaseFocus(s, id)
            appendHistory(s, `${status}: ${id}`)
          })
          return respond({ ok: true, revision: state.revision, paused: state.paused })
        },
      })
      editor.add({
        name: 'status', options: { namespace: 'taskflow' },
        description: 'Consultar el estado actual solo cuando haga falta decidir la siguiente acción. No realizar polling desde el agente.',
        input: schema({}, []),
        execute: async (_input, toolCtx) => {
          const { dir, sid } = await location(toolCtx)
          const s = await readState(dir, sid)
          return respond({ goal: s.goal, paused: s.paused, revision: s.revision, focus: s.focus, tasks: s.tasks,
            instructions: instructions(s), recentActivity: s.activity.slice(0, 8),
            groupProgress: s.tasks.filter(t => s.tasks.some(x => x.parentId === t.id))
              .map(t => ({ id: t.id, ...taskProgress(s.tasks, t.id) })) })
        },
      })
    })

    // Instrucción dinámica: da prioridad al vínculo real entre la subtarea y las operaciones observadas.
    await ctx.session.hook('context', async event => {
      const sid = event.sessionID
      if (!sid) return
      const { root, actor } = await scope(sid)
      let message = 'TASKFLOW v1.2 OBSERVADOR. Para trabajo ejecutable, crea un plan granular con taskflow.plan (fases + hojas). '
        + 'ANTES de la PRIMERA herramienta de cada nueva hoja, llama UNA VEZ a taskflow.focus({id,intent}) para activar su seguimiento y explicar brevemente qué estás haciendo. '
        + 'No repitas focus en cada herramienta. Todas las herramientas siguientes se observan automáticamente. '
        + 'Al verificar la hoja llama taskflow.update({id,status:"done",evidence}) con evidencia concreta. '
        + 'No cierres hojas por inferencia; si hay errores reporta failed/blocked. '
        + 'Gentle AI/OpenSpec controlan la ejecución. Respetá pausa y dependencias, y no crees planes para preguntas sin trabajo.'
      try {
        const s = await readState(directory, root)
        if (s.tasks.length) {
          const active = findFocusTask(s)
          message += ` PLAN: ${short(s.goal, 100)}.`
          if (active) message += ` FOCO ACTUAL ${active.id}: ${short(s.focus?.intent, 130)}. Conservá foco mientras trabajás en ella.`
          else {
            const available = leaves(s.tasks).filter(t => t.status === 'pending' && readyLeaf(s, t))
            message += ` SIN FOCO. Antes de otra herramienta elige una hoja habilitada y llama taskflow.focus. Candidatas: ${available.slice(0, 9).map(t => `${t.id}=${short(t.title, 45)}`).join('; ') || 'ninguna'}.`
          }
          if (s.paused) message += ' PAUSA ACTIVADA: NO iniciar nueva subtarea.'
          const incoming = s.instructions.slice(-2).map(i => short(i.text, 170)).join(' / ')
          if (incoming) message += ` INSTRUCCIONES DEL SUPERVISOR: ${incoming}`
        }
      } catch (error) { console.warn('[TaskFlow] contexto:', error) }
      if (actor !== 'Agente principal') message += ' SOS UN SUBAGENTE: no crees un plan nuevo para la misma sesión; trabajá sobre la subtarea que te delegaron.'
      event.system.push({ type: 'text', text: message })
    })

    // Vincular operaciones de subagentes a la conversación principal, sin adivinar su tarea.
    const sessionRoots = new Map<string, { root: string; actor: string }>()
    async function scope(sid: string) {
      const cached = sessionRoots.get(sid)
      if (cached) return cached
      let root = sid, actor = 'Agente principal'
      try {
        const info = await ctx.session.get({ sessionID: sid })
        if (info.parentID) {
          root = info.parentID
          actor = 'Subagente'
          for (let hop = 0; hop < 3; hop++) {
            const ancestor = await ctx.session.get({ sessionID: root })
            if (!ancestor.parentID) break
            root = ancestor.parentID
          }
        }
      } catch { /* No vinculamos sesiones desconocidas por suposición */ }
      const result = { root, actor }
      sessionRoots.set(sid, result)
      return result
    }

    // Registrar cada nueva petición sin exigir al usuario invocar la skill.
    await ctx.session.hook('prompt', async event => {
      const sid = eventSession(event)
      if (!sid) return
      const { root } = await scope(sid)
      const prompt = (event as unknown as { prompt?: { text?: string } }).prompt
      const title = lastGoal(prompt?.text)
      if (!title) return
      try {
        await commit(directory, root, s => {
          if (s.tasks.length && leaves(s.tasks).every(t => t.status === 'done')) {
            s.tasks = []; s.source = 'observed'; s.focus = undefined
          }
          if (!s.goal || !s.tasks.length) s.goal = title
          appendHistory(s, 'Solicitud recibida; seguimiento automático')
        })
      } catch (error) { console.warn('[TaskFlow] prompt:', error) }
    })

    // Hooks observadores: registran acciones reales sin alterar entradas ni salidas de otros plugins.
    await ctx.tool.hook('execute.before', async event => {
      const sid = eventSession(event), tool = eventTool(event)
      if (!sid || isTaskFlow(tool)) return
      const { root, actor } = await scope(sid)
      try {
        await commit(directory, root, s => {
          // Si el agente no declaró foco, inferir SOLO cuando haya una única hoja habilitada.
          const focus = inferFocus(s)
          s.activity.unshift({
            id: eventID(event) || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            at: new Date().toISOString(), tool: short(tool, 80), detail: eventDetail(event),
            status: 'running', actor, taskId: focus?.taskId,
          })
          s.activity = s.activity.slice(0, 150)
        })
      } catch (error) { console.warn('[TaskFlow] before:', error) }
    })
    await ctx.tool.hook('execute.after', async event => {
      const sid = eventSession(event), tool = eventTool(event)
      if (!sid || isTaskFlow(tool)) return
      const { root, actor } = await scope(sid)
      try {
        await commit(directory, root, s => {
          const id = eventID(event)
          const entry = (id && s.activity.find(a => a.id === id && a.status === 'running')) ||
            s.activity.find(a => a.tool === tool && a.actor === actor && a.status === 'running')
          const status = eventField(event, 'status') === 'error' ? 'error' : 'done'
          const now = new Date().toISOString()
          if (entry) {
            entry.status = status
            entry.endedAt = now
            entry.durationMs = Math.max(0, Date.parse(now) - Date.parse(entry.at))
          } else s.activity.unshift({ id: id || `${Date.now()}`, at: now,
            tool: short(tool, 80), detail: eventDetail(event), status, actor })
          s.activity = s.activity.slice(0, 150)
        })
      } catch (error) { console.warn('[TaskFlow] after:', error) }
    })
  },
})
