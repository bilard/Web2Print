import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// PARITÉ CLIENT ↔ SERVEUR du moteur d'enrichissement de textes.
//
// `functions/` est hermétique (`rootDir: "src"`) : ces modules ne peuvent pas être
// partagés, seulement recopiés. La dérive serait SILENCIEUSE et chère — un prompt qui
// diverge fait écrire au cron des textes que le navigateur n'aurait pas produits, une
// éligibilité qui diverge fait retraiter la nuit ce que le jour a déjà fait (et refacture),
// une garde qui diverge laisse passer la nuit ce que le jour refuse.
//
// On compare le TEXTE, en écartant l'en-tête de copie et les adaptations déclarées ici :
// toute autre différence casse la suite au lieu de dormir.
const root = resolve(__dirname, '../../..')

/** Corps du fichier, sans l'en-tête « ⚠ COPIE de … » du jumeau. Il se termine à la ligne
 *  qui renvoie vers CE test — un repère stable, là où compter les lignes casserait au
 *  premier mot ajouté. */
function body(path: string): string {
  const lines = readFileSync(resolve(root, path), 'utf8').split('\n')
  const marker = lines.findIndex((l) => l.startsWith('//') && l.includes('textEnrichParity.test.ts'))
  return lines.slice(marker + 1).join('\n').trim()
}

/** Les seules divergences tolérées, chacune justifiée. */
const ADAPTED: [RegExp, string][] = [
  // Le client résout par alias, le serveur par chemin relatif : même module.
  [/from '\.\.\/excel\/types'/g, "from '@/features/excel/types'"],
  // Le découpage en lots vient du moteur de complétion Excel côté client ; le serveur en
  // a une copie locale, elle-même couverte plus bas.
  [/from '\.\/batches'/g, "from '@/features/excel/ai-completion/columnCompletionEngine'"],
]

const TWINS: [string, string][] = [
  ['src/features/textEnrich/template.ts', 'functions/src/textEnrich/template.ts'],
  ['src/features/textEnrich/fieldPlan.ts', 'functions/src/textEnrich/fieldPlan.ts'],
  ['src/features/textEnrich/revision.ts', 'functions/src/textEnrich/revision.ts'],
  ['src/features/textEnrich/nodeConfig.ts', 'functions/src/textEnrich/nodeConfig.ts'],
  ['src/features/textEnrich/sheetMode.ts', 'functions/src/textEnrich/sheetMode.ts'],
  ['src/features/textEnrich/planWaves.ts', 'functions/src/textEnrich/planWaves.ts'],
  ['src/features/textEnrich/sheetMemory.ts', 'functions/src/textEnrich/sheetMemory.ts'],
  ['src/features/textEnrich/pass.ts', 'functions/src/textEnrich/pass.ts'],
]

describe('jumeaux serveur du moteur d’enrichissement', () => {
  for (const [client, server] of TWINS) {
    it(`${server.split('/').pop()} est identique des deux côtés`, () => {
      let s = body(server)
      for (const [from, to] of ADAPTED) s = s.replace(from, to)
      expect(s).toBe(body(client))
    })
  }

  it('⚠ le PROMPT est identique, schéma zod mis à part', () => {
    // `zod` n'est pas une dépendance des Cloud Functions : le serveur valide par
    // `parseLlmJson`. Le texte envoyé au modèle, lui, doit être le MÊME — c'est lui qui
    // décide de ce qui s'écrit dans les fiches.
    // À partir de la CONSTRUCTION du prompt : au-dessus, le jumeau porte un type écrit
    // à la main là où le client l'infère de zod.
    const cut = (s: string) => s.slice(s.indexOf('export function buildBatchPrompt')).trim()
    expect(cut(body('functions/src/textEnrich/prompt.ts')))
      .toBe(cut(body('src/features/textEnrich/prompt.ts')))
  })

  it('⚠ le DÉCOUPAGE en lots est identique : c’est lui qui décide si la réponse tient', () => {
    // Un lot plus gros côté serveur tronquerait la sortie en silence — la panne que le
    // commentaire de `chunkByVolume` décrit, transposée ici.
    // Idem : on compare à partir de la BOUCLE de lots, après le type réécrit.
    const cut = (s: string) => s.slice(s.indexOf('export async function runCompletionBatches')).trim()
    expect(cut(body('functions/src/textEnrich/batches.ts')))
      .toBe(cut(body('src/features/excel/ai-completion/columnCompletionEngine.ts')))
  })
})
