// src/features/navigation/usePaletteCommands.test.ts
import { describe, it, expect } from 'vitest'
import { Search } from 'lucide-react'
import { filterCommands, type PaletteCommand } from './usePaletteCommands'

const cmd = (label: string, keywords: string): PaletteCommand => ({
  id: label,
  group: 'Modules',
  label,
  keywords,
  icon: Search,
  run: () => {},
})

const COMMANDS = [
  cmd('Bibliothèque', 'Bibliothèque bibliotheque projets documents ouvrir'),
  cmd('PIM', 'PIM pim produits donnees fiches catalogue excel'),
  cmd('Workflows', 'Workflows automation pipeline cron zapier make'),
]

describe('filterCommands', () => {
  it('requête vide → toutes les commandes', () => {
    expect(filterCommands(COMMANDS, '')).toHaveLength(3)
    expect(filterCommands(COMMANDS, '   ')).toHaveLength(3)
  })

  it('matche sans tenir compte des accents ni de la casse', () => {
    expect(filterCommands(COMMANDS, 'bibliotheque').map((c) => c.label)).toEqual(['Bibliothèque'])
    expect(filterCommands(COMMANDS, 'BIBLIOTHÈQUE').map((c) => c.label)).toEqual(['Bibliothèque'])
  })

  it('matche sur les synonymes (keywords), pas seulement le label', () => {
    expect(filterCommands(COMMANDS, 'produits').map((c) => c.label)).toEqual(['PIM'])
    expect(filterCommands(COMMANDS, 'zapier').map((c) => c.label)).toEqual(['Workflows'])
  })

  it('tous les mots de la requête doivent matcher (ET logique)', () => {
    expect(filterCommands(COMMANDS, 'produits excel')).toHaveLength(1)
    expect(filterCommands(COMMANDS, 'produits zapier')).toHaveLength(0)
  })

  it('aucun résultat → tableau vide', () => {
    expect(filterCommands(COMMANDS, 'inexistant')).toHaveLength(0)
  })
})
