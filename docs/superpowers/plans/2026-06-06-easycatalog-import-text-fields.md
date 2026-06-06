# EasyCatalog — Import des champs TEXTE (moitié document, étape 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** À l'import d'un IDML produit par EasyCatalog, reconnaître les champs texte (marqueurs `ECTagData $ID/4…/5…`) et les transformer en placeholders `{{NomChamp}}` éditables — directement consommables par le moteur merge existant.

**Architecture:** Deux helpers purs et testés dans `src/features/easycatalog/ecIdmlImport.ts` (`parseEcTag`, `decodeEcName`), intégrés par une greffe minimale dans la boucle `CharacterStyleRange` de `parseStory` (`src/features/idml/idmlParser.ts`). Le placeholder remplace le texte du run AVANT l'accumulation dans `combinedText`, donc l'indexation des styles par caractère reste cohérente sans autre changement. `useDataMerge.connectSource` détecte déjà `{{}}` et pose `templateText` → aucun changement dans `idmlToFabric.ts` ni dans le merge.

**Tech Stack:** TypeScript strict, Vitest, DOMParser (déjà utilisé par idmlParser).

**Réf. spec :** `docs/superpowers/specs/2026-06-06-easycatalog-interop-design.md` (§7.1 import texte, §11 format).

**Périmètre :** champs TEXTE forme simple `$ID/4`/`$ID/5` uniquement. HORS scope (plans suivants) : champs image (`ECPageItemData`), forme qualifiée `$ID/2`/`$ID/3` (chemin data source ambigu → laissés en texte statique), export IDML natif preserve-and-patch.

**Convention commits :** trailer `-m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`. Branche : `master` directement (préférence utilisateur, pas de worktree). Types : `npx tsc -b`. Tests : `npx vitest run <fichier>`.

---

### Task 1: Helpers purs `parseEcTag` + `decodeEcName`

**Files:**
- Create: `src/features/easycatalog/ecIdmlImport.ts`
- Test: `src/features/easycatalog/ecIdmlImport.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/easycatalog/ecIdmlImport.test.ts
import { describe, it, expect } from 'vitest'
import { parseEcTag, decodeEcName } from './ecIdmlImport'

describe('decodeEcName', () => {
  it('décode les espaces URL-encodés', () => {
    expect(decodeEcName('Astérisque%20Exclusion')).toBe('Astérisque Exclusion')
    expect(decodeEcName('Prix%20Malin')).toBe('Prix Malin')
  })
  it('laisse un nom simple intact', () => {
    expect(decodeEcName('Name')).toBe('Name')
  })
  it('retombe sur la valeur brute (trim) si le décodage échoue', () => {
    expect(decodeEcName('%E0%')).toBe('%E0%')
  })
})

describe('parseEcTag', () => {
  it('reconnaît un marqueur d’ouverture $ID/4', () => {
    expect(parseEcTag('$ID/4 Description')).toEqual({ kind: 'open', field: 'Description' })
  })
  it('reconnaît un marqueur de fermeture $ID/5', () => {
    expect(parseEcTag('$ID/5 Prix%20Malin')).toEqual({ kind: 'close', field: 'Prix Malin' })
  })
  it('décode les noms de champ avec espaces', () => {
    expect(parseEcTag('$ID/4 Astérisque%20Exclusion')).toEqual({ kind: 'open', field: 'Astérisque Exclusion' })
  })
  it('ignore la forme qualifiée $ID/2 / $ID/3 (chemin data source ambigu)', () => {
    expect(parseEcTag('$ID/2 $ID/Trafic%20596756%20Unité%20de%20vente')).toEqual({ kind: 'none' })
    expect(parseEcTag('$ID/3 quoi que ce soit')).toEqual({ kind: 'none' })
  })
  it('renvoie none pour null, vide ou attribut non-EC', () => {
    expect(parseEcTag(null)).toEqual({ kind: 'none' })
    expect(parseEcTag('')).toEqual({ kind: 'none' })
    expect(parseEcTag('AllCaps')).toEqual({ kind: 'none' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/easycatalog/ecIdmlImport.test.ts`
