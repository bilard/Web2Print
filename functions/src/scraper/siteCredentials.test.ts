import { describe, it, expect } from 'vitest'
import { pickSiteCredentials } from './siteCredentials'

// Régression réelle (2026-07-22 soir) : kramp enregistré sous PLUSIEURS clés hétérogènes
// (`kramp`, `www.kramp.com`) alors que le lookup côté moisson passe `bare(domain)` =
// `kramp.com`. L'ancienne égalité stricte `all[host]` ne matchait AUCUNE clé → kramp
// retombait dans la passe générique Jina → prix 0%. Ces cas verrouillent la tolérance.
describe('pickSiteCredentials — tolérance aux clés hétérogènes', () => {
  const real = {
    'progarden.fr': { login: 'a', password: 'b', loginUrl: 'https://progarden.fr/connexion' },
    kramp: { login: 'k', password: 'kp', loginUrl: 'https://login.kramp.com/', host: 'kramp.com' },
    'www.kramp.com': { login: 'w', password: 'wp', loginUrl: 'https://login.kramp.com/' },
  }

  it('trouve kramp quand le lookup passe le domaine baré `kramp.com`', () => {
    const c = pickSiteCredentials(real, 'kramp.com')
    expect(c).not.toBeNull()
    expect(c!.password).toBeTruthy()
  })

  it('préfère la clé-domaine (www.kramp.com, saisie récente) au repli par champ host', () => {
    // want=kramp.com → all["www.kramp.com"] gagne avant le scan qui matcherait `kramp`.
    expect(pickSiteCredentials(real, 'kramp.com')!.login).toBe('w')
  })

  it('matche via le champ host interne quand seule la clé `kramp` existe', () => {
    const only = { kramp: { login: 'k', password: 'kp', host: 'kramp.com' } }
    expect(pickSiteCredentials(only, 'www.kramp.com')!.login).toBe('k')
  })

  it('résout progarden.fr par clé exacte', () => {
    expect(pickSiteCredentials(real, 'progarden.fr')!.login).toBe('a')
  })

  it('renvoie null pour un site sans identifiants', () => {
    expect(pickSiteCredentials(real, 'cdiscount.com')).toBeNull()
  })

  it('ignore une entrée incomplète (mot de passe manquant)', () => {
    expect(pickSiteCredentials({ 'kramp.com': { login: 'x' } }, 'kramp.com')).toBeNull()
  })
})
