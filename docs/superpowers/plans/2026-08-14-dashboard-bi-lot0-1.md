# Dashboard BI — Lots 0 & 1 (socle + visionneuse)

> **Pour les agents :** SOUS-SKILL REQUIS : `superpowers:subagent-driven-development`
> (recommandé) ou `superpowers:executing-plans` pour exécuter ce plan tâche par tâche.
> Les étapes utilisent des cases à cocher (`- [ ]`).

**Objectif :** livrer un module « Dashboard BI » où l'on ouvre, lit et met en page des
tableaux de bord branchés en direct sur les données du PIM, avec KPI, graphes, table et
tableau croisé.

**Architecture :** une spec de tuile sérialisable et validée (zod) décrit *ce qu'on veut
savoir* ; un registre déclare les sources, leurs dimensions et leurs mesures ; un moteur
d'agrégation PUR exécute la spec en mémoire. La persistance est un document Firestore par
tableau de bord, écrit par l'espace de travail (`inMyWorkspace`) et gardé par les règles.

**Stack :** React 18, TypeScript strict, Zustand, React Query, Firebase (Firestore),
`zod@4`, `chart.js@4` + `react-chartjs-2`, `react-grid-layout` (nouvelle dépendance),
Tailwind v3 + tokens de thème, Vitest.

**Spec :** `docs/superpowers/specs/2026-08-14-dashboard-bi-design.md`

## Contraintes globales

- Réponses, libellés, commentaires et messages de commit **en français**.
- Composants `PascalCase.tsx`, **150 lignes maximum**. Hooks `useCamelCase.ts`.
- Pas de logique métier dans les composants ; props typées explicitement, **jamais `any`**.
- Thème par tokens : `bg-background` / `bg-surface` / `bg-surface-2` / `bg-well`, jamais
  d'hex sombre en dur. `white` = avant-plan thémable ; blanc véritable = `text-[#fff]`.
  Couleurs programmatiques (chart.js) : lire `useThemeStore().resolvedTheme`.
- Traces de debug : `debugLog` de `src/lib/debugLog.ts`, jamais `console.log`.
- i18n : toute chaîne visible passe par `t()` avec sa clé dans `fr.ts`, `en.ts` (anglais
  **britannique**) et `es.ts`. ⚠ Jamais de `t()` en constante de module (langue figée).
- Barrières après chaque tâche : `npx tsc -b` (⚠ `tsc --noEmit` ne vérifie RIEN, project
  references), `npm run lint` (0 warning), `npm run test:run`, `npm run dead` (exit 0),
  `npm run cycles` (0). Les types partagés vivent dans `types.ts`, jamais dans un `.tsx`.
- Un symbole utilisé seulement dans son fichier **ne doit pas être exporté** (knip).
- Aucun cache de données : lecture Firestore par `onSnapshot`, jamais de copie locale
  persistée.

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `src/features/bi/types.ts` | Contrat (Dashboard, Tile, QuerySpec) + schémas zod + parseurs |
| `src/features/bi/engine/aggregate.ts` | PUR : filtre → groupe → mesure → trie |
| `src/features/bi/registry/types.ts` | Types du registre (DataSource, Dimension, Measure) |
| `src/features/bi/registry/sources.ts` | Registre + résolution par id |
| `src/features/bi/registry/pim.source.ts` | Source `pim.products` : dimensions et mesures |
| `src/features/bi/store/dashboardsStore.ts` | Chemins Firestore + lecture/écriture gardée |
| `src/features/bi/hooks/useDashboards.ts` | Abonnement live à la liste des tableaux de bord |
| `src/features/bi/hooks/useTileData.ts` | Données d'une tuile : source → moteur → résultat |
| `src/features/bi/components/BiScreen.tsx` | Écran : sélecteur, bascule de mode, grille |
| `src/features/bi/components/DashboardGrid.tsx` | Grille (react-grid-layout), seul point de contact avec la lib |
| `src/features/bi/components/TileFrame.tsx` | Cadre commun : titre, âge, états, erreur |
| `src/features/bi/components/tiles/KpiTile.tsx` | Valeur unique animée |
| `src/features/bi/components/tiles/ChartTile.tsx` | barres / courbes / aires / camemberts |
| `src/features/bi/components/tiles/TableTile.tsx` | Table détaillée |
| `src/features/bi/components/tiles/PivotTile.tsx` | Tableau croisé |
| `src/features/bi/engine/pivot.ts` | PUR : résultat plat → matrice croisée |
| `firestore.rules` | Règles `biDashboards` |
| `src/features/access/permissions.ts` | `bi.view`, `bi.edit` |
| `src/features/navigation/modules.ts` | Entrée de menu `bi` |
| `src/pages/DashboardPage.tsx` | Branchement de l'écran |

---

## Tâche 1 : contrat et validation

**Fichiers :**
- Créer : `src/features/bi/types.ts`
- Test : `src/features/bi/types.test.ts`

**Interfaces :**
- Produit : `SourceId`, `FilterOp`, `FilterClause`, `MeasureRef`, `DimensionRef`,
  `QuerySpec`, `TileKind`, `Tile`, `TilePlacement`, `Dashboard`,
  `parseDashboard(input: unknown): Dashboard`, `DASHBOARD_VERSION`, `MAX_DASHBOARD_BYTES`.

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
// src/features/bi/types.test.ts
import { describe, it, expect } from 'vitest'
import { parseDashboard, DASHBOARD_VERSION } from './types'

const minimal = {
  id: 'd1', name: 'Complétude', accountId: 'acme', workspaceUid: 'u1',
  version: DASHBOARD_VERSION, createdAt: 1, updatedAt: 2, createdBy: 'u1',
  tiles: [{
    id: 't1', kind: 'kpi', title: 'Produits',
    query: { source: 'pim.products', measures: [{ id: 'count' }], dimensions: [], filters: [] },
  }],
  layout: [{ tileId: 't1', x: 0, y: 0, w: 3, h: 2 }],
  filters: [],
}

describe('parseDashboard', () => {
  it('accepte un tableau de bord minimal et complète les champs optionnels', () => {
    const d = parseDashboard(minimal)
    expect(d.tiles[0].query.limit).toBeUndefined()
    expect(d.filters).toEqual([])
  })

  it('REFUSE une source inconnue — une spec non validée n’atteint jamais le moteur', () => {
    const bad = { ...minimal, tiles: [{ ...minimal.tiles[0], query: { ...minimal.tiles[0].query, source: 'sql.libre' } }] }
    expect(() => parseDashboard(bad)).toThrow()
  })

  it('REFUSE une tuile absente de la mise en page — une tuile invisible est une donnée perdue', () => {
    expect(() => parseDashboard({ ...minimal, layout: [] })).toThrow(/mise en page/i)
  })

  it('REFUSE un opérateur de filtre inventé', () => {
    const bad = { ...minimal, filters: [{ field: 'brand', op: 'ressemble', value: 'x' }] }
    expect(() => parseDashboard(bad)).toThrow()
  })
})
```

- [ ] **Étape 2 : lancer le test, vérifier l'échec**

Lancer : `npx vitest run src/features/bi/types.test.ts`
Attendu : ÉCHEC — `Failed to resolve import "./types"`.

- [ ] **Étape 3 : écrire le contrat**

```ts
// src/features/bi/types.ts
// Contrat du module BI : ce qu'une tuile VEUT SAVOIR, jamais comment le calculer.
//
// ⚠⚠ Toute spec entrant dans le module est validée ici — y compris celles écrites par une
// version antérieure et celles produites par un modèle de langage. Une spec non validée qui
// atteindrait le moteur produirait un chiffre faux sans le dire, ce qui est pire qu'une erreur.
import { z } from 'zod'

/** Incrémenter à chaque changement INCOMPATIBLE du contrat (et écrire la migration). */
export const DASHBOARD_VERSION = 1

/** Marge sous la limite dure de Firestore (1 048 576 octets). */
export const MAX_DASHBOARD_BYTES = 900_000

const SOURCE_IDS = [
  'pim.products', 'dam.assets', 'ai.usage', 'wf.runs', 'traffic.events', 'watch.listings',
] as const
export type SourceId = (typeof SOURCE_IDS)[number]

const FILTER_OPS = [
  'eq', 'ne', 'in', 'gt', 'gte', 'lt', 'lte', 'contains', 'between', 'empty', 'notEmpty',
] as const
export type FilterOp = (typeof FILTER_OPS)[number]

const filterSchema = z.object({
  field: z.string().min(1),
  op: z.enum(FILTER_OPS),
  value: z.unknown().optional(),
})
export type FilterClause = z.infer<typeof filterSchema>

const measureRefSchema = z.object({ id: z.string().min(1), alias: z.string().optional() })
export type MeasureRef = z.infer<typeof measureRefSchema>

/** `bucket` regroupe une dimension de TEMPS. Absent sur les autres. */
const dimensionRefSchema = z.object({
  id: z.string().min(1),
  bucket: z.enum(['day', 'week', 'month']).optional(),
})
export type DimensionRef = z.infer<typeof dimensionRefSchema>

const querySchema = z.object({
  source: z.enum(SOURCE_IDS),
  measures: z.array(measureRefSchema).min(1),
  dimensions: z.array(dimensionRefSchema),
  filters: z.array(filterSchema),
  sort: z.array(z.object({ by: z.string(), dir: z.enum(['asc', 'desc']) })).optional(),
  limit: z.number().int().positive().max(10_000).optional(),
})
export type QuerySpec = z.infer<typeof querySchema>

const TILE_KINDS = ['kpi', 'bar', 'line', 'area', 'pie', 'doughnut', 'table', 'pivot'] as const
export type TileKind = (typeof TILE_KINDS)[number]

const tileSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(TILE_KINDS),
  title: z.string(),
  query: querySchema,
  options: z.object({
    stacked: z.boolean().optional(),
    showTotals: z.boolean().optional(),
    /** Dimension portée en COLONNES du tableau croisé ; les autres restent en lignes. */
    pivotColumn: z.string().optional(),
  }).optional(),
  interactions: z.object({
    emitsFilter: z.boolean().optional(),
    drillPath: z.array(z.string()).optional(),
  }).optional(),
})
export type Tile = z.infer<typeof tileSchema>

const placementSchema = z.object({
  tileId: z.string().min(1),
  x: z.number().int().min(0), y: z.number().int().min(0),
  w: z.number().int().min(1), h: z.number().int().min(1),
})
export type TilePlacement = z.infer<typeof placementSchema>

const dashboardSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  accountId: z.string().min(1),
  workspaceUid: z.string().min(1),
  tiles: z.array(tileSchema),
  layout: z.array(placementSchema),
  filters: z.array(filterSchema),
  version: z.number().int().positive(),
  createdAt: z.number(), updatedAt: z.number(), createdBy: z.string(),
})
export type Dashboard = z.infer<typeof dashboardSchema>

/**
 * Valide une spec venue de la base, d'un import ou d'un modèle. Lève avec un message
 * lisible — l'appelant l'affiche tel quel plutôt que de tomber en marche.
 */
