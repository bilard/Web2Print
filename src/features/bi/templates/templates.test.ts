// ⚠⚠ LE test de ce lot : chaque tuile de chaque modèle ne référence que des mesures et des
// dimensions RÉELLEMENT déclarées par sa source. Une référence fantôme ne se voit pas à
// l'écriture — elle s'affiche en erreur chez l'utilisateur, sur le tableau qu'on lui a promis
// « prêt à ouvrir ».
//
// ⚠⚠ La vérification passe par le MOTEUR lui-même (`aggregate` sur zéro ligne) plutôt que par
// une règle réécrite ici : `resolveMeasure` résout toutes les mesures et toutes les dimensions
// AVANT de regarder la moindre ligne. Une règle jumelle divergerait au premier changement du
// moteur, et le test dirait « vert » sur un tableau cassé.
import { describe, expect, it } from 'vitest'
import type { ExcelColumn, ExcelSheet } from '@/features/excel/types'
import { aggregate } from '../engine/aggregate'
import { pimSource, pimSourceFromSheet } from '../registry/pim.source'
import { getSource } from '../registry/sources'
import type { DataSource } from '../registry/types'
import { parseDashboard, type SourceId } from '../types'
import { DASHBOARD_TEMPLATES, buildDashboard, getTemplate, templateDocId } from './index'
import type { TemplateTile } from './types'

const excelCol = (key: string, fieldType: ExcelColumn['fieldType'], label = key): ExcelColumn => ({
  key, label, fieldType, detectedType: fieldType, isPrimary: false, width: 160,
})

/** Feuille de référence : une feuille ACTIVE fait basculer la source PIM sur ses colonnes,
 *  et lui fait PERDRE ses dimensions de date et sa mesure d'ancienneté. */
const sheet: ExcelSheet = {
  name: 'Catalogue', taxonomy: [], rows: [],
  columns: [excelCol('marque', 'text', 'Marque'), excelCol('prix', 'currency', 'Prix')],
  taxonomyLevels: { marque: 1 },
}

/**
 * Les sources sous lesquelles une tuile doit tenir. Pour le PIM, il y en a DEUX : le catalogue
 * master ET la feuille active — `effectivePimSource` bascule de l'un à l'autre selon qu'une
 * feuille est ouverte, et seule leur INTERSECTION est sûre.
 */
function sourcesFor(id: SourceId): DataSource[] {
  return id === 'pim.products' ? [pimSource, pimSourceFromSheet(sheet)] : [getSource(id)]
}

const ctx = {
  accountId: 'acc1', workspaceUid: 'ws1', createdBy: 'u1', now: 1_700_000_000_000,
  name: 'Modèle', translate: (k: string) => `«${k}»`,
}