Expected: FAIL — `Failed to resolve import "./ecIdmlImport"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/easycatalog/ecIdmlImport.ts
// Détection des marqueurs de champ EasyCatalog dans un IDML.
// Format (relevé sur échantillon réel, cf. spec §11) : sur les <CharacterStyleRange>,
// l'attribut ECTagData="$ID/4 <nom>" ouvre un champ et "$ID/5 <nom>" le ferme ;
// le <Content> du marqueur ne contient qu'un U+FEFF (invisible). Noms URL-encodés.

export interface EcTagInfo {
  kind: 'open' | 'close' | 'none'
  field?: string
}

/** Décode un nom de champ EasyCatalog (URL-encodé) ; fallback sur la valeur brute si invalide. */
export function decodeEcName(raw: string): string {
  try {
    return decodeURIComponent(raw).trim()
  } catch {
    return raw.trim()
  }
}

/** Classe un attribut ECTagData. Forme simple $ID/4 (ouvre) / $ID/5 (ferme) uniquement ;
 *  la forme qualifiée $ID/2 / $ID/3 (chemin data source) est ignorée (ambiguë). */
export function parseEcTag(raw: string | null): EcTagInfo {
  if (!raw) return { kind: 'none' }
  const open = /^\$ID\/4 (.+)$/.exec(raw)
  if (open) return { kind: 'open', field: decodeEcName(open[1]) }
  const close = /^\$ID\/5 (.+)$/.exec(raw)
  if (close) return { kind: 'close', field: decodeEcName(close[1]) }
  return { kind: 'none' }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/easycatalog/ecIdmlImport.test.ts`