export function parseDashboard(input: unknown): Dashboard {
  const d = dashboardSchema.parse(input)
  // ⚠ Une tuile sans emplacement n'apparaît nulle part : elle serait perdue en silence,
  // et la première réécriture de la mise en page l'effacerait pour de bon.
  const placed = new Set(d.layout.map((l) => l.tileId))
  const orphan = d.tiles.find((t) => !placed.has(t.id))
  if (orphan) throw new Error(`Tuile « ${orphan.title || orphan.id} » absente de la mise en page`)
  return d
}
```

- [ ] **Étape 4 : lancer le test, vérifier le succès**

Lancer : `npx vitest run src/features/bi/types.test.ts`
Attendu : 4 tests PASS.

- [ ] **Étape 5 : commit**

```bash
git add src/features/bi/types.ts src/features/bi/types.test.ts
git commit -m "feat(bi): le contrat d'un tableau de bord, validé avant d'atteindre le moteur"
```

---

## Tâche 2 : le moteur d'agrégation (PUR)

**Fichiers :**
- Créer : `src/features/bi/registry/types.ts`, `src/features/bi/engine/aggregate.ts`
- Test : `src/features/bi/engine/aggregate.test.ts`

**Interfaces :**
- Consomme : `QuerySpec`, `FilterClause` (tâche 1).
- Produit : `Row`, `Dimension`, `Measure`, `DataSource` (registry/types) ;
  `aggregate(rows: Row[], query: QuerySpec, source: DataSource): AggregateResult` avec
  `AggregateResult = { columns: ResultColumn[]; rows: ResultRow[] }`,
  `ResultRow = Record<string, string | number | null>`.

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
// src/features/bi/engine/aggregate.test.ts
import { describe, it, expect } from 'vitest'
import { aggregate } from './aggregate'
import type { DataSource, Row } from '../registry/types'
import type { QuerySpec } from '../types'

const source: DataSource = {
  id: 'pim.products',
  labelKey: 'bi.source.pim',
  engine: 'client',
  dimensions: [
    { id: 'brand', labelKey: 'bi.dim.brand', kind: 'text', get: (r) => r.brand },
    { id: 'createdAt', labelKey: 'bi.dim.createdAt', kind: 'date', get: (r) => r.createdAt },
  ],
  measures: [
    { id: 'count', labelKey: 'bi.measure.count', format: 'int', aggregable: true,
      compute: (rows) => rows.length },
    { id: 'sum:price', labelKey: 'bi.measure.price', format: 'eur', aggregable: true,
      compute: (rows) => rows.reduce((n, r) => n + Number(r.price ?? 0), 0) },
    { id: 'median:price', labelKey: 'bi.measure.medianPrice', format: 'eur', aggregable: false,
      compute: (rows) => {
        const v = rows.map((r) => Number(r.price ?? 0)).sort((a, b) => a - b)
        return v.length ? v[Math.floor(v.length / 2)] : 0
      } },
  ],
}

const rows: Row[] = [
  { brand: 'Makita', price: 100, createdAt: Date.UTC(2026, 0, 5) },
  { brand: 'Makita', price: 300, createdAt: Date.UTC(2026, 0, 20) },
  { brand: 'Bosch',  price: 50,  createdAt: Date.UTC(2026, 1, 3) },
  { brand: null,     price: 10,  createdAt: Date.UTC(2026, 1, 4) },
]

const q = (p: Partial<QuerySpec>): QuerySpec => ({
  source: 'pim.products', measures: [{ id: 'count' }], dimensions: [], filters: [], ...p,
})

describe('aggregate', () => {
  it('sans dimension, rend UNE ligne de totaux', () => {
    const r = aggregate(rows, q({ measures: [{ id: 'count' }, { id: 'sum:price' }] }), source)
    expect(r.rows).toEqual([{ count: 4, 'sum:price': 460 }])
  })

  it('groupe par dimension et trie par mesure décroissante', () => {
    const r = aggregate(rows, q({
      dimensions: [{ id: 'brand' }], measures: [{ id: 'sum:price' }],
      sort: [{ by: 'sum:price', dir: 'desc' }],
    }), source)
    expect(r.rows.map((x) => x.brand)).toEqual(['Makita', 'Bosch', null])
    expect(r.rows[0]['sum:price']).toBe(400)
  })

  it('garde les valeurs ABSENTES dans leur propre groupe, jamais fondues dans une autre', () => {
    // ⚠ Regrouper `null` avec « Bosch » ou l'écarter en silence fausserait le total : la
    // somme des groupes ne vaudrait plus le total général.
    const r = aggregate(rows, q({ dimensions: [{ id: 'brand' }], measures: [{ id: 'count' }] }), source)
    const total = r.rows.reduce((n, x) => n + Number(x.count), 0)
    expect(total).toBe(rows.length)
  })

  it('regroupe une dimension de temps par mois', () => {
    const r = aggregate(rows, q({
      dimensions: [{ id: 'createdAt', bucket: 'month' }], measures: [{ id: 'count' }],
    }), source)
    expect(r.rows.map((x) => x.createdAt)).toEqual(['2026-01', '2026-02'])
    expect(r.rows.map((x) => x.count)).toEqual([2, 2])
  })

  it('applique les filtres AVANT de grouper', () => {
    const r = aggregate(rows, q({
      filters: [{ field: 'brand', op: 'eq', value: 'Makita' }], measures: [{ id: 'count' }],
    }), source)
    expect(r.rows).toEqual([{ count: 2 }])
  })

  it('rend un résultat VIDE sans lever quand aucune ligne ne passe', () => {
    const r = aggregate(rows, q({ filters: [{ field: 'brand', op: 'eq', value: 'Absent' }] }), source)
    expect(r.rows).toEqual([])
    expect(r.columns.length).toBeGreaterThan(0)
  })

  it('lève sur une mesure inconnue plutôt que de rendre zéro', () => {
    // ⚠⚠ Un zéro silencieux est le pire résultat possible : il se lit comme une donnée.
    expect(() => aggregate(rows, q({ measures: [{ id: 'sum:inexistant' }] }), source)).toThrow(/inconnue/i)
  })

  it('calcule une mesure NON AGRÉGEABLE sur les lignes du groupe, jamais par recomposition', () => {
    // La médiane d'un groupe ne se déduit pas des médianes de ses sous-groupes.
    const r = aggregate(rows, q({
      dimensions: [{ id: 'brand' }], measures: [{ id: 'median:price' }],
    }), source)
    expect(r.rows.find((x) => x.brand === 'Makita')?.['median:price']).toBe(300)
  })
})
```

- [ ] **Étape 2 : lancer le test, vérifier l'échec**

Lancer : `npx vitest run src/features/bi/engine/aggregate.test.ts`
Attendu : ÉCHEC — `Failed to resolve import "./aggregate"`.

- [ ] **Étape 3 : écrire les types du registre**

```ts
// src/features/bi/registry/types.ts
// Ce qu'une SOURCE déclare : ses champs interrogeables et ses mesures.
//
// ⚠⚠ Une mesure difficile est DÉCLARÉE, jamais réimplémentée : `compute` appelle la
// fonction pure qui fait déjà autorité ailleurs dans l'application (médiane d'écart,
// durée de cycle, coût rattrapé). Un moteur générique qui recalculerait ces valeurs
// naïvement contredirait les écrans en place.
import type { SourceId } from '../types'
import type { TranslationKey } from '@/lib/i18n'

export type Row = Record<string, unknown>

export type FieldKind = 'text' | 'number' | 'date' | 'bool'

export interface Dimension {
  id: string
  labelKey: TranslationKey
  kind: FieldKind
  /** Valeur brute portée par la ligne. `null`/`undefined` = valeur absente, groupe à part. */
  get: (row: Row) => unknown
}

export type MeasureFormat = 'int' | 'float' | 'eur' | 'pct' | 'ms'

export interface Measure {
  id: string
  labelKey: TranslationKey
  format: MeasureFormat
  /**
   * `false` pour une médiane, un pourcentage, un taux : additionner ou moyenner ces
   * valeurs entre groupes n'a pas de sens. Le constructeur refuse le geste (spec, risque 1).
   */
  aggregable: boolean
  compute: (rows: Row[]) => number
}

export interface DataSource {
  id: SourceId
  labelKey: TranslationKey
  /** `client` : lignes chargées puis agrégées en mémoire. `server` / `snapshot` : lots 3+. */
  engine: 'client' | 'server' | 'snapshot'
  dimensions: Dimension[]
  measures: Measure[]
}
```

- [ ] **Étape 4 : écrire le moteur**

```ts
// src/features/bi/engine/aggregate.ts
// Filtrer → grouper → mesurer → trier. PUR : aucun accès réseau, aucun rendu, aucun React.
import type { FilterClause, QuerySpec } from '../types'
import type { DataSource, Dimension, MeasureFormat, Row } from '../registry/types'
import type { TranslationKey } from '@/lib/i18n'

export interface ResultColumn {
  key: string
  /** ⚠ Typée : sans quoi chaque composant consommateur casterait à l'affichage, et un
   *  libellé absent du catalogue passerait sans bruit. */
  labelKey: TranslationKey
  role: 'dimension' | 'measure'
  format?: MeasureFormat
}
export type ResultRow = Record<string, string | number | null>
export interface AggregateResult { columns: ResultColumn[]; rows: ResultRow[] }

/** Clé de regroupement d'une valeur de temps. ⚠ En UTC, comme tous les compteurs mensuels
 *  de l'application — sans quoi une ligne changerait de mois selon le fuseau du lecteur. */
function bucketOf(value: unknown, bucket: 'day' | 'week' | 'month'): string | null {
  const ms = value instanceof Date ? value.getTime() : Number(value)
  if (!Number.isFinite(ms)) return null
  const d = new Date(ms)
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  if (bucket === 'month') return `${yyyy}-${mm}`
  if (bucket === 'day') return `${yyyy}-${mm}-${String(d.getUTCDate()).padStart(2, '0')}`
  // Semaine ISO : le lundi de la semaine porte la clé, c'est lisible et ordonnable.
  const day = (d.getUTCDay() + 6) % 7
  const monday = new Date(Date.UTC(yyyy, d.getUTCMonth(), d.getUTCDate() - day))
  return monday.toISOString().slice(0, 10)
}

function matches(row: Row, f: FilterClause, dim: Dimension | undefined): boolean {
  const v = dim ? dim.get(row) : row[f.field]
  const s = v == null ? '' : String(v).toLowerCase()
  const n = Number(v)
  switch (f.op) {
    case 'eq':       return v === f.value || s === String(f.value ?? '').toLowerCase()
    case 'ne':       return !(v === f.value || s === String(f.value ?? '').toLowerCase())
    case 'in':       return Array.isArray(f.value) && f.value.some((x) => String(x).toLowerCase() === s)
    case 'gt':       return n > Number(f.value)
    case 'gte':      return n >= Number(f.value)
    case 'lt':       return n < Number(f.value)
    case 'lte':      return n <= Number(f.value)
    case 'contains': return s.includes(String(f.value ?? '').toLowerCase())
    case 'between':  return Array.isArray(f.value) && n >= Number(f.value[0]) && n <= Number(f.value[1])
    case 'empty':    return v == null || s === ''
    case 'notEmpty': return !(v == null || s === '')
  }
}

/** Valeur de groupe d'une ligne pour une dimension. `null` = valeur ABSENTE — un groupe à
 *  part entière, jamais fondue dans une autre ni écartée : la somme des groupes doit
 *  toujours valoir le total général. */
function groupValue(row: Row, dim: Dimension, bucket?: 'day' | 'week' | 'month'): string | null {
  const raw = dim.get(row)
  if (raw == null || raw === '') return null
  if (dim.kind === 'date' && bucket) return bucketOf(raw, bucket)
  return String(raw)
}

export function aggregate(rows: Row[], query: QuerySpec, source: DataSource): AggregateResult {
  const dimById = new Map(source.dimensions.map((d) => [d.id, d]))
  const measures = query.measures.map((ref) => {
    const m = source.measures.find((x) => x.id === ref.id)
    // ⚠⚠ Jamais de repli à zéro : un zéro se lit comme une donnée, une erreur se corrige.
    if (!m) throw new Error(`Mesure inconnue pour cette source : ${ref.id}`)
    return { ref, m }
  })

  const columns: ResultColumn[] = [
    ...query.dimensions.map((d) => ({
      key: d.id,
      labelKey: dimById.get(d.id)?.labelKey ?? d.id,
      role: 'dimension' as const,
    })),
    ...measures.map(({ ref, m }) => ({
      key: ref.alias ?? ref.id, labelKey: m.labelKey, role: 'measure' as const, format: m.format,
    })),
  ]

  const kept = query.filters.length
    ? rows.filter((r) => query.filters.every((f) => matches(r, f, dimById.get(f.field))))
    : rows

  // Sans dimension : une seule ligne de totaux (le cas des tuiles KPI).
  if (query.dimensions.length === 0) {
    if (kept.length === 0) return { columns, rows: [] }
    const line: ResultRow = {}
    for (const { ref, m } of measures) line[ref.alias ?? ref.id] = m.compute(kept)
    return { columns, rows: [line] }
  }

  const groups = new Map<string, { keys: (string | null)[]; rows: Row[] }>()
  for (const row of kept) {
    const keys = query.dimensions.map((d) => {
      const dim = dimById.get(d.id)
      if (!dim) throw new Error(`Dimension inconnue pour cette source : ${d.id}`)
      return groupValue(row, dim, d.bucket)
    })
    const k = JSON.stringify(keys)
    const g = groups.get(k) ?? { keys, rows: [] }
    g.rows.push(row)
    groups.set(k, g)
  }

  let out: ResultRow[] = [...groups.values()].map(({ keys, rows: gr }) => {
    const line: ResultRow = {}
    query.dimensions.forEach((d, i) => { line[d.id] = keys[i] })
    // ⚠ Chaque mesure est calculée sur les LIGNES du groupe. Une médiane ne se recompose
    // pas depuis les médianes de sous-groupes — d'où le passage des lignes, pas des totaux.
    for (const { ref, m } of measures) line[ref.alias ?? ref.id] = m.compute(gr)
    return line
  })

  if (query.sort?.length) {
    const [s] = query.sort
    out.sort((a, b) => {
      const av = a[s.by], bv = b[s.by]
      // Les valeurs absentes vont en fin de liste, quel que soit le sens du tri.
      if (av == null) return 1
      if (bv == null) return -1
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv : String(av).localeCompare(String(bv), 'fr')
      return s.dir === 'desc' ? -cmp : cmp
    })
  } else {
    out.sort((a, b) => String(a[query.dimensions[0].id] ?? '￿')
      .localeCompare(String(b[query.dimensions[0].id] ?? '￿'), 'fr'))
  }

  if (query.limit) out = out.slice(0, query.limit)
  return { columns, rows: out }
}
```

- [ ] **Étape 5 : lancer le test, vérifier le succès**

Lancer : `npx vitest run src/features/bi/engine/aggregate.test.ts`
Attendu : 8 tests PASS.

