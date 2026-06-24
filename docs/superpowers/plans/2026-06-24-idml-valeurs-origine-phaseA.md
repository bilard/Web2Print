# Import IDML — afficher les valeurs d'origine (Phase A) — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** À l'import d'un IDML balisé XML natif, afficher la **valeur d'origine** dans les blocs (au lieu de `{{champ}}`), tout en gardant le merge fonctionnel et en persistant la valeur (pas le `{{}}`) à la sauvegarde.

**Architecture:** Le parser produit `obj.text` = valeur d'origine (parse « mode valeur », une passe stylée) ; `data.templateText` (string) + `data.originText` (valeur stable) + `data.mergeFields` (string[]) en métadonnée. Le moteur de fusion lit déjà `data.templateText` ; on change la **cible du swap** de `useAutoSave`/disconnect de `templateText` vers `originText` pour que le JSON sauvé porte la valeur. Pas de double arbre stylé ; les styles sur sortie mergée dégradent au style de base (limite v1).

**Tech Stack:** TypeScript strict, Vitest, Fabric.js, Zustand.

## Global Constraints

- TypeScript strict, pas d'`any` ; `npx tsc -b` clean (project references). Tests : `npm run test:run -- <chemin>`. Knip exit 0.
- **Ne jamais modifier** `src/components/ui/**`, `src/lib/firebase/config.ts`, `public/fonts/`.
- **Non-régression du merge** : `src/features/merge` doit rester vert ; le chemin `{{}}` tapé manuellement (sans `data.originText`) conserve son comportement actuel.
- Chemin ciblé = **XML natif** (`flattenXmlElementStory`). EasyCatalog hors périmètre.
- `data` est sérialisé (`FABRIC_SERIALIZED_PROPS = ['data', 'perPixelTargetFind']`, `serializationProps.ts:10`) → `data.templateText`/`originText`/`mergeFields` survivent au reload.
- Concaténation du texte d'un Textbox (à reproduire pour le template) : `paras.map((p) => p.text.replace(/\n$/, '')).join('\n')` (`idmlToFabric.ts`).

---

### Task 1 : Mode « valeur » + extraction des champs (xmlElementStory)

**Files:**
- Modify: `src/features/idml/xmlElementStory.ts`
- Test: `src/features/idml/xmlElementStory.value.test.ts`

**Interfaces:**
- Consumes: `xmlTagName`, `elementDepth` (existants).
- Produces:
  - `valueXmlElementStory(xml: string): string` — unwrap les `<XMLElement>` en **conservant le contenu d'origine** (aucune substitution `{{}}`).
  - `extractStoryFields(xml: string): string[]` — liste ordonnée et dédupliquée des champs (`MarkupTag` feuilles) de la story, `[]` si non balisée.

- [ ] **Step 1: Write the failing test**

```typescript
// src/features/idml/xmlElementStory.value.test.ts
import { describe, it, expect } from 'vitest'
import { valueXmlElementStory, extractStoryFields, templatizeXmlElementStory } from './xmlElementStory'

const STORY = (inner: string) =>
  `<?xml version="1.0"?><idPkg:Story xmlns:idPkg="x"><Story Self="s1">${inner}</Story></idPkg:Story>`

const PRIX = `<ParagraphStyleRange><XMLElement MarkupTag="XMLTag/Prix_normal">` +
  `<CharacterStyleRange><Content>22</Content></CharacterStyleRange>` +
  `<CharacterStyleRange><Content>€</Content></CharacterStyleRange>` +
  `<CharacterStyleRange><Content>,99</Content></CharacterStyleRange>` +
  `</XMLElement></ParagraphStyleRange>`

describe('valueXmlElementStory', () => {
  it('conserve la valeur d’origine et retire les balises (pas de {{}})', () => {
    const out = valueXmlElementStory(STORY(PRIX))
    expect(out).toContain('22')
    expect(out).toContain(',99')
    expect(out).not.toContain('{{')
    expect(out).not.toContain('<XMLElement')
  })
  it('laisse une story non balisée inchangée', () => {
    const plain = STORY('<ParagraphStyleRange><CharacterStyleRange><Content>OFFRE</Content></CharacterStyleRange></ParagraphStyleRange>')
    expect(valueXmlElementStory(plain)).toBe(plain)
  })
})

describe('extractStoryFields', () => {
  it('liste les champs feuilles dédupliqués dans l’ordre', () => {
    const inner = `<XMLElement MarkupTag="XMLTag/Article"><ParagraphStyleRange>` +
      `<CharacterStyleRange><XMLElement MarkupTag="XMLTag/Libelle_Article"><Content>L</Content></XMLElement></CharacterStyleRange>` +
      `<CharacterStyleRange><XMLElement MarkupTag="XMLTag/Marques"><Content>M</Content></XMLElement></CharacterStyleRange>` +
      `</ParagraphStyleRange></XMLElement>`
    expect(extractStoryFields(STORY(inner))).toEqual(['Libelle_Article', 'Marques'])
  })
  it('story non balisée → []', () => {
    expect(extractStoryFields(STORY('<ParagraphStyleRange><CharacterStyleRange><Content>x</Content></CharacterStyleRange></ParagraphStyleRange>'))).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/features/idml/xmlElementStory.value.test.ts`
