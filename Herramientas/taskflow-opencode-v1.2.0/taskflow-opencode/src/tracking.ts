import { appendHistory, leaves, short, taskProgress, type Focus, type FocusSource, type State, type Task } from './state.js'

export const readyLeaf = (s: State, t: Task) => t.dependsOn.every(dep => taskProgress(s.tasks, dep).status === 'done')
export const findFocusTask = (s: State): Task | undefined => {
  if (!s.focus) return
  return leaves(s.tasks).find(t => t.id === s.focus!.taskId && t.status === 'active')
}
/** Una sola subtarea activa por sesión. No hace suposiciones sobre pasos ya realizados. */
export function selectFocus(s: State, id: string, source: FocusSource, intent: string): Focus {
  const t = leaves(s.tasks).find(t => t.id === id)
  if (!t) throw new Error('La subtarea no existe o es una fase agrupadora: ' + id)
  if (s.paused) throw new Error('TaskFlow está pausado. Reanudá antes de comenzar otra subtarea.')
  if (t.status !== 'pending' && t.status !== 'active') throw new Error('Subtarea no disponible: ' + t.status)
  if (!readyLeaf(s, t)) throw new Error('Existen dependencias pendientes: ' + id)
  for (const other of leaves(s.tasks)) {
    if (other.id !== id && other.status === 'active') {
      other.status = 'pending'
      other.note = short(`Interrumpida al cambiar el foco a ${id}`, 500)
      appendHistory(s, `Paso interrumpido (sin completar): ${other.id}`)
    }
  }
  const now = new Date().toISOString()
  const same = s.focus?.taskId === id
  t.status = 'active'
  s.focus = { taskId: id, source, intent: short(intent, 240) || t.title,
    since: same ? s.focus!.since : now }
  appendHistory(s, `Foco ${source}: ${id}`)
  return s.focus
}
/** Solo se infiere si hay UNA opción inequívoca. Nunca elegir arbitrariamente entre tareas. */
export function inferFocus(s: State): Focus | undefined {
  if (findFocusTask(s)) return s.focus
  if (s.paused || !s.tasks.length) return
  const active = leaves(s.tasks).filter(t => t.status === 'active')
  if (active.length === 1) return selectFocus(s, active[0].id, 'inferred', 'Única subtarea previamente activa')
  if (active.length > 1) return
  const eligible = leaves(s.tasks).filter(t => t.status === 'pending' && readyLeaf(s, t))
  if (eligible.length !== 1) return
  return selectFocus(s, eligible[0].id, 'inferred', 'Única subtarea habilitada por dependencias')
}
export function releaseFocus(s: State, id: string) {
  if (s.focus?.taskId === id) s.focus = undefined
}
