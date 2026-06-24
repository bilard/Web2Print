# Balisage XML InDesign → champs de données — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lire les balises XML natives d'InDesign (`<XMLElement MarkupTag>`) dans le pipeline IDML→Fabric et les convertir en champs de fusion, sans toucher au moteur de merge existant.

**Architecture:** Un pré-traitement DOM (jumeau de `ecTemplatizer`) aplatit les `<XMLElement>` en placeholders canoniques `{{Champ}}` **avant** `parseStory` (texte), une lecture de `XML/BackingStory.xml` pose `ecImageField` sur les cadres image et capture l'arbre des balises (`tagTree`), et l'export multi-page conserve les `<XMLElement>` pour le round-trip InDesign. Toute la complexité de l'imbrication XML est isolée dans des modules purs et testables ; la boucle fragile de `parseStory` n'est pas modifiée dans sa logique.

**Tech Stack:** TypeScript strict (ES2022), DOMParser/XMLSerializer (dispo en navigateur et sous vitest), JSZip, Vitest v4.

## Global Constraints

- Conventions : pas de logique métier dans l'UI ; typer explicitement (pas d'`any`) ; un fichier focalisé par responsabilité.
- **Ne jamais modifier** `src/components/ui/**`, `src/lib/firebase/config.ts`, `public/fonts/`.
- Knip baseline = exit 0 : **ne pas exporter** un symbole utilisé seulement dans son fichier (sauf si consommé par un test ou un autre module).
- Types : vérifier avec **`npx tsc -b`** (project references — `tsc --noEmit` ne vérifie rien).
- Tests : `npm run test:run` ; un seul fichier : `npm run test:run -- <chemin>`.
- Représentation interne canonique des champs = `{{Nom}}` (générée par le parser, jamais tapée). Le nom du champ = `MarkupTag` privé du préfixe `XMLTag/`, **non** URL-décodé (les noms de tags InDesign n'ont jamais d'espace ; accents conservés tels quels).
- Commits fréquents, un par tâche.

---

### Task 1 : Helpers de balises XML

**Files:**
- Create: `src/features/idml/xmlElementTags.ts`
- Test: `src/features/idml/xmlElementTags.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `xmlTagName(markupTag: string | null): string | null` — extrait le nom de champ d'un attribut `MarkupTag` (`"XMLTag/Prix"` → `"Prix"`, `"XMLTag/Réduction"` → `"Réduction"`), `null` si vide.
  - `elementDepth(el: Element): number` — profondeur d'un nœud (nombre d'ancêtres), pour trier du plus profond au moins profond.

- [ ] **Step 1: Write the failing test**

```typescript
// src/features/idml/xmlElementTags.test.ts
import { describe, it, expect } from 'vitest'
import { xmlTagName, elementDepth } from './xmlElementTags'

describe('xmlTagName', () => {
  it('retire le préfixe XMLTag/', () => {
    expect(xmlTagName('XMLTag/Prix')).toBe('Prix')
  })
  it('conserve les accents (pas d’URL-decode)', () => {
    expect(xmlTagName('XMLTag/Réduction')).toBe('Réduction')
  })
  it('renvoie null pour une valeur vide ou nulle', () => {
    expect(xmlTagName(null)).toBeNull()
    expect(xmlTagName('XMLTag/')).toBeNull()
  })
})

