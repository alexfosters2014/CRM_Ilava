import { readFile, writeFile, mkdir, rename, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createHash } from 'node:crypto'

export type Status = 'pending' | 'active' | 'done' | 'failed' | 'blocked'
export type Task = {
  id: string; title: string; parentId?: string; dependsOn: string[]; priority: number;
  status: Status; acceptance: string; evidence: string; note: string
}
export type FocusSource = 'agent' | 'manual' | 'inferred'
export type Focus = { taskId: string; source: FocusSource; intent: string; since: string }
export type Activity = { id: string; at: string; tool: string; detail: string; status: 'running' | 'done' | 'error'; taskId?: string; actor?: string; endedAt?: string; durationMs?: number }
export type State = {
  version: 1; directory: string; sessionID: string; goal: string; source: 'observed' | 'agent';
  paused: boolean; revision: number; tasks: Task[]; activity: Activity[]; focus?: Focus;
  history: { at: string; message: string }[];
  instructions: { id: string; text: string; at: string }[];
  updatedAt: string
}

const root = process.env.TASKFLOW_STATE_DIR || join(homedir(), '.config', 'opencode', 'taskflow-supervisor', 'v1')
const hash = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 24)
const safe = (s: string) => String(s || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120)
export const directoryKey = (directory: string) => hash(resolve(directory || process.cwd()).toLowerCase())
export const statePath = (directory: string, sessionID: string) => join(root, directoryKey(directory), `${safe(sessionID || 'unknown')}.json`)
export const empty = (directory: string, sessionID: string): State => ({
  version: 1, directory, sessionID, goal: '', source: 'observed', paused: false, revision: 0,
  tasks: [], activity: [], focus: undefined, history: [], instructions: [], updatedAt: new Date().toISOString(),
})
export const short = (s: unknown, limit = 250) => String(s ?? '').trim().slice(0, limit)
export const appendHistory = (state: State, message: string) => {
  state.history.unshift({ at: new Date().toISOString(), message: short(message, 180) })
  state.history = state.history.slice(0, 70)
}
export async function readState(directory: string, sessionID: string): Promise<State> {
  try {
    const data = JSON.parse(await readFile(statePath(directory, sessionID), 'utf8')) as State
    if (data.version === 1 && Array.isArray(data.tasks) && Array.isArray(data.activity)) return data
  } catch (error: unknown) {
    if ((error as { code?: string })?.code !== 'ENOENT') console.warn('[TaskFlow] Error leyendo estado:', String(error))
  }
  return empty(directory, sessionID)
}
async function acquireLock(lock: string): Promise<() => Promise<void>> {
  for (let n = 0; n < 100; n++) {
    try {
      await mkdir(lock)
      return () => rm(lock, { recursive: true, force: true })
    } catch (error: unknown) {
      if ((error as { code?: string }).code !== 'EEXIST') throw error
      try {
        const info = await stat(lock)
        if (Date.now() - info.mtimeMs > 20_000) await rm(lock, { recursive: true, force: true })
      } catch { /* lock removed by another process */ }
      await new Promise((done) => setTimeout(done, 35))
    }
  }
  throw new Error('TaskFlow: el archivo de estado está ocupado')
}
export async function mutateState(
  directory: string,
  sessionID: string,
  mutation: (state: State) => void | Promise<void>,
): Promise<State> {
  const path = statePath(directory, sessionID)
  await mkdir(dirname(path), { recursive: true })
  const unlock = await acquireLock(path + '.lock')
  try {
    const state = await readState(directory, sessionID)
    await mutation(state)
    state.revision += 1
    state.updatedAt = new Date().toISOString()
    const tmp = `${path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
    await writeFile(tmp, JSON.stringify(state, null, 2), 'utf8')
    try { await rename(tmp, path) } catch (error) { await rm(tmp, { force: true }); throw error }
    return state
  } finally {
    await unlock()
  }
}
export function validateTasks(raw: Task[], existing: Task[] = []) {
  if (!raw.length || raw.length + existing.length > 100) throw new Error('Se requieren de 1 a 100 tareas')
  const all = [...existing, ...raw]
  const ids = new Set<string>()
  for (const task of all) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(task.id) || ids.has(task.id)) throw new Error('ID inválido o duplicado: ' + task.id)
    ids.add(task.id)
    if (!task.title.trim() || task.priority < 1 || task.priority > 5 || !Number.isInteger(task.priority)) throw new Error('Título o prioridad inválida: ' + task.id)
  }
  const byId = new Map(all.map(t => [t.id, t]))
  const visited = new Set<string>(), stack = new Set<string>()
  function visit(id: string) {
    if (stack.has(id)) throw new Error('Dependencia circular: ' + id)
    if (visited.has(id)) return
    stack.add(id)
    const task = byId.get(id)!
    if (task.parentId && (!byId.has(task.parentId) || task.parentId === id)) throw new Error('Padre inválido: ' + id)
    for (const dep of task.dependsOn) {
      if (!byId.has(dep) || dep === id) throw new Error('Dependencia inválida: ' + dep)
      visit(dep)
    }
    stack.delete(id)
    visited.add(id)
  }
  for (const id of ids) visit(id)
  for (const task of all) {
    const chain = new Set([task.id]); let current = task
    while (current.parentId) {
      if (chain.has(current.parentId)) throw new Error('Jerarquía circular')
      chain.add(current.parentId)
      current = byId.get(current.parentId)!
    }
  }
}
export function leaves(tasks: Task[]) {
  const parents = new Set(tasks.map(t => t.parentId).filter(Boolean))
  return tasks.filter(t => !parents.has(t.id))
}


/**
 * Los grupos no son pasos ejecutables: su avance se deriva exclusivamente de las hojas.
 * Compatibilidad: los planes antiguos con fases sin hijos se siguen mostrando tal cual.
 */
export function descendants(tasks: Task[], parentId: string): Task[] {
  const result: Task[] = []
  const explore = (id: string) => {
    for (const item of tasks) {
      if (item.parentId !== id) continue
      result.push(item)
      explore(item.id)
    }
  }
  explore(parentId)
  return result
}

export function taskProgress(tasks: Task[], id: string) {
  const children = descendants(tasks, id)
  const scoped = children.length ? leaves(children) : tasks.filter(t => t.id === id)
  const total = scoped.length
  const done = scoped.filter(t => t.status === 'done').length
  const active = scoped.some(t => t.status === 'active')
  const failed = scoped.some(t => t.status === 'failed')
  const blocked = scoped.some(t => t.status === 'blocked')
  const status: Status = !children.length ? (scoped[0]?.status || 'pending')
    : total && done === total ? 'done' : active ? 'active'
    : failed ? 'failed' : blocked ? 'blocked' : 'pending'
  return { done, total, percentage: total ? Math.round(100 * done / total) : 0, status, isGroup: children.length > 0 }
}

/** Obliga a registrar subtareas reales cuando el agente propone fases amplias. */
export function validateGranularPlan(tasks: Task[]) {
  const childCount = new Map<string, number>()
  for (const task of tasks) if (task.parentId) childCount.set(task.parentId, (childCount.get(task.parentId) || 0) + 1)
  const phases = tasks.filter(t => !t.parentId && /^(fase|etapa|m[oó]dulo|bloque|hito)\b/i.test(t.title.trim()))
  const emptyPhases = phases.filter(t => (childCount.get(t.id) || 0) < 2)
  if (emptyPhases.length) throw new Error(
    `Desglose insuficiente: cada fase debe tener al menos 2 subtareas con parentId. Revisá: ${emptyPhases.map(t => t.id).join(', ')}. ` +
    'Ejemplo: {id:"f1-analizar",parentId:"f1",title:"Identificar servicios existentes",dependsOn:[],priority:1,acceptance:"Rutas identificadas"}.',
  )
  if (!phases.length && tasks.length >= 5 && childCount.size === 0) throw new Error(
    'El plan tiene 5 o más tareas planas. Agrupá en etapas y subtareas mediante parentId para mostrar seguimiento granular.',
  )
}
