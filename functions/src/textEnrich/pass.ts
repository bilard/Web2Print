// functions/src/textEnrich/pass.ts
// ⚠ COPIE de src/features/textEnrich/pass.ts (bundles séparés : `functions/` est hermétique,
// `rootDir: "src"`). Toute modification là-bas doit être reportée ici — cf.
// textEnrichParity.test.ts.
// Un PASSAGE d'enrichissement : ce qu'il y a à faire, puis comment le faire.
//
// Deux moitiés délibérément séparées. `planPass` DÉCIDE — pur, sans réseau, testable, et
// c'est lui qui dit « 412 champs à traiter sur 231 000 » avant qu'un centime ne soit
// dépensé. `runPass` EXÉCUTE, avec ses dépendances injectées.
//
// ⚠ L'exécution ne réinvente pas l'orchestration des lots : elle réutilise
// `runCompletionBatches` (`excel/ai-completion/`), qui porte déjà l'arrêt propre entre
// lots, le coupe-circuit à trois échecs consécutifs et l'espacement des appels. Un second
// orchestrateur aurait divergé du premier au premier correctif.
import type { CellValue, ExcelRow, ExcelColumn } from '../excel/types'
import { runCompletionBatches } from './batches'
import { detectLanguage } from './detectLang'
import { findViolations, type ProtectedOptions, type Violation } from './protected'
import {
  eligibility, applyRevision, newPassCounts, countOutcome, countConsidered,
  type EnrichableField, type EnrichPass,
} from './revision'
import type { FieldPlan } from './fieldPlan'

/** Un produit tel que le passage le voit. `row` sert aux gabarits (colonnes voisines). */
export interface EnrichTarget {
  id: string
  fields: Record<string, EnrichableField>
  row?: Record<string, CellValue>
}

/** Un travail à faire : UN champ d'UN produit. */
export interface EnrichUnit {
  productId: string
  field: string
  plan: FieldPlan
  /** Valeur courante du champ, celle qui sera remplacée. */
  text: string
  /** Langue détectée, quand elle l'a été (jamais devinée — cf. `detectLang`). */
  sourceLang?: string
  row: Record<string, CellValue>
}

export interface PlanResult {
  units: EnrichUnit[]
  counts: EnrichPass['counts']
}

/**
 * Ce qu'il y a à faire, sans rien faire.
 *
 * Rendre les compteurs AVEC les unités permet d'annoncer le travail avant de le lancer :
 * « 412 champs à traiter, 109 000 déjà faits, 3 200 trop courts ». Sans ce chiffrage
 * préalable, on découvre le volume — et la facture — une fois le passage lancé.
 */
export function planPass(targets: EnrichTarget[], plans: FieldPlan[]): PlanResult {
  const units: EnrichUnit[] = []
  let counts = newPassCounts()

  for (const target of targets) {
    for (const plan of plans) {
      counts = countConsidered(counts)
      const field = target.fields[plan.key]
      // Un champ absent du produit n'est pas un refus à comptabiliser comme les autres :
      // le plan vise une colonne que ce produit n'a pas.
      if (!field) {
        counts = countOutcome(counts, { revised: false, skipped: 'not-applicable' })
        continue
      }
      const text = field.value == null ? '' : String(field.value)
      // La langue n'est cherchée que pour une traduction : ailleurs, elle ne décide de
      // rien et la calculer serait du travail perdu sur des centaines de milliers de champs.
      const sourceLang = plan.kind === 'translate' ? (detectLanguage(text).lang ?? undefined) : undefined

      const refusal = eligibility(field, {
        kind: plan.kind,
        targetLang: 'fr',
        promptVersion: plan.promptVersion,
        minLength: plan.minLength,
        detectedLang: sourceLang,
        includeEmpty: plan.includeEmpty,
      })
      if (refusal) {
        counts = countOutcome(counts, { revised: false, skipped: refusal })
        continue
      }
      units.push({
        productId: target.id,
        field: plan.key,
        plan,
        text,
        ...(sourceLang ? { sourceLang } : {}),
        row: target.row ?? {},
      })
    }
  }
  return { units, counts }
}

export interface RunPassDeps {
  /** Produit les textes d'un lot : identifiant d'unité → texte proposé. */
  callBatch: (units: EnrichUnit[]) => Promise<Record<string, string>>
  /** Éléments intouchables de ce produit (références, codes-barres, marques). */
  protectedOf: (unit: EnrichUnit) => ProtectedOptions
  /** Écrit la révision retenue. */
  onRevision: (unit: EnrichUnit, field: EnrichableField) => void
  /** Signale une proposition refusée par la vérification, avec ce qu'elle a cassé. */
  onRejected?: (unit: EnrichUnit, violations: Violation[]) => void
  /** Dépense cumulée du passage, en dollars. Consultée ENTRE les lots. */
  spentUsd?: () => number
  /** Plafond de dépense. Atteint, le passage s'arrête proprement et le dit. */
  capUsd?: number
  onChunkDone?: (done: number, total: number) => void
  now?: () => number
  passId: string
  provider?: string
  model?: string
  chunkSize?: number
}

