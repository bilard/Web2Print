import { describe, it, expect } from 'vitest'
import { parseDescriptionFromMarkdown } from '../parsers/parseDescription'

const SAMPLE_MD_1 = `# Perceuse 18V

Perceuse-visseuse compacte 18V avec batterie Li-Ion intégrée. Idéale pour les
professionnels du bâtiment.

## Caractéristiques techniques

| Tension | 18 V |
| Couple maxi | 60 Nm |
`

const SAMPLE_MD_2 = `# Visseuse à chocs

## Description

Visseuse à chocs 18V haute performance. Couple impressionnant de 250 Nm.

## Avantages

- Robuste
- Compacte
`

const SAMPLE_NO_DESC = `# Produit X

## Spécifications

| Poids | 1.5 kg |
`

describe('parseDescriptionFromMarkdown', () => {
  it('extrait le paragraphe sous le H1 quand pas de section dédiée', () => {
    const desc = parseDescriptionFromMarkdown(SAMPLE_MD_1)
    expect(desc).toContain('Perceuse-visseuse compacte 18V')
    expect(desc).not.toContain('Caractéristiques')
  })

  it('extrait la section "## Description" si présente', () => {
    const desc = parseDescriptionFromMarkdown(SAMPLE_MD_2)
    expect(desc).toContain('haute performance')
    expect(desc).not.toContain('Robuste')
  })

  it('renvoie au moins le titre H1 si pas de description prose', () => {
    // La fonction utilise le H1 comme description minimale en dernier recours
    // quand aucune prose n'est trouvée (ni section dédiée, ni paragraphe après le titre)
    const desc = parseDescriptionFromMarkdown(SAMPLE_NO_DESC)
    expect(desc).toBe('Produit X')
    expect(desc).not.toContain('Spécifications')
    expect(desc).not.toContain('Poids')
  })

  it('ignore les bandeaux cookies (retourne le titre H1 en dernier recours)', () => {
    // Le contenu cookie est filtré par isGarbageContent → aucune prose trouvée
    // La fonction revient sur le H1 comme description minimale
    const md = '# Produit\n\nWe use cookies. Accept all cookies. Manage preferences.\n\n## Specs\n'
    const desc = parseDescriptionFromMarkdown(md)
    expect(desc).toBe('Produit')
    expect(desc).not.toContain('cookies')
    expect(desc).not.toContain('Specs')
  })
})