- [ ] **Étape 6 : barrières et commit**

```bash
npx tsc -b && npm run lint && npm run dead
git add src/features/bi/engine src/features/bi/registry/types.ts
git commit -m "feat(bi): le moteur d'agrégation, pur et testé — un zéro silencieux est interdit"
```

---

## Tâche 3 : registre et source PIM

**Fichiers :**
- Créer : `src/features/bi/registry/pim.source.ts`, `src/features/bi/registry/sources.ts`
- Test : `src/features/bi/registry/pim.source.test.ts`
- Lire pour référence : `src/features/pim/types.ts` (`Product`, `ProductField`)

**Interfaces :**
- Consomme : `DataSource`, `Row`, `Measure` (tâche 2).
- Produit : `pimSource: DataSource`, `productToRow(p: Product, columns: string[]): Row`,
  `getSource(id: SourceId): DataSource`, `ALL_SOURCES: DataSource[]`.

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
// src/features/bi/registry/pim.source.test.ts
import { describe, it, expect } from 'vitest'
import { pimSource, productToRow } from './pim.source'
import { getSource } from './sources'
import { aggregate } from '../engine/aggregate'
import type { Product } from '@/features/pim/types'

const product = (id: string, fields: Record<string, unknown>): Product => ({
  _id: id, masterSku: id, masterEan: null, primarySourceId: 's1',
  fields: Object.fromEntries(Object.entries(fields)
    .map(([k, v]) => [k, { value: v as never, winningSourceId: 's1' }])),
  sourceLinks: [], taxonomyPath: ['Outillage', 'Perçage'], needsDedup: false,
  createdAt: 1, updatedAt: 2,
})

describe('source PIM', () => {
  it('aplatit un produit : champs, taxonomie et compteurs', () => {
    const row = productToRow(product('p1', { marque: 'Makita', prix: '199,90' }), ['marque', 'prix'])
    expect(row.marque).toBe('Makita')
    expect(row['taxo.1']).toBe('Outillage')
    expect(row._filled).toBe(2)
  })

  it('mesure la COMPLÉTUDE en pourcentage de champs renseignés', () => {
    const rows = [
      productToRow(product('p1', { a: 'x', b: 'y' }), ['a', 'b']),
      productToRow(product('p2', { a: 'x', b: '' }), ['a', 'b']),
    ]
    const m = pimSource.measures.find((x) => x.id === 'pim.completeness')!
    expect(m.compute(rows)).toBeCloseTo(75, 5)
    // ⚠ Une moyenne de pourcentages entre groupes est fausse : la mesure se déclare NON
    // agrégeable, et le constructeur refusera de l'additionner.
    expect(m.aggregable).toBe(false)
  })

  it('se branche au moteur sans adaptateur', () => {
    const rows = [
      productToRow(product('p1', { marque: 'Makita' }), ['marque']),
      productToRow(product('p2', { marque: 'Bosch' }), ['marque']),
    ]
    const r = aggregate(rows, {
      source: 'pim.products', measures: [{ id: 'count' }],
      dimensions: [{ id: 'taxo.1' }], filters: [],
    }, pimSource)
    expect(r.rows).toEqual([{ 'taxo.1': 'Outillage', count: 2 }])
  })

  it('résout une source par son identifiant, et lève sur un identifiant inconnu', () => {
    expect(getSource('pim.products').id).toBe('pim.products')
    expect(() => getSource('sql.libre' as never)).toThrow()
  })
})
```

- [ ] **Étape 2 : lancer le test, vérifier l'échec**

Lancer : `npx vitest run src/features/bi/registry/pim.source.test.ts`
Attendu : ÉCHEC — module introuvable.

- [ ] **Étape 3 : écrire la source PIM**

```ts
// src/features/bi/registry/pim.source.ts
// Source « produits du PIM » : ses colonnes sont DYNAMIQUES (elles viennent du schéma du
// projet), ses dimensions fixes sont la taxonomie et les dates.
import type { Product } from '@/features/pim/types'
import type { DataSource, Dimension, Row } from './types'

/** Profondeur de taxonomie exposée en dimensions (cf. taxonomie à 4 niveaux). */
const TAXO_LEVELS = 4

/**
 * Produit → ligne plate consommable par le moteur.
 *
 * ⚠ `_filled` / `_total` sont calculés ICI, une fois, plutôt que dans chaque mesure : la
 * complétude se lit sur les colonnes DEMANDÉES, pas sur les clés présentes — un produit
 * sans le champ « poids » doit compter comme non renseigné, pas être ignoré.
 */
export function productToRow(p: Product, columns: string[]): Row {
  const row: Row = { _id: p._id, _sku: p.masterSku, _createdAt: p.createdAt, _updatedAt: p.updatedAt }
  let filled = 0
  for (const c of columns) {
    const v = p.fields[c]?.value ?? null
    row[c] = v
    if (v !== null && v !== undefined && String(v).trim() !== '') filled++
  }
  for (let i = 0; i < TAXO_LEVELS; i++) row[`taxo.${i + 1}`] = p.taxonomyPath[i] ?? null
  row._filled = filled
  row._total = columns.length
  return row
}

const taxoDimensions: Dimension[] = Array.from({ length: TAXO_LEVELS }, (_, i) => ({
  id: `taxo.${i + 1}`,
  labelKey: `bi.dim.taxo${i + 1}` as Dimension['labelKey'],
  kind: 'text' as const,
  get: (r: Row) => r[`taxo.${i + 1}`],
}))

const numbersOf = (rows: Row[], key: string): number[] =>
  rows.map((r) => Number(r[key])).filter((n) => Number.isFinite(n))

export const pimSource: DataSource = {
  id: 'pim.products',
  labelKey: 'bi.source.pim',
  engine: 'client',
  dimensions: [
    ...taxoDimensions,
    { id: '_createdAt', labelKey: 'bi.dim.createdAt', kind: 'date', get: (r) => r._createdAt },
    { id: '_updatedAt', labelKey: 'bi.dim.updatedAt', kind: 'date', get: (r) => r._updatedAt },
  ],
  measures: [
    { id: 'count', labelKey: 'bi.measure.count', format: 'int', aggregable: true,
      compute: (rows) => rows.length },
    // Complétude = champs renseignés / champs attendus, sur l'ensemble des lignes du groupe.
    { id: 'pim.completeness', labelKey: 'bi.measure.completeness', format: 'pct', aggregable: false,
      compute: (rows) => {
        const total = rows.reduce((n, r) => n + Number(r._total ?? 0), 0)
        if (total === 0) return 0
        return (rows.reduce((n, r) => n + Number(r._filled ?? 0), 0) / total) * 100
      } },
    { id: 'pim.filled', labelKey: 'bi.measure.filled', format: 'int', aggregable: true,
      compute: (rows) => rows.reduce((n, r) => n + Number(r._filled ?? 0), 0) },
    { id: 'pim.freshnessDays', labelKey: 'bi.measure.freshness', format: 'float', aggregable: false,
      compute: (rows) => {
        const ages = numbersOf(rows, '_updatedAt').map((ts) => (Date.now() - ts) / 86_400_000)
        if (!ages.length) return 0
        const sorted = ages.sort((a, b) => a - b)
        return sorted[Math.floor(sorted.length / 2)]
      } },
  ],
}
```

- [ ] **Étape 4 : écrire le registre**

```ts
// src/features/bi/registry/sources.ts
// Point d'entrée UNIQUE des sources. Le constructeur, le moteur et le prompt lisent ici —
// une source absente d'ici n'existe pas pour le module.
import type { SourceId } from '../types'
import type { DataSource } from './types'
import { pimSource } from './pim.source'

export const ALL_SOURCES: DataSource[] = [pimSource]

export function getSource(id: SourceId): DataSource {
  const s = ALL_SOURCES.find((x) => x.id === id)
  // Lever plutôt que rendre une source vide : une tuile sans source doit le DIRE.
  if (!s) throw new Error(`Source inconnue : ${id}`)
  return s
}
```

- [ ] **Étape 5 : ajouter les clés i18n**

Ajouter dans `src/lib/i18n/fr.ts`, `en.ts` (anglais britannique) et `es.ts`, à la suite du
bloc du module BI (à créer) :

```ts
// fr.ts
'bi.source.pim': 'Produits (PIM)',
'bi.dim.taxo1': 'Univers', 'bi.dim.taxo2': 'Famille',
'bi.dim.taxo3': 'Sous-famille', 'bi.dim.taxo4': 'Catégorie',
'bi.dim.createdAt': 'Date de création', 'bi.dim.updatedAt': 'Dernière modification',
'bi.measure.count': 'Nombre de produits',
'bi.measure.completeness': 'Complétude',
'bi.measure.filled': 'Champs renseignés',
'bi.measure.freshness': 'Ancienneté médiane (jours)',
```

```ts
// en.ts
'bi.source.pim': 'Products (PIM)',
'bi.dim.taxo1': 'Universe', 'bi.dim.taxo2': 'Family',
'bi.dim.taxo3': 'Sub-family', 'bi.dim.taxo4': 'Category',
'bi.dim.createdAt': 'Created on', 'bi.dim.updatedAt': 'Last modified',
'bi.measure.count': 'Number of products',
'bi.measure.completeness': 'Completeness',
'bi.measure.filled': 'Fields filled in',
'bi.measure.freshness': 'Median age (days)',
```

```ts
// es.ts
'bi.source.pim': 'Productos (PIM)',
'bi.dim.taxo1': 'Universo', 'bi.dim.taxo2': 'Familia',
'bi.dim.taxo3': 'Subfamilia', 'bi.dim.taxo4': 'Categoría',
'bi.dim.createdAt': 'Fecha de creación', 'bi.dim.updatedAt': 'Última modificación',
'bi.measure.count': 'Número de productos',
'bi.measure.completeness': 'Completitud',
'bi.measure.filled': 'Campos rellenados',
'bi.measure.freshness': 'Antigüedad mediana (días)',
```

- [ ] **Étape 6 : lancer le test, vérifier le succès**

Lancer : `npx vitest run src/features/bi/registry/pim.source.test.ts`
Attendu : 4 tests PASS.

- [ ] **Étape 7 : commit**

```bash
npx tsc -b && npm run lint
git add src/features/bi/registry src/lib/i18n
git commit -m "feat(bi): la source PIM déclare ses dimensions et ses mesures"
```

---

## Tâche 4 : persistance, règles Firestore, permissions, menu

⚠ **Cette tâche fait les règles AVANT l'écran.** Une écriture client sans règle
correspondante échoue **en silence** (déjà vécu sur le module Suivi), et une section sans
permission déclarée est visible par tous (contrôle fail-open).

**Fichiers :**
- Créer : `src/features/bi/store/dashboardsStore.ts`, `src/features/bi/hooks/useDashboards.ts`
- Test : `src/features/bi/store/dashboardsStore.test.ts`
- Modifier : `firestore.rules` (après le bloc `users/{uid}/priceWatch`),
  `src/features/access/permissions.ts`, `src/features/navigation/modules.ts`,
  `src/lib/i18n/{fr,en,es}.ts`

**Interfaces :**
- Consomme : `Dashboard`, `parseDashboard`, `MAX_DASHBOARD_BYTES` (tâche 1).
- Produit : `dashboardsCol(uid)`, `dashboardDoc(uid, id)`, `assertWritable(d: Dashboard)`,
  `saveDashboard(uid, d)`, `deleteDashboard(uid, id)`, `useDashboards(): Dashboard[]`.

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
// src/features/bi/store/dashboardsStore.test.ts
import { describe, it, expect } from 'vitest'
import { assertWritable, dashboardDoc } from './dashboardsStore'
import { DASHBOARD_VERSION, MAX_DASHBOARD_BYTES, type Dashboard } from '../types'

const base: Dashboard = {
  id: 'd1', name: 'Complétude', accountId: 'acme', workspaceUid: 'u1',
  version: DASHBOARD_VERSION, createdAt: 1, updatedAt: 2, createdBy: 'u1',
  tiles: [], layout: [], filters: [],
}

describe('garde-fous d’écriture', () => {
  it('laisse passer un tableau de bord ordinaire', () => {
    expect(() => assertWritable(base)).not.toThrow()
  })

  it('REFUSE un document trop lourd AVANT l’envoi, avec un message lisible', () => {
    // ⚠ Firestore refuse tout document au-delà de 1 048 576 octets. Sans ce garde-fou,
    // l'écriture échouerait côté serveur et l'écran laisserait croire à un enregistrement.
    const fat: Dashboard = { ...base, description: 'x'.repeat(MAX_DASHBOARD_BYTES) }
    expect(() => assertWritable(fat)).toThrow(/trop volumineux/i)
  })

  it('range les tableaux de bord sous l’ESPACE DE TRAVAIL, pas sous l’identité', () => {
    expect(dashboardDoc('workspace-1', 'd1')).toBe('users/workspace-1/biDashboards/d1')
  })
})
```

- [ ] **Étape 2 : lancer le test, vérifier l'échec**

