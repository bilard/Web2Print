import type { IdmlZipContents } from '@/features/idml/assemblyLoader'
import { xmlTagName, elementDepth } from './xmlElementTags'

/**
 * Convertit les <XMLElement MarkupTag="XMLTag/Champ"> d'une story balisée XML natif
 * InDesign en placeholders {{Champ}}.
 *  - unwrap=true  (IMPORT) : remplace chaque XMLElement par son run → story plate.
 *  - unwrap=false (EXPORT) : conserve les <XMLElement>, n'injecte que le run {{Champ}}.
 * Une « feuille » = XMLElement sans XMLElement descendant ; un « conteneur » en a.
 * NON exporté : seuls les deux wrappers ci-dessous l'utilisent (règle knip).
 */
function processXmlElementStory(xml: string, opts: { unwrap: boolean }): string {
  if (!xml.includes('MarkupTag')) return xml
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) return xml
  // Garde stricte : la chaîne "MarkupTag" peut apparaître dans du texte ordinaire sans aucun
  // <XMLElement>. Dans ce cas, parser puis re-sérialiser (XMLSerializer normalise quotes/entités)
  // produirait une divergence parasite. On retourne l'original intact.
  if (doc.getElementsByTagName('XMLElement').length === 0) return xml

  // ── Étape 1 : feuilles-champs → un run {{Champ}} unique ──
  // getElementsByTagName renvoie en ordre document (ancêtre avant descendant) ; comme les
  // feuilles sont disjointes, l'ordre de traitement n'a pas d'incidence.
  for (const el of Array.from(doc.getElementsByTagName('XMLElement'))) {
    if (el.getElementsByTagName('XMLElement').length > 0) continue // conteneur → étape 2
    const field = xmlTagName(el.getAttribute('MarkupTag'))
    if (!field) continue

    // Run porteur de style = 1er CharacterStyleRange interne s'il existe ; sinon Content nu.
    const firstCsr = el.getElementsByTagName('CharacterStyleRange')[0]
    let runNode: Element
    if (firstCsr) {
      // Deep clone pour préserver <Properties><AppliedFont> (et tout autre enfant de style).
      // AppliedFont est un ENFANT du CSR (dans <Properties>), pas un attribut — un shallow clone
      // le perdrait, effaçant l'override de police à l'import ET à l'export.
      runNode = firstCsr.cloneNode(true) as Element
      // Retirer les enfants <Content> et <Br> existants (texte source) avant d'injecter le placeholder.
      for (const child of Array.from(runNode.children)) {
        if (child.tagName === 'Content' || child.tagName === 'Br') {
          runNode.removeChild(child)
        }
      }
      const content = doc.createElement('Content')
      content.textContent = `{{${field}}}`
      runNode.appendChild(content)
    } else {
      runNode = doc.createElement('Content')
      runNode.textContent = `{{${field}}}`
    }

    if (opts.unwrap) {
      el.parentNode?.replaceChild(runNode, el)
    } else {
      while (el.firstChild) el.removeChild(el.firstChild)
      el.appendChild(runNode)
    }
  }

  // ── Étape 2 : conteneurs → remonter leurs enfants (IMPORT uniquement) ──
  if (opts.unwrap) {
    const containers = Array.from(doc.getElementsByTagName('XMLElement')).sort(
      (a, b) => elementDepth(b) - elementDepth(a), // plus profond d'abord
    )
    for (const c of containers) {
      const parent = c.parentNode
      if (!parent) continue
      while (c.firstChild) parent.insertBefore(c.firstChild, c)
      parent.removeChild(c)
    }
  }

  const serialized = new XMLSerializer().serializeToString(doc)
  // XMLSerializer omet le prologue <?xml … ?> (hors arbre DOM) ; IDML l'exige → on le réinjecte.
  const prolog = /^\s*<\?xml[^>]*\?>/.exec(xml)
  return prolog && !serialized.startsWith('<?xml') ? `${prolog[0]}\n${serialized}` : serialized
}

export const flattenXmlElementStory = (xml: string): string =>
  processXmlElementStory(xml, { unwrap: true })

export const templatizeXmlElementStory = (xml: string): string =>
  processXmlElementStory(xml, { unwrap: false })

/** Applique la templatisation (conserve les XMLElement) à toutes les stories — pour l'export. */
export function templatizeXmlElementContents(contents: IdmlZipContents): IdmlZipContents {
  const stories: Record<string, string> = {}
  for (const [path, xml] of Object.entries(contents.stories)) {
    stories[path] = templatizeXmlElementStory(xml)
  }
  return { ...contents, stories }
}
