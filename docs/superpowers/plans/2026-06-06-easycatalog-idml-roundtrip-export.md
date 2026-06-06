# EasyCatalog — Export IDML round-trip (moitié document, étape 3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produire, à l'export IDML multi-pages (merge), un fichier qu'EasyCatalog reconnaît nativement : on **conserve les marqueurs `ECTagData`** et on réinjecte des placeholders `{{champ}}` entre eux, que `patchStories` résout ensuite par ligne.

**Problème résolu:** le XML source EC contient les VRAIES valeurs entre les marqueurs (`$ID/4`/`$ID/5`), pas des `{{}}`. `patchStories` (regex sur `<Content>{{…}}</Content>`) ne trouve donc rien à remplacer. Il faut une passe de **templatisation** qui réinjecte `{{champ}}` dans le run de valeur, en laissant les CSR marqueurs intacts.

**Architecture:** Nouveau fichier `src/features/merge/ecTemplatizer.ts` : `templatizeEcStory(xml)` (DOM, pur, testable en jsdom) applique la même logique d'ouverture/fermeture que l'import (`parseEcTag`) mais réécrit le `<Content>` du run de valeur en `{{champ}}` ; `templatizeEcContents(contents)` mappe sur `contents.stories`. Branché dans `useIdmlBatchExport` **entre** `extractIdmlContents` et `buildMultiPageIdml`. `patchStories` préserve déjà tous les attributs (donc les `ECTagData`) — **aucun changement dans `idmlPatcher.ts`**. Les cadres image (`ECPageItemData`) survivent par passe-plat (spreads non modifiés) → EC re-tire l'image ; **rien à faire côté image ici**.

**Tech Stack:** TypeScript strict, Vitest (jsdom : `DOMParser`/`XMLSerializer` dispo), JSZip (déjà au projet).

**Réf. spec :** `docs/superpowers/specs/2026-06-06-easycatalog-interop-design.md` (§7.2 export preserve-and-patch).

**Périmètre / hypothèses :** marqueurs `$ID/4`/`$ID/5` équilibrés (forme simple). Valeur multi-runs : seul le 1er run reçoit le placeholder, les autres sont vidés (perte de style intra-valeur, acceptable). Champ vide sans run de valeur : laissé tel quel (limite documentée). Forme qualifiée `$ID/2`/`$ID/3` : non templatisée. Export interactif `exportIdmlModified` : déjà EC-safe (préserve les attributs) — hors scope ici, on cible l'export merge multi-pages (`buildMultiPageIdml`).

**Convention commits :** trailer `-m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`. Branche `master`. Types : `npx tsc -b`. Tests : `npx vitest run <fichier>`.

---

### Task 1: `templatizeEcStory` + `templatizeEcContents`

**Files:**
- Create: `src/features/merge/ecTemplatizer.ts`
- Test: `src/features/merge/ecTemplatizer.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/merge/ecTemplatizer.test.ts
import { describe, it, expect } from 'vitest'
import { templatizeEcStory } from './ecTemplatizer'

const STORY = (inner: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>` +
  `<idPkg:Story xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging">` +
  `<Story Self="s1"><ParagraphStyleRange>${inner}</ParagraphStyleRange></Story></idPkg:Story>`

const MARK_OPEN = '<CharacterStyleRange ECTagData="$ID/4 Prix"><Content>﻿</Content></CharacterStyleRange>'
const MARK_CLOSE = '<CharacterStyleRange ECTagData="$ID/5 Prix"><Content>﻿</Content></CharacterStyleRange>'

