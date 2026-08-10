import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// PARITÉ CLIENT ↔ SERVEUR de l'instantané de textes (`textsSnapshot.ts` des deux côtés).
//
// ⚠ On ne peut PAS importer les deux modules dans le même test — vérifié empiriquement :
// le client résout `@/features/textEnrich/detectLang` par l'alias Vite, que le bundle des
// Functions ne connaît pas (`functions/tsconfig.json` a `rootDir: "src"` et refuse tout
// fichier hors de `functions/src`, et l'alias `@/` n'existe pas dans `functions/`). On
// compare donc le TEXTE, comme `textEnrichParity.test.ts`.
//
// Une ventilation qui diverge fait mentir l'écran « Suivi » selon que le passage tourne au
// navigateur ou par le cron — invisible tant qu'on ne compare pas les deux à froid.
const root = resolve(__dirname, '../../..')

/** Corps du fichier, sans l'en-tête « ⚠ COPIE de … » du jumeau serveur. Il se termine à la
 *  ligne qui renvoie vers CE test — un repère stable, là où compter les lignes casserait
 *  au premier commentaire ajouté d'un seul côté. Le fichier client n'a pas ce repère : la
 *  recherche échoue (-1), et le corps rendu est le fichier entier. */
function body(path: string): string {
  const lines = readFileSync(resolve(root, path), 'utf8').split('\n')
  const marker = lines.findIndex((l) => l.startsWith('//') && l.includes('textsSnapshotParity.test.ts'))
  return lines.slice(marker + 1).join('\n').trim()
}

/** Les seules divergences tolérées, chacune justifiée : la manière dont chaque côté
 *  résout les MÊMES modules. */
const ADAPTED: [RegExp, string][] = [
  [/from '\.\.\/textEnrich\/detectLang'/g, "from '@/features/textEnrich/detectLang'"],
  [/from '\.\/langBreakdown'/g, "from '../textEnrich/langBreakdown'"],
  [/from '\.\.\/textEnrich\/pass'/g, "from '@/features/textEnrich/pass'"],
  [/from '\.\/opsProgress'/g, "from './opsTypes'"],
]

const TWINS: [string, string][] = [
  ['src/features/priceWatch/ops/textsSnapshot.ts', 'functions/src/priceWatch/textsSnapshot.ts'],
  ['src/features/priceWatch/textEnrich/langBreakdown.ts', 'functions/src/priceWatch/langBreakdown.ts'],
]

describe('jumeau serveur de l’instantané de textes', () => {
  for (const [client, server] of TWINS) {
    it(`${server.split('/').pop()} est identique des deux côtés`, () => {
      let s = body(server)
      for (const [from, to] of ADAPTED) s = s.replace(from, to)
      expect(s).toBe(body(client))
    })
  }
})
