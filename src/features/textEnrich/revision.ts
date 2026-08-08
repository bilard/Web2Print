// Enrichissement des textes produit : la FORME d'une révision et les décisions qui
// l'entourent. PUR — aucune dépendance React, Firebase ou LLM.
//
// ⚠ Où vit une révision, et pourquoi PAS dans une collection à part. Le catalogue compte
// 115 000 produits ; à quelques champs chacun, une collection de révisions atteindrait
// des centaines de milliers de documents, un écrit par révision, avec des index composés
// pour la filtrer et un retour arrière qui toucherait des milliers de documents. La
// révision vit donc SUR LE CHAMP qu'elle modifie (`ProductField.enrich`), et un document
// de SYNTHÈSE par passage énumère les produits touchés. L'écran lit la synthèse, charge
// ces produits, et le retour arrière n'est qu'une écriture de champ sur des documents
// déjà en main.
//
// Conséquence heureuse : l'original voyage avec le champ auquel il appartient. Il survit
// donc à un export, à une copie de projet, à une reprise de sauvegarde — là où une
// collection annexe se serait désolidarisée au premier de ces gestes.
import type { CellValue } from '@/features/excel/types'

/** Ce qu'un passage fait à un champ. Un seul par révision : un texte traduit PUIS
 *  restructuré produit deux révisions successives, chacune avec son avant/après. */
export type EnrichKind = 'translate' | 'improve' | 'structure'

export interface FieldEnrichment {
  /** Valeur d'ORIGINE, avant la toute première révision de ce champ.
   *
   *  ⚠ Jamais écrasée par une révision ultérieure : c'est la donnée fournisseur, le seul
   *  point de retour qui ait un sens. Un « original » qui serait la sortie du passage
   *  précédent ne permettrait plus de revenir à la source. */
  original: CellValue
  kind: EnrichKind
  /** Langue détectée en entrée (code court : 'nl', 'de', 'en'…), quand elle l'a été. */
  sourceLang?: string
  /** Langue produite. 'fr' aujourd'hui ; le champ existe pour que d'autres cibles
   *  n'imposent pas de migration. */
  targetLang: string
  /** Passage qui a produit cette révision — clé de jointure avec sa synthèse. */
  passId: string
  at: number
  provider?: string
  model?: string
  /**
   * Marqueur d'IDEMPOTENCE : ce qui a produit cette valeur.
   *
   * ⚠ Ne peut pas se réduire à « le champ est en français maintenant ». Un passage écrit
   * directement ; sans marqueur, le suivant retraduirait ce que le premier a produit —
   * et un texte réécrit deux fois dérive. Mais un marqueur qui ne serait QUE « déjà
   * traité » interdirait de rejouer après avoir amélioré la consigne. Il porte donc la
   * VERSION de la consigne : changer la consigne rend le champ à nouveau éligible,
   * laisser la consigne inchangée le laisse tranquille.
   */
  marker: string
}

/** Un champ produit, augmenté de sa révision éventuelle. Reprend `ProductField` du PIM
 *  sans l'importer : ce module est pur et doit rester testable seul. */
export interface EnrichableField {
  value: CellValue
  enrich?: FieldEnrichment
}

/** Construit le marqueur d'idempotence. Stable, lisible dans la base, et distinct dès
 *  qu'une des trois composantes change. */
export function buildMarker(kind: EnrichKind, targetLang: string, promptVersion: string): string {
  return `${kind}:${targetLang}:${promptVersion}`
}

export interface EligibilityOptions {
  kind: EnrichKind
  targetLang: string
  promptVersion: string
  /** En deçà de ce nombre de caractères, un texte est jugé trop pauvre (0 = pas de seuil). */
  minLength: number
  /** Langue détectée du texte courant, si on la connaît. */
  detectedLang?: string
  /** Traiter les champs VIDES ? Un champ vide n'a rien à traduire, mais peut être
   *  construit par gabarit à partir d'autres colonnes. */
  includeEmpty?: boolean
}

export type Ineligible =
  | 'already-done'   // même consigne, même cible : rien à refaire
  | 'empty'          // rien à traiter et les vides sont exclus
  | 'long-enough'    // au-dessus du seuil, et déjà dans la langue cible
  | 'not-applicable' // rien ne s'applique à ce champ

/**
 * Ce champ mérite-t-il un passage ? Rend `null` s'il le mérite, sinon la RAISON du refus.
 *
 * Rendre la raison plutôt qu'un booléen n'est pas un luxe : c'est ce qui permet au
 * passage de dire « 112 000 champs ignorés dont 109 000 déjà traités » plutôt qu'un
 * silence dans lequel on ne distingue pas un filtre trop strict d'une panne.
 */
