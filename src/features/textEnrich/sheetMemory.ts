// Mémoire d'un passage sur FEUILLE : ce qui a déjà été traité, et ce que la source a
// changé depuis. PUR.
//
// ⚠ Le mode feuille n'a aucune mémoire : la feuille traverse le graphe et meurt avec le
// run. Chaque exécution refaisait donc — et refacturait — le catalogue entier, ce qui
// interdisait purement et simplement un passage quotidien. Ce module donne le juge ; le
// magasin, lui, vit à côté.
//
// ⚠⚠ LA CLÉ N'EST PAS LE NUMÉRO DE LIGNE. Les lignes importées sont numérotées par
// POSITION (`row_0`, `row_1`…) : il suffit qu'un produit soit inséré ou retiré chez le
// fournisseur pour que tous les identifiants suivants se décalent — et un catalogue qui
// reçoit des produits chaque jour, c'est exactement ça. La mémoire serait alors un
// coup d'épée dans l'eau, invisible autrement que sur la facture. On clefe donc sur la
// RÉFÉRENCE ARTICLE, celle-là même que la carte connaît déjà pour protéger les codes.
/** Une ligne de feuille, telle que le mode feuille la manipule (cf. `SheetRow`). */
export type MemoryRow = Record<string, unknown>

/**
 * Empreinte courte d'un texte source.
 *
 * ⚠ On ne stocke PAS le texte : à cent quinze mille lignes et deux champs, la mémoire
 * pèserait plus lourd que le catalogue qu'elle accompagne. Une collision ferait sauter une
 * fiche pourtant modifiée — un texte non retraité, jamais un texte faux — et suppose que
 * deux versions d'un même champ tombent sur la même valeur : de l'ordre du milliardième.
 */
export function textFingerprint(v: unknown): string {
  const s = (v == null ? '' : String(v)).trim().toLowerCase()
  // FNV-1a 32 bits : court, sans dépendance, et suffisant pour dire « ce n'est plus le
  // même texte ».
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `${s.length.toString(36)}.${h.toString(36)}`
}

/**
 * Clé de mémoire d'une ligne : la référence article, à défaut le code-barres.
 *
 * Rend `null` quand ni l'une ni l'autre n'est renseignée — la ligne est alors traitée à
 * chaque passage, faute de pouvoir la reconnaître. C'est le comportement d'avant, et il
 * vaut mieux qu'une mémoire qui rangerait deux produits différents sous la même clé.
 */
export function memoryKey(row: MemoryRow, cols: { ref?: string; ean?: string }): string | null {
  for (const col of [cols.ref, cols.ean]) {
    if (!col) continue
    const v = row[col]
    const s = v == null ? '' : String(v).trim()
    if (s) return s
  }
  return null
}

/** Ce que la mémoire retient d'une ligne : par champ, l'empreinte du texte traité. */
type RowMemory = Record<string, string>
export type EnrichMemory = Record<string, RowMemory>

/** Pourquoi une ligne entre dans le passage. */
type SheetReason = 'new' | 'changed' | 'unknown-key'

export interface SheetDecision {
  row: MemoryRow
  key: string | null
  reason: SheetReason
  /** Champs à traiter sur cette ligne : ceux que la source a changés, ou tous si neuve. */
  fields: string[]
}

/**
 * Les lignes à reprendre, et pourquoi.
 *
 * ⚠ Une ligne dont UN SEUL champ a changé n'entre que pour ce champ : retraiter le nom
 * parce que le texte de vente a bougé, c'est repayer un travail déjà fait — et écraser
 * une traduction que rien ne remettait en cause.
 */
export function sheetQueue(
  rows: MemoryRow[],
  fields: string[],
  memory: EnrichMemory,
  cols: { ref?: string; ean?: string },
): SheetDecision[] {
  const out: SheetDecision[] = []
  for (const row of rows) {
    const key = memoryKey(row, cols)
    if (!key) { out.push({ row, key: null, reason: 'unknown-key', fields }); continue }
    const known = memory[key]
    if (!known) { out.push({ row, key, reason: 'new', fields }); continue }
    const changed = fields.filter((f) => known[f] !== textFingerprint(row[f] ?? null))
    if (changed.length > 0) out.push({ row, key, reason: 'changed', fields: changed })
  }
  return out
}

/**
 * La mémoire mise à jour après un passage.
 *
 * ⚠ FUSIONNÉE, jamais remplacée : un passage borné à cinq cents fiches ne doit pas effacer
 * ce que les précédents savaient des cent quinze mille autres — elles repartiraient toutes
 * au passage suivant.
 */
export function rememberRows(
  memory: EnrichMemory,
  decisions: SheetDecision[],
  cols: { ref?: string; ean?: string },
): EnrichMemory {
  const next: EnrichMemory = { ...memory }
  for (const d of decisions) {
    const key = d.key ?? memoryKey(d.row, cols)
    if (!key) continue
    const entry: RowMemory = { ...(next[key] ?? {}) }
    for (const f of d.fields) entry[f] = textFingerprint(d.row[f] ?? null)
    next[key] = entry
  }
  return next
}
