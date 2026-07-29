import { GitBranch, Repeat, Pipette, Sigma } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'

interface IfElseConfig {
  expression: string
}

const ifElseNode: NodeSpec<
  IfElseConfig,
  { value: unknown },
  { then?: unknown; else?: unknown }
> = {
  type: 'if-else',
  category: 'logic',
  labelKey: 'node.if-else.label',
  descriptionKey: 'node.if-else.desc',
  icon: GitBranch,
  inputs: [{ name: 'value', type: 'any' }],
  outputs: [
    { name: 'then', type: 'any' },
    { name: 'else', type: 'any' },
  ],
  configSchema: [
    {
      name: 'expression',
      kind: 'expression',
      labelKey: 'node.if-else.f1',
      helpKey: 'node.if-else.f2',
    },
  ],
  defaultConfig: { expression: 'true' },
  runtime: 'client',
  run: async (ctx, config, inputs) => {
    const value = inputs.value
    const expr = config.expression?.trim() || 'true'
    let result: boolean
    try {
      result = Boolean(new Function('value', `return (${expr})`)(value))
    } catch (err) {
      throw new Error(`Erreur d'évaluation "${expr}" : ${err instanceof Error ? err.message : err}`, { cause: err })
    }
    ctx.log('info', `Condition "${expr}" = ${result}`)
    return result ? { then: value } : { else: value }
  },
}

interface PipeConfig {
  expressions: string
}

const pipeNode: NodeSpec<
  PipeConfig,
  { value: unknown },
  { result: unknown }
> = {
  type: 'pipe',
  category: 'logic',
  labelKey: 'node.pipe.label',
  descriptionKey: 'node.pipe.desc',
  icon: Pipette,
  inputs: [{ name: 'value', type: 'any' }],
  outputs: [{ name: 'result', type: 'any' }],
  configSchema: [
    {
      name: 'expressions',
      kind: 'textarea',
      labelKey: 'node.pipe.f1',
      helpKey: 'node.pipe.f2',
    },
  ],
  defaultConfig: { expressions: '' },
  runtime: 'client',
  run: async (ctx, config, inputs) => {
    const lines = String(config.expressions || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    if (lines.length === 0) {
      ctx.log('warn', 'Aucune expression — la valeur est forwardée telle quelle.')
      return { result: inputs.value }
    }
    let value = inputs.value
    ctx.log('info', `Pipe : ${lines.length} expression(s) à appliquer.`)
    for (let i = 0; i < lines.length; i++) {
      const expr = lines[i]
      try {
        value = new Function('value', `return (${expr})`)(value)
      } catch (err) {
        throw new Error(
          `Étape ${i + 1} "${expr}" : ${err instanceof Error ? err.message : err}`,
          { cause: err },
        )
      }
    }
    return { result: value }
  },
}

/**
 * Loop : début d'une boucle foreach. L'executor le reconnaît spécialement —
 * pour chaque élément du tableau d'input, il exécute le sous-graphe entre
 * loop-each et le loop-collect connecté en aval, en injectant `item` dans
 * les configs interpolées ({{item.X}}).
 */
const loopEachNode: NodeSpec<
  Record<string, never>,
  { items: unknown },
  { item: unknown }
> = {
  type: 'loop-each',
  category: 'logic',
  labelKey: 'node.loop-each.label',
  descriptionKey: 'node.loop-each.desc',
  icon: Repeat,
  inputs: [{ name: 'items', type: 'any', required: true }],
  outputs: [{ name: 'item', type: 'any' }],
  configSchema: [],
  defaultConfig: {},
  runtime: 'client',
  // Le run par défaut n'est appelé que si le node n'est pas dans une paire valide.
  run: async (ctx, _config, inputs) => {
    const items = inputs.items
    if (!Array.isArray(items)) {
      throw new Error("Loop each : l'entrée 'items' doit être un tableau.")
    }
    ctx.log(
      'warn',
      'Loop each isolé (sans Loop Collect en aval) — forwarde le premier élément seulement.',
    )
    return { item: items[0] }
  },
}

/**
 * Loop Collect : fin d'une boucle. L'executor remplit son output `results`
 * avec l'array des valeurs collectées sur chaque itération.
 */
const loopCollectNode: NodeSpec<
  Record<string, never>,
  { item: unknown },
  { results: unknown }
> = {
  type: 'loop-collect',
  category: 'logic',
  labelKey: 'node.loop-collect.label',
  descriptionKey: 'node.loop-collect.desc',
  icon: Sigma,
  inputs: [{ name: 'item', type: 'any' }],
  outputs: [{ name: 'results', type: 'any' }],
  configSchema: [],
  defaultConfig: {},
  runtime: 'client',
  run: async (_ctx, _config, inputs) => {
    // Hors loop : forwarde l'item seul dans un array de 1 élément.
    return { results: inputs.item === undefined ? [] : [inputs.item] }
  },
}

nodeRegistry.register(ifElseNode)
nodeRegistry.register(pipeNode)
nodeRegistry.register(loopEachNode)
nodeRegistry.register(loopCollectNode)