Expected: PASS (2 describes, 8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/easycatalog/ecIdmlImport.ts src/features/easycatalog/ecIdmlImport.test.ts
git commit -m "feat(easycatalog): helpers de détection des marqueurs de champ IDML (parseEcTag/decodeEcName)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Greffer la détection EC dans `parseStory`

**Files:**
- Modify: `src/features/idml/idmlParser.ts`

Contexte exact (lecture du fichier au préalable) :
- `parseStory` itère les `ParagraphStyleRange` (boucle `for p`, début ~ligne 946), puis pour chacun les `CharacterStyleRange` (boucle `for c`, début ligne 962).
- Les états `combinedText`, `resolvedStyle`, `charStylesMap` sont initialisés par paragraphe juste avant la boucle `for c` (lignes 958-960).
- Le texte d'un run est assemblé en `const text = textParts.join('')` (ligne 990), suivi de `if (!text || fontSize < 0.5) continue` (ligne 991), puis `const startIdx = combinedText.length` / `combinedText += text` (lignes 993-994).
- Les marqueurs EC ont un `<Content>` réduit à U+FEFF → après nettoyage (ligne 982) leur `text` est vide ; ils sont donc déjà ignorés, MAIS il faut lire leur `ECTagData` avant.

- [ ] **Step 1: Ajouter l’import du helper**

En tête de `src/features/idml/idmlParser.ts`, à côté des autres imports, ajouter :

```ts
import { parseEcTag } from '@/features/easycatalog/ecIdmlImport'
```

- [ ] **Step 2: Ajouter les états EC par paragraphe**

Repérer (dans la boucle `for p`) le bloc d’initialisation :

```ts
    let combinedText = ''
    let resolvedStyle: IdmlParagraph | null = null
    const charStylesMap: Record<number, CharStyleOverride> = {}
```

Le remplacer par (ajout de 2 états EC) :

```ts
    let combinedText = ''
    let resolvedStyle: IdmlParagraph | null = null
    const charStylesMap: Record<number, CharStyleOverride> = {}
    // EasyCatalog : champ ouvert en cours (entre $ID/4 et $ID/5) + flag d’émission unique
    let ecField: string | null = null
    let ecEmitted = false
```

- [ ] **Step 3: Insérer la détection des marqueurs**

Repérer :

```ts
      const text = textParts.join('')
      if (!text || fontSize < 0.5) continue
```

Le remplacer par :

```ts
      let text = textParts.join('')

      // ── EasyCatalog : marqueurs de champ ($ID/4 ouvre, $ID/5 ferme) ──
      const ecTag = parseEcTag(charEl.getAttribute('ECTagData'))
      if (ecTag.kind === 'open') {
        ecField = ecTag.field ?? null
        ecEmitted = false
        continue
      }
      if (ecTag.kind === 'close') {
        // champ vide (aucun run de valeur) → émettre quand même le placeholder
        if (ecField && !ecEmitted) combinedText += `{{${ecField}}}`
        ecField = null
        ecEmitted = false
        continue
      }
      if (ecField) {
        if (ecEmitted) continue // un seul placeholder par champ, même si la valeur s’étale sur plusieurs runs
        text = `{{${ecField}}}`
        ecEmitted = true
      }

      if (!text || fontSize < 0.5) continue
```

> Note : `text` passe de `const` à `let`. Le reste de la boucle (calcul `startIdx`, `combinedText += text`, boucle d’overrides `for i < text.length`) est inchangé et reste cohérent puisque `text` vaut désormais le placeholder.

- [ ] **Step 4: Vérifier les types**

Run: `npx tsc -b`
Expected: aucune erreur.

- [ ] **Step 5: Vérifier l’absence de régression sur la suite**

Run: `npm run test:run`
Expected: toute la suite passe (aucun test IDML existant cassé).

- [ ] **Step 6: Commit**

```bash
git add src/features/idml/idmlParser.ts
git commit -m "feat(easycatalog): import IDML — champs texte EasyCatalog reconnus comme {{placeholders}}" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Vérification réelle sur l’échantillon + note de spec

**Files:**
- Modify: `docs/superpowers/specs/2026-06-06-easycatalog-interop-design.md` (statut §7.1)

- [ ] **Step 1: Smoke test headless sur l’échantillon réel**

L’échantillon `IMPORTS/EasyCatalog/test-easycatalog.idml` est présent localement (non versionné). Vérifier que les noms de champs apparaissent bien en `{{…}}` après parsing, via un script Node ponctuel qui réutilise le parser. Comme `parseStory` n’est pas exporté, vérifier au niveau de la story XML déjà extraite :

Run (vérifie que la greffe produit les placeholders attendus sur une story réelle) :
```bash
node --input-type=module -e '
import { parseEcTag } from "./src/features/easycatalog/ecIdmlImport.ts";
import { readFileSync } from "node:fs";
import { DOMParser } from "@xmldom/xmldom";
' 2>/dev/null || echo "Si @xmldom/xmldom absent côté node, faire le smoke test via l’app (Step 2)."
```

Si le one-liner n’est pas exécutable hors navigateur (DOMParser navigateur), passer directement au Step 2 (vérification dans l’app), qui fait foi.

- [ ] **Step 2: Smoke test dans l’app (fait foi)**

Lancer `npm run dev`, importer `IMPORTS/EasyCatalog/test-easycatalog.idml`. Vérifier sur le canvas que les blocs texte issus de champs EasyCatalog affichent leurs noms en placeholders, p. ex. `{{Name}}`, `{{Description}}`, `{{Prix Malin}}`, `{{Astérisque Exclusion}}` (et non la valeur brute / le nom nu). Confirmer qu’aucun caractère U+FEFF parasite n’est visible.

- [ ] **Step 3: Mettre à jour le statut de la spec**

Dans `docs/superpowers/specs/2026-06-06-easycatalog-interop-design.md`, section §7.1, ajouter en fin de section une ligne de statut :

```md
> **Statut 2026-06-06** : import des champs TEXTE (forme `$ID/4`/`$ID/5`) LIVRÉ. Reste : champs image (`ECPageItemData`) et export IDML natif preserve-and-patch.
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-06-06-easycatalog-interop-design.md
git commit -m "docs(easycatalog): import champs texte livré — statut spec §7.1" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

- **Couverture spec §7.1 (texte)** : détection `ECTagData` $ID/4/5 → T1 (helpers) + T2 (greffe) ; placeholder `{{ecFieldName}}` consommé par merge → acquis via `connectSource` (pas de code) ; filtrage U+FEFF → déjà fait ligne 982. ✓
- **Hors scope explicite** : image (`ECPageItemData`), qualifié `$ID/2`/`$ID/3`, round-trip export → non touchés, documentés.
- **Cohérence des types** : `EcTagInfo`/`parseEcTag`/`decodeEcName` définis en T1, importés en T2. `text` passe `const`→`let` (signalé).
- **Risque indexation styles** : neutralisé — le placeholder remplace `text` AVANT `combinedText += text` et la boucle `for i < text.length`, donc les indices `charStylesMap` restent alignés.
- **Pas de placeholder de plan** : code complet à chaque step. Le smoke test headless (T3.S1) est best-effort (DOMParser navigateur) ; le smoke test app (T3.S2) fait foi.
