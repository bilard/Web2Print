import { describe, it, expect } from 'vitest'
import { normalizeComposedHtml, reportFacts } from './reportCompose'


// ⚠⚠ Sur téléphone, le mail composé sortait du cadre : le lecteur voyait la colonne des
// libellés et pas les chiffres — l'inverse de ce qu'il vient chercher. Une consigne de rendu
// ne suffit pas, le modèle recompose la page à chaque envoi.
describe('mise en page repliable', () => {
  it('ramène une largeur d’attribut en pixels à 100 %', () => {
    expect(normalizeComposedHtml(`<table width="760" cellpadding="0">${'x'.repeat(250)}</table>`))
      .toContain('width="100%"')
  })
  it('retire un plancher de largeur — c’est lui qui force le débordement', () => {
    const out = normalizeComposedHtml(`<table style="min-width:640px;background:#111">${'x'.repeat(250)}</table>`)
    expect(out).not.toContain('min-width')
  })
  it('transforme une largeur fixe en pleine largeur', () => {
    const out = normalizeComposedHtml(`<div style="width:760px;padding:8px">${'x'.repeat(250)}</div>`)
    expect(out).toContain('max-width:100%;width:100%')
  })

  // ⚠ Sur un écran de 390 px, un retrait de 32 px de chaque côté mange un sixième de la
  // largeur — et c'est autant de colonnes qui ne tiennent plus.
  it('ramène les retraits latéraux d’une maquette d’ordinateur', () => {
    expect(normalizeComposedHtml(`<td style="padding:14px 32px">${'x'.repeat(250)}</td>`))
      .toContain('padding:14px 12px')
  })
  it('supprime l’interdiction de revenir à la ligne', () => {
    expect(normalizeComposedHtml(`<td style="white-space:nowrap;color:#fff">${'x'.repeat(250)}</td>`))
      .not.toContain('nowrap')
  })
  it('remonte les polices sous 13 px, que iOS compenserait par un zoom', () => {
    const out = normalizeComposedHtml(`<td style="font-size:10px">${'x'.repeat(250)}</td>`)
    expect(out).toContain('font-size:13px')
  })
  it('laisse tranquille ce qui est déjà correct', () => {
    const ok = `<table width="100%" style="font-size:15px">${'x'.repeat(250)}</table>`
    expect(normalizeComposedHtml(ok)).toContain(ok)
  })

  // ⚠ Le fragment n'a pas d'en-tête : la déclaration de thème voyage dans le corps, sans
  // quoi iOS recolore le texte et le rend illisible sur son propre fond.
  it('déclare le thème sombre au client de messagerie', () => {
    expect(normalizeComposedHtml(`<table>${'x'.repeat(250)}</table>`))
      .toContain('color-scheme:dark')
  })
})


// ⚠⚠ LA raison d'être de l'enrichissement du 2026-08-11 : on ne peut pas rédiger une
// consigne sur des données que le modèle ne voit pas. Le rapport portait le stock et le
// prix barré du concurrent depuis toujours ; le prompt n'en transmettait rien.
describe('reportFacts — la distorsion, pas seulement l’écart', () => {
  const cell = (o: Record<string, unknown>) => ({
    siteId: 's', domain: 'www.rival.fr', priceTtc: 96, listPriceTtc: null,
    gapPct: -20, stock: 'in-stock', match: 'exact', ...o,
  })
  const productWith = (cells: unknown[]) => ({
    runAt: Date.now(),
    kpis: { products: 1, comparisons: 1, productsUndercut: 1 },
    byCompetitor: [], byFamily: [], sites: [], totalMatched: 1, truncated: false,
    products: [{
      id: 'p1', name: 'LAME 520MM', reference: 'X1', ean: null, famille: 'LAMES',
      myPriceHt: 100, sourceUrl: null, bestGapPct: -20, undercut: true, competitors: cells,
    }],
  } as unknown as Parameters<typeof reportFacts>[0])

  it('compte à part le sous-coté dont le moins cher est EN RUPTURE — il ne prend pas la vente', () => {
    const f = reportFacts(productWith([cell({ stock: 'out-of-stock' })]))
    expect(f.sous_cotes_dont_le_moins_cher_est_en_rupture).toBe(1)
    expect(f.sous_cotes_dont_le_moins_cher_est_en_promo).toBe(0)
  })

  it('compte à part le sous-coté dont le moins cher affiche un PRIX BARRÉ — promo datée', () => {
    const f = reportFacts(productWith([cell({ listPriceTtc: 140 })]))
    expect(f.sous_cotes_dont_le_moins_cher_est_en_promo).toBe(1)
    expect(f.sous_cotes_dont_le_moins_cher_est_en_rupture).toBe(0)
  })

  it('l’exemple porte QUI est moins cher, à quel prix et dans quel état', () => {
    const f = reportFacts(productWith([
      cell({ domain: 'www.cher.fr', gapPct: -5, priceTtc: 114 }),
      cell({ domain: 'www.agressif.fr', gapPct: -30, priceTtc: 84, listPriceTtc: 120, stock: 'on-order' }),
    ]))
    // ⚠ Le MOINS cher, pas le premier de la liste.
    expect((f.exemples_de_produits_sous_cotes as Record<string, unknown>[])[0]).toMatchObject({
      moins_cher_chez: 'agressif.fr', son_prix_ttc: 84, son_stock: 'on-order',
      en_promo: true, son_prix_barre_ttc: 120,
    })
  })

  it('ne prétend rien quand aucun concurrent n’a de prix', () => {
    const f = reportFacts(productWith([cell({ gapPct: null })]))
    expect(f.sous_cotes_dont_le_moins_cher_est_en_rupture).toBe(0)
    expect((f.exemples_de_produits_sous_cotes as Record<string, unknown>[])[0].moins_cher_chez).toBeNull()
  })
})
