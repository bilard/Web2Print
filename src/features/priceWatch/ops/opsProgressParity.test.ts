import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// PARITÉ CLIENT ↔ SERVEUR de la publication d'avancement (`progressStore.ts` ↔
// `functions/src/priceWatch/opsProgress.ts`).
//
// ⚠ On ne peut PAS importer les deux modules dans le même test : le client tire
// `firebase/firestore` + l'alias Vite `@/lib/firebase/config`, le serveur tire
// `firebase-admin/firestore` — deux SDK, deux bundles qui ne compilent pas ensemble
// (`functions/tsconfig.json` a `rootDir: "src"` et refuse tout fichier hors de
// `functions/src`). On compare donc le TEXTE, comme `textEnrichParity.test.ts`.
//
// Un intervalle ou une décision qui divergerait ferait écrire le cron plus (ou moins)
// souvent que le navigateur — invisible tant qu'on ne compare pas un run de nuit à un
// run de jour.
const root = resolve(__dirname, '../../../..')

const read = (path: string): string => readFileSync(resolve(root, path), 'utf8')

/** Extrait un bloc `[from, to]` inclus, par repère de texte — pas de numéro de ligne,
 *  qui casserait au premier commentaire ajouté d'un seul côté. */
function cut(source: string, from: string, to: string): string {
  const start = source.indexOf(from)
  if (start < 0) throw new Error(`repère de début introuvable : ${from}`)
  const end = source.indexOf(to, start)
  if (end < 0) throw new Error(`repère de fin introuvable : ${to}`)
  return source.slice(start, end + to.length).trim()
}

const CLIENT = 'src/features/priceWatch/ops/progressStore.ts'
const SERVER = 'functions/src/priceWatch/opsProgress.ts'

describe('jumeau serveur de la publication d’avancement', () => {
  it('OPS_WRITE_INTERVAL_MS et shouldPublish sont identiques des deux côtés', () => {
    // Seule partie PURE et censée être identique verbatim : l'intervalle et la décision
    // d'écrire. Extraits SÉPARÉMENT (pas en un seul bloc contigu) : le serveur intercale
    // sa propre définition de `TextsProgress` entre les deux — le client l'IMPORTE, il ne
    // la redéfinit pas. Cette différence est assumée (cf. le test suivant) et ne doit pas
    // faire échouer celui-ci.
    const pure = (s: string) => [
      cut(s, 'export const OPS_WRITE_INTERVAL_MS', '\n'),
      cut(
        s,
        'export function shouldPublish',
        'return force || lastAt === 0 || now - lastAt >= OPS_WRITE_INTERVAL_MS\n}',
      ),
    ].join('\n')
    expect(pure(read(SERVER))).toBe(pure(read(CLIENT)))
  })

  it('TextsProgress (serveur) a exactement les champs de TextsProgress (client, opsTypes.ts)', () => {
    // Le serveur ne peut pas IMPORTER `opsTypes.ts` (même mur de compilation) : il
    // redéfinit l'interface, SANS ses commentaires JSDoc. Une redéfinition qui dérive fait
    // persister un document que l'écran désérialise mal, ou qui tait un champ que le cron
    // a pourtant renseigné — on compare donc les signatures de champ, commentaires écartés.
    const fieldsOnly = (block: string) => block
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '' && !l.startsWith('/*') && !l.startsWith('*'))
      .join('\n')
    const iface = (s: string) => fieldsOnly(cut(s, 'interface TextsProgress {', '\n}'))
    expect(iface(read(SERVER))).toBe(iface(read('src/features/priceWatch/ops/opsTypes.ts')))
  })

  it('⚠ les deux écritures passent par le chemin CANONICALISÉ (opsProgressDoc)', () => {
    // Un watchId retapé avec une casse ou un espace différents ne canonicalise QUE si on
    // passe par `opsProgressDoc` (stableId). Une version qui inlinerait le chemin en dur
    // viserait un AUTRE document que le navigateur — cf. paths.ts des deux côtés.
    expect(read(CLIENT)).toContain('opsProgressDoc(uid, watchId)')
    expect(read(SERVER)).toContain('opsProgressDoc(uid, watchId)')
  })
})