Expected: FAIL — `valueXmlElementStory`/`extractStoryFields` non exportés.

- [ ] **Step 3: Write minimal implementation**

Ajouter à `src/features/idml/xmlElementStory.ts`. `valueXmlElementStory` = même squelette que
`processXmlElementStory` mais SANS l'étape 1 de substitution : on unwrap simplement tous les
`<XMLElement>` (feuilles + conteneurs) en remontant leurs enfants, le `<Content>` d'origine est
conservé.

```typescript
/** Unwrap les <XMLElement> en conservant le contenu d'origine (aucune substitution {{}}). */
export function valueXmlElementStory(xml: string): string {
  if (!xml.includes('MarkupTag')) return xml
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) return xml
  if (doc.getElementsByTagName('XMLElement').length === 0) return xml
  // remonter les enfants de chaque XMLElement, du plus profond au moins profond
  const els = Array.from(doc.getElementsByTagName('XMLElement')).sort(
    (a, b) => elementDepth(b) - elementDepth(a),
  )
  for (const el of els) {
    const parent = el.parentNode
    if (!parent) continue
    while (el.firstChild) parent.insertBefore(el.firstChild, el)
    parent.removeChild(el)
  }
  const serialized = new XMLSerializer().serializeToString(doc)
  const prolog = /^\s*<\?xml[^>]*\?>/.exec(xml)
  return prolog && !serialized.startsWith('<?xml') ? `${prolog[0]}\n${serialized}` : serialized
}

/** Liste ordonnée et dédupliquée des champs (MarkupTag des feuilles) d'une story. */
export function extractStoryFields(xml: string): string[] {
  if (!xml.includes('MarkupTag')) return []
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const el of Array.from(doc.getElementsByTagName('XMLElement'))) {
    if (el.getElementsByTagName('XMLElement').length > 0) continue // conteneur
    const field = xmlTagName(el.getAttribute('MarkupTag'))
    if (field && !seen.has(field)) { seen.add(field); out.push(field) }
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/features/idml/xmlElementStory.value.test.ts`
Expected: PASS.

Run: `npm run test:run -- src/features/idml/xmlElementStory.test.ts`
Expected: PASS (non-régression du flatten/templatize existant).

- [ ] **Step 5: Commit**

```bash
git add src/features/idml/xmlElementStory.ts src/features/idml/xmlElementStory.value.test.ts
git commit -m "feat(idml): mode valeur + extraction des champs (xmlElementStory)"
```

---

### Task 2 : Parser la valeur + poser template/fields sur l'objet

**Files:**
- Modify: `src/features/idml/idmlParser.ts`
- Test: `src/features/idml/idmlParser.value.test.ts`

