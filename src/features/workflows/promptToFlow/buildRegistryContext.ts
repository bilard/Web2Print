// src/features/workflows/promptToFlow/buildRegistryContext.ts
import { nodeRegistry } from '../registry'
import type { Port, NodeSpec } from '../types'

function fmtPorts(ports: Port[]): string {
  if (ports.length === 0) return '(aucun)'
  return ports.map((p) => `${p.name}:${p.type}${p.required ? '*' : ''}`).join(', ')
}

/**
 * Sérialise les champs de config. Les nodes à `ConfigComponent` custom ont un
 * `configSchema` vide mais exposent toutes leurs clés dans `defaultConfig` (ex:
 * send-gmail → to, subject, body…). On fusionne les deux sources pour que le LLM
 * connaisse TOUS les champs remplissables (sinon il les laisse vides).
 */
function fmtConfig(spec: NodeSpec): string {
  const bySchema = new Map((spec.configSchema ?? []).map((f) => [f.name, f]))
  const dc = (spec.defaultConfig ?? {}) as Record<string, unknown>
  const names = Array.from(new Set([...bySchema.keys(), ...Object.keys(dc)]))
  if (names.length === 0) return '(aucune)'
  return names
    .map((name) => {
      const f = bySchema.get(name)
      if (f) {
        const opts = f.options?.length ? `=${f.options.map((o) => o.value).join('|')}` : ''
        return `${name}:${f.kind}${opts}(${f.label})`
      }
      return `${name}:${typeof dc[name]}`
    })
    .join(', ')
}

function fmtNode(spec: NodeSpec): string {
  return [
    `- type: ${spec.type} | cat: ${spec.category} | ${spec.label}`,
    `  desc: ${spec.description}`,
    `  in: ${fmtPorts(spec.inputs)}`,
    `  out: ${fmtPorts(spec.outputs)}`,
    `  config: ${fmtConfig(spec)}`,
  ].join('\n')
}

/**
 * Sérialise le registre de nodes en catalogue texte déterministe, injecté dans
 * le prompt de génération. Le `*` après un type de port signale `required`.
 * L'ordre suit `nodeRegistry.list()` (ordre d'enregistrement).
 */
export function buildRegistryContext(): string {
  return nodeRegistry
    .list()
    .map(fmtNode)
    .join('\n')
}