export interface RunPassResult {
  counts: EnrichPass['counts']
  productIds: string[]
  cappedBy?: 'spend'
}

/** Identifiant d'une unité dans un lot. Doit être stable et unique : deux champs d'un
 *  même produit voyagent ensemble. */
export function unitKey(unit: EnrichUnit): string {
  return `${unit.productId}::${unit.field}`
}

/**
 * Exécute un passage.
 *
 * ⚠ Le plafond de dépense s'applique ENTRE les lots, jamais au milieu : couper un lot en
 * cours perdrait des réponses déjà payées. Le passage s'arrête donc au premier lot
 * franchissant le plafond et le signale (`cappedBy`), pour que la reprise sache qu'il
 * reste du travail — un passage qui s'arrête en silence se lit comme un passage terminé.
 */
export async function runPass(
  units: EnrichUnit[],
  base: EnrichPass['counts'],
  deps: RunPassDeps,
): Promise<RunPassResult> {
  let counts = base
  const touched = new Set<string>()
  const now = deps.now ?? (() => Date.now())
  const abortRef = { current: false }
  let capped = false

  // `runCompletionBatches` raisonne en lignes de tableur : on lui présente chaque unité
  // sous cette forme, sans que le reste du moteur ait à connaître le modèle Excel.
  const rows: ExcelRow[] = units.map((u) => ({ _id: unitKey(u) } as ExcelRow))
  const byKey = new Map(units.map((u) => [unitKey(u), u]))
  const columns: ExcelColumn[] = []

  await runCompletionBatches(
    rows,
    // Le prompt réel est construit par `callBatch`, qui a les unités : celui-ci ne sert
    // qu'au filtre de lignes vides de l'orchestrateur, et nos unités sont déjà filtrées.
    '.',
    columns,
    {
      callBatch: async (chunk) => {
        const chunkUnits = chunk.map((r) => byKey.get(r._id)!).filter(Boolean)
        return deps.callBatch(chunkUnits)
      },
      onItem: (rowId, status, value) => {
        const unit = byKey.get(rowId)
        if (!unit) return
        if (status !== 'done' || !value) {
          // Échec, saut ou abandon : rien n'est écrit. Le champ reste éligible pour le
          // passage suivant, ce qui est le comportement voulu.
          counts = countOutcome(counts, { revised: false })
          return
        }
        const violations = findViolations(unit.text, value, deps.protectedOf(unit))
        if (violations.length > 0) {
          deps.onRejected?.(unit, violations)
          counts = countOutcome(counts, { revised: false, rejected: true })
          return
        }
        const field: EnrichableField = { value: unit.text }
        deps.onRevision(unit, applyRevision(field, value, {
          kind: unit.plan.kind,
          targetLang: 'fr',
          promptVersion: unit.plan.promptVersion,
          passId: deps.passId,
          at: now(),
          ...(unit.sourceLang ? { sourceLang: unit.sourceLang } : {}),
          ...(deps.provider ? { provider: deps.provider } : {}),
          ...(deps.model ? { model: deps.model } : {}),
        }))
        touched.add(unit.productId)
        counts = countOutcome(counts, { revised: true })
      },
      onChunkDone: (index, total) => {
        // ⚠ Le moteur compte des LOTS ; le journal parle de CHAMPS. Remonter l'index de
        // lot tel quel affichait « 97 / 5 789 champs traités » après deux heures alors
        // que 1 940 champs étaient faits — de quoi croire à une lenteur d'un facteur
        // vingt, et arrêter un run qui se portait bien.
        const perChunk = total > 0 ? Math.ceil(units.length / total) : 1
        deps.onChunkDone?.(Math.min(units.length, (index + 1) * perChunk), units.length)
        // Le plafond est consulté ici, entre deux lots : c'est le seul endroit où
        // s'arrêter ne perd rien de déjà payé.
        if (deps.capUsd != null && deps.spentUsd && deps.spentUsd() >= deps.capUsd) {
          capped = true
          abortRef.current = true
        }
      },
      abortRef,
    },
    deps.chunkSize ?? 20,
  )

  return { counts, productIds: [...touched], ...(capped ? { cappedBy: 'spend' as const } : {}) }
}
