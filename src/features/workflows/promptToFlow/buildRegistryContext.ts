// src/features/workflows/promptToFlow/buildRegistryContext.ts
import { nodeRegistry } from '../registry'
import type { Port, ConfigField, NodeSpec } from '../types'

function fmtPorts(ports: Port[]): string {
  if (ports.length === 0) return '(aucun)'
  return ports.map((p) => `${p.name}:${p.type}${p.required ? '*' : ''}`).join(', ')
}

function fmtConfig(fields: ConfigField[]): string {
  if (fields.length === 0) return '(aucune)'
  return fields.map((f) => `${f.name}:${f.kind}(${f.label})`).join(', ')
}

function fmtNode(spec: NodeSpec): string {
  return [
    `- type: ${spec.type} | cat: ${spec.category} | ${spec.label}`,
    `  desc: ${spec.description}`,
    `  in: ${fmtPorts(spec.inputs)}`,
    `  out: ${fmtPorts(spec.outputs)}`,
    `  config: ${fmtConfig(spec.configSchema)}`,
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
