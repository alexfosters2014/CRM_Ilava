import { Plugin, Panel, Command, type PanelTab } from '@opencode/plugin/gui'
import { createEffect, createSignal, onCleanup, onMount, For, Show } from 'solid-js'
import { TaskFlow } from './rpc.js'

type Status = 'pending' | 'active' | 'done' | 'failed' | 'blocked'
type Task = { id: string; title: string; parentId?: string; priority: number; status: Status; evidence?: string; acceptance?: string }
type Activity = { id: string; at: string; tool: string; detail: string; status: 'running' | 'done' | 'error'; taskId?: string; actor?: string }
type State = { goal: string; paused: boolean; revision: number; tasks: Task[]; activity: Activity[];
  focus?: { taskId: string; intent: string; source: string }; instructions: { text: string }[] }
const empty = (): State => ({ goal: '', paused: false, revision: 0, tasks: [], activity: [], instructions: [] })
const btn: Record<string, string> = { background: 'transparent', color: 'inherit', border: '1px solid var(--border-base,#8886)',
  'border-radius': '7px', padding: '6px 9px', 'font-size': '12px', cursor: 'pointer' }
const childrenOf = (tasks: Task[], id: string) => tasks.filter(t => t.parentId === id).sort((a,b) => a.priority - b.priority)
const leaves = (tasks: Task[]) => tasks.filter(t => !tasks.some(c => c.parentId === t.id))
function stats(task: Task, tasks: Task[]): { done: number; total: number; status: Status } {
  const visit = (id: string): Task[] => childrenOf(tasks, id).flatMap(t => [...(childrenOf(tasks,t.id).length ? visit(t.id) : [t])])
  const descendants = visit(task.id)
  const list = descendants.length ? descendants : [task]
  const done = list.filter(t => t.status === 'done').length
  const status = !descendants.length ? task.status : done === list.length ? 'done' : list.some(t => t.status === 'active') ? 'active'
    : list.some(t => t.status === 'failed') ? 'failed' : list.some(t => t.status === 'blocked') ? 'blocked' : 'pending'
  return { done, total: list.length, status }
}
/** Estado visual: aro blanco pendiente, aro con punto para ejecución, círculo blanco marcado al completar. */
function StatusCircle(props: { status: Status; label?: string }) {
  return <svg width="18" height="18" viewBox="0 0 20 20" role="img" aria-label={props.label || props.status}
    style={{ 'flex-shrink': '0', opacity: props.status === 'pending' ? .8 : 1 }}>
    <circle cx="10" cy="10" r="8" fill={props.status === 'done' ? 'white' : 'none'} stroke="white" stroke-width="1.65" />
    <Show when={props.status === 'done'}>
      <path d="M6 10.2 8.8 13 14.4 7.2" fill="none" stroke="#17212c" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" />
    </Show>
    <Show when={props.status === 'active'}><circle cx="10" cy="10" r="3.1" fill="white" /></Show>
    <Show when={props.status === 'failed'}><path d="M7 7 13 13 M13 7 7 13" stroke="white" stroke-width="1.8" stroke-linecap="round" /></Show>
    <Show when={props.status === 'blocked'}><path d="M6 10h8" stroke="white" stroke-width="1.8" stroke-linecap="round" /></Show>
  </svg>
}
function KindIcon(props: { main: boolean }) {
  return <svg width="15" height="15" viewBox="0 0 20 20" aria-hidden="true"
    style={{ opacity: props.main ? .92 : .63, 'flex-shrink': '0' }}>
    <Show when={props.main} fallback={<>
      <rect x="5.5" y="3.2" width="11" height="13.5" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.5" />
      <path d="M8 7h5.7M8 10h5.7M8 13h3.7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </>}>
      <path d="M2.3 6.5V5.2c0-1 .8-1.8 1.8-1.8H8l1.7 1.9H16c1 0 1.8.8 1.8 1.8V15c0 1-.8 1.8-1.8 1.8H4.1c-1 0-1.8-.8-1.8-1.8V6.5Z"
        fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
    </Show>
  </svg>
}
function Branch(props: { task: Task; all: Task[]; depth: number; collapsed: Set<string>; toggle: (id: string) => void; focusId?: string }) {
  const kids = () => childrenOf(props.all, props.task.id)
  const group = () => kids().length > 0
  const status = () => stats(props.task,props.all).status
  const focused = () => props.focusId === props.task.id && status() === 'active'
  const collapsed = () => props.collapsed.has(props.task.id)
  return <div style={{ 'margin-left': props.depth ? '14px' : '0', 'border-left': props.depth ? '1px solid var(--border-base,#7773)' : 'none',
    'padding-left': props.depth ? '8px' : '0' }}>
    <div style={{ display: 'flex', 'align-items': 'center', gap: '7px', 'margin-top': '3px', padding: '7px 5px',
      'border-radius': '7px', background: focused() ? 'rgba(255,255,255,.09)' : 'transparent',
      'border-left': focused() ? '2px solid white' : '2px solid transparent' }} title={props.task.evidence || props.task.acceptance || props.task.title}>
      <Show when={group()} fallback={<span style={{ width: '11px', 'flex-shrink': 0 }} /> }>
        <button type="button" onClick={() => props.toggle(props.task.id)} aria-label={collapsed() ? 'Expandir tarea' : 'Contraer tarea'}
          style={{ background: 'transparent', color: 'inherit', border: 'none', cursor: 'pointer', padding: 0,
            width: '11px', 'flex-shrink': 0, 'font-size': '13px' }}>{collapsed() ? '▸' : '▾'}</button>
      </Show>
      <KindIcon main={props.depth === 0} />
      <div style={{ flex: 1, 'min-width': 0, 'line-height': '1.4', 'font-weight': props.depth === 0 ? '600' : '400',
        'font-size': '12px', 'overflow-wrap': 'anywhere' }}>{props.task.title}</div>
      <StatusCircle status={status()} label={`${props.task.title}: ${status() === 'done' ? 'completada' : status() === 'active' ? 'en ejecución' : 'pendiente'}`} />
    </div>
    <Show when={group() && !collapsed()}>
      <For each={kids()}>{t => <Branch task={t} all={props.all} depth={props.depth + 1} collapsed={props.collapsed}
        toggle={props.toggle} focusId={props.focusId} />}</For>
    </Show>
  </div>
}
function View(props: { ctx: any; sessionID: () => string; directory: () => string }) {
  const [state,setState] = createSignal<State>(empty())
  const [error,setError] = createSignal('')
  const [busy,setBusy] = createSignal(false)
  const [instruction,setInstruction] = createSignal('')
  const [selectedTask,setSelectedTask] = createSignal('')
  const [collapsed,setCollapsed] = createSignal<Set<string>>(new Set())
  const toggle = (id: string) => setCollapsed(prev => { const s=new Set(prev); if(s.has(id))s.delete(id);else s.add(id);return s })
  let ticket = 0
  async function refresh() {
    const dir=props.directory(),sid=props.sessionID()
    if(!dir||!sid)return
    const current=++ticket
    try {
      const result=await props.ctx.client.rpc(TaskFlow).snapshot({directory:dir,sessionID:sid})
      if(current!==ticket)return
      const s=JSON.parse(result.json) as State
      setState({ ...empty(), ...s })
      setError('')
    } catch(e) {if(current===ticket)setError('No se pudo actualizar: '+String(e))}
  }
  async function control(action:string,id='',value='') {
    setBusy(true)
    try {
      const result=await props.ctx.client.rpc(TaskFlow).control({directory:props.directory(),sessionID:props.sessionID(),action,id,value})
      const parsed=JSON.parse(result.json)
      if(!parsed.ok)throw new Error(parsed.error||'Acción rechazada')
      setState(parsed.state);setError('')
    } catch(e) {setError(String(e))} finally {setBusy(false)}
  }
  createEffect(() => { props.sessionID(); props.directory(); setState(empty()); void refresh() })
  onMount(() => {
    const unsub=props.ctx.client.rpc(TaskFlow).events.on('changed',(evt:{data:{sessionID:string}})=>{
      if(evt.data.sessionID===props.sessionID())void refresh()
    })
    const interval=setInterval(()=>{if(!busy())void refresh()},1200)
    onCleanup(()=>{clearInterval(interval);unsub()})
  })
  const leaf = () => leaves(state().tasks)
  const done = () => leaf().filter(t=>t.status==='done').length
  const roots = () => state().tasks.filter(t=>!t.parentId||!state().tasks.some(p=>p.id===t.parentId)).sort((a,b)=>a.priority-b.priority)
  const current = () => state().focus?.taskId || leaf().find(t=>t.status==='active')?.id
  const running = () => state().activity.filter(a=>a.status==='running')
  return <div style={{ padding:'13px',height:'100%',overflow:'auto','box-sizing':'border-box','font-family':'inherit','font-size':'12px' }}>
    <div style={{display:'flex','justify-content':'space-between','align-items':'center',gap:'8px'}}>
      <b style={{'font-size':'16px'}}>TaskFlow <span style={{opacity:.5,'font-size':'10px'}}>v1.2</span></b>
      <span style={{'font-size':'10px',opacity:.75}}>{state().paused?'⏸ Pausado':'● Observando'}</span>
    </div>
    <Show when={state().goal}><p style={{opacity:.75,'line-height':'1.45','margin':'10px 0 7px'}}>{state().goal}</p></Show>
    <div style={{display:'flex','justify-content':'space-between',opacity:.8,'font-size':'11px','margin':'12px 0 6px'}}>
      <span>Avance verificado</span><b>{done()} / {leaf().length}</b>
    </div>
    <div style={{height:'5px',background:'var(--background-element,#8883)','border-radius':'9px',overflow:'hidden'}}>
      <div style={{height:'100%',width:`${leaf().length?Math.round(100*done()/leaf().length):0}%`,background:'white','border-radius':'9px'}} />
    </div>
    <Show when={error()}><p style={{color:'#ef8f89','font-size':'11px'}}>{error()}</p></Show>
    <div style={{display:'flex','justify-content':'space-between','align-items':'center','margin-top':'17px','margin-bottom':'7px'}}>
      <b>Tareas</b>
      <button style={{...btn,border:'none',padding:'2px 0','font-size':'11px',opacity:.8}}
        onClick={()=>setCollapsed(new Set(collapsed().size?[]:state().tasks.filter(t=>state().tasks.some(x=>x.parentId===t.id)).map(t=>t.id)))}>
        {collapsed().size?'Expandir':'Contraer'}
      </button>
    </div>
    <Show when={roots().length} fallback={<p style={{opacity:.7,'line-height':'1.5'}}>Aún no hay plan. TaskFlow observará las operaciones mientras el agente prepara sus tareas.</p>}>
      <For each={roots()}>{t=><Branch task={t} all={state().tasks} depth={0} collapsed={collapsed()} toggle={toggle} focusId={current()}/>}</For>
    </Show>
    <Show when={running().length && !current()}>
      <p style={{opacity:.68,'font-size':'11px','line-height':'1.5'}}>Hay actividad del agente, pero todavía no indicó qué subtarea está ejecutando.</p>
    </Show>
    <details style={{'margin-top':'20px','border-top':'1px solid var(--border-base,#8884)','padding-top':'10px'}}>
      <summary style={{cursor:'pointer',opacity:.8,'font-size':'12px'}}>Supervisión</summary>
      <div style={{display:'flex',gap:'6px','margin-top':'11px'}}>
        <button style={btn} disabled={busy()||state().paused} onClick={()=>void control('pause')}>⏸ Pausar</button>
        <button style={btn} disabled={busy()||!state().paused} onClick={()=>void control('resume')}>▶ Reanudar</button>
      </div>
      <textarea value={instruction()} onInput={e=>setInstruction(e.currentTarget.value)}
        placeholder="Instrucción para el agente…" style={{width:'100%',height:'58px','box-sizing':'border-box',background:'transparent',color:'inherit',
        border:'1px solid var(--border-base,#8886)','border-radius':'6px',padding:'8px','margin-top':'10px'}}/>
      <button style={{...btn,'margin-top':'5px'}} disabled={busy()||!instruction().trim()}
        onClick={async()=>{const v=instruction();await control('instruction','',v);if(!error())setInstruction('')}}>Guardar instrucción</button>
      <details style={{'margin-top':'10px'}}>
        <summary style={{cursor:'pointer',opacity:.75}}>Prioridades y control de pasos</summary>
        <select value={selectedTask()} onChange={e=>setSelectedTask(e.currentTarget.value)}
          style={{width:'100%','margin-top':'8px',padding:'7px',color:'inherit',background:'var(--background-element,#333)',
            border:'1px solid var(--border-base,#8886)','border-radius':'6px'}}>
          <option value="">Elegí una subtarea</option>
          <For each={leaf()}>{t=><option value={t.id}>{t.title}</option>}</For>
        </select>
        <div style={{display:'flex',gap:'5px','flex-wrap':'wrap','margin-top':'7px'}}>
          <button style={btn} disabled={!selectedTask()} onClick={()=>void control('focus',selectedTask(),'Foco seleccionado por supervisor')}>Enfocar</button>
          <button style={btn} disabled={!selectedTask()} onClick={()=>void control('priority',selectedTask(),'1')}>Prioridad alta</button>
          <button style={btn} disabled={!selectedTask()} onClick={()=>void control('block',selectedTask(),'Bloqueada por supervisor')}>Bloquear</button>
          <button style={btn} disabled={!selectedTask()} onClick={()=>void control('reopen',selectedTask())}>Reabrir</button>
        </div>
      </details>
      <p style={{opacity:.6,'font-size':'10px','line-height':'1.5'}}>Pausa cooperativa: se aplica antes del próximo paso, no corta una herramienta ya iniciada.</p>
    </details>
    <details style={{'margin-top':'12px','font-size':'11px'}}>
      <summary style={{cursor:'pointer',opacity:.66}}>Diagnóstico técnico</summary>
      <p style={{opacity:.65}}>Sesión: {props.sessionID().slice(0,20)} · revisión {state().revision}</p>
      <button style={btn} onClick={()=>void refresh()}>Actualizar</button>
      <Show when={state().activity.length}>
        <For each={state().activity.slice(0,12)}>{a=><p style={{opacity:.75,'overflow-wrap':'anywhere',margin:'6px 0'}}>
          {a.status==='running'?'◌':a.status==='error'?'×':'✓'} {a.tool}{a.detail?` · ${a.detail}`:''}{a.taskId?` (${a.taskId})`:''}</p>}</For>
      </Show>
    </details>
  </div>
}
export default Plugin.define({
  i18n:{en:{title:'TaskFlow',open:'Abrir TaskFlow'},es:{title:'TaskFlow',open:'Abrir TaskFlow'}},
  setup(ctx){
    const tab:PanelTab={id:'main',get title(){return ctx.t('title')},closable:'compact',fallback:true}
    ctx.add(Panel,{id:'main',region:'side',width:'narrow',list:input=>input.open.includes('main')?[tab]:[],
      render:props=><View ctx={ctx} sessionID={()=>props.session.id} directory={()=>props.session.directory}/>})
    ctx.add(Command,{id:'open',title:'Abrir TaskFlow',run:()=>{
      const session=ctx.sessions.current();if(session)ctx.layout.toggle(`${ctx.id}:main`,session)
    }})
  },
})