**Interfaces:**
- Consumes: `valueXmlElementStory`, `extractStoryFields`, `templatizeXmlElementStory`+`flattenXmlElementStory` (Task 1 + existant).
- Produces:
  - `IdmlObject.mergeTemplate?: string` (le texte avec `{{champ}}`, même concaténation que `text`).
  - `IdmlObject.mergeFields?: string[]`.
  - `parseStory` lit désormais la version **valeur** (`obj.text` = valeurs d'origine).

- [ ] **Step 1: Write the failing test**

```typescript
// src/features/idml/idmlParser.value.test.ts
import { describe, it, expect } from 'vitest'
import { parseIdml } from './idmlParser'

const SPREAD = `<?xml version="1.0"?><idPkg:Spread xmlns:idPkg="x"><Spread Self="sp1">
<Page Self="pg1" GeometricBounds="0 0 200 200" ItemTransform="1 0 0 1 0 0" />
<TextFrame Self="tf1" ParentStory="u16c" ItemTransform="1 0 0 1 10 10">
<Properties><PathGeometry><GeometryPathType><PathPointArray>
<PathPointType Anchor="0 0"/><PathPointType Anchor="100 0"/>
<PathPointType Anchor="100 50"/><PathPointType Anchor="0 50"/>
</PathPointArray></GeometryPathType></PathGeometry></Properties>
</TextFrame></Spread></idPkg:Spread>`

const STORY = `<?xml version="1.0"?><idPkg:Story xmlns:idPkg="x"><Story Self="u16c">
<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/n">
<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/n">
<XMLElement MarkupTag="XMLTag/Prix_normal"><Content>22,99</Content></XMLElement>
</CharacterStyleRange></ParagraphStyleRange></Story></idPkg:Story>`

describe('parseIdml — valeurs d’origine', () => {
  it('texte = valeur d’origine (pas {{}}), mergeTemplate = {{Prix_normal}}, mergeFields listés', () => {
    const doc = parseIdml({ 'Spreads/s.xml': SPREAD }, { 'Stories/u16c.xml': STORY }, {}, '')
    const tf = doc.objects.find((o) => o.type === 'TextFrame')
    const text = (tf?.paragraphs ?? []).map((p) => p.text).join('')
    expect(text).toContain('22,99')
    expect(text).not.toContain('{{')
    expect(tf?.mergeTemplate).toContain('{{Prix_normal}}')
    expect(tf?.mergeFields).toEqual(['Prix_normal'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/features/idml/idmlParser.value.test.ts`
Expected: FAIL — le texte vaut `{{Prix_normal}}` et `mergeTemplate`/`mergeFields` sont absents.

- [ ] **Step 3: Write minimal implementation**

3a. Étendre l'interface `IdmlObject` (vers la ligne 75, près de `ecImageField`) :

```typescript
  ecImageField?: string
  mergeTemplate?: string  // texte avec {{champ}} (même concaténation que le texte affiché)
  mergeFields?: string[]  // champs liés à ce bloc (XML natif)
```

3b. Dans `parseStory` (ligne 928), lire la version **valeur** au lieu du flatten template :

```typescript
  const doc = parseXml(valueXmlElementStory(storyXml))
```

(importer `valueXmlElementStory` en tête, à côté de `flattenXmlElementStory`.)

3c. Dans `parseIdml`, construire une map `storyId → { template, fields }` à partir des stories,
en réutilisant `flattenXmlElementStory` (texte template) + `parseStory` pour concaténer le
template **comme** le texte. Le plus simple : une fonction interne qui parse la version template
et concatène les `.text` :

```typescript
// près de la construction de storiesMap (ligne ~1565)
const storyMergeMap = new Map<string, { template: string; fields: string[] }>()
for (const [, xml] of Object.entries(stories)) {
  try {
    const doc = parseXml(xml)
    const storyEls = doc.getElementsByTagName('Story')
    if (storyEls.length === 0) continue
    const storyId = storyEls[0].getAttribute('Self') ?? ''
    if (!storyId) continue
    const fields = extractStoryFields(xml)
    if (fields.length === 0) continue // story non balisée → pas de template
    // template = texte de la version {{}}, concaténé comme le Textbox
    const tplParas = parseStory(flattenStoryXml(xml), colorMap, paraStyles, charStyles)
    const template = tplParas.map((p) => p.text.replace(/\n$/, '')).join('\n')
    storyMergeMap.set(storyId, { template, fields })
  } catch { /* skip */ }
}
```

> `flattenStoryXml` = l'ancien comportement (substitution `{{}}`). Comme `parseStory` lit
> désormais la version **valeur**, le calcul du template doit passer le XML déjà flatten-template
> à `parseStory`. Pour éviter une double-substitution, exposer une variante de `parseStory` qui
> prend un flag « ne pas re-flatten » OU appliquer `flattenXmlElementStory(xml)` ici et faire que
> `parseStory` ne re-flatten pas si le XML ne contient plus de `MarkupTag`. **Décision** :
> `valueXmlElementStory`/`flattenXmlElementStory` sont idempotents sur un XML déjà sans
> `<XMLElement>` (early-return `if (doc.getElementsByTagName('XMLElement').length === 0)`), donc
> passer `flattenXmlElementStory(xml)` à `parseStory` est sûr : `valueXmlElementStory` à
> l'intérieur ne touchera plus rien (`{{}}` déjà en place, plus de balises). Utiliser :
> `const tplParas = parseStory(flattenXmlElementStory(xml), colorMap, paraStyles, charStyles)`.

3d. Poser `mergeTemplate`/`mergeFields` sur le TextFrame (dans `parseElement`, là où
`paragraphs` est attaché, ligne ~1869) — passer `storyMergeMap` à la chaîne
`walkElementsInOrder`/`parseElement` (param optionnel avec défaut, comme `imageFieldMap`), puis :

```typescript
    const merge = storyMergeMap.get(storyId)
    return {
      ...base, storyId, paragraphs,
      ...(merge ? { mergeTemplate: merge.template, mergeFields: merge.fields } : {}),
      // ... reste
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/features/idml/idmlParser.value.test.ts`
Expected: PASS.

Run: `npm run test:run -- src/features/idml/idmlParser.xmltags.test.ts src/features/idml/idmlParser.image.test.ts`
Expected: ⚠️ le test `idmlParser.xmltags.test.ts` (Task 3 de la Phase 1) **assert que le texte
contient `{{Prix}}`** — il devient FAUX avec ce changement. Le **mettre à jour** pour asserter la
valeur d'origine + `mergeTemplate`/`mergeFields` (c'est le comportement voulu, pas une
régression). Documenter ce changement dans le commit.

