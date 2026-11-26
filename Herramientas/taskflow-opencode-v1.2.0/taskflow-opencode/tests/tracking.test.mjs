import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
// Pruebas de contrato fuente para el protocolo que usa el plugin en runtime.
const source = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8')
const tracking = await readFile(new URL('../src/tracking.ts', import.meta.url), 'utf8')
const gui = await readFile(new URL('../src/gui.tsx', import.meta.url), 'utf8')
test('el agente tiene herramienta de foco y finalización con evidencia', () => {
  assert.match(source, /name: 'focus'/)
  assert.match(source, /name: 'update'/)
  assert.match(source, /Para completar se requiere tarea activa y evidencia concreta/)
  assert.match(source, /selectFocus\(s, id, 'agent'/)
})
test('una fase solo se completa a partir de sus hojas y no se atribuye trabajo ambiguo', () => {
  assert.match(source, /Esta fase agrupa subtareas/)
  assert.match(tracking, /if \(eligible.length !== 1\) return/)
  assert.match(tracking, /if \(active.length > 1\) return/)
})
test('el panel contiene círculos blancos, check e iconos distintos', () => {
  assert.match(gui, /function StatusCircle/)
  assert.match(gui, /function KindIcon/)
  assert.match(gui, /fill=\{props.status === 'done' \? 'white'/)
  assert.match(gui, /focusId=\{current\(\)\}/)
})