Lancer : `npx vitest run src/features/bi/store/dashboardsStore.test.ts`
Attendu : ÉCHEC — module introuvable.

- [ ] **Étape 3 : écrire la persistance**

```ts
// src/features/bi/store/dashboardsStore.ts
// Chemins et écriture des tableaux de bord.
//
// ⚠ Sous `users/{workspaceUid}/…` : les tableaux de bord sont des DONNÉES DE TRAVAIL, donc
// partagées par les membres d'une société, jamais rangées sous l'identité de leur auteur.
import { doc, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { MAX_DASHBOARD_BYTES, parseDashboard, type Dashboard } from '../types'

export const dashboardsCol = (uid: string) => `users/${uid}/biDashboards`
export const dashboardDoc = (uid: string, id: string) => `${dashboardsCol(uid)}/${id}`

/** ⚠ Vérifié AVANT l'envoi : un refus de Firestore arriverait après coup, et l'écran aurait
 *  déjà affiché « enregistré ». */
export function assertWritable(d: Dashboard): void {
  const bytes = new TextEncoder().encode(JSON.stringify(d)).length
  if (bytes > MAX_DASHBOARD_BYTES) {
    throw new Error(`Tableau de bord trop volumineux (${Math.round(bytes / 1024)} ko) — retire des tuiles.`)
  }
}

export async function saveDashboard(uid: string, d: Dashboard): Promise<void> {
  const valid = parseDashboard({ ...d, updatedAt: Date.now() })
  assertWritable(valid)
  await setDoc(doc(db, dashboardDoc(uid, valid.id)), valid)
}

export async function deleteDashboard(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(db, dashboardDoc(uid, id)))
}
```

- [ ] **Étape 4 : écrire le hook d'abonnement**

```ts
// src/features/bi/hooks/useDashboards.ts
// Liste LIVE des tableaux de bord de l'espace de travail. Aucun cache : l'abonnement
// reflète la base, un tableau créé sur un autre poste apparaît sans rechargement.
import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { dashboardsCol } from '../store/dashboardsStore'
import { parseDashboard, type Dashboard } from '../types'
import { debugLog } from '@/lib/debugLog'

export function useDashboards(): Dashboard[] {
  const uid = useWorkspaceUid()
  const [items, setItems] = useState<Dashboard[]>([])

  useEffect(() => {
    if (!uid) { setItems([]); return }
    return onSnapshot(
      query(collection(db, dashboardsCol(uid)), orderBy('updatedAt', 'desc')),
      (snap) => {
        const out: Dashboard[] = []
        for (const d of snap.docs) {
          try {
            out.push(parseDashboard(d.data()))
          } catch (e) {
            // ⚠ Un document invalide n'emporte pas la liste entière : il est écarté et DIT.
            debugLog('[bi] tableau de bord illisible', d.id, e)
          }
        }
        setItems(out)
      },
      (e) => console.warn('[bi] liste des tableaux de bord illisible :', e),
    )
  }, [uid])

  return items
}
```

- [ ] **Étape 5 : ajouter la règle Firestore**

Dans `firestore.rules`, juste après le bloc `match /users/{uid}/priceWatch/{document=**}` :

```
    // Tableaux de bord BI : données de TRAVAIL, donc partagées dans l'espace de la société.
    // ⚠️ La lecture suit l'espace de travail ; l'écriture exige en plus `bi.edit` — sans
    // quoi n'importe quel membre pourrait réécrire les tableaux de bord de tous les autres.
    match /users/{uid}/biDashboards/{dashboardId} {
      allow read:  if isAuthenticated() && inMyWorkspace(uid);
      allow write: if hasPermission('bi.edit') && inMyWorkspace(uid);
    }
```

- [ ] **Étape 6 : déclarer les permissions et le menu**

Dans `src/features/access/permissions.ts`, ajouter au catalogue :

```ts
  { key: 'bi.view', module: 'Dashboard BI', labelKey: 'perm.bi.view', descriptionKey: 'perm.bi.view.desc' },
  { key: 'bi.edit', module: 'Dashboard BI', labelKey: 'perm.bi.edit', descriptionKey: 'perm.bi.edit.desc' },
```

et dans `MODULE_LABEL`, une entrée `'Dashboard BI': 'perm.module.17'` (avec la clé i18n
correspondante dans les trois catalogues).

Dans `src/features/navigation/modules.ts` :
1. ajouter `'bi'` à l'union des identifiants de section (ligne ~22) ;
2. ajouter `bi: true` à la table des modules activés (ligne ~38) ;
3. ajouter l'entrée de menu dans le groupe `product-data` :

```ts
  { id: 'bi', group: 'product-data', icon: BarChart3, labelKey: 'nav.bi', accent: 'text-cyan-400',
    activeBg: 'bg-cyan-500/[0.1]', activeText: 'text-cyan-300' },
```

4. ⚠ **ne pas oublier** `bi: 'bi.view'` dans `MODULE_PERMISSION` — sans cette ligne, le
   module est visible par TOUS les rôles (fail-open).

Clés i18n à ajouter dans les trois catalogues : `nav.bi` (« Dashboard BI » / « BI
dashboards » / « Paneles BI »), `perm.bi.view`, `perm.bi.view.desc`, `perm.bi.edit`,
`perm.bi.edit.desc`, `perm.module.17`.

- [ ] **Étape 7 : lancer les tests, vérifier le succès**

Lancer : `npx vitest run src/features/bi/store/dashboardsStore.test.ts`
Attendu : 3 tests PASS.

- [ ] **Étape 8 : déployer les règles et commiter**

```bash
npx tsc -b && npm run lint && npm run test:run
firebase deploy --only firestore:rules
git add -A
git commit -m "feat(bi): les tableaux de bord existent en base, gardés par leurs règles"
```

⚠ Le déploiement des règles fait partie de la tâche : une règle écrite mais non déployée
laisse l'écriture échouer en silence.

---

## Tâche 5 : cadre de tuile et états

**Fichiers :**
- Créer : `src/features/bi/components/TileFrame.tsx`, `src/features/bi/components/TileStates.tsx`
- Test : `src/features/bi/components/TileStates.test.tsx`

**Interfaces :**
- Produit : `TileFrame` (props : `title: string`, `updatedAt: number | null`,
  `live: boolean`, `state: 'loading' | 'empty' | 'error' | 'ready'`,
  `skeleton: 'chart' | 'table' | 'kpi'`, `error?: string`, `onRetry: () => void`,
  `onClearFilters: () => void`, `children: React.ReactNode`) ;
  `TileSkeleton({ kind })`, `TileEmpty({ onClearFilters })`, `TileError({ message, onRetry })`
  (`TileStates.tsx`).

- [ ] **Étape 1 : écrire le test qui échoue**

```tsx
// src/features/bi/components/TileStates.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TileEmpty, TileError } from './TileStates'

describe('états d’une tuile', () => {
  it('un résultat vide propose de retirer le filtre qui l’a vidé', () => {
    // ⚠ Un cadre vide sans explication se lit comme une panne.
    render(<TileEmpty onClearFilters={() => {}} />)
    expect(screen.getByRole('button')).toBeTruthy()
  })

  it('une erreur donne sa cause ET un bouton réessayer, dans le cadre de la tuile', () => {
    render(<TileError message="Source inconnue : sql.libre" onRetry={() => {}} />)
    expect(screen.getByText(/sql.libre/)).toBeTruthy()
    expect(screen.getByRole('button')).toBeTruthy()
  })
})
```

- [ ] **Étape 2 : lancer le test, vérifier l'échec**

Lancer : `npx vitest run src/features/bi/components/TileStates.test.tsx`
Attendu : ÉCHEC — module introuvable.

- [ ] **Étape 3 : écrire les états**

```tsx
// src/features/bi/components/TileStates.tsx
// Les états d'une tuile ne sont pas des trous : chacun dit ce qui se passe et ce qu'on peut
// faire. ⚠ Un tourniquet centré ne dit rien de la forme à venir — un squelette, si.
import { AlertTriangle, FilterX, RotateCcw } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

export function TileSkeleton({ kind }: { kind: 'chart' | 'table' | 'kpi' }) {
  if (kind === 'kpi') return <div className="h-10 w-28 rounded bg-white/[0.06] animate-pulse" />
  if (kind === 'table') {
    return (
      <div className="space-y-1.5">
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-4 rounded bg-white/[0.05] animate-pulse" />)}
      </div>
    )
  }
  return (
    <div className="flex items-end gap-1.5 h-full min-h-[6rem]">
      {[40, 70, 55, 85, 30, 60].map((h, i) => (
        <div key={i} className="flex-1 rounded-t bg-white/[0.06] animate-pulse" style={{ height: `${h}%` }} />
      ))}
    </div>
  )
}

export function TileEmpty({ onClearFilters }: { onClearFilters: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
      <p className="text-[11px] text-white/40">{t('bi.tile.empty')}</p>
      <button
        onClick={onClearFilters}
        className="inline-flex items-center gap-1.5 text-[11px] text-indigo-300 hover:text-indigo-200 transition-colors"
      >
        <FilterX className="w-3 h-3" />{t('bi.tile.clearFilters')}
      </button>
    </div>
  )
}

export function TileError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-3">
      <AlertTriangle className="w-4 h-4 text-amber-400" />
      <p className="text-[11px] text-amber-200/80 break-words">{message}</p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 text-[11px] text-white/60 hover:text-white transition-colors"
      >
        <RotateCcw className="w-3 h-3" />{t('bi.tile.retry')}
      </button>
    </div>
  )
}
```

- [ ] **Étape 4 : écrire le cadre**

```tsx
// src/features/bi/components/TileFrame.tsx
// Cadre COMMUN à toutes les tuiles : titre, témoin de direct, âge de la donnée, états.
// ⚠ L'âge est affiché sur chaque tuile : un chiffre sans âge est invérifiable.
import { TileSkeleton, TileEmpty, TileError } from './TileStates'
import { useTranslation } from '@/lib/i18n'

interface Props {
  title: string
  /** Dernière donnée reçue (ms epoch), `null` si rien n'est encore arrivé. */
  updatedAt: number | null
  /** La tuile est branchée sur un flux, par opposition à une photo datée. */
  live: boolean
  state: 'loading' | 'empty' | 'error' | 'ready'
  skeleton: 'chart' | 'table' | 'kpi'
  error?: string
  onRetry: () => void
  onClearFilters: () => void
  children: React.ReactNode
}

function ageLabel(updatedAt: number | null): string {
  if (updatedAt == null) return '—'
  const s = Math.max(0, Math.round((Date.now() - updatedAt) / 1000))
  if (s < 60) return `${s} s`
  const m = Math.round(s / 60)
  return m < 60 ? `${m} min` : `${Math.round(m / 60)} h`
}

export function TileFrame({
  title, updatedAt, live, state, skeleton, error, onRetry, onClearFilters, children,
}: Props) {
  const { t } = useTranslation()
  return (
    <div className="h-full flex flex-col bg-surface rounded-lg border border-white/[0.06] overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.05] shrink-0
        cursor-move bi-tile-handle">
        <h3 className="text-[12px] font-semibold text-white truncate flex-1">{title}</h3>
        {live && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />}
        <span className="text-[10px] tabular-nums text-white/35 shrink-0" title={t('bi.tile.ageTitle')}>
          {ageLabel(updatedAt)}
        </span>
      </div>
      {/* ⚠ `min-h-0` : sans lui, un enfant flex refuse de rétrécir et c'est la PAGE qui
          s'allonge. Le débordement scrolle DANS la tuile. */}
      <div className="flex-1 min-h-0 overflow-auto p-3">
        {state === 'loading' ? <TileSkeleton kind={skeleton} />
          : state === 'error' ? <TileError message={error ?? ''} onRetry={onRetry} />
          : state === 'empty' ? <TileEmpty onClearFilters={onClearFilters} />
          : children}
      </div>
    </div>
  )
}
```

- [ ] **Étape 5 : ajouter les clés i18n**

`bi.tile.empty`, `bi.tile.clearFilters`, `bi.tile.retry`, `bi.tile.ageTitle` dans les trois
catalogues. FR : « Aucune donnée pour ces filtres », « Retirer les filtres », « Réessayer »,
« Âge de la donnée affichée ».

- [ ] **Étape 6 : lancer le test, vérifier le succès**

Lancer : `npx vitest run src/features/bi/components/TileStates.test.tsx`
Attendu : 2 tests PASS.

- [ ] **Étape 7 : commit**

```bash
npx tsc -b && npm run lint
git add src/features/bi/components src/lib/i18n
git commit -m "feat(bi): le cadre d'une tuile, et des états qui ne sont pas des trous"
```

---

## Tâche 6 : données d'une tuile (branchement live)

**Fichiers :**
- Créer : `src/features/bi/hooks/useTileData.ts`, `src/features/bi/engine/rowsFromPim.ts`
- Test : `src/features/bi/engine/rowsFromPim.test.ts`

