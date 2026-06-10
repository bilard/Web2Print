// functions/src/workflow/types.ts
export interface ServerNode { id: string; type: string; position?: unknown; config: unknown }
export interface ServerEdge {
  id: string; source: string; sourceHandle: string; target: string; targetHandle: string
}
export interface ServerWorkflow {
  id: string; name: string; ownerId: string
  nodes: ServerNode[]; edges: ServerEdge[]
}

export type LogLevel = 'info' | 'warn' | 'error'
export interface RunLog { ts: number; level: LogLevel; node?: string; msg: string }

export interface ServerRunCtx {
  uid: string
  log: (level: LogLevel, msg: string) => void
  signal: AbortSignal
}

export type ServerRun = (
  ctx: ServerRunCtx,
  config: Record<string, unknown>,
  inputs: Record<string, unknown>,
) => Promise<Record<string, unknown>>

export interface ServerNodeSpec { type: string; run: ServerRun }
