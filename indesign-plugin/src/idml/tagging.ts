// indesign-plugin/src/idml/tagging.ts
import { slugifyTag } from '../lib/slug'

// Le module 'indesign' fournit l'objet app au runtime UXP.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { app } = require('indesign') as { app: any }

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

  const tag = ensureTag(doc, name)
  const root = doc.xmlElements.item(0)
  try {
    // root.xmlElements.add(tag, storyContent) — storyContent = sélection texte/cadre
    root.xmlElements.add(tag, sel[0])
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