Run: `npx tsc -b`
Expected: aucune erreur (les appelants de `parseIdml` restent valides ; nouveaux champs optionnels).

- [ ] **Step 5: Commit**

```bash
git add src/features/idml/idmlParser.ts src/features/idml/idmlParser.value.test.ts src/features/idml/idmlParser.xmltags.test.ts
git commit -m "feat(idml): parser affiche la valeur + pose mergeTemplate/mergeFields"
```

---

### Task 3 : Poser data.text/templateText/originText/mergeFields sur le Textbox

**Files:**
- Modify: `src/features/idml/idmlToFabric.ts`

**Interfaces:**
- Consumes: `IdmlObject.mergeTemplate`/`mergeFields` (Task 2).
- Produces: Textbox avec `text` = valeur, `data.templateText` = template, `data.originText` = valeur, `data.mergeFields`.

- [ ] **Step 1: Modifier la création du Textbox**

Dans `idmlToFabric.ts`, au bloc Textbox (`fullText` + `new Textbox(...)`, ~lignes 381-524), `fullText`
est déjà la **valeur** (Task 2). Étendre `data` :

```typescript
        data: {
          ...makeData(obj, fullText.slice(0, 30) || 'Texte'),
          idmlPtScale: sY,
          ...(obj.mergeTemplate ? {
            templateText: obj.mergeTemplate,
            originText: fullText,
            originStyles: fabricCharStyles ?? {}, // styles par-caractère de la VALEUR (persistance)
            mergeFields: obj.mergeFields ?? [],
          } : {}),
        },
```

