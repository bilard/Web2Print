import { describe, it, expect } from 'vitest'
import { Search } from 'lucide-react'
import { filterCommands, type PaletteCommand } from './usePaletteCommands'

// ⚠️ Les assertions portent sur `id`, PAS sur `label` : depuis l'i18n, le
// libellé dépend de la langue active — un test qui l'assertirait deviendrait
// dépendant d'un état global. L'invariant testé ici est le FILTRAGE.
const cmd = (id: string, keywords: string): PaletteCommand => ({
  id,
  groupId: 'modules',
  label: id,
  keywords,
  icon: Search,
  run: () => {},
})

// Keywords bilingues, comme en production (cf. MODULE_KEYWORDS).
const COMMANDS = [
  cmd('module:library', 'Bibliothèque Library bibliotheque projets documents ouvrir library projects open'),
  cmd('module:data', 'PIM pim produits donnees fiches catalogue excel products data sheets'),
  cmd('module:workflows', 'Workflows automation pipeline cron zapier make'),
]

describe('filterCommands', () => {
  it('requête vide → toutes les commandes', () => {
    expect(filterCommands(COMMANDS, '')).toHaveLength(3)
    expect(filterCommands(COMMANDS, '   ')).toHaveLength(3)
  })

  it('matche sans tenir compte des accents ni de la casse', () => {
    expect(filterCommands(COMMANDS, 'bibliotheque').map((c) => c.id)).toEqual(['module:library'])
    expect(filterCommands(COMMANDS, 'BIBLIOTHÈQUE').map((c) => c.id)).toEqual(['module:library'])
  })

  it('matche sur les synonymes (keywords), pas seulement le label', () => {
    expect(filterCommands(COMMANDS, 'produits').map((c) => c.id)).toEqual(['module:data'])
    expect(filterCommands(COMMANDS, 'zapier').map((c) => c.id)).toEqual(['module:workflows'])
  })

  it('tous les mots de la requête doivent matcher (ET logique)', () => {
    expect(filterCommands(COMMANDS, 'produits excel')).toHaveLength(1)
    expect(filterCommands(COMMANDS, 'produits zapier')).toHaveLength(0)
  })

  it('aucun résultat → tableau vide', () => {
    expect(filterCommands(COMMANDS, 'inexistant')).toHaveLength(0)
  })

  // Garde-fou du choix « keywords bilingues » : un terme anglais doit trouver
  // le module MÊME quand l'app tourne en français (et réciproquement).
  it('trouve un module par son nom anglais comme par son nom français', () => {
    expect(filterCommands(COMMANDS, 'library').map((c) => c.id)).toEqual(['module:library'])
    expect(filterCommands(COMMANDS, 'bibliotheque').map((c) => c.id)).toEqual(['module:library'])
    expect(filterCommands(COMMANDS, 'products').map((c) => c.id)).toEqual(['module:data'])
  })
})
