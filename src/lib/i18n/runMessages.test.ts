import { describe, it, expect } from 'vitest'
import { fr } from './fr'
import { en } from './en'
// Import direct du catalogue SERVEUR. Possible parce que `i18nMessages.ts` est
// un module pur (aucun import, donc pas d'Admin SDK dans le graphe vitest) et
// que `tsconfig.app.json` n'impose pas de `rootDir`. L'inverse est interdit :
// `functions/tsconfig.json` a `rootDir: "src"` et ne peut rien importer hors de
// `functions/src` — pas même un JSON partagé. D'où deux catalogues, et ce test.
import { RUN_MESSAGES } from '../../../functions/src/i18nMessages'

/** Extrait les jetons `{param}` d'un gabarit. */
function placeholders(s: string): string[] {
  return (s.match(/\{(\w+)\}/g) ?? []).sort()
}

describe('messages de run — parité client ↔ serveur', () => {
  const serverKeys = Object.keys(RUN_MESSAGES).sort()

  it('a des clés serveur non vides', () => {
    // Si l'import cassait (chemin, résolution), le test suivant passerait à vide
    // et le garde-fou serait fail-open. Cf. reference_audit_gates_must_fail_closed.
    expect(serverKeys.length).toBeGreaterThan(10)
  })

  it('déclare chaque clé serveur dans le catalogue client', () => {
    // Le serveur est un SOUS-ENSEMBLE du client : le client émet en plus des
    // messages que le cron ne produit jamais (nodes de `SERVER_UNSUPPORTED`,
    // avertissements propres à l'UI). L'inverse serait un message serveur
    // intraduisible côté client → panneau bilingue.
    const missing = serverKeys.filter((k) => !(k in fr))
    expect(missing, `clés serveur absentes de src/lib/i18n/fr.ts :\n${missing.join('\n')}`).toEqual([])
  })

  it('emploie le MÊME texte des deux côtés, au byte près', () => {
    // C'est LE test qui rend la duplication acceptable. Une reformulation d'un
    // seul côté suffit à faire diverger le journal d'un même workflow selon
    // qu'il a été lancé à la main ou par le cron.
    const drift: string[] = []
    for (const key of serverKeys) {
      const entry = RUN_MESSAGES[key]
      if (key in fr && fr[key as keyof typeof fr] !== entry.fr) {
        drift.push(`FR ${key}\n  serveur : ${entry.fr}\n  client  : ${fr[key as keyof typeof fr]}`)
      }
      if (key in en && en[key as keyof typeof en] !== entry.en) {
        drift.push(`EN ${key}\n  serveur : ${entry.en}\n  client  : ${en[key as keyof typeof en]}`)
      }
    }
    expect(drift, `textes divergents entre les catalogues :\n${drift.join('\n')}`).toEqual([])
  })

  it('conserve les mêmes variables interpolées', () => {
    for (const key of serverKeys) {
      const entry = RUN_MESSAGES[key]
      expect(placeholders(entry.en), `variables divergentes sur ${key}`).toEqual(placeholders(entry.fr))
    }
  })

  it('ne préfixe que par « run. » côté serveur', () => {
    // Discipline de nommage : le catalogue serveur ne contient QUE des messages
    // de run. Une clé d'UI qui atterrirait là serait un signe de confusion de
    // périmètre (le serveur ne rend aucune interface).
    const stray = serverKeys.filter((k) => !k.startsWith('run.'))
    expect(stray, `clés serveur hors périmètre :\n${stray.join('\n')}`).toEqual([])
  })
})