**Interfaces :**
- Consomme : `aggregate`, `getSource`, `productToRow`, `QuerySpec`.
- Produit : `pimRows(products: Product[], columns: string[]): Row[]` ;
  `useTileData(query: QuerySpec, globalFilters: FilterClause[]): { result: AggregateResult | null; state: 'loading'|'empty'|'error'|'ready'; error?: string; updatedAt: number | null; live: boolean; retry: () => void }`.

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
// src/features/bi/engine/rowsFromPim.test.ts
import { describe, it, expect } from 'vitest'
import { pimRows } from './rowsFromPim'
import type { Product } from '@/features/pim/types'

const p = (id: string, fields: Record<string, string>): Product => ({
  _id: id, masterSku: id, masterEan: null, primarySourceId: 's',
  fields: Object.fromEntries(Object.entries(fields)
    .map(([k, v]) => [k, { value: v as never, winningSourceId: 's' }])),
  sourceLinks: [], taxonomyPath: [], needsDedup: false, createdAt: 0, updatedAt: 0,
})

describe('pimRows', () => {
  it('déduit les colonnes de TOUS les produits, pas seulement du premier', () => {
    // ⚠ Un produit sans le champ « poids » doit compter comme NON renseigné : si les
    // colonnes venaient du premier produit, la complétude serait surévaluée.
    const rows = pimRows([p('a', { marque: 'X' }), p('b', { marque: 'Y', poids: '2' })], [])
    expect(rows[0]._total).toBe(2)
    expect(rows[0]._filled).toBe(1)
  })

  it('respecte les colonnes imposées quand elles sont fournies', () => {
    const rows = pimRows([p('a', { marque: 'X', poids: '2' })], ['marque'])
    expect(rows[0]._total).toBe(1)
  })
})
```

- [ ] **Étape 2 : lancer le test, vérifier l'échec**

Lancer : `npx vitest run src/features/bi/engine/rowsFromPim.test.ts`
Attendu : ÉCHEC — module introuvable.

- [ ] **Étape 3 : écrire l'adaptateur**

```ts
// src/features/bi/engine/rowsFromPim.ts
import type { Product } from '@/features/pim/types'
import { productToRow } from '../registry/pim.source'
import type { Row } from '../registry/types'

/**
 * Produits → lignes. Les colonnes attendues sont l'UNION de tous les champs rencontrés,
 * sauf si l'appelant impose une liste (schéma de la source).
 */
export function pimRows(products: Product[], columns: string[]): Row[] {
  const cols = columns.length
    ? columns
    : [...new Set(products.flatMap((p) => Object.keys(p.fields)))].sort()
  return products.map((p) => productToRow(p, cols))
}
```

- [ ] **Étape 4 : écrire le hook**

```ts
// src/features/bi/hooks/useTileData.ts
// Données d'une tuile : source → lignes → moteur. Mémoïsé par spec ET par lignes : sans
// cela, vingt tuiles branchées en direct recalculeraient tout à chaque battement.
import { useCallback, useMemo, useState } from 'react'
import { usePimStore } from '@/stores/pim.store'
import { aggregate, type AggregateResult } from '../engine/aggregate'
import { pimRows } from '../engine/rowsFromPim'
import { getSource } from '../registry/sources'
import type { FilterClause, QuerySpec } from '../types'

export interface TileData {
  result: AggregateResult | null
  state: 'loading' | 'empty' | 'error' | 'ready'
  error?: string
  updatedAt: number | null
  live: boolean
  retry: () => void
}

export function useTileData(query: QuerySpec, globalFilters: FilterClause[]): TileData {
  const products = usePimStore((s) => s.products)
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return useMemo<TileData>(() => {
    // Lot 1 : seule la source client est branchée. Les sources `server` et `snapshot`
    // arrivent au lot 3 — le dire vaut mieux que rendre une tuile vide.
    try {
      const source = getSource(query.source)
      if (source.engine !== 'client') {
        return { result: null, state: 'error', error: `Source non encore disponible : ${source.id}`,
          updatedAt: null, live: false, retry }
      }
      if (products.length === 0) {
        return { result: null, state: 'loading', updatedAt: null, live: true, retry }
      }
      const rows = pimRows(products, [])
      const merged: QuerySpec = { ...query, filters: [...query.filters, ...globalFilters] }
      const result = aggregate(rows, merged, source)
      return {
        result,
        state: result.rows.length ? 'ready' : 'empty',
        updatedAt: Date.now(), live: true, retry,
      }
    } catch (e) {
      return { result: null, state: 'error', error: e instanceof Error ? e.message : String(e),
        updatedAt: null, live: false, retry }
    }
    // `attempt` est une dépendance VOLONTAIRE : c'est ce qui rejoue le calcul sur « réessayer ».
  }, [products, query, globalFilters, attempt, retry])
}
```

- [ ] **Étape 5 : lancer les tests, vérifier le succès**

Lancer : `npx vitest run src/features/bi/engine/rowsFromPim.test.ts`
Attendu : 2 tests PASS.

- [ ] **Étape 6 : commit**

```bash
npx tsc -b && npm run lint
git add src/features/bi/hooks/useTileData.ts src/features/bi/engine/rowsFromPim.ts src/features/bi/engine/rowsFromPim.test.ts
git commit -m "feat(bi): une tuile lit ses données en direct, ou dit pourquoi elle ne peut pas"
```

---

## Tâche 7 : tuiles KPI et graphes

**Fichiers :**
- Créer : `src/features/bi/components/tiles/KpiTile.tsx`,
  `src/features/bi/components/tiles/ChartTile.tsx`, `src/features/bi/engine/formatValue.ts`
- Test : `src/features/bi/engine/formatValue.test.ts`
- Déplacer : `src/features/priceWatch/dashboard/AnimatedNumber.tsx` →
  `src/components/shared/AnimatedNumber.tsx` (⚠ il est aujourd'hui rangé dans la veille ; le
  module BI ne doit pas importer un composant d'un autre domaine métier. Mettre à jour les
  imports existants — `OpsCockpit.tsx` et les autres consommateurs — et vérifier
  `npm run cycles` après le déplacement.)
- Lire pour référence : `src/features/workflows/registry/chartSpec.ts` (palette)

**Interfaces :**
- Consomme : `AggregateResult`, `MeasureFormat`, `TileFrame`.
- Produit : `formatMeasure(value: number | string | null, format?: MeasureFormat, locale?: string): string` ;
  `KpiTile({ result })`, `ChartTile({ result, kind, stacked })`.

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
// src/features/bi/engine/formatValue.test.ts
import { describe, it, expect } from 'vitest'
import { formatMeasure } from './formatValue'

describe('formatMeasure', () => {
  it('formate selon le TYPE de mesure, pas selon la valeur', () => {
    expect(formatMeasure(1234, 'int', 'fr-FR').replace(/ | /g, ' ')).toBe('1 234')
    expect(formatMeasure(75.5, 'pct', 'fr-FR')).toMatch(/75,5\s*%/)
    expect(formatMeasure(1500, 'ms', 'fr-FR')).toBe('1,5 s')
  })

  it('distingue ZÉRO d’une valeur ABSENTE', () => {
    // ⚠ Afficher « 0 » là où la donnée manque se lit comme un résultat.
    expect(formatMeasure(0, 'int', 'fr-FR')).toBe('0')
    expect(formatMeasure(null, 'int', 'fr-FR')).toBe('—')
  })
})
```

- [ ] **Étape 2 : lancer le test, vérifier l'échec**

Lancer : `npx vitest run src/features/bi/engine/formatValue.test.ts`
Attendu : ÉCHEC — module introuvable.

- [ ] **Étape 3 : écrire le formateur**

```ts
// src/features/bi/engine/formatValue.ts
// Un seul formateur pour tout le module : deux règles d'arrondi différentes sur le même
// écran suffisent à faire douter de tous les chiffres.
import type { MeasureFormat } from '../registry/types'

export function formatMeasure(
  value: number | string | null,
  format: MeasureFormat = 'float',
  locale = 'fr-FR',
): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'string') return value
  switch (format) {
    case 'int':   return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)
    case 'eur':   return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(value)
    case 'pct':   return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} %`
    case 'ms':    return value < 1000
      ? `${Math.round(value)} ms`
      : value < 60_000 ? `${(value / 1000).toFixed(1).replace('.', ',')} s`
      : `${Math.round(value / 60_000)} min`
    case 'float': return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)
  }
}
```

- [ ] **Étape 4 : écrire la tuile KPI**

```tsx
// src/features/bi/components/tiles/KpiTile.tsx
// Une mesure, en grand. ⚠ La valeur s'ANIME quand elle change : sur un tableau branché en
// direct, on doit voir que ça bouge, pas seulement le résultat.
import { AnimatedNumber } from '@/components/shared/AnimatedNumber'
import { formatMeasure } from '../../engine/formatValue'
import { intlLocale, useTranslation } from '@/lib/i18n'
import type { AggregateResult } from '../../engine/aggregate'

export function KpiTile({ result }: { result: AggregateResult }) {
  const { t, locale } = useTranslation()
  const col = result.columns.find((c) => c.role === 'measure')
  const raw = col ? result.rows[0]?.[col.key] ?? null : null
  const value = typeof raw === 'number' ? raw : null

  return (
    <div className="h-full flex flex-col justify-center">
      <p className="text-3xl font-semibold text-white tabular-nums">
        {value === null
          ? '—'
          : <AnimatedNumber value={value} format={(n) => formatMeasure(n, col?.format, intlLocale(locale))} />}
      </p>
      {col && <p className="text-[11px] text-white/40 mt-1">{t(col.labelKey as 'bi.measure.count')}</p>}
    </div>
  )
}
```

- [ ] **Étape 5 : écrire la tuile graphe**

```tsx
// src/features/bi/components/tiles/ChartTile.tsx
// Barres, courbes, aires, camemberts — sur `chart.js`, déjà au projet et déjà utilisé par
// le node « Graphique ». ⚠ Les couleurs de texte et de grille suivent le THÈME : lues
// depuis le store, jamais écrites en dur.
import { Bar, Line, Pie, Doughnut } from 'react-chartjs-2'
import {
  Chart, CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement,
  Tooltip, Legend, Filler,
} from 'chart.js'
import { useThemeStore } from '@/stores/theme.store'
import { formatMeasure } from '../../engine/formatValue'
import type { AggregateResult } from '../../engine/aggregate'
import type { TileKind } from '../../types'

Chart.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement,
  Tooltip, Legend, Filler)

const PALETTE = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4',
  '#a855f7', '#ec4899', '#84cc16', '#f97316', '#14b8a6']

export function ChartTile({ result, kind, stacked }: {
  result: AggregateResult; kind: TileKind; stacked?: boolean
}) {
  const dark = useThemeStore((s) => s.resolvedTheme) === 'dark'
  const tick = dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.55)'
  const grid = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'

  const dimKey = result.columns.find((c) => c.role === 'dimension')?.key
  const measures = result.columns.filter((c) => c.role === 'measure')
  const labels = result.rows.map((r) => (dimKey ? String(r[dimKey] ?? '—') : ''))
  const data = {
    labels,
    datasets: measures.map((m, i) => ({
      label: m.key,
      data: result.rows.map((r) => Number(r[m.key] ?? 0)),
      backgroundColor: kind === 'pie' || kind === 'doughnut'
        ? labels.map((_, k) => PALETTE[k % PALETTE.length])
        : PALETTE[i % PALETTE.length],
      borderColor: PALETTE[i % PALETTE.length],
      fill: kind === 'area',
      tension: 0.25,
    })),
  }
  const options = {
    maintainAspectRatio: false,
    plugins: {
      legend: { display: measures.length > 1, labels: { color: tick, boxWidth: 10 } },
      tooltip: {
        callbacks: {
          label: (c: { parsed: { y?: number }; raw: unknown; dataset: { label?: string } }) =>
            `${c.dataset.label ?? ''} : ${formatMeasure(
              typeof c.parsed?.y === 'number' ? c.parsed.y : Number(c.raw),
              measures[0]?.format,
            )}`,
        },
      },
    },
    scales: kind === 'pie' || kind === 'doughnut' ? undefined : {
      x: { stacked, ticks: { color: tick }, grid: { color: grid } },
      y: { stacked, ticks: { color: tick }, grid: { color: grid } },
    },
  }

  if (kind === 'pie') return <Pie data={data} options={options} />
  if (kind === 'doughnut') return <Doughnut data={data} options={options} />
  if (kind === 'line' || kind === 'area') return <Line data={data} options={options} />
  return <Bar data={data} options={options} />
}
```

- [ ] **Étape 6 : installer la dépendance manquante**

```bash
npm install react-chartjs-2
```

(⚠ `chart.js` est déjà présent ; vérifier avant d'installer, et ne rien ajouter d'autre.)

- [ ] **Étape 7 : lancer les tests, vérifier le succès**

Lancer : `npx vitest run src/features/bi/engine/formatValue.test.ts`
Attendu : 2 tests PASS.

- [ ] **Étape 8 : commit**

```bash
npx tsc -b && npm run lint && npm run dead
git add -A
git commit -m "feat(bi): KPI animé et graphes qui suivent le thème"
```

---

## Tâche 8 : table et tableau croisé

**Fichiers :**
- Créer : `src/features/bi/engine/pivot.ts`,
  `src/features/bi/components/tiles/TableTile.tsx`,
  `src/features/bi/components/tiles/PivotTile.tsx`
- Test : `src/features/bi/engine/pivot.test.ts`

**Interfaces :**
- Consomme : `AggregateResult`, `formatMeasure`.
- Produit : `toPivot(result: AggregateResult, rowDim: string, colDim: string, measureKey: string): PivotMatrix`
  avec `PivotMatrix = { columns: (string|null)[]; rows: { key: string|null; cells: (number|null)[]; total: number }[]; columnTotals: number[]; grandTotal: number }`.

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
// src/features/bi/engine/pivot.test.ts
import { describe, it, expect } from 'vitest'
import { toPivot } from './pivot'
import type { AggregateResult } from './aggregate'

const result: AggregateResult = {
  columns: [
    { key: 'brand', labelKey: 'bi.dim.brand', role: 'dimension' },
    { key: 'family', labelKey: 'bi.dim.family', role: 'dimension' },
    { key: 'count', labelKey: 'bi.measure.count', role: 'measure', format: 'int' },
  ],
  rows: [
    { brand: 'Makita', family: 'Perçage', count: 3 },
    { brand: 'Makita', family: 'Sciage', count: 2 },
    { brand: 'Bosch',  family: 'Perçage', count: 5 },
  ],
}

describe('toPivot', () => {
  it('croise deux dimensions et totalise les deux axes', () => {
    const p = toPivot(result, 'brand', 'family', 'count')
    expect(p.columns).toEqual(['Perçage', 'Sciage'])
    expect(p.rows.find((r) => r.key === 'Makita')?.cells).toEqual([3, 2])
    expect(p.rows.find((r) => r.key === 'Bosch')?.cells).toEqual([5, null])
    expect(p.columnTotals).toEqual([8, 2])
    expect(p.grandTotal).toBe(10)
  })

  it('laisse une cellule ABSENTE vide au lieu d’y écrire zéro', () => {
    // ⚠ « Bosch × Sciage » n'a pas été mesuré : ce n'est pas la même chose que zéro produit.
    const p = toPivot(result, 'brand', 'family', 'count')
    expect(p.rows.find((r) => r.key === 'Bosch')?.cells[1]).toBeNull()
  })
})
```

