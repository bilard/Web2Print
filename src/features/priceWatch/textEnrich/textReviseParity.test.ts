import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// PARITÉ CLIENT ↔ SERVEUR des modules purs de « Traduire et étoffer les fiches ».
//
// `functions/` est hermétique (`rootDir: "src"`) : ces modules ne peuvent pas être
// partagés, seulement recopiés. La dérive serait SILENCIEUSE et chère — un prompt qui
// diverge fait écrire au cron des textes que le navigateur n'aurait pas produits, une
// garde `protected` qui diverge laisse passer la nuit ce que le jour refuse.
//
// On compare le TEXTE, en écartant l'en-tête de copie et les adaptations d'import
// déclarées ici : toute autre différence casse la suite au lieu de dormir.
const root = resolve(__dirname, '../../../..')

/** Corps du fichier, sans l'en-tête « ⚠ COPIE de … » propre au jumeau serveur. Celui-ci
 *  se termine à la ligne qui renvoie vers CE test — un repère stable, là où compter les
 *  lignes casserait au premier mot ajouté. */
function body(path: string): string {
  const lines = readFileSync(resolve(root, path), 'utf8').split('\n')
  const marker = lines.findIndex((l) => l.startsWith('//') && l.includes('textReviseParity.test.ts'))
  return lines.slice(marker + 1).join('\n').trim()
}

/** Les seules divergences tolérées, chacune justifiée. */
const ADAPTED: Record<string, [RegExp, string][]> = {
  'textEnrich/protected.ts': [
    // Le client résout par alias, le serveur par chemin relatif : le module est le même.
    [/from '\.\.\/priceWatch\/catalog\/keys'/, "from '@/features/priceWatch/catalog/keys'"],
  ],
}

const TWINS: [string, string][] = [
  ['src/features/priceWatch/textEnrich/chunkByVolume.ts', 'functions/src/priceWatch/textEnrich/chunkByVolume.ts'],
  ['src/features/priceWatch/textEnrich/staleRevision.ts', 'functions/src/priceWatch/textEnrich/staleRevision.ts'],
  ['src/features/textEnrich/protected.ts', 'functions/src/textEnrich/protected.ts'],
  ['src/features/textEnrich/detectLang.ts', 'functions/src/textEnrich/detectLang.ts'],
  ['src/features/workflows/registry/catalogTextReviseTypes.ts', 'functions/src/priceWatch/textEnrich/revisePlans.ts'],
]

describe('jumeaux serveur de « Traduire et étoffer les fiches »', () => {
  for (const [client, server] of TWINS) {
    it(`${server.split('/').pop()} est identique des deux côtés`, () => {
      let s = body(server)
      for (const [from, to] of ADAPTED[server.replace('functions/src/', '')] ?? []) {
        s = s.replace(from, to)
      }
      expect(s).toBe(body(client))
    })
  }

  it('⚠ le PROMPT est identique, schéma zod mis à part', () => {
    // `zod` n'est pas une dépendance des Cloud Functions et `callLlm` n'annonce aucun
    // schéma : seule la construction du prompt est portée. Le texte envoyé au modèle,
    // lui, doit être le MÊME — c'est lui qui décide de ce qui s'écrit dans les fiches.
    const cut = (s: string) => s.slice(s.indexOf('export interface PromptProduct')).trim()
    expect(cut(body('functions/src/priceWatch/textEnrich/screenPrompt.ts')))
      .toBe(cut(body('src/features/priceWatch/textEnrich/screenPrompt.ts')))
  })
})

// ⚠ `functions/src/textEnrich/**` est exclu de knip (`knip.json`). C'est une COPIE
// verbatim : un export que le serveur n'appelle pas y reste parce que le client, lui,
// l'appelle. Le retirer « parce qu'il est mort » ferait diverger les jumeaux et casserait
// le test ci-dessus — la raison est ici, knip.json n'accepte pas de commentaires.
