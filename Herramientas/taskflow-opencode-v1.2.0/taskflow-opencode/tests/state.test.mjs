import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = await mkdtemp(join(tmpdir(), 'taskflow-v1-test-'))
process.env.TASKFLOW_STATE_DIR = dir
const { mutateState, readState, statePath, validateTasks, leaves, validateGranularPlan, taskProgress } = await import('../src/state.ts')
const task = (id, dependsOn = [], parentId) => ({ id, title: id, dependsOn, parentId, priority: 1,
  status: 'pending', acceptance: 'Verificar salida', evidence: '', note: '' })
test('persistencia aislada por proyecto y sesión', async () => {
  await mutateState('C:/Trabajo/CRM', 's1', s => { s.goal = 'CRM' })
  await mutateState('C:/Trabajo/CRM', 's2', s => { s.goal = 'otro chat' })
  await mutateState('C:/Trabajo/Volley', 's1', s => { s.goal = 'voley' })
  assert.equal((await readState('C:/Trabajo/CRM', 's1')).goal, 'CRM')
  assert.equal((await readState('C:/Trabajo/CRM', 's2')).goal, 'otro chat')
  assert.equal((await readState('C:/Trabajo/Volley', 's1')).goal, 'voley')
  assert.notEqual(statePath('C:/Trabajo/CRM','s1'), statePath('C:/Trabajo/CRM','s2'))
})
test('escrituras concurrentes sin perder revisiones', async () => {
  await Promise.all(Array.from({ length: 14 }, (_, i) => mutateState('C:/Trabajo/CRM','sim',s => {
    s.activity.push({ id: String(i), at: '', tool: '', detail: '', status: 'done' })
  })))
  const state = await readState('C:/Trabajo/CRM','sim')
  assert.equal(state.activity.length, 14)
  assert.equal(state.revision, 14)
})
test('dependencias inválidas, ciclos y padres inválidos', () => {
  assert.throws(() => validateTasks([task('a',['b'])]))
  assert.throws(() => validateTasks([task('a',['b']),task('b',['a'])]))
  assert.throws(() => validateTasks([task('a', [], 'b')]))
  validateTasks([task('fase'), task('a', [], 'fase'), task('b', ['a'], 'fase')])
})
test('progreso solo cuenta las hojas', () => {
  const all = [task('fase'),task('a',[], 'fase'),task('b',[], 'fase')]
  assert.deepEqual(leaves(all).map(t=>t.id), ['a','b'])
})
test.after(async () => rm(dir,{recursive:true,force:true}))

test('una fase sin subtareas reales es rechazada por la planificación granular', () => {
  assert.throws(() => validateGranularPlan([task('f1')] .map(t => ({...t, title:'Fase 1 - Backend'}))))
  const valid = [
    {...task('f1'),title:'Fase 1 - Backend'},
    task('f1-a', [], 'f1'),
    task('f1-b', ['f1-a'], 'f1'),
  ]
  validateTasks(valid)
  assert.doesNotThrow(() => validateGranularPlan(valid))
  assert.throws(() => validateGranularPlan(Array.from({length: 5}, (_, i) => task('flat-'+i))))
})
test('las fases heredan estado y porcentaje de sus subtareas hoja', () => {
  const all = [task('fase'),task('a',[], 'fase'),task('b',[], 'fase')]
  assert.deepEqual(taskProgress(all,'fase'), {done:0,total:2,percentage:0,status:'pending',isGroup:true})
  all[1].status = 'done'
  all[2].status = 'active'
  assert.deepEqual(taskProgress(all,'fase'), {done:1,total:2,percentage:50,status:'active',isGroup:true})
  all[2].status = 'done'
  assert.equal(taskProgress(all, 'fase').status, 'done')
})
