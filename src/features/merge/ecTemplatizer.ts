// Templatisation EasyCatalog : réinjecte des placeholders {{champ}} entre les marqueurs
// ECTagData ($ID/4 ouvre / $ID/5 ferme) d'un IDML source, pour que patchStories les résolve
// par ligne tout en conservant les marqueurs (→ EasyCatalog reconnaît ses champs nativement).
import { parseEcTag } from '@/features/easycatalog/ecIdmlImport'
import type { IdmlZipContents } from '@/features/idml/assemblyLoader'

/** Templatise une story XML : remplace la valeur des champs EC par {{champ}}, marqueurs conservés. */
export function templatizeEcStory(xml: string): string {
  if (!xml.includes('ECTagData')) return xml
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) return xml

  const csrs = Array.from(doc.getElementsByTagName('CharacterStyleRange'))
  let ecField: string | null = null
  let emitted = false

  for (const csr of csrs) {
    const tag = parseEcTag(csr.getAttribute('ECTagData'))
    if (tag.kind === 'open') {
      ecField = tag.field ?? null
      emitted = false
      continue // marqueur : laisser tel quel (U+FEFF)
    }
    if (tag.kind === 'close') {
      ecField = null
      emitted = false
      continue // marqueur : laisser tel quel
    }
    if (!ecField) continue // texte hors champ : inchangé

    // run de valeur d'un champ : retirer les Content/Br existants
    for (const node of Array.from(csr.childNodes)) {
      if (node.nodeType === 1) {
        const t = (node as Element).tagName
        if (t === 'Content' || t === 'Br') csr.removeChild(node)
      }
    }
    if (!emitted) {
      const content = doc.createElement('Content')
      content.textContent = `{{${ecField}}}`
      csr.appendChild(content)
      emitted = true
    }
  }

  const serialized = new XMLSerializer().serializeToString(doc)
  // XMLSerializer omet le prologue <?xml … ?> (hors arbre DOM) ; IDML l'exige → on le réinjecte.
  const prolog = /^\s*<\?xml[^>]*\?>/.exec(xml)
  return prolog && !serialized.startsWith('<?xml') ? `${prolog[0]}\n${serialized}` : serialized
}

/** Applique la templatisation à toutes les stories d'un IdmlZipContents (autres champs inchangés). */
export function templatizeEcContents(contents: IdmlZipContents): IdmlZipContents {
  const stories: Record<string, string> = {}
  for (const [path, xml] of Object.entries(contents.stories)) {
    stories[path] = templatizeEcStory(xml)
  }
  return { ...contents, stories }
}