describe('elementDepth', () => {
  it('compte les ancêtres', () => {
    const doc = new DOMParser().parseFromString(
      '<a><b><c/></b></a>',
      'application/xml',
    )
    const c = doc.getElementsByTagName('c')[0]
    const a = doc.getElementsByTagName('a')[0]
    expect(elementDepth(c)).toBeGreaterThan(elementDepth(a))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/features/idml/xmlElementTags.test.ts`
Expected: FAIL — `Cannot find module './xmlElementTags'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/features/idml/xmlElementTags.ts

/** Nom de champ depuis un attribut MarkupTag InDesign : "XMLTag/Prix" → "Prix". */
export function xmlTagName(markupTag: string | null): string | null {
  if (!markupTag) return null
  const name = markupTag.replace(/^XMLTag\//, '').trim()
  return name || null
}

/** Profondeur d'un élément (nombre d'ancêtres) — sert au tri du plus profond au moins profond. */
export function elementDepth(el: Element): number {
  let depth = 0
  let node: Node | null = el.parentNode
  while (node) {
    depth++
    node = node.parentNode
  }
  return depth
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/features/idml/xmlElementTags.test.ts`
Expected: PASS (5 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/features/idml/xmlElementTags.ts src/features/idml/xmlElementTags.test.ts
git commit -m "feat(idml): helpers de balises XML natives (xmlTagName, elementDepth)"
```

---

### Task 2 : Traitement des stories balisées (cœur)

Transforme les `<XMLElement MarkupTag>` d'une story en runs `{{Champ}}`. Deux modes :
- **`unwrap: true`** (IMPORT) : remplace les `<XMLElement>` par leur contenu → story plate
  lisible par `parseStory` (les `ParagraphStyleRange`/`CharacterStyleRange` redeviennent
  enfants directs).
- **`unwrap: false`** (EXPORT) : conserve les `<XMLElement>` (round-trip InDesign), n'injecte
  qu'un run `{{Champ}}` unique dans chaque feuille.

**Files:**
- Create: `src/features/idml/xmlElementStory.ts`
- Test: `src/features/idml/xmlElementStory.test.ts`

**Interfaces:**
- Consumes: `xmlTagName`, `elementDepth` (Task 1) ; `IdmlZipContents` (existant, `@/features/idml/assemblyLoader`).
- Produces:
  - `processXmlElementStory(xml, opts)` — **interne, NON exporté** (utilisé seulement par les
    deux wrappers ci-dessous dans le même fichier ; l'exporter ferait échouer knip).
  - `flattenXmlElementStory(xml: string): string` — = `processXmlElementStory(xml, { unwrap: true })`
  - `templatizeXmlElementStory(xml: string): string` — = `processXmlElementStory(xml, { unwrap: false })`
  - `templatizeXmlElementContents(contents: IdmlZipContents): IdmlZipContents` — applique `templatizeXmlElementStory` à toutes les stories.

- [ ] **Step 1: Write the failing test**

```typescript
// src/features/idml/xmlElementStory.test.ts
import { describe, it, expect } from 'vitest'
import { flattenXmlElementStory, templatizeXmlElementStory } from './xmlElementStory'

const STORY = (inner: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>` +
  `<idPkg:Story xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging">` +
  `<Story Self="s1">${inner}</Story></idPkg:Story>`

// Prix éclaté en 4 runs, enveloppé d'un seul XMLElement Prix (cas réel run-splitting)
const PRIX = `<ParagraphStyleRange>` +
  `<XMLElement Self="x1" MarkupTag="XMLTag/Prix">` +
  `<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/n"><Content>22</Content></CharacterStyleRange>` +
  `<CharacterStyleRange><Content>€</Content></CharacterStyleRange>` +
  `<CharacterStyleRange><Content>,</Content></CharacterStyleRange>` +
  `<CharacterStyleRange><Content>99</Content></CharacterStyleRange>` +
  `</XMLElement></ParagraphStyleRange>`

// 3 feuilles dans un conteneur Article, sur 2 paragraphes
const MULTI = `<XMLElement Self="a1" MarkupTag="XMLTag/Article" XMLContent="s1">` +
  `<ParagraphStyleRange>` +
  `<CharacterStyleRange><XMLElement MarkupTag="XMLTag/Libelle_Article"><Content>Libelle Article</Content></XMLElement><Br /></CharacterStyleRange>` +
  `<CharacterStyleRange><XMLElement MarkupTag="XMLTag/Marques"><Content>Marques</Content></XMLElement></CharacterStyleRange>` +
  `</ParagraphStyleRange></XMLElement>`

describe('flattenXmlElementStory (import)', () => {
  it('réduit un champ éclaté en 4 runs à un seul {{Prix}} et supprime les XMLElement', () => {
    const out = flattenXmlElementStory(STORY(PRIX))
    expect((out.match(/\{\{Prix\}\}/g) ?? []).length).toBe(1)
    expect(out).not.toContain('<XMLElement')
    expect(out).not.toContain('22')
    expect(out).not.toContain(',99')
  })

  it('aplatit un conteneur Article en remontant ses paragraphes, avec un placeholder par feuille', () => {
    const out = flattenXmlElementStory(STORY(MULTI))
    expect(out).toContain('{{Libelle_Article}}')
    expect(out).toContain('{{Marques}}')
    expect(out).not.toContain('<XMLElement')
    // les ParagraphStyleRange sont redevenus enfants directs de <Story>
    expect(/<Story[^>]*>\s*<ParagraphStyleRange/.test(out)).toBe(true)
  })

  it('laisse une story sans MarkupTag strictement inchangée', () => {
    const plain = STORY('<ParagraphStyleRange><CharacterStyleRange><Content>OFFRE</Content></CharacterStyleRange></ParagraphStyleRange>')
    expect(flattenXmlElementStory(plain)).toBe(plain)
  })

  it('conserve le prologue <?xml ?>', () => {
    expect(flattenXmlElementStory(STORY(PRIX)).startsWith('<?xml')).toBe(true)
  })
})

describe('templatizeXmlElementStory (export, round-trip)', () => {
  it('injecte {{Prix}} mais conserve les <XMLElement> pour le round-trip', () => {
    const out = templatizeXmlElementStory(STORY(PRIX))
    expect(out).toContain('{{Prix}}')
    expect(out).toContain('MarkupTag="XMLTag/Prix"')
    expect(out).not.toContain('22')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/features/idml/xmlElementStory.test.ts`
Expected: FAIL — `Cannot find module './xmlElementStory'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/features/idml/xmlElementStory.ts
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
      runNode = firstCsr.cloneNode(false) as Element // shallow : conserve les attributs de style
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/features/idml/xmlElementStory.test.ts`
Expected: PASS (6 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/features/idml/xmlElementStory.ts src/features/idml/xmlElementStory.test.ts
git commit -m "feat(idml): flatten/templatize des stories balisées XML → {{champ}}"
```

---

### Task 3 : Import du texte balisé (brancher dans le parser)

**Files:**
- Modify: `src/features/idml/idmlParser.ts` (import + `parseStory` ~ligne 917-923)
- Test: `src/features/idml/idmlParser.xmltags.test.ts`

**Interfaces:**
- Consumes: `flattenXmlElementStory` (Task 2) ; `parseIdml` (existant, signature
  `parseIdml(spreads, stories, resources, _designMap, masterSpreads?)`).
- Produces: aucun nouveau symbole — `parseStory` consomme désormais les stories balisées.

- [ ] **Step 1: Write the failing test**

Test d'intégration via `parseIdml` (parseStory est interne, non exporté). Fixture minimale :
un Spread avec un `TextFrame ParentStory="u156"` + la story balisée correspondante.

```typescript
// src/features/idml/idmlParser.xmltags.test.ts
import { describe, it, expect } from 'vitest'
import { parseIdml } from './idmlParser'

const SPREAD = `<?xml version="1.0"?><idPkg:Spread xmlns:idPkg="x">
<Spread Self="sp1"><Page Self="pg1" GeometricBounds="0 0 200 200" ItemTransform="1 0 0 1 0 0" />
<TextFrame Self="tf1" ParentStory="u156" ItemTransform="1 0 0 1 10 10">
<Properties><PathGeometry><GeometryPathType><PathPointArray>
<PathPointType Anchor="0 0"/><PathPointType Anchor="100 0"/>
<PathPointType Anchor="100 50"/><PathPointType Anchor="0 50"/>
</PathPointArray></GeometryPathType></PathGeometry></Properties>
</TextFrame></Spread></idPkg:Spread>`

const STORY = `<?xml version="1.0"?><idPkg:Story xmlns:idPkg="x">
<Story Self="u156">
<XMLElement Self="a1" MarkupTag="XMLTag/Article" XMLContent="u156">
<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/n">
<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/n">
<XMLElement MarkupTag="XMLTag/Prix"><Content>22</Content></XMLElement>
</CharacterStyleRange></ParagraphStyleRange></XMLElement></Story></idPkg:Story>`

describe('parseIdml — stories balisées XML natif', () => {
  it('convertit un champ balisé en placeholder {{Prix}} dans le texte du paragraphe', () => {
    const doc = parseIdml({ 'Spreads/s.xml': SPREAD }, { 'Stories/u156.xml': STORY }, {}, '')
    const tf = doc.objects.find((o) => o.type === 'TextFrame')
    expect(tf).toBeTruthy()
    const text = (tf?.paragraphs ?? []).map((p) => p.text).join('')
    expect(text).toContain('{{Prix}}')
    expect(text).not.toContain('22')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/features/idml/idmlParser.xmltags.test.ts`
Expected: FAIL — le texte vaut `22` (balises ignorées), `{{Prix}}` absent.

- [ ] **Step 3: Write minimal implementation**

Ajouter l'import en tête de `src/features/idml/idmlParser.ts` (près de la ligne 13, sous l'import EC existant) :

```typescript
import { flattenXmlElementStory } from './xmlElementStory'
```

Dans `parseStory` (ligne 917), aplatir la story balisée tout au début, avant le parsing.
Remplacer :

```typescript
): IdmlParagraph[] {
  const doc = parseXml(storyXml)
```

par :

```typescript
): IdmlParagraph[] {
  // Balises XML natives InDesign : aplatir <XMLElement MarkupTag> en {{champ}} avant parsing.
  // (no-op si la story ne contient aucun MarkupTag.)
  const doc = parseXml(flattenXmlElementStory(storyXml))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/features/idml/idmlParser.xmltags.test.ts`
Expected: PASS.

Vérifier la non-régression EasyCatalog/{{}} :
Run: `npm run test:run -- src/features/merge src/features/idml`
Expected: PASS (aucun test existant cassé).

- [ ] **Step 5: Commit**

```bash
git add src/features/idml/idmlParser.ts src/features/idml/idmlParser.xmltags.test.ts
git commit -m "feat(idml): import du texte balisé XML natif via flatten dans parseStory"
```

---

### Task 4 : BackingStory — champs image + arbre des balises

**Files:**
- Create: `src/features/idml/xmlBackingStory.ts`
- Test: `src/features/idml/xmlBackingStory.test.ts`

**Interfaces:**
- Consumes: `xmlTagName` (Task 1).
- Produces:
  - `interface TagTreeNode { field: string; objectId?: string; children: TagTreeNode[] }`
  - `parseBackingStoryImageFields(backingStoryXml: string): Map<string, string>` — map
    `XMLContent (Self d'objet) → nom de champ` pour tous les `<XMLElement>` ayant un `XMLContent`.
  - `parseBackingStoryTagTree(backingStoryXml: string): TagTreeNode | null` — arbre des
    balises depuis la racine `Root` (premier `<XMLElement>`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/features/idml/xmlBackingStory.test.ts
import { describe, it, expect } from 'vitest'
import { parseBackingStoryImageFields, parseBackingStoryTagTree } from './xmlBackingStory'

const BACKING = `<?xml version="1.0"?><idPkg:BackingStory xmlns:idPkg="x">
<XmlStory Self="u98"><ParagraphStyleRange><CharacterStyleRange>
<XMLElement Self="di3" MarkupTag="XMLTag/Root">
  <XMLElement Self="di3i4" MarkupTag="XMLTag/Article" XMLContent="u156" />
  <XMLElement Self="di3i5" MarkupTag="XMLTag/Prix" XMLContent="u16c" />
  <XMLElement Self="di3i7" MarkupTag="XMLTag/Image" XMLContent="u1c4">
    <XMLAttribute Self="a" Name="href" Value="file:///x.png" />
  </XMLElement>
</XMLElement>
</CharacterStyleRange></ParagraphStyleRange></XmlStory></idPkg:BackingStory>`

describe('parseBackingStoryImageFields', () => {
  it('mappe chaque XMLContent vers son nom de champ', () => {
    const map = parseBackingStoryImageFields(BACKING)
    expect(map.get('u1c4')).toBe('Image')
    expect(map.get('u156')).toBe('Article')
    expect(map.get('u16c')).toBe('Prix')
  })
  it('renvoie une map vide pour une entrée vide', () => {
    expect(parseBackingStoryImageFields('').size).toBe(0)
  })
})

describe('parseBackingStoryTagTree', () => {
  it('reconstruit la hiérarchie Root > [Article, Prix, Image]', () => {
    const tree = parseBackingStoryTagTree(BACKING)
    expect(tree?.field).toBe('Root')
    expect(tree?.children.map((c) => c.field)).toEqual(['Article', 'Prix', 'Image'])
    expect(tree?.children[0].objectId).toBe('u156')
  })
  it('renvoie null pour une entrée vide', () => {
    expect(parseBackingStoryTagTree('')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/features/idml/xmlBackingStory.test.ts`
Expected: FAIL — `Cannot find module './xmlBackingStory'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/features/idml/xmlBackingStory.ts
import { xmlTagName } from './xmlElementTags'

/** Nœud de l'arbre des balises XML (hiérarchie conteneurs → feuilles). */
export interface TagTreeNode {
  field: string
  objectId?: string // XMLContent : Self de l'objet cible (story ou image), si présent
  children: TagTreeNode[]
}

function parseBacking(xml: string): Document | null {
  if (!xml || !xml.includes('XMLElement')) return null
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) return null
  return doc
}

/** Map XMLContent (Self d'objet) → nom de champ, pour relier les cadres/images à un champ. */
export function parseBackingStoryImageFields(backingStoryXml: string): Map<string, string> {
  const map = new Map<string, string>()
  const doc = parseBacking(backingStoryXml)
  if (!doc) return map
  for (const el of Array.from(doc.getElementsByTagName('XMLElement'))) {
    const objId = el.getAttribute('XMLContent')
    const field = xmlTagName(el.getAttribute('MarkupTag'))
    if (objId && field) map.set(objId, field)
  }
  return map
}

function buildNode(el: Element): TagTreeNode {
  const children: TagTreeNode[] = []
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i]
    if (child.nodeType === 1 && (child as Element).tagName === 'XMLElement') {
      children.push(buildNode(child as Element))
    }
  }
  return {
    field: xmlTagName(el.getAttribute('MarkupTag')) ?? '',
    objectId: el.getAttribute('XMLContent') ?? undefined,
    children,
  }
}

/** Arbre des balises depuis la racine (premier <XMLElement>, en ordre document). */
export function parseBackingStoryTagTree(backingStoryXml: string): TagTreeNode | null {
  const doc = parseBacking(backingStoryXml)
  if (!doc) return null
  const all = doc.getElementsByTagName('XMLElement')
  if (all.length === 0) return null
  return buildNode(all[0])
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/features/idml/xmlBackingStory.test.ts`
Expected: PASS (6 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/features/idml/xmlBackingStory.ts src/features/idml/xmlBackingStory.test.ts
git commit -m "feat(idml): lecture BackingStory (champs image + arbre des balises)"
```

---

### Task 5 : Câblage import — BackingStory → loaders + parseIdml

Capture `XML/BackingStory.xml` au dézippage, le passe à `parseIdml`, pose `ecImageField` sur
les cadres image via la map, et expose `tagTree` dans `IdmlDocument`.

**Files:**
- Modify: `src/features/idml/assemblyLoader.ts` (`IdmlZipContents` ~ligne 23-29 ; `unzipIdml` ~ligne 378)
- Modify: `src/features/idml/idmlParser.ts` (`IdmlDocument`, `parseIdml`, `walkElementsInOrder`, `parseElement`)
- Modify: `src/features/idml/useIdmlParse.ts` (~ligne 83)
- Test: `src/features/idml/idmlParser.image.test.ts`

**Interfaces:**
- Consumes: `parseBackingStoryImageFields`, `parseBackingStoryTagTree`, `TagTreeNode` (Task 4).
- Produces:
  - `IdmlZipContents.backingStory?: string`
  - `IdmlDocument.tagTree?: TagTreeNode | null`
  - `parseIdml(spreads, stories, resources, _designMap, masterSpreads?, backingStory?)` — 6e
    paramètre optionnel `backingStory: string = ''`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/features/idml/idmlParser.image.test.ts
import { describe, it, expect } from 'vitest'
import { parseIdml } from './idmlParser'

// Rectangle image u1ca contenant <Image Self="u1c4"> ; BackingStory balise u1c4 = Image.
const SPREAD = `<?xml version="1.0"?><idPkg:Spread xmlns:idPkg="x">
<Spread Self="sp1"><Page Self="pg1" GeometricBounds="0 0 200 200" ItemTransform="1 0 0 1 0 0" />
<Rectangle Self="u1ca" ContentType="GraphicType" ItemTransform="1 0 0 1 10 10">
<Properties><PathGeometry><GeometryPathType><PathPointArray>
<PathPointType Anchor="0 0"/><PathPointType Anchor="50 0"/>
<PathPointType Anchor="50 50"/><PathPointType Anchor="0 50"/>
</PathPointArray></GeometryPathType></PathGeometry></Properties>
<Image Self="u1c4" ItemTransform="1 0 0 1 0 0"><Properties><GraphicBounds Left="0" Top="0" Right="50" Bottom="50"/></Properties></Image>
</Rectangle></Spread></idPkg:Spread>`

const BACKING = `<?xml version="1.0"?><idPkg:BackingStory xmlns:idPkg="x">
<XmlStory Self="u98"><ParagraphStyleRange><CharacterStyleRange>
<XMLElement Self="di3" MarkupTag="XMLTag/Root">
<XMLElement Self="di3i7" MarkupTag="XMLTag/Image" XMLContent="u1c4">
<XMLAttribute Name="href" Value="file:///x.png" /></XMLElement>
</XMLElement></CharacterStyleRange></ParagraphStyleRange></XmlStory></idPkg:BackingStory>`

describe('parseIdml — image balisée via BackingStory', () => {
  it('pose ecImageField sur le cadre image dont l’Image enfant est référencée', () => {
    const doc = parseIdml({ 'Spreads/s.xml': SPREAD }, {}, {}, '', {}, BACKING)
    const rect = doc.objects.find((o) => o.type === 'Rectangle' || o.type === 'Image')
    expect(rect?.ecImageField).toBe('Image')
  })
  it('expose l’arbre des balises', () => {
    const doc = parseIdml({ 'Spreads/s.xml': SPREAD }, {}, {}, '', {}, BACKING)
    expect(doc.tagTree?.field).toBe('Root')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/features/idml/idmlParser.image.test.ts`
Expected: FAIL — `parseIdml` n'accepte pas de 6e argument / `ecImageField` est `undefined` / `tagTree` absent.

- [ ] **Step 3a: Étendre `IdmlZipContents` + capture dans `unzipIdml`**

Dans `src/features/idml/assemblyLoader.ts`, ajouter le champ à l'interface (après `designMap`) :

```typescript
export interface IdmlZipContents {
  spreads: Record<string, string>
  stories: Record<string, string>
  resources: Record<string, string>
  masterSpreads: Record<string, string>
  designMap: string
  backingStory?: string // XML/BackingStory.xml — balises XML natives (images + arbre)
}
```

Dans `unzipIdml`, ajouter une branche au `for` de classification (avant la branche `designmap.xml`) :

```typescript
    } else if (path === 'XML/BackingStory.xml') {
      contents.backingStory = text
    } else if (path.toLowerCase() === 'designmap.xml') {
```

- [ ] **Step 3b: Étendre `IdmlDocument` + `parseIdml` (idmlParser.ts)**

Ajouter l'import en tête :

```typescript
import { parseBackingStoryImageFields, parseBackingStoryTagTree, type TagTreeNode } from './xmlBackingStory'
```

Étendre l'interface `IdmlDocument` (ligne 108-113) :

```typescript
export interface IdmlDocument {
  pageWidth: number
  pageHeight: number
  objects: IdmlObject[]
  spreadCount: number
  tagTree?: TagTreeNode | null // hiérarchie des balises XML natives (groupes répétables)
}
```

Signature de `parseIdml` (ligne 1521) — ajouter le 6e paramètre :

```typescript
export function parseIdml(
  spreads: Record<string, string>,
  stories: Record<string, string>,
  resources: Record<string, string>,
  _designMap: string,
  masterSpreads: Record<string, string> = {},
  backingStory: string = '',
): IdmlDocument {
```

Juste après `const objStyleMap = buildObjectStyleMap(resources)` (ligne 1546), construire la map + l'arbre :

```typescript
  const imageFieldMap = parseBackingStoryImageFields(backingStory)
  const tagTree = parseBackingStoryTagTree(backingStory)
```

Passer `imageFieldMap` aux deux appels de `walkElementsInOrder` (lignes 1594 et 1609) en
dernier argument :

```typescript
      walkElementsInOrder(spreadEl, pageOffsetX, pageOffsetY, colorMap, storiesMap, allObjects, objStyleMap, anchoredFrameMap, imageFieldMap)
```
```typescript
        walkElementsInOrder(masterSpreadEl, pageOffsetX, pageOffsetY, colorMap, storiesMap, allObjects, objStyleMap, anchoredFrameMap, imageFieldMap)
```

Modifier le `return` (ligne 1614) :

```typescript
  return { pageWidth, pageHeight, objects: allObjects, spreadCount, tagTree }
```

- [ ] **Step 3c: Threader `imageFieldMap` dans `walkElementsInOrder` + `parseElement`**

Signature de `walkElementsInOrder` (ligne 1475) — ajouter le paramètre :

```typescript
function walkElementsInOrder(
  parent: Element,
  pageOffsetX: number,
  pageOffsetY: number,
  colorMap: Map<string, IdmlColor>,
  storiesMap: Map<string, IdmlParagraph[]>,
  results: IdmlObject[],
  objStyleMap: Map<string, ObjectStyleDef>,
  anchoredFrameMap: Map<string, AnchoredFrameRef[]>,
  imageFieldMap: Map<string, string> = new Map(),
) {
```

Dans son corps, propager aux appels récursif et à `parseElement` (lignes 1492 et 1494) :

```typescript
    if (tag === 'Group') {
      walkElementsInOrder(el, pageOffsetX, pageOffsetY, colorMap, storiesMap, results, objStyleMap, anchoredFrameMap, imageFieldMap)
    } else if (ITEM_TAGS.has(tag)) {
      const obj = parseElement(el, tag as IdmlObject['type'], pageOffsetX, pageOffsetY, colorMap, storiesMap, objStyleMap, imageFieldMap)
```

Signature de `parseElement` (ligne 1617) — ajouter le paramètre :

```typescript
function parseElement(
  el: Element,
  type: IdmlObject['type'],
  pageOffsetX: number,
  pageOffsetY: number,
  colorMap: Map<string, IdmlColor>,
  storiesMap: Map<string, IdmlParagraph[]>,
  objStyleMap: Map<string, ObjectStyleDef> = new Map(),
  imageFieldMap: Map<string, string> = new Map(),
): IdmlObject | null {
```

- [ ] **Step 3d: Résoudre `ecImageField` via la map (idmlParser.ts ligne 1686)**

Remplacer :

```typescript
  const ecImageField = parseEcImageField(el.getAttribute('ECPageItemData')) ?? undefined
```

par :

```typescript
  // EasyCatalog (ECPageItemData) ou balise XML native (BackingStory → Self du cadre OU de son Image enfant)
  let ecImageField = parseEcImageField(el.getAttribute('ECPageItemData')) ?? undefined
  if (!ecImageField && imageFieldMap.size > 0) {
    const selfId = el.getAttribute('Self')
    const imgChildId = directChildren(el, 'Image')[0]?.getAttribute('Self')
    ecImageField =
      (selfId ? imageFieldMap.get(selfId) : undefined) ??
      (imgChildId ? imageFieldMap.get(imgChildId) : undefined) ??
      undefined
  }
```

- [ ] **Step 3e: Passer la BackingStory depuis le hook d'import**

Dans `src/features/idml/useIdmlParse.ts`, à l'appel `parseIdml` (ligne 83), ajouter l'argument :

```typescript
      const idmlDoc = parseIdml(
        idmlContents.spreads,
        idmlContents.stories,
        idmlContents.resources,
        idmlContents.designMap,
        idmlContents.masterSpreads,
        idmlContents.backingStory ?? '',
      )
```

- [ ] **Step 4: Run tests + types**

Run: `npm run test:run -- src/features/idml/idmlParser.image.test.ts`
Expected: PASS (2 assertions).

Run: `npx tsc -b`
Expected: aucune erreur (les nouveaux paramètres ont des défauts, l'appel `EditorPage.tsx:135` reste valide).

Run: `npm run test:run -- src/features/idml src/features/merge`
Expected: PASS (non-régression).

- [ ] **Step 5: Commit**

```bash
git add src/features/idml/assemblyLoader.ts src/features/idml/idmlParser.ts src/features/idml/useIdmlParse.ts src/features/idml/idmlParser.image.test.ts
git commit -m "feat(idml): câblage import des images balisées + arbre des balises (BackingStory)"
```

---

### Task 6 : Export round-trip multi-page

Vérifié dans `buildMultiPageIdml` (idmlPatcher.ts:338-355) : la fonction recopie les fichiers
du zip brut sauf `Spreads/`, `Stories/`, `MasterSpreads/`, `Resources/`, `designmap.xml`.
Donc `XML/Tags.xml` et `XML/BackingStory.xml` sont **copiés tels quels**. Les stories/spreads,
eux, sont **suffixés** par `_row{i}` (`suffixIds`).

**Ce que ce Task garantit (le besoin réel) :**
- Les valeurs de chaque ligne sont fusionnées (`templatizeXmlElementStory` met `{{champ}}` en
  conservant les `<XMLElement>`, puis `patchStories` remplace `{{champ}}` par la valeur).
- Les `<XMLElement MarkupTag>` **inline du texte** survivent dans chaque story suffixée, et
  restent cohérents : `suffixIds` suffixe ensemble le `Self` de la story et ses `XMLContent`.
- Les **images** mergées sont correctes : à l'export elles passent par `options.bindings.src`
  (patchSpreads), **pas** par la BackingStory.

**Limite connue (documentée, hors périmètre) :** la `XML/BackingStory.xml` copiée garde ses
`XMLContent` non suffixés alors que les objets multi-pages sont suffixés. La structure XML de
haut niveau est donc désynchronisée en multi-page. Conséquence unique : un **ré-import dans
l'app** du fichier exporté ne reconnaîtrait plus les champs image (lus depuis la BackingStory
à l'import). Le merge et le balisage texte ne sont pas affectés. Re-synchroniser/fusionner la
BackingStory pour le multi-page est un chantier séparé (1 seule BackingStory par IDML → il
faudrait fusionner N structures suffixées) — à traiter si un round-trip InDesign complet est
requis.

**Files:**
- Modify: `src/features/merge/useIdmlBatchExport.ts` (~ligne 60)
- Test: `src/features/idml/xmlElementStory.roundtrip.test.ts`

**Interfaces:**
- Consumes: `templatizeXmlElementContents` (Task 2) ; `resolveText` (existant) ; `templatizeEcContents` (existant).
- Produces: aucun nouveau symbole.

- [ ] **Step 1: Write the failing test**

Le round-trip combine templatisation (conserve XMLElement, valeur→`{{}}`) puis résolution
(`{{}}`→valeur de la ligne), en vérifiant que la balise survit.

```typescript
// src/features/idml/xmlElementStory.roundtrip.test.ts
import { describe, it, expect } from 'vitest'
import { templatizeXmlElementStory } from './xmlElementStory'
import { resolveText } from '@/features/merge/mergeEngine'
import type { MergeRow } from '@/stores/merge.store'

const STORY = `<?xml version="1.0"?><idPkg:Story xmlns:idPkg="x"><Story Self="s1">` +
  `<ParagraphStyleRange><XMLElement MarkupTag="XMLTag/Prix">` +
  `<CharacterStyleRange><Content>22</Content></CharacterStyleRange>` +
  `<CharacterStyleRange><Content>,99</Content></CharacterStyleRange>` +
  `</XMLElement></ParagraphStyleRange></Story></idPkg:Story>`

describe('round-trip export XML natif', () => {
  it('templatise en {{Prix}} puis résout la valeur de la ligne, en conservant la balise', () => {
    const templ = templatizeXmlElementStory(STORY)
    expect(templ).toContain('{{Prix}}')
    expect(templ).toContain('MarkupTag="XMLTag/Prix"')

    // Simule patchStories : remplacer {{}} dans <Content> via resolveText
    const row: MergeRow = { _id: 'r1', Prix: '49,90' }
    const out = templ.replace(
      /(<Content>)([\s\S]*?)(<\/Content>)/g,
      (m, open, content, close) =>
        content.includes('{{') ? `${open}${resolveText(content, row)}${close}` : m,
    )
    expect(out).toContain('49,90')
    expect(out).toContain('MarkupTag="XMLTag/Prix"') // round-trip : balise préservée
    expect(out).not.toContain('{{Prix}}')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/features/idml/xmlElementStory.roundtrip.test.ts`
Expected: FAIL au départ uniquement si `templatizeXmlElementStory` n'est pas importable — sinon, ce test valide la mécanique. (S'il passe déjà, c'est attendu : Task 2 fournit la fonction ; ce test sert de garde de non-régression du round-trip. Passer directement au Step 3 du câblage.)

- [ ] **Step 3: Câbler la templatisation XML dans l'export**

Dans `src/features/merge/useIdmlBatchExport.ts`, ajouter l'import :

```typescript
import { templatizeXmlElementContents } from '@/features/idml/xmlElementStory'
```

Modifier la ligne 60 pour chaîner les deux templatiseurs (EC puis XML natif) :

```typescript
      const contents = templatizeXmlElementContents(
        templatizeEcContents(await extractIdmlContents(buffer)),
      )
```

- [ ] **Step 4: Run tests + types**

Run: `npm run test:run -- src/features/idml/xmlElementStory.roundtrip.test.ts`
Expected: PASS (5 assertions).

Run: `npx tsc -b`
Expected: aucune erreur.

Run: `npm run test:run`
Expected: suite complète au vert.

Run: `npx knip`
Expected: exit 0 (tous les nouveaux exports sont consommés : helpers par les modules, `templatizeXmlElementContents` par l'export, `flattenXmlElementStory` par le parser).

- [ ] **Step 5: Commit**

```bash
git add src/features/merge/useIdmlBatchExport.ts src/features/idml/xmlElementStory.roundtrip.test.ts
git commit -m "feat(merge): export multi-page round-trip des IDML balisés XML natif"
```

---

## Note à l'exécutant — fixtures d'intégration T3/T5

Les fixtures XML de T3 et T5 (Spread + TextFrame/Rectangle) n'ont jamais été exécutées contre
le vrai `parseBounds`. Si `parseBounds` renvoie `null` sur la fixture (exigence non satisfaite
sur `GeometricBounds`/`PathGeometry`/`ItemTransform`), l'objet n'est pas créé et le test
échoue **par forme de fixture, pas par bug de logique**. Dans ce cas, ajuster la fixture
(copier la géométrie d'un objet du sample réel `Snipet_PROMO_converted.idml`, décompressé sous
le scratchpad) plutôt que chercher un bug dans le code de balisage. L'assertion à préserver
est : le texte contient `{{Prix}}` (T3) / `ecImageField === 'Image'` (T5).

## Records répétables (Phase 1) — portée livrée

Le **niveau page** (1 ligne de données → 1 page = 1 instance complète du gabarit balisé) est
livré par la chaîne `templatizeXmlElementContents` + `buildMultiPageIdml` (Task 6) : c'est la
définition standard du data merge, et c'est ce que couvre le sample mono-produit Monoprix.
La métadonnée `tagTree` (Task 5) est capturée et exposée sur `IdmlDocument` pour alimenter un
futur **niveau grille intra-page** (N produits sur une même page).

## Hors périmètre (plan ultérieur)

- **Niveau grille intra-page** (dupliquer un conteneur `Article` en grille sur une page) :
  nécessite des décisions de layout (pas de grille, débordement, pagination) et un sample
  multi-produits réel. À traiter dans un plan dédié, en s'appuyant sur `IdmlDocument.tagTree`.
- **Matching `_` ↔ espace** : les noms de tags InDesign n'ont pas d'espace (`Libelle_Article`)
  alors que les colonnes data peuvent en avoir (`Libelle Article`). `resolveText` matche déjà
  par clé/label/alias insensible casse-trim ; une normalisation `_`↔espace pourra être ajoutée
  dans le matching de `mergeEngine` si le besoin se confirme (hors lecture, donc hors ce plan).
- **Phase 2** : ExtendScript `.jsx` de balisage 1-clic dans InDesign (plan séparé).

## Self-review

- **Couverture spec** : format texte (T2/T3) ✓ ; format image via BackingStory (T4/T5) ✓ ;
  conteneurs/feuilles (T2 étape 1/2) ✓ ; représentation interne `{{}}` (T2) ✓ ; hiérarchie
  `tagTree` (T4/T5) ✓ ; export round-trip + records niveau page (T6) ✓ ; tests fixture
  Monoprix (Prix 4-runs T2, multi-feuilles T2, image BackingStory T5, round-trip T6) ✓.
  Niveau grille intra-page : explicitement reporté (voir « Hors périmètre »).
- **Placeholders** : aucun TODO/TBD ; chaque étape de code montre le code complet.
- **Cohérence des types** : `xmlTagName`/`elementDepth` (T1) consommés en T2/T4 ;
  `flattenXmlElementStory` (T2) en T3 ; `templatizeXmlElementContents` (T2) en T6 ;
  `parseBackingStoryImageFields`/`parseBackingStoryTagTree`/`TagTreeNode` (T4) en T5 ;
  `IdmlZipContents.backingStory` (T5) lu en T5 (useIdmlParse) ; signature `parseIdml` à 6
  paramètres cohérente entre T5 et les tests T3/T5.
