# EasyCatalog — Import des champs IMAGE (moitié document, étape 2b) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** À l'import d'un IDML EasyCatalog, reconnaître les cadres image (Rectangle vides portant `ECPageItemData="2 2 <NomChamp>"`) et les matérialiser en `FabricImage` placeholder liés au champ (`data.bindings.src`), pour que le merge y charge l'image par ligne.

**Architecture:** Helper pur `parseEcImageField` (dans `ecIdmlImport.ts`, testé). Le parser (`idmlParser.ts`) lit `ECPageItemData` sur chaque élément et pose `obj.ecImageField`. `idmlToFabric.ts` : pour un Rectangle avec `ecImageField`, créer un `FabricImage` placeholder (GIF 1×1 transparent — sûr en Fabric v6, `instanceof FabricImage` vrai) avec `data.bindings = { src: <champ> }`. Le merge (`useDataMerge.applyRow`) charge déjà l'image sur la branche `prop === 'src' && obj instanceof FabricImage` — **aucun changement merge**.

**Tech Stack:** TypeScript strict, Vitest, Fabric.js v6.

**Réf. spec :** `docs/superpowers/specs/2026-06-06-easycatalog-interop-design.md` (§7.1 image, §11 format).

**Périmètre / hors scope :** la VALEUR de la colonne liée doit être chargeable par `loadImage` (URL Firebase, ou nom de fichier résolu via Firebase Storage — comportement existant). On ne télécharge/substitue pas les binaires ici ; on pose le binding. Forme `ECPageItemData` attendue : `"2 2 <champ>"`.

**Convention commits :** trailer `-m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`. Branche `master`. Types : `npx tsc -b`. Tests : `npx vitest run <fichier>`.

---

### Task 1: Helper pur `parseEcImageField`

**Files:**
- Modify: `src/features/easycatalog/ecIdmlImport.ts`
- Modify: `src/features/easycatalog/ecIdmlImport.test.ts`

- [ ] **Step 1: Write the failing test (ajouter au fichier existant)**

```ts
// Ajouter à l'import en tête de ecIdmlImport.test.ts :
import { parseEcImageField } from './ecIdmlImport'

// Ajouter ce bloc à la fin de ecIdmlImport.test.ts :
describe('parseEcImageField', () => {
  it('extrait le nom de champ d’un cadre image "2 2 <nom>"', () => {
    expect(parseEcImageField('2 2 Asset_001_page')).toBe('Asset_001_page')
    expect(parseEcImageField('2 2 Suppliers_01')).toBe('Suppliers_01')
  })
  it('décode les espaces URL-encodés', () => {
    expect(parseEcImageField('2 2 Picto%201')).toBe('Picto 1')
  })
  it('ignore les formes non-image (ECPaginationPageItemData, vide, null)', () => {
    expect(parseEcImageField('1 1 5 Type 0x53 STUNT')).toBeNull()
    expect(parseEcImageField('')).toBeNull()
    expect(parseEcImageField(null)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/easycatalog/ecIdmlImport.test.ts`
Expected: FAIL — `parseEcImageField is not a function`.

- [ ] **Step 3: Write minimal implementation (ajouter à ecIdmlImport.ts)**

```ts
// Ajouter à la fin de src/features/easycatalog/ecIdmlImport.ts

/** Extrait le nom de champ d'un cadre image EasyCatalog : ECPageItemData="2 2 <nom>". */
export function parseEcImageField(raw: string | null): string | null {
  if (!raw) return null
  const m = /^2 2 (.+)$/.exec(raw.trim())
  if (!m) return null
  return decodeEcName(m[1])
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/easycatalog/ecIdmlImport.test.ts`
Expected: PASS (3 describes : decodeEcName, parseEcTag, parseEcImageField).

- [ ] **Step 5: Commit**

```bash
git add src/features/easycatalog/ecIdmlImport.ts src/features/easycatalog/ecIdmlImport.test.ts
git commit -m "feat(easycatalog): helper parseEcImageField (cadre image ECPageItemData)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Parser `ECPageItemData` dans `idmlParser.ts`

**Files:**
- Modify: `src/features/idml/idmlParser.ts`

- [ ] **Step 1: Ajouter `ecImageField` à l’interface `IdmlObject`**

Repérer, dans l’interface `IdmlObject` (vers la fin, après `isAnchored?: boolean`) :

```ts
  // True for anchored frames (position relative to parent text flow, not absolute)
  isAnchored?: boolean
}
```

Le remplacer par :

```ts
  // True for anchored frames (position relative to parent text flow, not absolute)
  isAnchored?: boolean
  // EasyCatalog : nom du champ image lié (cadre Rectangle portant ECPageItemData="2 2 <champ>")
  ecImageField?: string
}
```

- [ ] **Step 2: Importer le helper**

Repérer l’import existant en tête de fichier :

```ts
import { parseEcTag } from '@/features/easycatalog/ecIdmlImport'
```

Le remplacer par :

```ts
import { parseEcTag, parseEcImageField } from '@/features/easycatalog/ecIdmlImport'
```

- [ ] **Step 3: Lire `ECPageItemData` dans `parseElement` et le propager**

Dans `parseElement`, repérer la ligne qui calcule l’id de l’élément :

```ts
  const id = attr(el, 'Self') || `item_${Math.random().toString(36).slice(2)}`
```

Insérer juste après :

```ts
  // EasyCatalog : cadre image (Rectangle vide avec ECPageItemData="2 2 <champ>")
  const ecImageField = parseEcImageField(el.getAttribute('ECPageItemData')) ?? undefined
