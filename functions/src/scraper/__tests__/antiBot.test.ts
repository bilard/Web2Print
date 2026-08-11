import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { antiBotChallenge } from '../antiBot'

/** Fixture RÉELLE : réponse de `granit-parts.fr/e/productlist/…` lue via Jina Reader le
 *  2026-08-11. C'est exactement ce que la moisson prenait pour une page de catalogue. */
const CHALLENGE = readFileSync(join(__dirname, 'fixtures/cloudflare-challenge.html'), 'utf-8')

describe('antiBotChallenge', () => {
  it('reconnaît le défi Cloudflare qui a fait moissonner 50 pages pour 0 produit', () => {
    expect(antiBotChallenge(CHALLENGE)).toBe('Cloudflare')
  })

  it('reconnaît les autres protections par leur signature technique', () => {
    expect(antiBotChallenge('<html><script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script>')).toBe('Cloudflare')
    expect(antiBotChallenge('<html>…geo.captcha-delivery.com/captcha/…')).toBe('DataDome')
    expect(antiBotChallenge('<html>Incapsula incident ID: 1234-567')).toBe('Incapsula')
    expect(antiBotChallenge('<html><div id="px-captcha"></div>')).toBe('PerimeterX')
  })

  it('laisse passer une vraie page — un filtre ne vide jamais une liste', () => {
    const page = '<html><title>Filtres à huile</title><div data-article-number="123456">…</div></html>'
    expect(antiBotChallenge(page)).toBeNull()
  })

  it('⚠ ne jette pas un catalogue qui CITE les mots du défi', () => {
    // Un marqueur ambigu sur une page volumineuse est du contenu, pas un refus : sans ce
    // garde-fou, le correctif supprimerait des pages que l'ancien code lisait très bien.
    const gros = `<html><title>Just a moment</title>${'<div data-article-number="1">x</div>'.repeat(3000)}`
    expect(gros.length).toBeGreaterThan(50_000)
    expect(antiBotChallenge(gros)).toBeNull()
  })

  it('reste muet sur une entrée vide plutôt que d’inventer une protection', () => {
    expect(antiBotChallenge('')).toBeNull()
    expect(antiBotChallenge(null)).toBeNull()
    expect(antiBotChallenge(undefined)).toBeNull()
  })
})

describe('⚠⚠ non-régression : une page SERVIE par Cloudflare n’est pas un défi', () => {
  // Fixture RÉELLE : accueil de granit-parts.fr, servi normalement (123 ko, 84 rayons).
  // Cloudflare y injecte `/cdn-cgi/challenge-platform/scripts/jsd/main.js` — sa détection
  // de navigateur. Compter ce chemin comme un défi a fait jeter la page, d'où « accueil
  // injoignable » puis zéro produit : le bug que ce module devait corriger, en pire.
  const SERVED = readFileSync(join(__dirname, 'fixtures/cloudflare-served-ok.html'), 'utf-8')

  it('laisse passer la page saine malgré le script de détection Cloudflare', () => {
    expect(SERVED).toContain('/cdn-cgi/challenge-platform/scripts/jsd/main.js')
    expect(antiBotChallenge(SERVED)).toBeNull()
  })

  it('distingue le chemin du DÉFI de celui de la détection', () => {
    expect(antiBotChallenge('<html>…/cdn-cgi/challenge-platform/scripts/jsd/main.js')).toBeNull()
    expect(antiBotChallenge('<html>…/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1?ray=x')).toBe('Cloudflare')
  })
})