> `fullText` = valeur affichée ; `obj.mergeTemplate` = template `{{}}` ; `fabricCharStyles` = les
> styles par-caractère de la valeur (déjà calculés pour le Textbox). `originStyles` est requis pour
> que le **formatage survive au reload** (cf. Task 4). Pour un bloc image, le
> champ reste `data.ecImageField` (Phase 1) ; ajouter `mergeFields: [ecImageField]` au bloc image
> pour cohérence d'affichage (Phase B). Ne pas poser `templateText` si le bloc n'est pas balisé.

- [ ] **Step 2: Vérifier compilation + build**

Run: `npx tsc -b`
Expected: aucune erreur.

Run: `npm run build`
Expected: build OK.

- [ ] **Step 3: Commit**

```bash
git add src/features/idml/idmlToFabric.ts
git commit -m "feat(idml): Textbox affiche la valeur, template/originText/mergeFields en data"
```

---

### Task 4 : Persistance — sauver la valeur (pas le template)

`useAutoSave` échange aujourd'hui `obj.text` → `data.templateText` avant de sérialiser (le JSON
sauvé porte `{{}}`). On change la **cible** vers `data.originText` quand il existe (blocs IDML
balisés), en gardant le comportement actuel pour les `{{}}` manuels (sans `originText`).

**Files:**
- Modify: `src/features/editor/useAutoSave.ts` (~lignes 134-179)
- Test: `src/features/editor/useAutoSave.persist.test.ts` (test ciblé de la fonction de swap, extraite si besoin)

**Interfaces:**
- Consumes: `data.templateText`, `data.originText` (Tasks 2-3).
- Produces: JSON sérialisé dont `text` = valeur stable pour les blocs IDML balisés.

- [ ] **Step 1: Écrire un test ciblé de la règle de swap**

Extraire la décision en fonction pure testable `serializedTextFor(obj)` :

```typescript
// src/features/editor/useAutoSave.persist.test.ts
import { describe, it, expect } from 'vitest'
import { serializedTextFor } from './useAutoSave'

describe('serializedTextFor', () => {
  it('bloc IDML balisé (originText présent) → sérialise la VALEUR stable', () => {
    expect(serializedTextFor({ text: '49,90', data: { templateText: '{{Prix}}', originText: '22,99' } }))
      .toBe('22,99')
  })
  it('{{}} manuel (pas d’originText) → sérialise le template (comportement legacy)', () => {
    expect(serializedTextFor({ text: 'Jean', data: { templateText: '{{nom}}' } }))
      .toBe('{{nom}}')
  })
  it('bloc sans template → texte inchangé', () => {
    expect(serializedTextFor({ text: 'OFFRE', data: {} })).toBe('OFFRE')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/features/editor/useAutoSave.persist.test.ts`
Expected: FAIL — `serializedTextFor` non exporté.

- [ ] **Step 3: Implémenter + brancher**

```typescript
// useAutoSave.ts — fonction pure exportée
export function serializedTextFor(obj: { text?: string; data?: { templateText?: unknown; originText?: unknown } }): string {
  const d = obj.data ?? {}
  if (typeof d.originText === 'string') return d.originText // bloc IDML balisé : valeur stable
  if (typeof d.templateText === 'string') return d.templateText // {{}} manuel : legacy
  return obj.text ?? ''
}
```

Dans le Step 2 de `useAutoSave` (la boucle ~134-150), le swap concerne **text ET styles** (et
width, déjà géré via `originalWidth`). Remplacer :
- le gate `if (obj.data?.templateText)` par `if (obj.data?.templateText || obj.data?.originText)` ;
- la cible texte `obj.set('text', tmpl)` par `obj.set('text', serializedTextFor(obj))` ;
- la cible **styles** : pour un bloc IDML (`data.originStyles` présent), swapper vers
  `originStyles` ; sinon garder le legacy `templateStyles`. Concrètement, remplacer la ligne
  styles existante par :