```

Puis repérer l’objet retourné par `parseElement` qui contient les propriétés `hasImage, imagePath,` et y ajouter `ecImageField`. Repérer :

```ts
    hasImage, imagePath,
```

Le remplacer par :

```ts
    hasImage, imagePath, ecImageField,
```

- [ ] **Step 4: Vérifier les types**

Run: `npx tsc -b`
Expected: aucune erreur.

- [ ] **Step 5: Commit**

```bash
git add src/features/idml/idmlParser.ts
git commit -m "feat(easycatalog): parser ECPageItemData → IdmlObject.ecImageField" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Placeholder `FabricImage` dans `idmlToFabric.ts`

**Files:**
- Modify: `src/features/idml/idmlToFabric.ts`

- [ ] **Step 1: Ajouter la constante du GIF 1×1 transparent**

Repérer les imports en tête (ligne 10-13) :

```ts
import { Rect, Ellipse, Line, Textbox, Path, Shadow, FabricImage } from 'fabric'
import type { FabricObject } from 'fabric'
import type { IdmlObject, IdmlColor, IdmlParagraph } from './idmlParser'
import { resolveAvailableFont } from '@/features/assets/useFonts'
```

Insérer juste après cette zone d’imports :

```ts
// GIF 1×1 transparent : src sûr pour un FabricImage placeholder (pas de crash Fabric v6,
// instanceof FabricImage = true → débloque la branche binding 'src' du merge).
const EC_TRANSPARENT_1PX =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
```

- [ ] **Step 2: Brancher le cadre image EC dans le `case 'Rectangle'`**

Repérer le début du case Rectangle :

```ts
    case 'Rectangle': {
      const cr = obj.cornerRadius ? obj.cornerRadius * Math.min(Math.abs(obj.scaleX), Math.abs(obj.scaleY)) : 0
      if (obj.hasImage) {
```

Le remplacer par (insertion de la branche EC AVANT `if (obj.hasImage)`) :

```ts
    case 'Rectangle': {
      const cr = obj.cornerRadius ? obj.cornerRadius * Math.min(Math.abs(obj.scaleX), Math.abs(obj.scaleY)) : 0
      // EasyCatalog : cadre image → FabricImage placeholder lié au champ (merge y chargera l'image)
      if (obj.ecImageField) {
        const imgEl = new Image()
        imgEl.src = EC_TRANSPARENT_1PX
        return new FabricImage(imgEl, {
          left: cx, top: cy, originX: 'center', originY: 'center',
          width: displayW, height: displayH, angle,
          shadow: makeShadow(obj),
          data: {
            ...makeData(obj, obj.ecImageField),
            type: 'image',
            ecImageField: obj.ecImageField,
            bindings: { src: obj.ecImageField },
          },
        })
      }
      if (obj.hasImage) {
```

> Note : `cx, cy, displayW, displayH, angle, makeShadow, makeData, FabricImage` sont tous déjà en portée dans cette fonction (utilisés par les branches voisines).

- [ ] **Step 3: Vérifier les types**

Run: `npx tsc -b`
Expected: aucune erreur.

- [ ] **Step 4: Vérifier l’absence de régression**

Run: `npm run test:run`
Expected: toute la suite passe.

- [ ] **Step 5: Commit**

```bash
git add src/features/idml/idmlToFabric.ts
git commit -m "feat(easycatalog): cadre image EC → FabricImage placeholder + binding src" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Vérification + note de spec

**Files:**
- Modify: `docs/superpowers/specs/2026-06-06-easycatalog-interop-design.md` (§7.1)

- [ ] **Step 1: Vérifs automatiques**

Run: `npx tsc -b` (exit 0) puis `npm run test:run` (tout vert, dont `ecIdmlImport.test.ts`).

- [ ] **Step 2: Smoke test app (à valider par l’utilisateur — non automatisable ici)**

Importer `IMPORTS/EasyCatalog/test-easycatalog.idml`, vérifier que les cadres image (Asset_xxx, Picto_x, Suppliers_xx) apparaissent comme blocs image (placeholder transparent) et non perdus. Connecter une data source dont une colonne porte des URLs image → la preview doit charger les images dans ces cadres.

- [ ] **Step 3: Mettre à jour la spec §7.1**

Dans `docs/superpowers/specs/2026-06-06-easycatalog-interop-design.md`, §7.1, mettre à jour la ligne de statut existante en :

```md
> **Statut 2026-06-06** : import des champs TEXTE (`$ID/4`/`$ID/5`) ET IMAGE (`ECPageItemData`) LIVRÉ. Reste : export IDML natif preserve-and-patch (templatisation).
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-06-06-easycatalog-interop-design.md
git commit -m "docs(easycatalog): import champs image livré — statut spec §7.1" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

- **Couverture** : §7.1 image → T1 (helper) + T2 (parser) + T3 (Fabric placeholder). Merge consommateur → acquis (branche `src` existante, vérifiée `useDataMerge.ts:248`). ✓
- **Sécurité Fabric v6** : placeholder = data-URI GIF 1×1 (pas de `placeholder:` → pas de crash connu). `instanceof FabricImage` vrai → binding `src` actif.
- **Cohérence types** : `parseEcImageField` (T1) importé en T2 ; `ecImageField` ajouté à `IdmlObject` (T2) lu en T3. `EC_TRANSPARENT_1PX` local à idmlToFabric.
- **Hors scope** : pas de substitution binaire, pas d’export (plan 3), forme `ECPageItemData` non-"2 2" ignorée.
- **Risque régression** : la branche EC est gardée par `obj.ecImageField` (absent des IDML non-EC) → comportement Rectangle inchangé ailleurs ; non-régression validée par `npm run test:run`.