- [ ] **Étape 2 : lancer le test, vérifier l'échec**

Lancer : `npx vitest run src/features/bi/engine/pivot.test.ts`
Attendu : ÉCHEC — module introuvable.

- [ ] **Étape 3 : écrire le croisement**

```ts
// src/features/bi/engine/pivot.ts
// Résultat plat → matrice croisée. PUR. Le tableau croisé n'est pas un graphe : `chart.js`
// ne sait pas le faire, et c'est le visuel le plus utilisé d'un outil décisionnel.
import type { AggregateResult } from './aggregate'

export interface PivotMatrix {
  columns: (string | null)[]
  rows: { key: string | null; cells: (number | null)[]; total: number }[]
  columnTotals: number[]
  grandTotal: number
}

export function toPivot(
  result: AggregateResult, rowDim: string, colDim: string, measureKey: string,
): PivotMatrix {
  const columns: (string | null)[] = []
  const rowKeys: (string | null)[] = []
  const cells = new Map<string, number>()

  for (const r of result.rows) {
    const rk = (r[rowDim] ?? null) as string | null
    const ck = (r[colDim] ?? null) as string | null
    if (!rowKeys.some((k) => k === rk)) rowKeys.push(rk)
    if (!columns.some((k) => k === ck)) columns.push(ck)
    cells.set(JSON.stringify([rk, ck]), Number(r[measureKey] ?? 0))
  }

  const rows = rowKeys.map((key) => {
    // ⚠ `null` = croisement JAMAIS mesuré. Y écrire 0 affirmerait une absence de produits
    // qui n'a pas été constatée.
    const line = columns.map((c) => cells.get(JSON.stringify([key, c])) ?? null)
    return { key, cells: line, total: line.reduce<number>((n, v) => n + (v ?? 0), 0) }
  })

  const columnTotals = columns.map((_, i) => rows.reduce((n, r) => n + (r.cells[i] ?? 0), 0))
  return { columns, rows, columnTotals, grandTotal: columnTotals.reduce((n, v) => n + v, 0) }
}
```

- [ ] **Étape 4 : écrire les deux composants**

```tsx
// src/features/bi/components/tiles/TableTile.tsx
// Table détaillée. ⚠ Le débordement scrolle DANS la tuile (cf. TileFrame) : la page ne
// défile jamais horizontalement.
import { formatMeasure } from '../../engine/formatValue'
import { intlLocale, useTranslation } from '@/lib/i18n'
import type { AggregateResult } from '../../engine/aggregate'

export function TableTile({ result }: { result: AggregateResult }) {
  const { t, locale } = useTranslation()
  return (
    <table className="w-full text-[11px] tabular-nums">
      <thead className="sticky top-0 bg-surface">
        <tr className="text-white/40 text-left">
          {result.columns.map((c) => (
            <th key={c.key} className="font-medium py-1 pr-3 whitespace-nowrap">
              {t(c.labelKey as 'bi.measure.count')}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {result.rows.map((r, i) => (
          <tr key={i} className="border-t border-white/[0.04] hover:bg-white/[0.03]">
            {result.columns.map((c) => (
              <td key={c.key} className={`py-1 pr-3 ${c.role === 'measure' ? 'text-white/80 text-right' : 'text-white/60'}`}>
                {c.role === 'measure'
                  ? formatMeasure(r[c.key] as number | null, c.format, intlLocale(locale))
                  : (r[c.key] ?? '—')}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

```tsx
// src/features/bi/components/tiles/PivotTile.tsx
import { toPivot } from '../../engine/pivot'
import { formatMeasure } from '../../engine/formatValue'
import { intlLocale, useTranslation } from '@/lib/i18n'
import type { AggregateResult } from '../../engine/aggregate'

export function PivotTile({ result, columnDim }: { result: AggregateResult; columnDim?: string }) {
  const { t, locale } = useTranslation()
  const dims = result.columns.filter((c) => c.role === 'dimension')
  const measure = result.columns.find((c) => c.role === 'measure')
  // Deux dimensions sont nécessaires : sans elles, un croisement n'a pas de sens. On le DIT.
  if (dims.length < 2 || !measure) {
    return <p className="text-[11px] text-white/40">{t('bi.pivot.needsTwoDimensions')}</p>
  }
  const colDim = columnDim && dims.some((d) => d.key === columnDim) ? columnDim : dims[1].key
  const rowDim = dims.find((d) => d.key !== colDim)!.key
  const p = toPivot(result, rowDim, colDim, measure.key)
  const fmt = (v: number | null) => formatMeasure(v, measure.format, intlLocale(locale))

  return (
    <table className="w-full text-[11px] tabular-nums">
      <thead className="sticky top-0 bg-surface">
        <tr className="text-white/40">
          <th className="text-left font-medium py-1 pr-3">{t(dims[0].labelKey as 'bi.dim.taxo1')}</th>
          {p.columns.map((c) => (
            <th key={String(c)} className="text-right font-medium py-1 pr-3 whitespace-nowrap">{c ?? '—'}</th>
          ))}
          <th className="text-right font-semibold py-1 text-white/60">{t('bi.pivot.total')}</th>
        </tr>
      </thead>
      <tbody>
        {p.rows.map((r) => (
          <tr key={String(r.key)} className="border-t border-white/[0.04] hover:bg-white/[0.03]">
            <td className="py-1 pr-3 text-white/60">{r.key ?? '—'}</td>
            {r.cells.map((v, i) => (
              <td key={i} className="py-1 pr-3 text-right text-white/80">{fmt(v)}</td>
            ))}
            <td className="py-1 text-right font-semibold text-white">{fmt(r.total)}</td>
          </tr>
        ))}
        <tr className="border-t border-white/10">
          <td className="py-1 pr-3 font-semibold text-white/60">{t('bi.pivot.total')}</td>
          {p.columnTotals.map((v, i) => (
            <td key={i} className="py-1 pr-3 text-right font-semibold text-white/80">{fmt(v)}</td>
          ))}
          <td className="py-1 text-right font-semibold text-white">{fmt(p.grandTotal)}</td>
        </tr>
      </tbody>
    </table>
  )
}
```

- [ ] **Étape 5 : clés i18n**

`bi.pivot.total` (« Total » / « Total » / « Total »), `bi.pivot.needsTwoDimensions`
(FR : « Un tableau croisé demande deux dimensions »).

- [ ] **Étape 6 : lancer le test, vérifier le succès**

Lancer : `npx vitest run src/features/bi/engine/pivot.test.ts`
Attendu : 2 tests PASS.

- [ ] **Étape 7 : commit**

```bash
npx tsc -b && npm run lint
git add -A
git commit -m "feat(bi): table et tableau croisé — une cellule jamais mesurée reste vide"
```

---

## Tâche 9 : la grille, le geste

**Fichiers :**
- Créer : `src/features/bi/components/DashboardGrid.tsx`,
  `src/features/bi/hooks/useLayoutDraft.ts`
- Test : `src/features/bi/hooks/useLayoutDraft.test.ts`
- Modifier : `package.json` (dépendance `react-grid-layout` + `@types/react-grid-layout`)

**Interfaces :**
- Consomme : `TilePlacement`, `Tile`, `TileFrame`, `useTileData`.
- Produit : `useLayoutDraft(initial: TilePlacement[], onCommit: (l: TilePlacement[]) => void)`
  → `{ layout, setDraft, commit, undo, redo, canUndo, canRedo }` ;
  `DashboardGrid({ tiles, layout, editing, onLayoutChange, globalFilters })`.

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
// src/features/bi/hooks/useLayoutDraft.test.ts
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLayoutDraft } from './useLayoutDraft'
import type { TilePlacement } from '../types'

const initial: TilePlacement[] = [{ tileId: 't1', x: 0, y: 0, w: 3, h: 2 }]

describe('brouillon de mise en page', () => {
  it('n’ENREGISTRE PAS pendant le geste, seulement au relâchement', () => {
    // ⚠ Écrire à chaque pixel parcouru ferait tourner vingt tuiles branchées en direct à
    // chaque déplacement — et une écriture Firestore par image.
    const onCommit = vi.fn()
    const { result } = renderHook(() => useLayoutDraft(initial, onCommit))
    act(() => result.current.setDraft([{ tileId: 't1', x: 4, y: 0, w: 3, h: 2 }]))
    expect(onCommit).not.toHaveBeenCalled()
    act(() => result.current.commit())
    expect(onCommit).toHaveBeenCalledWith([{ tileId: 't1', x: 4, y: 0, w: 3, h: 2 }])
  })

  it('annule et refait le dernier geste', () => {
    const { result } = renderHook(() => useLayoutDraft(initial, vi.fn()))
    act(() => { result.current.setDraft([{ tileId: 't1', x: 4, y: 0, w: 3, h: 2 }]); result.current.commit() })
    act(() => result.current.undo())
    expect(result.current.layout[0].x).toBe(0)
    act(() => result.current.redo())
    expect(result.current.layout[0].x).toBe(4)
  })

  it('ne peut pas annuler avant le premier geste', () => {
    const { result } = renderHook(() => useLayoutDraft(initial, vi.fn()))
    expect(result.current.canUndo).toBe(false)
  })
})
```

- [ ] **Étape 2 : lancer le test, vérifier l'échec**

Lancer : `npx vitest run src/features/bi/hooks/useLayoutDraft.test.ts`
Attendu : ÉCHEC — module introuvable.

- [ ] **Étape 3 : écrire le brouillon de mise en page**

```ts
// src/features/bi/hooks/useLayoutDraft.ts
// La mise en page vit en état LOCAL pendant le geste et n'est persistée qu'au relâchement.
// Pile d'annulation bornée : cinquante gestes suffisent, et la mémoire reste plate.
import { useCallback, useRef, useState } from 'react'
import type { TilePlacement } from '../types'

const UNDO_MAX = 50

export function useLayoutDraft(initial: TilePlacement[], onCommit: (l: TilePlacement[]) => void) {
  const [layout, setLayout] = useState<TilePlacement[]>(initial)
  const past = useRef<TilePlacement[][]>([])
  const future = useRef<TilePlacement[][]>([])
  const [, force] = useState(0)
  const draft = useRef<TilePlacement[] | null>(null)

  const setDraft = useCallback((next: TilePlacement[]) => {
    draft.current = next
    setLayout(next)
  }, [])

  const commit = useCallback(() => {
    const next = draft.current
    if (!next) return
    past.current = [...past.current, layout === next ? initial : layout].slice(-UNDO_MAX)
    future.current = []
    draft.current = null
    onCommit(next)
    force((n) => n + 1)
  }, [layout, initial, onCommit])

  const undo = useCallback(() => {
    const prev = past.current.at(-1)
    if (!prev) return
    past.current = past.current.slice(0, -1)
    future.current = [layout, ...future.current]
    setLayout(prev)
    onCommit(prev)
    force((n) => n + 1)
  }, [layout, onCommit])

  const redo = useCallback(() => {
    const next = future.current[0]
    if (!next) return
    future.current = future.current.slice(1)
    past.current = [...past.current, layout]
    setLayout(next)
    onCommit(next)
    force((n) => n + 1)
  }, [layout, onCommit])

  return {
    layout, setDraft, commit, undo, redo,
    canUndo: past.current.length > 0, canRedo: future.current.length > 0,
  }
}
```