describe('modèles de tableau de bord', () => {
  it('expose trois modèles aux clés et aux identifiants de document distincts', () => {
    expect(DASHBOARD_TEMPLATES).toHaveLength(3)
    expect(new Set(DASHBOARD_TEMPLATES.map((t) => t.key)).size).toBe(3)
    expect(new Set(DASHBOARD_TEMPLATES.map((t) => templateDocId(t.key))).size).toBe(3)
    // ⚠ Identifiant DÉTERMINISTE : c'est lui qui rend la création idempotente.
    expect(templateDocId('watchGaps')).toBe('bi_tpl_watchGaps')
  })

  it('rend un tableau de bord VALIDE au sens du contrat', () => {
    for (const tpl of DASHBOARD_TEMPLATES) {
      const draft = buildDashboard(tpl, ctx)
      expect(draft.id).toBe(templateDocId(tpl.key))
      // Lève sur une tuile absente de la mise en page, sur deux pages homonymes, sur toute
      // forme non conforme : c'est la porte que franchit toute écriture.
      expect(() => parseDashboard(draft)).not.toThrow()
    }
  })

  it('ne référence QUE des mesures et des dimensions déclarées par sa source', () => {
    for (const tpl of DASHBOARD_TEMPLATES) {
      for (const page of tpl.pages) {
        for (const tile of page.tiles) {
          for (const source of sourcesFor(tile.query.source)) {
            expect(
              () => aggregate([], tile.query, source),
              `${tpl.key} › ${tile.titleKey} (${source.id})`,
            ).not.toThrow()
          }
        }
      }
    }
  })

  it('ne filtre et ne trie que sur des champs qui existent', () => {
    for (const tpl of DASHBOARD_TEMPLATES) {
      for (const page of tpl.pages) {
        for (const tile of page.tiles) {
          for (const source of sourcesFor(tile.query.source)) {
            const ids = new Set(source.dimensions.map((d) => d.id))
            // ⚠ `aggregate` ne LÈVE PAS sur un champ de filtre inconnu : il se replie sur la
            // clé brute de la ligne, donc filtre sur rien, en silence.
            for (const f of tile.query.filters) expect(ids.has(f.field)).toBe(true)
            const keys = aggregate([], tile.query, source).columns.map((c) => c.key)
            // ⚠ `sort.by` n'est jamais validé non plus : un tri sur une clé absente réordonne
            // au hasard, et le « top 15 » d'une tuile limitée n'est alors plus le bon.
            for (const s of tile.query.sort ?? []) expect(keys).toContain(s.by)
          }
        }
      }
    }
  })

  it('ne croise un tableau que sur une dimension que la tuile porte', () => {
    for (const tpl of DASHBOARD_TEMPLATES) {
      for (const tile of tpl.pages.flatMap((p) => p.tiles)) {
        const col = tile.options?.pivotColumn
        if (!col) continue
        expect(tile.query.dimensions.map((d) => d.id)).toContain(col)
      }
    }
  })

  it('ne totalise jamais une mesure non agrégeable', () => {
    for (const tpl of DASHBOARD_TEMPLATES) {
      for (const tile of tpl.pages.flatMap((p) => p.tiles)) {
        if (tile.options?.showTotals !== true) continue
        for (const source of sourcesFor(tile.query.source)) {
          const cols = aggregate([], tile.query, source).columns
          // ⚠⚠ Une médiane, un pourcentage, un taux ne se recomposent pas entre groupes :
          // totalisés, ils affichent « 312 % » sans que rien ne le signale.
          expect(cols.every((c) => c.role !== 'measure' || c.aggregable !== false)).toBe(true)
        }
      }
    }
  })

  it('traduit les titres AU MOMENT de la construction, jamais à l’import', () => {
    const tpl = getTemplate('pimCompleteness')
    const draft = buildDashboard(tpl, { ...ctx, translate: (k) => `EN:${k}` })
    expect(draft.tiles[0].title.startsWith('EN:')).toBe(true)
    expect(draft.name).toBe('Modèle')
  })

  it('recopie la première page à la racine et pose tous les horodatages', () => {
    const draft = buildDashboard(getTemplate('watchGaps'), ctx)
    expect(draft.createdAt).toBe(ctx.now)
    expect(draft.updatedAt).toBe(ctx.now)
    expect(draft.createdBy).toBe('u1')
    expect(draft.accountId).toBe('acc1')
    expect(draft.workspaceUid).toBe('ws1')
    expect(draft.tiles.length).toBe(draft.pages?.[0].tiles.length)
  })

  it('donne des identifiants de tuile uniques, stables d’une construction à l’autre', () => {
    for (const tpl of DASHBOARD_TEMPLATES) {
      const tiles: TemplateTile[] = tpl.pages.flatMap((p) => p.tiles)
      expect(new Set(tiles.map((t) => t.id)).size).toBe(tiles.length)
    }
    const a = buildDashboard(getTemplate('watchGaps'), ctx)
    const b = buildDashboard(getTemplate('watchGaps'), ctx)
    expect(a.tiles.map((t) => t.id)).toEqual(b.tiles.map((t) => t.id))
  })
})
