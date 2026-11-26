import { Rpc } from '@opencode/plugin/rpc'

const string = { type: 'string' } as const
const request = (properties: Record<string, unknown>, required: string[]) => ({
  type: 'object', properties, required, additionalProperties: false,
}) as const

export const TaskFlow = Rpc.define({
  id: 'taskflow-supervisor',
  methods: {
    snapshot: {
      input: request({ directory: string, sessionID: string }, ['directory', 'sessionID']),
      output: request({ json: string }, ['json']),
    },
    control: {
      input: request({ directory: string, sessionID: string, action: string, id: string, value: string },
        ['directory', 'sessionID', 'action', 'id', 'value']),
      output: request({ json: string }, ['json']),
    },
  },
  events: {
    changed: { schema: request({ sessionID: string, revision: { type: 'number' } }, ['sessionID', 'revision']) },
  },
})