- [ ] **Étape 4 : installer la grille**

```bash
npm install react-grid-layout && npm install -D @types/react-grid-layout
```

- [ ] **Étape 5 : écrire la grille**

```tsx
// src/features/bi/components/DashboardGrid.tsx
// SEUL point de contact avec `react-grid-layout` : la lib reste remplaçable.
//
// ⚠ En consultation, aucune poignée : `isDraggable`/`isResizable` sont faux. Un tableau
// consulté ne se déforme pas d'un clic malheureux.
import GridLayout, { type Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { TileFrame } from './TileFrame'
import { KpiTile } from './tiles/KpiTile'
import { ChartTile } from './tiles/ChartTile'
import { TableTile } from './tiles/TableTile'
import { PivotTile } from './tiles/PivotTile'
import { useTileData } from '../hooks/useTileData'
import type { FilterClause, Tile, TilePlacement } from '../types'

const COLS = 12
const ROW_HEIGHT = 40

function TileBody({ tile, globalFilters, onClearFilters }: {
  tile: Tile; globalFilters: FilterClause[]; onClearFilters: () => void
}) {
  const { result, state, error, updatedAt, live, retry } = useTileData(tile.query, globalFilters)
  const skeleton = tile.kind === 'kpi' ? 'kpi' : tile.kind === 'table' || tile.kind === 'pivot' ? 'table' : 'chart'
  return (
    <TileFrame
      title={tile.title} updatedAt={updatedAt} live={live} state={state} error={error}
      skeleton={skeleton} onRetry={retry} onClearFilters={onClearFilters}
    >
      {result && (
        tile.kind === 'kpi' ? <KpiTile result={result} />
          : tile.kind === 'table' ? <TableTile result={result} />
          : tile.kind === 'pivot' ? <PivotTile result={result} columnDim={tile.options?.pivotColumn} />
          : <ChartTile result={result} kind={tile.kind} stacked={tile.options?.stacked} />
      )}
    </TileFrame>
  )
}

export function DashboardGrid({ tiles, layout, editing, width, globalFilters, onDrag, onCommit, onClearFilters }: {
  tiles: Tile[]
  layout: TilePlacement[]
  editing: boolean
  width: number
  globalFilters: FilterClause[]
  onDrag: (l: TilePlacement[]) => void
  onCommit: () => void
  onClearFilters: () => void
}) {
  const rgl: Layout[] = layout.map((l) => ({ i: l.tileId, x: l.x, y: l.y, w: l.w, h: l.h }))
  const toPlacements = (l: Layout[]): TilePlacement[] =>
    l.map((x) => ({ tileId: x.i, x: x.x, y: x.y, w: x.w, h: x.h }))

  return (
    <GridLayout
      className="layout"
      layout={rgl}
      cols={COLS}
      rowHeight={ROW_HEIGHT}
      width={width}
      margin={[12, 12]}
      isDraggable={editing}
      isResizable={editing}
      draggableHandle=".bi-tile-handle"
      // ⚠ Pendant le geste, on ne fait que MÉMORISER : l'écriture se fait au relâchement.
      onLayoutChange={(l) => onDrag(toPlacements(l))}
      onDragStop={onCommit}
      onResizeStop={onCommit}
    >
      {tiles.map((t) => (
        <div key={t.id}>
          <TileBody tile={t} globalFilters={globalFilters} onClearFilters={onClearFilters} />
        </div>
      ))}
    </GridLayout>
  )
}
```

- [ ] **Étape 6 : lancer les tests, vérifier le succès**

Lancer : `npx vitest run src/features/bi/hooks/useLayoutDraft.test.ts`
Attendu : 3 tests PASS.

- [ ] **Étape 7 : commit**

```bash
npx tsc -b && npm run lint && npm run dead
git add -A
git commit -m "feat(bi): la grille — le geste vit en local, l'écriture attend le relâchement"
```

---

## Tâche 10 : l'écran, la bascule de mode, le raccourci

**Fichiers :**
- Créer : `src/features/bi/components/BiScreen.tsx`,
  `src/features/bi/components/BiToolbar.tsx`
- Modifier : `src/pages/DashboardPage.tsx`

**Interfaces :**
- Consomme : `useDashboards`, `saveDashboard`, `DashboardGrid`, `useLayoutDraft`.
- Produit : `BiScreen()` — écran de premier niveau du module `bi`.

- [ ] **Étape 1 : écrire la barre d'outils**