describe('templatizeEcStory', () => {
  it('réinjecte {{champ}} dans le run de valeur et conserve les marqueurs', () => {
    const xml = STORY(`${MARK_OPEN}<CharacterStyleRange><Content>12,99</Content></CharacterStyleRange>${MARK_CLOSE}`)
    const out = templatizeEcStory(xml)
    expect(out).toContain('{{Prix}}')
    expect(out).not.toContain('12,99')
    expect(out).toContain('ECTagData="$ID/4 Prix"')
    expect(out).toContain('ECTagData="$ID/5 Prix"')
  })

  it('laisse une story sans ECTagData strictement inchangée', () => {
    const xml = STORY('<CharacterStyleRange><Content>Texte normal</Content></CharacterStyleRange>')
    expect(templatizeEcStory(xml)).toBe(xml)
  })

  it('avec une valeur sur plusieurs runs, place {{champ}} une seule fois et vide le reste', () => {
    const xml = STORY(
      `${MARK_OPEN}` +
      `<CharacterStyleRange><Content>12</Content></CharacterStyleRange>` +
      `<CharacterStyleRange><Content>,99</Content></CharacterStyleRange>` +
      `${MARK_CLOSE}`,
    )
    const out = templatizeEcStory(xml)
    expect((out.match(/\{\{Prix\}\}/g) ?? []).length).toBe(1)
    expect(out).not.toContain('12')
    expect(out).not.toContain(',99')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/merge/ecTemplatizer.test.ts`
Expected: FAIL — `Failed to resolve import "./ecTemplatizer"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/merge/ecTemplatizer.ts
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

  return new XMLSerializer().serializeToString(doc)
}

/** Applique la templatisation à toutes les stories d'un IdmlZipContents (autres champs inchangés). */
export function templatizeEcContents(contents: IdmlZipContents): IdmlZipContents {
  const stories: Record<string, string> = {}
  for (const [path, xml] of Object.entries(contents.stories)) {
    stories[path] = templatizeEcStory(xml)
  }
  return { ...contents, stories }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/merge/ecTemplatizer.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/merge/ecTemplatizer.ts src/features/merge/ecTemplatizer.test.ts
git commit -m "feat(easycatalog): templatizeEcStory — réinjecte {{champ}} entre marqueurs EC, marqueurs conservés" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Brancher la templatisation dans l’export IDML batch

**Files:**
- Modify: `src/features/merge/useIdmlBatchExport.ts`

- [ ] **Step 1: Ajouter l’import**

Repérer l’import existant :

```ts
import { extractIdmlContents, buildMultiPageIdml, type PatchOptions } from './idmlPatcher'
```

Ajouter juste après :

```ts
import { templatizeEcContents } from './ecTemplatizer'
```

- [ ] **Step 2: Templatiser le contenu extrait**

Repérer :

```ts
      // Extract XML contents
      const contents = await extractIdmlContents(buffer)
```

Le remplacer par :

```ts
      // Extract XML contents, puis templatiser les champs EasyCatalog ({{champ}} entre marqueurs)
      const contents = templatizeEcContents(await extractIdmlContents(buffer))
```

- [ ] **Step 3: Vérifier les types**

Run: `npx tsc -b`
Expected: aucune erreur.

- [ ] **Step 4: Vérifier l’absence de régression**

Run: `npm run test:run`
Expected: toute la suite passe (l’export IDML « manuel » à `{{}}` reste intact : `templatizeEcStory` ne touche que les stories contenant `ECTagData`, et retourne les autres inchangées).

- [ ] **Step 5: Commit**

```bash
git add src/features/merge/useIdmlBatchExport.ts
git commit -m "feat(easycatalog): export IDML batch templatise les champs EC avant patch (round-trip)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Vérification + note de spec

**Files:**
- Modify: `docs/superpowers/specs/2026-06-06-easycatalog-interop-design.md` (§7.2)

- [ ] **Step 1: Vérifs automatiques**

Run: `npx tsc -b` (exit 0) puis `npm run test:run` (tout vert, dont `ecTemplatizer.test.ts`).

- [ ] **Step 2: Smoke test app (à valider par l’utilisateur — non automatisable ici)**

Importer `IMPORTS/EasyCatalog/test-easycatalog.idml`, connecter une data source, puis **Exporter → IDML (multi-pages)**. Ouvrir l’IDML résultant : vérifier que chaque page porte les valeurs de la ligne correspondante ET que les marqueurs EC sont présents (réouverture dans EasyCatalog → champs reconnus). Vérification rapide hors InDesign : dézipper l’IDML exporté et confirmer la présence de `ECTagData="$ID/4 …"` + des valeurs résolues dans les `<Content>` (plus de `{{…}}` résiduel).

- [ ] **Step 3: Mettre à jour la spec §7.2**

Dans `docs/superpowers/specs/2026-06-06-easycatalog-interop-design.md`, §7.2, ajouter en fin de section :

```md
> **Statut 2026-06-06** : export IDML batch round-trip LIVRÉ — `templatizeEcContents` (`src/features/merge/ecTemplatizer.ts`) réinjecte `{{champ}}` entre les marqueurs conservés avant `buildMultiPageIdml`. Images : passe-plat (cadre + `ECPageItemData` conservés). Reste éventuel : forme qualifiée `$ID/2`/`$ID/3`, champs vides sans run de valeur.
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-06-06-easycatalog-interop-design.md
git commit -m "docs(easycatalog): export IDML round-trip livré — statut spec §7.2" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

- **Couverture §7.2** : preserve-and-patch → `templatizeEcStory` conserve les marqueurs (ne touche que le `<Content>` des runs de valeur) + `patchStories` existant résout par ligne en préservant les attributs (vérifié `idmlPatcher.ts:45`). Insertion entre extract et build (`useIdmlBatchExport.ts:58`). ✓
- **Pas de changement `idmlPatcher.ts`** : confirmé — `patchStories` opère sur `<Content>` uniquement, attributs (donc `ECTagData`) intacts.
- **Images** : passe-plat (spreads non modifiés ; `ECPageItemData` conservé) → rien à coder ici. ✓
- **Cohérence types** : `templatizeEcContents(contents: IdmlZipContents): IdmlZipContents` (type importé de `assemblyLoader`, identique à la sortie de `extractIdmlContents`) → compatible avec `buildMultiPageIdml(buffer, contents, …)`. Réutilise `parseEcTag` (déjà livré).
- **Non-régression export manuel** : `templatizeEcStory` early-return si pas d’`ECTagData` → stories à `{{}}` manuels inchangées.
- **Testabilité** : `DOMParser`/`XMLSerializer` présents en jsdom (env Vitest du projet) → `templatizeEcStory` testé en bout-à-bout au niveau XML.
- **Limites documentées** : multi-runs (style intra-valeur perdu), champ vide (non templatisé), `$ID/2`/`$ID/3` (ignoré).