```typescript
        const idmlStyles = obj.data.originStyles as Record<number, Record<number, Record<string, unknown>>> | undefined
        if (idmlStyles) {
          // bloc IDML : sérialiser les styles de la VALEUR
          ;(obj as any).styles = JSON.parse(JSON.stringify(idmlStyles))
        } else {
          // legacy {{}} manuel : styles du template (comportement actuel)
          const tStyles = obj.data.templateStyles as Record<number, Record<number, Record<string, unknown>>> | undefined
          ;(obj as any).styles = tStyles && Object.keys(tStyles).length > 0 ? JSON.parse(JSON.stringify(tStyles)) : {}
        }
```

Le Step 4 (restauration de `resolved` + styles capturés) reste inchangé (il restaure
`obj.text`/`obj.styles` capturés avant swap, donc l'écran n'est pas affecté).

> Effet : le JSON sauvé porte la **valeur stable + son formatage** pour les blocs IDML, le `{{}}`
> pour le legacy manuel. `data.templateText`/`originStyles` restent dans `data` (sérialisé) → le
> merge fonctionne et le formatage survit au reload.

- [ ] **Step 4: Vérifier**

Run: `npm run test:run -- src/features/editor/useAutoSave.persist.test.ts`
Expected: PASS.

Run: `npx tsc -b` ; `npm run test:run -- src/features/merge src/features/editor`
Expected: PASS (non-régression).

- [ ] **Step 5: Commit**

```bash
git add src/features/editor/useAutoSave.ts src/features/editor/useAutoSave.persist.test.ts
git commit -m "feat(editor): sauvegarder la valeur stable des blocs IDML balisés (pas {{}})"
```

---

### Task 5 : Disconnect & édition montrent la valeur ; sync originText

**Files:**
- Modify: `src/features/merge/useDataMerge.ts` (disconnect ~ligne 295 ; édition ~ligne 567 ; capture ~582)

**Interfaces:**
- Consumes: `data.originText`, `data.templateText` (Tasks 2-4).
- Produces: comportement d'affichage/édition cohérent (valeur, pas `{{}}`).

- [ ] **Step 1: Disconnect restaure la valeur**

À `disconnectSource` (~ligne 295), remplacer `obj.set('text', obj.data.templateText ...)` par :

```typescript
        const restore = (obj.data.originText ?? obj.data.templateText) as string
        obj.set('text', restore)
```

(blocs IDML → valeur ; `{{}}` manuel → template, inchangé.)

- [ ] **Step 2: Édition montre la valeur (bloc IDML)**

À `handleEditingEntered` (~ligne 567), ne montrer le template QUE pour le legacy manuel :

```typescript
  if (target.data?.templateText && !target.data?.originText) {
    target.set('text', target.data.templateText as string) // legacy {{}} manuel
  }
  // bloc IDML balisé (originText présent) : on laisse la valeur affichée (édition de la valeur)
```

- [ ] **Step 3: Sync originText sur édition d'un bloc IDML**