```tsx
// src/features/bi/components/BiToolbar.tsx
// Sélecteur de tableau de bord + bascule de mode. ⚠ La bascule est EXPLICITE (bouton et
// touche « E ») : le mode consultation ne doit jamais laisser traîner une poignée.
import { Eye, Pencil, Undo2, Redo2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import type { Dashboard } from '../types'

export function BiToolbar({ items, currentId, onSelect, editing, onToggleEdit, canEdit, undo, redo, canUndo, canRedo }: {
  items: Dashboard[]
  currentId: string | null
  onSelect: (id: string) => void
  editing: boolean
  onToggleEdit: () => void
  canEdit: boolean
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={currentId ?? ''}
        onChange={(e) => onSelect(e.target.value)}
        className="bg-well border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
      >
        {items.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>

      {canEdit && (
        <button
          onClick={onToggleEdit}
          title={t('bi.toolbar.toggleHint')}
          className={`inline-flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 transition-colors ${
            editing ? 'bg-indigo-500 text-[#fff]' : 'bg-well text-white/70 hover:text-white'
          }`}
        >
          {editing ? <Pencil className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {editing ? t('bi.toolbar.editing') : t('bi.toolbar.viewing')}
        </button>
      )}

      {editing && (
        <div className="flex items-center gap-1">
          <button onClick={undo} disabled={!canUndo} title={t('bi.toolbar.undo')}
            className="p-1.5 rounded-lg bg-well text-white/60 hover:text-white disabled:opacity-30">
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={redo} disabled={!canRedo} title={t('bi.toolbar.redo')}
            className="p-1.5 rounded-lg bg-well text-white/60 hover:text-white disabled:opacity-30">
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Étape 2 : écrire l'écran**

```tsx
// src/features/bi/components/BiScreen.tsx
// Écran du module « Dashboard BI ». Assemblage seulement : le calcul vit dans le moteur,
// la mise en page dans `useLayoutDraft`, la persistance dans le store.
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useDashboards } from '../hooks/useDashboards'
import { useLayoutDraft } from '../hooks/useLayoutDraft'
import { saveDashboard } from '../store/dashboardsStore'
import { useWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { useCan } from '@/features/access/useAccess'
import { BiToolbar } from './BiToolbar'
import { DashboardGrid } from './DashboardGrid'
import { useTranslation } from '@/lib/i18n'
import type { TilePlacement } from '../types'

export function BiScreen() {
  const { t } = useTranslation()
  const uid = useWorkspaceUid()
  const canEdit = useCan('bi.edit')
  const items = useDashboards()
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [width, setWidth] = useState(1200)
  const boxRef = useRef<HTMLDivElement>(null)

  const current = useMemo(
    () => items.find((d) => d.id === currentId) ?? items[0] ?? null,
    [items, currentId],
  )

  // La grille exige une largeur en pixels : on la mesure et on la suit.
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const persist = (layout: TilePlacement[]) => {
    if (!uid || !current) return
    saveDashboard(uid, { ...current, layout }).catch((e: unknown) => {
      // ⚠ Un refus d'écriture doit se VOIR : sans règle Firestore, l'échec est silencieux.
      toast.error(e instanceof Error ? e.message : t('bi.save.failed'))
    })
  }
  const draft = useLayoutDraft(current?.layout ?? [], persist)

  /** Retire les filtres globaux — le geste proposé par une tuile vide. */
  const persistFilters = (filters: typeof current.filters) => {
    if (!uid || !current) return
    saveDashboard(uid, { ...current, filters }).catch((e: unknown) => {
      toast.error(e instanceof Error ? e.message : t('bi.save.failed'))
    })
  }

  // « E » bascule le mode, sauf pendant une saisie.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey) return
      if (e.key === 'e' || e.key === 'E') setEditing((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (items.length === 0) {
    return <p className="text-sm text-white/45 py-8 text-center">{t('bi.screen.empty')}</p>
  }

  return (
    <div className="space-y-4" ref={boxRef}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">{t('bi.screen.title')}</h1>
          <p className="text-sm text-white/50">{t('bi.screen.intro')}</p>
        </div>
        <BiToolbar
          items={items} currentId={current?.id ?? null} onSelect={setCurrentId}
          editing={editing} onToggleEdit={() => setEditing((v) => !v)}
          canEdit={canEdit}
          undo={draft.undo} redo={draft.redo} canUndo={draft.canUndo} canRedo={draft.canRedo}
        />
      </header>

      {current && (
        <DashboardGrid
          tiles={current.tiles}
          layout={draft.layout}
          editing={editing}
          width={width}
          globalFilters={current.filters}
          onDrag={draft.setDraft}
          onCommit={draft.commit}
          onClearFilters={() => persistFilters([])}
        />
      )}
    </div>
  )
}
```

- [ ] **Étape 3 : brancher l'écran dans la page**

Dans `src/pages/DashboardPage.tsx` :

```tsx
const BiScreen = lazy(() => import('@/features/bi/components/BiScreen').then((m) => ({ default: m.BiScreen })))
```

et, à la suite de la branche `watch-ops` :

```tsx
      ) : activeSection === 'bi' && canSee('bi') ? (
        <div className="flex-1 overflow-auto px-8 pb-8 bg-background">
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center h-full bg-background">
              <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
            </div>
          }>
            <BiScreen />
          </Suspense>
        </div>
```

- [ ] **Étape 4 : clés i18n**

`bi.screen.title` (« Dashboard BI »), `bi.screen.intro` (FR : « Vos tableaux de bord, sur
vos données, en direct. »), `bi.screen.empty` (FR : « Aucun tableau de bord — créez-en un
pour commencer. »), `bi.toolbar.viewing` (« Consultation »), `bi.toolbar.editing`
(« Édition »), `bi.toolbar.toggleHint` (« Basculer consultation / édition (E) »),
`bi.toolbar.undo`, `bi.toolbar.redo`, `bi.save.failed` (FR : « Enregistrement refusé. »).

- [ ] **Étape 5 : vérifier dans l'application**

Lancer : `npm run dev`, ouvrir le module « Dashboard BI ».
Attendu : sans tableau de bord, le message vide ; avec un document créé à la main dans
Firestore (une tuile KPI `count` sur `pim.products`), la tuile s'affiche, la bascule `E`
sort les poignées, un déplacement suivi d'un relâchement persiste la position (recharger la
page la conserve). ⚠ La création de tuiles depuis l'écran arrive à la tâche 11 : à ce stade,
le document se pose à la main, c'est normal.

- [ ] **Étape 6 : barrières complètes et commit**

```bash
npx tsc -b && npm run lint && npm run test:run && npm run dead && npm run cycles
git add -A
git commit -m "feat(bi): l'écran du module, consultation et édition"
```

---

## Tâche 11 : ajouter une tuile

⚠ Sans cette tâche, le lot 1 exigerait d'écrire les tuiles à la main dans Firestore : le
module serait lisible mais inutilisable. Le constructeur complet (rail des champs, zones
Mesures/Lignes/Colonnes) vient au lot 2 ; ici, le strict minimum pour poser une tuile.

**Fichiers :**
- Créer : `src/features/bi/components/AddTileMenu.tsx`, `src/features/bi/engine/newTile.ts`
- Test : `src/features/bi/engine/newTile.test.ts`
- Modifier : `src/features/bi/components/BiScreen.tsx`

**Interfaces :**
- Consomme : `Tile`, `TilePlacement`, `Dashboard`, `getSource`, `parseDashboard`.
- Produit : `newTile(kind: TileKind, source: SourceId, measureId: string, dimensionId?: string): Tile` ;
  `placeTile(layout: TilePlacement[], tileId: string, kind: TileKind): TilePlacement[]` ;
  `AddTileMenu({ onAdd })`.

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
// src/features/bi/engine/newTile.test.ts
import { describe, it, expect } from 'vitest'
import { newTile, placeTile } from './newTile'
import { parseDashboard, DASHBOARD_VERSION } from '../types'

describe('nouvelle tuile', () => {
  it('produit une tuile VALIDE au sens du contrat', () => {
    const tile = newTile('bar', 'pim.products', 'count', 'taxo.1')
    const layout = placeTile([], tile.id, 'bar')
    expect(() => parseDashboard({
      id: 'd', name: 'n', accountId: 'a', workspaceUid: 'w',
      version: DASHBOARD_VERSION, createdAt: 1, updatedAt: 1, createdBy: 'u',
      tiles: [tile], layout, filters: [],
    })).not.toThrow()
  })

  it('une tuile KPI n’a PAS de dimension — sinon elle rendrait plusieurs lignes', () => {
    expect(newTile('kpi', 'pim.products', 'count', 'taxo.1').query.dimensions).toEqual([])
  })

  it('pose la tuile SOUS les existantes, jamais par-dessus', () => {
    const layout = placeTile([{ tileId: 'a', x: 0, y: 0, w: 6, h: 4 }], 'b', 'bar')
    expect(layout[1].y).toBeGreaterThanOrEqual(4)
  })

  it('donne à chaque type sa taille de départ utilisable', () => {
    expect(placeTile([], 'k', 'kpi')[0].w).toBeLessThan(placeTile([], 'p', 'pivot')[0].w)
  })
})
```

- [ ] **Étape 2 : lancer le test, vérifier l'échec**

Lancer : `npx vitest run src/features/bi/engine/newTile.test.ts`
Attendu : ÉCHEC — module introuvable.

- [ ] **Étape 3 : écrire la fabrique**

```ts
// src/features/bi/engine/newTile.ts
// Fabrique d'une tuile par défaut. PUR — et son résultat DOIT passer `parseDashboard` :
// une tuile invalide serait écartée à la lecture, donc invisible sans un mot.
import { getSource } from '../registry/sources'
import type { SourceId, Tile, TileKind, TilePlacement } from '../types'

/** Taille de départ par type, en cellules de la grille (12 colonnes). */
const SIZES: Record<TileKind, { w: number; h: number }> = {
  kpi: { w: 3, h: 3 },
  bar: { w: 6, h: 6 }, line: { w: 6, h: 6 }, area: { w: 6, h: 6 },
  pie: { w: 4, h: 6 }, doughnut: { w: 4, h: 6 },
  table: { w: 6, h: 7 }, pivot: { w: 8, h: 7 },
}

export function newTile(kind: TileKind, source: SourceId, measureId: string, dimensionId?: string): Tile {
  const s = getSource(source)
  const measure = s.measures.find((m) => m.id === measureId) ?? s.measures[0]
  // ⚠ Une tuile KPI montre UNE valeur : lui donner une dimension produirait plusieurs
  // lignes dont une seule serait affichée — un chiffre faux, sans avertissement.
  const dimensions = kind === 'kpi' || !dimensionId ? [] : [{ id: dimensionId }]
  return {
    id: `t_${Date.now().toString(36)}_${Math.round(performance.now())}`,
    kind,
    title: '',
    query: { source, measures: [{ id: measure.id }], dimensions, filters: [] },
  }
}

/** Pose la tuile sous tout ce qui existe : recouvrir une tuile en place serait un vol. */
export function placeTile(layout: TilePlacement[], tileId: string, kind: TileKind): TilePlacement[] {
  const bottom = layout.reduce((y, l) => Math.max(y, l.y + l.h), 0)
  const { w, h } = SIZES[kind]
  return [...layout, { tileId, x: 0, y: bottom, w, h }]
}
```

- [ ] **Étape 4 : écrire le menu d'ajout**

```tsx
// src/features/bi/components/AddTileMenu.tsx
// Choix du visuel, de la mesure et de la dimension. Le geste complet (glisser un visuel sur
// la grille, brancher les champs) arrive au lot 2 ; ici on pose une tuile utilisable.
import { useState } from 'react'
import { BarChart3, LineChart, PieChart, Hash, Table2, Grid3x3, Plus } from 'lucide-react'
import { getSource } from '../registry/sources'
import { useTranslation } from '@/lib/i18n'
import type { SourceId, TileKind } from '../types'

const KINDS: { kind: TileKind; Icon: typeof BarChart3 }[] = [
  { kind: 'kpi', Icon: Hash }, { kind: 'bar', Icon: BarChart3 }, { kind: 'line', Icon: LineChart },
  { kind: 'pie', Icon: PieChart }, { kind: 'table', Icon: Table2 }, { kind: 'pivot', Icon: Grid3x3 },
]

export function AddTileMenu({ source, onAdd }: {
  source: SourceId
  onAdd: (kind: TileKind, measureId: string, dimensionId?: string) => void
}) {
  const { t } = useTranslation()
  const s = getSource(source)
  const [kind, setKind] = useState<TileKind>('bar')
  const [measureId, setMeasureId] = useState(s.measures[0].id)
  const [dimensionId, setDimensionId] = useState(s.dimensions[0].id)

  return (
    <div className="bg-surface rounded-lg p-3 flex flex-wrap items-end gap-2">
      <div className="flex items-center gap-1">
        {KINDS.map(({ kind: k, Icon }) => (
          <button
            key={k} onClick={() => setKind(k)} title={t(`bi.kind.${k}` as 'bi.kind.bar')}
            className={`p-1.5 rounded-lg transition-colors ${
              kind === k ? 'bg-indigo-500 text-[#fff]' : 'bg-well text-white/50 hover:text-white'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wider text-white/35">{t('bi.add.measure')}</span>
        <select value={measureId} onChange={(e) => setMeasureId(e.target.value)}
          className="bg-well border border-white/10 rounded-lg px-2 py-1 text-xs text-white">
          {s.measures.map((m) => <option key={m.id} value={m.id}>{t(m.labelKey)}</option>)}
        </select>
      </label>

      {kind !== 'kpi' && (
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-white/35">{t('bi.add.dimension')}</span>
          <select value={dimensionId} onChange={(e) => setDimensionId(e.target.value)}
            className="bg-well border border-white/10 rounded-lg px-2 py-1 text-xs text-white">
            {s.dimensions.map((d) => <option key={d.id} value={d.id}>{t(d.labelKey)}</option>)}
          </select>
        </label>
      )}

      <button
        onClick={() => onAdd(kind, measureId, kind === 'kpi' ? undefined : dimensionId)}
        className="inline-flex items-center gap-1.5 text-xs bg-indigo-500 hover:bg-indigo-600 text-[#fff] rounded-lg px-3 py-1.5 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />{t('bi.add.button')}
      </button>
    </div>
  )
}
```

- [ ] **Étape 5 : brancher dans l'écran**

Dans `BiScreen`, sous la barre d'outils et **uniquement en mode édition** :

```tsx
      {editing && current && (
        <AddTileMenu
          source="pim.products"
          onAdd={(kind, measureId, dimensionId) => {
            const tile = newTile(kind, 'pim.products', measureId, dimensionId)
            // Le titre par défaut nomme la mesure ET la dimension : « Nombre de produits
            // par Univers » se lit, « Sans titre » non.
            tile.title = t('bi.add.defaultTitle', {
              measure: t(getSource('pim.products').measures.find((m) => m.id === measureId)!.labelKey),
              dimension: dimensionId
                ? t(getSource('pim.products').dimensions.find((d) => d.id === dimensionId)!.labelKey)
                : '',
            })
            const layout = placeTile(current.layout, tile.id, kind)
            saveDashboard(uid!, { ...current, tiles: [...current.tiles, tile], layout })
              .catch((e: unknown) => toast.error(e instanceof Error ? e.message : t('bi.save.failed')))
          }}
        />
      )}
```

- [ ] **Étape 6 : clés i18n**

`bi.add.measure` (« Mesure »), `bi.add.dimension` (« Répartir par »), `bi.add.button`
(« Ajouter »), `bi.add.defaultTitle` (FR : « {measure} par {dimension} »), et un libellé par
visuel : `bi.kind.kpi`, `bi.kind.bar`, `bi.kind.line`, `bi.kind.pie`, `bi.kind.table`,
`bi.kind.pivot` — dans les trois catalogues.

- [ ] **Étape 7 : lancer les tests, vérifier le succès**

Lancer : `npx vitest run src/features/bi/engine/newTile.test.ts`
Attendu : 4 tests PASS.

- [ ] **Étape 8 : commit**

```bash
npx tsc -b && npm run lint && npm run test:run
git add -A
git commit -m "feat(bi): poser une tuile sans écrire dans la base à la main"
```

---

## Tâche 12 : recette visuelle et documentation

**Fichiers :**
- Modifier : `src/features/bi/components/BiScreen.tsx` (message vide → bouton de création)
- Créer : `src/features/bi/components/NewDashboardButton.tsx`
- Test : manuel, listé ci-dessous

**Interfaces :**
- Produit : `NewDashboardButton({ onCreated })` — crée un tableau de bord vide valide.

- [ ] **Étape 1 : écrire le bouton de création**

```tsx
// src/features/bi/components/NewDashboardButton.tsx
// Créer un tableau de bord VIDE mais VALIDE — un document qui ne passerait pas
// `parseDashboard` serait invisible dans la liste, sans que rien ne le dise.
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { saveDashboard } from '../store/dashboardsStore'
import { useWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { useAuthStore } from '@/stores/auth.store'
import { useAccessStore } from '@/stores/access.store'
import { DASHBOARD_VERSION } from '../types'
import { useTranslation } from '@/lib/i18n'

export function NewDashboardButton({ onCreated }: { onCreated: (id: string) => void }) {
  const { t } = useTranslation()
  const uid = useWorkspaceUid()
  const user = useAuthStore((s) => s.user)
  // ⚠ `accountId` vaut '' quand aucune société n'est rattachée — `??` ne le rattraperait pas.
  const accountId = useAccessStore((s) => s.accountId) || 'default'

  const create = async () => {
    if (!uid || !user) return
    const id = `bi_${Date.now().toString(36)}`
    try {
      await saveDashboard(uid, {
        id, name: t('bi.new.defaultName'), accountId, workspaceUid: uid,
        tiles: [], layout: [], filters: [],
        version: DASHBOARD_VERSION, createdAt: Date.now(), updatedAt: Date.now(), createdBy: user.uid,
      })
      onCreated(id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('bi.save.failed'))
    }
  }

  return (
    <button
      onClick={create}
      className="inline-flex items-center gap-1.5 text-xs bg-indigo-500 hover:bg-indigo-600 text-[#fff] rounded-lg px-3 py-1.5 transition-colors"
    >
      <Plus className="w-3.5 h-3.5" />{t('bi.new.button')}
    </button>
  )
}
```

Le brancher dans `BiScreen` : à côté du titre, et dans le message vide.
Clés i18n : `bi.new.button` (« Nouveau tableau de bord »), `bi.new.defaultName`
(« Sans titre »).

- [ ] **Étape 2 : recette manuelle (à cocher une par une)**

- [ ] Ajouter une tuile de chaque type depuis le menu : chacune s'affiche avec un titre
      lisible (« Nombre de produits par Univers »), sous les tuiles existantes.
- [ ] La bascule `E` sort et rentre les poignées ; en consultation, aucune poignée visible.
- [ ] Déplacer une tuile : les voisines s'écartent, la position tient après rechargement.
- [ ] Redimensionner par un coin : la tuile garde sa taille après rechargement.
- [ ] Une tuile en erreur (source inconnue) affiche son message et son bouton réessayer,
      **les autres tuiles continuent de fonctionner**.
- [ ] Un tableau croisé large scrolle **dans sa tuile** ; la page ne défile pas
      horizontalement.
- [ ] Thème clair : aucun texte illisible, les axes et la grille des graphes changent de
      couleur (vérifier avec le sélecteur de thème, puis en préférence système).
- [ ] Vingt tuiles : le déplacement reste fluide (pas de saccade visible).
- [ ] Un compte sans la permission `bi.view` ne voit pas l'entrée de menu ; un compte avec
      `bi.view` mais sans `bi.edit` ne voit pas le bouton d'édition et ne peut pas écrire
      (vérifier que l'écriture est bien refusée côté règles, pas seulement masquée).

- [ ] **Étape 3 : mettre à jour la documentation**

Ajouter au `CLAUDE.md`, section « Conventions », une ligne :
`Module BI : le contrat vit dans src/features/bi/types.ts ; toute spec entrant dans le module passe par parseDashboard.`

- [ ] **Étape 4 : commit final des lots 0 et 1**

```bash
npx tsc -b && npm run lint && npm run test:run && npm run dead && npm run cycles
npm run build
git add -A
git commit -m "feat(bi): création d'un tableau de bord et recette visuelle des lots 0 et 1"
firebase deploy --only hosting
```

---

## Ce que ces deux lots ne font pas

À traiter dans les plans suivants, dans cet ordre :

- **Lot 2** — constructeur : palette de visuels glissable, rail des champs, zones
  Mesures / Lignes / Colonnes / Filtres, filtres globaux, filtrage croisé au clic, forage.
- **Lot 3** — sources massives : agrégation serveur pour la veille (1,3 M de lignes), photos
  nocturnes et axe du temps.
- **Lot 4** — diffusion : export PNG/PDF/Excel, mail planifié, alertes de seuil, partage par
  jeton révocable.
- **Lot 5** — prompt → tableau de bord.
