// PARITÉ CLIENT ↔ SERVEUR de `firstWatchId` — le suivi auquel un incident (carte en
// erreur) est rattaché. `src/features/workflows/runtime/firstWatchId.ts` (navigateur) et
// `functions/src/workflow/preflight.ts` (cron) sont deux implémentations distinctes : une
// divergence route les pannes vers un journal que l'écran ne lit jamais, EN SILENCE — le
// suivi paraît sain alors qu'il accumule des incidents ailleurs.
//
// ⚠ Contrairement à `opsProgressParity.test.ts` (progressStore.ts importe le SDK client
// Firestore, son jumeau serveur le SDK admin — deux bundles qui ne compilent pas
// ensemble), toute la chaîne de `firstWatchId` est PURE des deux côtés (aucun module
// Firebase importé, direct ou transitif). Les deux implémentations s'importent donc
// réellement ici, sur les MÊMES fixtures — un test comportemental, pas une comparaison de
// texte source.
import { describe, it, expect } from 'vitest'
import { firstWatchId as clientFirstWatchId } from './firstWatchId'
import { firstWatchId as serverFirstWatchId } from '../../../../functions/src/workflow/preflight'
import { WATCH_NODES } from './validateWorkflow'
import type { Workflow } from '../types'

function wf(nodes: Workflow['nodes'], edges: Workflow['edges'] = []): Workflow {
  return { id: 'wf-1', name: 'x', nodes, edges } as unknown as Workflow
}

function node(id: string, type: string, config: unknown): Workflow['nodes'][number] {
  return { id, type, position: { x: 0, y: 0 }, config } as unknown as Workflow['nodes'][number]
}

function edge(source: string, target: string, targetHandle = ''): Workflow['edges'][number] {
  return { id: `${source}-${target}`, source, sourceHandle: '', target, targetHandle }
}

/** Compare les deux implémentations sur le MÊME graphe : c'est la seule assertion qui
 *  compte ici, le reste des tests du dépôt couvre déjà le comportement d'un seul côté. */
function expectParity(w: Workflow): void {
  expect(clientFirstWatchId(w)).toBe(serverFirstWatchId(w as never))
}

describe('firstWatchId — parité navigateur ↔ cron', () => {
  it('un seul suivi : chaque type de carte de veille tarifaire donne le même id des deux côtés', () => {
    for (const type of WATCH_NODES) {
      expectParity(wf([node('n1', type, { watchId: 'Mon Suivi' })]))
    }
  })

  it('aucun suivi : un workflow sans carte de veille ne désigne rien, des deux côtés', () => {
    expectParity(wf([node('n1', 'export-pdf', {})]))
    expectParity(wf([]))
  })

  it('une carte orpheline (déconnectée alors que le graphe a des liens) est ignorée des deux côtés', () => {
    expectParity(
      wf(
        [
          node('n0', 'trigger', {}),
          node('n1', 'harvest-competitor', { watchId: 'orphelin' }),
        ],
        [],
      ),
    )
    // Orpheline en présence d'AUTRES liens actifs ailleurs dans le graphe.
    expectParity(
      wf(
        [
          node('n0', 'trigger', {}),
          node('n1', 'harvest-competitor', { watchId: 'orphelin' }),
          node('n2', 'compare-catalog', { watchId: 'orphelin' }),
        ],
        [edge('n0', 'n2')],
      ),
    )
  })

  it('deux sous-graphes de veille indépendants : le PREMIER connecté gagne, des deux côtés', () => {
    expectParity(
      wf(
        [
          node('n1', 'harvest-competitor', { watchId: 'sousA' }),
          node('n2', 'compare-catalog', { watchId: 'sousA' }),
          node('n3', 'harvest-competitor', { watchId: 'sousB' }),
          node('n4', 'compare-catalog', { watchId: 'sousB' }),
        ],
        [edge('n1', 'n2'), edge('n3', 'n4')],
      ),
    )
  })

  it('« Sites sources » branché IMPOSE son watchId, en écartant la config locale — des deux côtés', () => {
    expectParity(
      wf(
        [
          node('src', 'source-sites', { watchId: 'Source A' }),
          node('n1', 'harvest-competitor', { watchId: 'config locale ignorée' }),
        ],
        [edge('src', 'n1', 'sites')],
      ),
    )
  })

  it('⚠ un watchId qui n’est pas une chaîne (import corrompu) retombe sur l’id du workflow, des deux côtés', () => {
    // C'EST la divergence trouvée en écrivant ce test : le navigateur coerçait
    // `String(123)` → "123" pendant que le cron, plus strict (`typeof v === 'string'`),
    // retombait sur l'id du workflow — deux journaux pour le même incident selon qui
    // l'écrit. `deriveWatchId` déclare son paramètre `configWatchId: string` : une valeur
    // qui n'a jamais été une chaîne n'a jamais été un `watchId` volontaire, elle est donc
    // traitée comme absente des deux côtés (cf. `rawWatchId` dans alignWatchIds.ts et
    // `watchIdOf` dans preflight.ts).
    expectParity(wf([node('n1', 'harvest-competitor', { watchId: 123 })]))
    expectParity(wf([node('n1', 'harvest-competitor', null)]))
    expectParity(wf([{ id: 'n1', type: 'harvest-competitor', position: { x: 0, y: 0 } } as unknown as Workflow['nodes'][number]]))
  })
})
