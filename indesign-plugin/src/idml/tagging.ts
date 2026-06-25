// indesign-plugin/src/idml/tagging.ts
import { slugifyTag } from '../lib/slug'

// Le module 'indesign' fournit l'objet app au runtime UXP.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { app } = require('indesign') as { app: any }

/** Id de la story d'un objet (cadre, texte, ou XMLElement) — pour comparer « même bloc ». */
function storyIdOf(obj: any): number | null {
  try {
    if (obj?.parentStory?.id != null) return obj.parentStory.id
    const t = obj?.texts?.item?.(0)
    if (t?.parentStory?.id != null) return t.parentStory.id
    const c = obj?.xmlContent
    if (c?.parentStory?.id != null) return c.parentStory.id
    const tf = obj?.parentTextFrames?.[0]
    if (tf?.parentStory?.id != null) return tf.parentStory.id
  } catch { /* */ }
  return null
}

/** Collecte tous les XMLElement portant un tag donné (parcours récursif). */
function collectByTag(doc: any, tagName: string): any[] {
  const out: any[] = []
  const walk = (el: any) => {
    const n = el.xmlElements?.length ?? 0
    for (let i = 0; i < n; i++) {
      const child = el.xmlElements.item(i)
      if (child.markupTag?.name === tagName) out.push(child)
      walk(child)
    }
  }
  const root = doc.xmlElements?.item(0)
  if (root) walk(root)
  return out
}

/** Récupère le XMLTag par nom (slugifié) ou le crée. */
export function ensureTag(doc: any, name: string): any {
  const tagName = slugifyTag(name)
  const existing = doc.xmlTags.itemByName(tagName)
  if (existing && existing.isValid) return existing
  return doc.xmlTags.add(tagName)
}

/**
 * Enrobe la sélection courante (texte ou cadre image) dans un XMLElement lié
 * au tag. Le root XMLElement (doc.xmlElements[0]) est le parent.
 * Produit, à l'export IDML : <XMLElement MarkupTag="XMLTag/<name>"> que
 * Web2Print relit via xmlElementStory.ts (flatten → {{<name>}}).
 */
export function applyTagToSelection(name: string): { ok: boolean; message?: string } {
  const doc = app.activeDocument
  if (!doc) return { ok: false, message: 'Aucun document ouvert' }
  const sel = app.selection
  if (!sel || sel.length === 0) return { ok: false, message: 'Sélectionne un texte ou un cadre' }

  const tagName = slugifyTag(name)
  // Garde-fou anti-doublon : refuser si un élément de ce tag existe déjà dans la même
  // story que la sélection (= le même bloc de texte). Évite les ×N en recliquant.
  try {
    const selStory = storyIdOf(sel[0])
    if (selStory != null) {
      for (const el of collectByTag(doc, tagName)) {
        if (storyIdOf(el) === selStory) {
          return { ok: false, message: `« ${name} » déjà posé sur ce bloc` }
        }
      }
    }
  } catch { /* impossible de vérifier : on pose normalement */ }

  const tag = ensureTag(doc, name)
  const root = doc.xmlElements.item(0)
  // Toujours baliser le TEXTE du bloc : si on a sélectionné un CADRE, on cible son
  // texte (→ crochets + cohérent avec les autres champs + meilleur pour la fusion).
  let target = sel[0]
  try {
    if (String(sel[0]?.constructor?.name) === 'TextFrame') {
      const t = sel[0].texts?.item?.(0)
      if (t && t.isValid) target = t
    }
  } catch { /* on garde la sélection telle quelle */ }
  try {
    root.xmlElements.add(tag, target)
    return { ok: true }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}

/** Compte les XMLElement par nom de tag (parcours récursif de l'arbre XML). */
export function countTaggedByName(doc: any): Record<string, number> {
  const counts: Record<string, number> = {}
  const walk = (el: any) => {
    const n = el.xmlElements?.length ?? 0
    for (let i = 0; i < n; i++) {
      const child = el.xmlElements.item(i)
      const tagName = child.markupTag?.name
      if (tagName) counts[tagName] = (counts[tagName] ?? 0) + 1
      walk(child)
    }
  }
  const root = doc.xmlElements?.item(0)
  if (root) walk(root)
  return counts
}
