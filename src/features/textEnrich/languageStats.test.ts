import { describe, it, expect } from 'vitest'
import { languageStats } from './languageStats'

const NL = 'Grasmaaier mes geschikt voor alle modellen van het merk'
const FR = 'Lame de tondeuse adaptée à tous les modèles de la marque'
const DE = 'Rasenmäher Messer geeignet für alle Modelle der Marke'

describe('répartition des langues', () => {
  it('compte chaque langue reconnue, la plus fréquente d’abord', () => {
    const [stats] = languageStats(
      [{ d: NL }, { d: NL }, { d: FR }],
      ['d'],
    )
    expect(stats.byLang[0]).toEqual({ lang: 'nl', count: 2 })
    expect(stats.byLang.find((b) => b.lang === 'fr')?.count).toBe(1)
  })

  it('chiffre ce qui n’est pas français', () => {
    const [stats] = languageStats([{ d: NL }, { d: DE }, { d: FR }], ['d'])
    expect(stats.foreign).toBe(2)
  })

  it('⚠ ne range PAS les indéterminés du côté du français', () => {
    // Le détecteur s'abstient volontiers, surtout sur les libellés courts. Les compter
    // comme français ferait croire un catalogue déjà traduit — et un passage lancé
    // là-dessus ne trouverait « rien à traiter » sans qu'on comprenne pourquoi.
    // ⚠ Un libellé purement technique, sans mot ni accent : c'est le cas le plus fréquent
    // sur des noms de pièces, et le détecteur s'y abstient — à raison.
    const [stats] = languageStats([{ d: 'BOSCH GSR 12V-15 kit 1234' }, { d: FR }], ['d'])
    expect(stats.undecided).toBe(1)
    expect(stats.byLang.find((b) => b.lang === 'fr')?.count).toBe(1)
    expect(stats.foreign).toBe(0)
  })

  it('sépare les cellules vides des indéterminées', () => {
    const [stats] = languageStats([{ d: '' }, { d: null }, { d: 'court' }, { d: FR }], ['d'])
    // « court » fait moins de huit caractères : le détecteur ne peut rien en dire.
    expect(stats.empty).toBe(3)
    expect(stats.counted).toBe(1)
  })

  it('traite plusieurs colonnes en une passe', () => {
    const stats = languageStats([{ nom: FR, desc: NL }], ['nom', 'desc'])
    expect(stats.map((s) => s.column)).toEqual(['nom', 'desc'])
    expect(stats[1].foreign).toBe(1)
  })

  it('rend des compteurs à zéro plutôt que rien sur une colonne absente', () => {
    // Une colonne mal nommée doit se LIRE comme telle (« 0 sur 3 »), pas disparaître du
    // tableau : c'est le symptôme le plus fréquent d'une clé mal orthographiée.
    const [stats] = languageStats([{ nom: FR }, { nom: NL }, { nom: DE }], ['inexistante'])
    expect(stats).toMatchObject({ column: 'inexistante', counted: 0, empty: 3, foreign: 0 })
  })
})
