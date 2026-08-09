import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SERVER_UNSUPPORTED, SERVER_SKIP_VISUAL, SERVER_PASS_THROUGH, breaksServerRun, ignoredOnServer } from './serverCapability'

// PARITÉ CLIENT ↔ SERVEUR. `functions/` est un paquet hermétique : le module ne peut pas
// être partagé, seulement recopié. Ce test lit le fichier serveur comme du TEXTE et
// compare les ensembles — c'est le seul garde-fou possible contre la dérive, et la dérive
// ici est silencieuse et coûteuse : une carte retirée côté serveur sans l'être ici fait
// crier l'éditeur à tort, l'inverse laisse repartir un cron qui s'arrêtera dessus.
function serverSet(name: string): Set<string> {
  const src = readFileSync(resolve(__dirname, '../../../../functions/src/workflow/nodes/index.ts'), 'utf8')
  const block = src.split(`${name} = new Set<string>([`)[1]?.split('])')[0]
  if (!block) throw new Error(`${name} introuvable dans le registre serveur`)
  // Les commentaires du bloc contiennent des noms de types entre quotes (`text-enrich`
  // y est cité en prose) : on ne lit que les lignes de code.
  const code = block.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
  return new Set([...code.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]))
}

describe('capacité serveur — parité avec le registre des Cloud Functions', () => {
  it('SERVER_UNSUPPORTED est identique des deux côtés', () => {
    expect([...SERVER_UNSUPPORTED].sort()).toEqual([...serverSet('SERVER_UNSUPPORTED')].sort())
  })

  it('SERVER_SKIP_VISUAL est identique des deux côtés', () => {
    expect([...SERVER_SKIP_VISUAL].sort()).toEqual([...serverSet('SERVER_SKIP_VISUAL')].sort())
  })

  it('SERVER_PASS_THROUGH est identique des deux côtés', () => {
    expect([...SERVER_PASS_THROUGH].sort()).toEqual([...serverSet('SERVER_PASS_THROUGH')].sort())
  })
})

describe('breaksServerRun', () => {
  it('un node visuel ne casse pas le run (ignoré proprement côté serveur)', () => {
    expect(breaksServerRun('chart')).toBe(false)
  })

  it('l’enrichissement de textes tourne côté serveur : plus rien à annoncer', () => {
    // Il a désormais son jumeau (`functions/src/workflow/nodes/textEnrich.ts`) : le cron
    // traduit au lieu de laisser passer. Le signaler ferait annoncer au pré-vol un travail
    // non fait sur une carte qui travaille.
    expect(breaksServerRun('text-enrich')).toBe(false)
    expect(ignoredOnServer('text-enrich')).toBe(false)
  })

  it('un export PDF, lui, casse toujours le run — sa sortie EST le travail', () => {
    expect(breaksServerRun('export-pdf')).toBe(true)
  })

  it('un node avec jumeau serveur ne déclenche rien', () => {
    for (const type of ['directed-search', 'compare-catalog', 'harvest-competitor', 'cost-report']) {
      expect(breaksServerRun(type)).toBe(false)
    }
  })
})