export function eligibility(field: EnrichableField, opts: EligibilityOptions): Ineligible | null {
  const marker = buildMarker(opts.kind, opts.targetLang, opts.promptVersion)
  if (field.enrich?.marker === marker) return 'already-done'

  const text = typeof field.value === 'string' ? field.value.trim() : String(field.value ?? '').trim()
  if (!text) return opts.includeEmpty ? null : 'empty'

  // Traduction : seule la langue décide. Un texte néerlandais parfaitement rédigé doit
  // passer, un texte français bancal n'a rien à y faire.
  if (opts.kind === 'translate') {
    if (!opts.detectedLang || opts.detectedLang === opts.targetLang) return 'long-enough'
    return null
  }

  // Enrichissement et mise en forme : c'est la longueur qui trie.
  if (opts.minLength > 0 && text.length >= opts.minLength) return 'long-enough'
  return null
}

/**
 * Applique une révision à un champ.
 *
 * ⚠ `original` n'est capturé qu'à la PREMIÈRE révision. Aux suivantes, on garde celui
 * déjà en place : c'est la donnée fournisseur, et c'est vers elle que le retour arrière
 * doit ramener — pas vers la sortie du passage précédent.
 */
export function applyRevision(
  field: EnrichableField,
  next: string,
  meta: Omit<FieldEnrichment, 'original' | 'marker'> & { promptVersion: string },
): EnrichableField {
  return {
    value: next,
    enrich: {
      original: field.enrich?.original ?? field.value,
      kind: meta.kind,
      ...(meta.sourceLang ? { sourceLang: meta.sourceLang } : {}),
      targetLang: meta.targetLang,
      passId: meta.passId,
      at: meta.at,
      ...(meta.provider ? { provider: meta.provider } : {}),
      ...(meta.model ? { model: meta.model } : {}),
      marker: buildMarker(meta.kind, meta.targetLang, meta.promptVersion),
    },
  }
}

/**
 * Ramène un champ à son état d'origine. Le marqueur disparaît AVEC la révision : un champ
 * rejeté doit redevenir éligible, sinon rejeter une mauvaise traduction interdirait d'en
 * obtenir une bonne.
 */
export function revertRevision(field: EnrichableField): EnrichableField {
  if (!field.enrich) return field
  return { value: field.enrich.original }
}

/** Une révision est-elle en place sur ce champ ? */
export function isEnriched(field: EnrichableField): boolean {
  return !!field.enrich
}

/** Synthèse d'un passage : ce que l'écran de comparaison lit en premier. */
export interface EnrichPass {
  passId: string
  at: number
  /** Ce que le passage a traité, pour le rejouer ou le comprendre après coup. */
  kind: EnrichKind
  targetLang: string
  promptVersion: string
  fields: string[]
  /** Produits touchés — l'écran les charge à la demande plutôt que de dupliquer les
   *  textes ici, qui pèseraient et divergeraient de la donnée. */
  productIds: string[]
  counts: {
    considered: number
    revised: number
    /** Refusés par la vérification des éléments intouchables (référence altérée…). */
    rejected: number
    skipped: Record<Ineligible, number>
  }
  /** Dépense du passage, si le routeur l'a rapportée. */
  costUsd?: number
  /** Vrai si le passage s'est arrêté sur son plafond — il reste donc du travail. */
  cappedBy?: 'spend' | 'rows'
}

/** Compteurs vierges d'un passage. Toutes les raisons de refus sont présentes dès le
 *  départ, à zéro : un passage qui n'écarte rien pour une raison donnée doit l'afficher
 *  « 0 » et non l'omettre — une absence se lit comme un oubli de comptage. */
export function newPassCounts(): EnrichPass['counts'] {
  return {
    considered: 0,
    revised: 0,
    rejected: 0,
    skipped: { 'already-done': 0, empty: 0, 'long-enough': 0, 'not-applicable': 0 },
  }
}

/**
 * Enregistre le sort d'UN champ dans les compteurs du passage.
 *
 * `considered` est incrémenté à chaque champ vu, quel que soit son sort : c'est le
 * dénominateur, et sans lui « 412 révisés » ne dit pas s'il en restait 500 ou 200 000.
 */
export function countOutcome(
  counts: EnrichPass['counts'],
  outcome: { revised: boolean; rejected?: boolean; skipped?: Ineligible | null },
): EnrichPass['counts'] {
  const next: EnrichPass['counts'] = { ...counts, skipped: { ...counts.skipped } }
  next.considered++
  if (outcome.skipped) next.skipped[outcome.skipped]++
  else if (outcome.rejected) next.rejected++
  else if (outcome.revised) next.revised++
  return next
}