Dans **`handleEditingExited`** (ligne 577 — handler de **SORTIE** d'édition, PAS `handleEditingEntered`),
là où le code re-capture/résout (~lignes 582-618), pour un bloc IDML balisé non connecté, mettre à
jour `originText` (et `originStyles`) avec le texte/styles édités :

```typescript
  if (target.data?.originText && !hasPlaceholders(currentText)) {
    target.data.originText = currentText // la valeur stable suit l'édition
    const styles = (target as any).styles
    if (styles && Object.keys(styles).length > 0) {
      target.data.originStyles = JSON.parse(JSON.stringify(styles))
    }
  }
```

> Ne PAS toucher `templateText` (le mapping `{{champ}}` ne change pas en éditant la valeur).

- [ ] **Step 4: Vérifier la non-régression du merge**

Run: `npx tsc -b`
Expected: aucune erreur.

Run: `npm run test:run -- src/features/merge`
Expected: PASS (les flux `{{}}` manuels inchangés ; vérifier que `resolveText`/`applyRow` via
`data.templateText` restent verts).

- [ ] **Step 5: Commit**

```bash
git add src/features/merge/useDataMerge.ts
git commit -m "feat(merge): blocs IDML balisés affichent/éditent la valeur, pas {{}}"
```

---

### Task 6 : Test d'intégration round-trip + knip

**Files:**
- Test: `src/features/idml/valueRoundtrip.test.ts`

- [ ] **Step 1: Test round-trip parse → merge**

```typescript
// src/features/idml/valueRoundtrip.test.ts
import { describe, it, expect } from 'vitest'
import { resolveText } from '@/features/merge/mergeEngine'
import { serializedTextFor } from '@/features/editor/useAutoSave'
import type { MergeRow } from '@/stores/merge.store'

describe('round-trip valeur ↔ merge', () => {
  it('la valeur stable est sérialisée, et le template résout la data', () => {
    const data = { templateText: '{{Prix_normal}}', originText: '22,99', mergeFields: ['Prix_normal'] }
    // sauvegarde : on persiste la valeur stable, pas {{}}
    expect(serializedTextFor({ text: '22,99', data })).toBe('22,99')
    // merge : le template résout la ligne
    const row: MergeRow = { _id: 'r1', Prix_normal: '49,90' }
    expect(resolveText(data.templateText, row)).toBe('49,90')
  })
})
```

- [ ] **Step 2: Vérifier**

Run: `npm run test:run -- src/features/idml/valueRoundtrip.test.ts`
Expected: PASS.

Run: `npm run test:run` ; `npx tsc -b` ; `npx knip`
Expected: suite verte, tsc clean, knip exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/features/idml/valueRoundtrip.test.ts
git commit -m "test(idml): round-trip valeur d'origine ↔ merge"
```

---

## Gate de validation réel (utilisateur, avant Phase B)

Après Phase A, **valider dans l'app** (build + deploy ou dev) :
- [ ] Réimporter le V6 → la maquette affiche les **valeurs** (« 22€,99 », « +55g GRATUIT »…),
      **plus aucun `{{}}`**.
- [ ] Sauvegarder, recharger le projet → toujours les valeurs (pas `{{}}`).
- [ ] **Le formatage est préservé après reload** (couleurs/tailles par-caractère, ex. le « € »
      du prix dans son style) — pas seulement le texte (vérifie `originStyles`).
- [ ] Connecter une source de données → les valeurs se mettent à jour (merge OK).
- [ ] Déconnecter → revient aux valeurs d'origine (pas `{{}}`).

Si OK → Phase B (4 connecteurs UI : panneau, tooltip, badge permanent, liste globale), plan séparé.

## Self-review

- **Couverture spec** : affichage valeur (T1-T3) ✓ ; template/fields en métadonnée (T2-T3) ✓ ;
  persistance valeur (T4) ✓ ; disconnect/édition valeur + sync originText (T5) ✓ ; merge intact
  (data.templateText, non-régression T4-T6) ✓ ; limite v1 styles mergés (documentée) ✓ ;
  rétro-compat `{{}}` manuel (T4-T5) ✓.
- **Placeholders** : aucun ; code réel partout.
- **Cohérence des types** : `valueXmlElementStory`/`extractStoryFields` (T1) → `idmlParser` (T2) ;
  `IdmlObject.mergeTemplate`/`mergeFields` (T2) → `idmlToFabric` (T3) ; `data.templateText`/
  `originText`/`mergeFields` (T3) → `serializedTextFor` (T4) + `useDataMerge` (T5) + round-trip (T6).

## Points à vérifier à l'implémentation

- **`parseStory` re-flatten** (T2 step 3c) : confirmer l'idempotence (early-return si plus de
  `<XMLElement>`) pour que passer `flattenXmlElementStory(xml)` à `parseStory` ne double-substitue
  pas. Sinon, ajouter un flag `skipFlatten` à `parseStory`.
- **Threading `storyMergeMap`** : comme `imageFieldMap`, ajouter un paramètre optionnel à
  `walkElementsInOrder`/`parseElement` (défaut `new Map()`), propager aux 2 appels.
- **`serializedTextFor` non couvert par knip** : exporté + consommé par `useAutoSave` et le test.
