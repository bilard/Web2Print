import { describe, it, expect } from 'vitest'
import { EXCLUDED_ANALYTICS_EMAILS } from './excludedAccounts'
// Import du JUMEAU SERVEUR par chemin relatif — `functions/` est un projet
// TypeScript distinct, mais la constante est pure.
import { OWNER_EMAILS } from '../../../functions/src/analytics/owner'

/**
 * Deux listes gouvernent l'exclusion : le serveur refuse la COLLECTE, le client
 * purge l'HISTORIQUE. Divergentes, un compte cesserait d'être compté sans qu'on
 * puisse jamais nettoyer ce qu'il a déjà laissé.
 */
describe('comptes exclus des statistiques', () => {
  it('couvre les trois adresses de l’exploitant', () => {
    expect(EXCLUDED_ANALYTICS_EMAILS).toEqual(
      expect.arrayContaining(['ibs.studio@gmail.com', 'fbilard59@gmail.com', 'f.bilard@pimalion.com']),
    )
  })

  it('inclut l’OWNER — sinon il serait compté malgré lui', () => {
    for (const email of OWNER_EMAILS) {
      expect(EXCLUDED_ANALYTICS_EMAILS).toContain(email)
    }
  })

  it('n’élargit PAS OWNER_EMAILS, qui route les notifications Telegram', () => {
    // Une seule adresse doit y figurer : la grossir enverrait les alertes de
    // nouvelle session au mauvais compte.
    expect(OWNER_EMAILS).toHaveLength(1)
  })
})
