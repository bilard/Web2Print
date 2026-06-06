# EasyCatalog — Export data (moitié 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exporter une feuille du data workspace (`ExcelSheet`) vers un zip ingérable par EasyCatalog (CSV/XLSX + `fields.json` + `images.csv`), avec champ-clé garanti et noms de champs stables (`ecFieldName`).

**Architecture:** Logique pure et testable (`ecFieldName.ts`, `ecExport.ts`) → assemblage zip (`ecZip.ts`) → hook de download (`useEasyCatalogExport.ts`) → UI (`EasyCatalogExportModal.tsx`) branchée dans `DataPage.tsx`. Aucune nouvelle source de vérité : on consomme `ExcelSheet` existant. Le contrat `ecFieldName` sera réutilisé par la moitié document (round-trip IDML).

**Tech Stack:** TypeScript strict, React 18, Vitest, JSZip (déjà au projet), xlsx (déjà au projet), shadcn/ui + Tailwind.

**Réf. spec :** `docs/superpowers/specs/2026-06-06-easycatalog-interop-design.md` (§5 moitié data).

**Convention commits :** chaque `git commit` se termine par le trailer `-m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`. Branche : on travaille directement sur `master`.

**Vérif types :** toujours `npx tsc -b` (project references — `tsc --noEmit` ne vérifie rien). Tests : `npx vitest run <fichier>`.

---

### Task 1: Contrat de nommage `ecFieldName`

**Files:**
- Create: `src/features/easycatalog/ecFieldName.ts`
- Test: `src/features/easycatalog/ecFieldName.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/easycatalog/ecFieldName.test.ts
import { describe, it, expect } from 'vitest'
import { sanitizeEcName, buildEcFieldNames } from './ecFieldName'
import type { ExcelColumn } from '@/features/excel/types'

function col(key: string, label: string): ExcelColumn {
  return { key, label, fieldType: 'text', detectedType: 'text', isPrimary: false, width: 120 }
}

describe('sanitizeEcName', () => {
  it('garde lettres/chiffres/accents et remplace le reste par _', () => {
    expect(sanitizeEcName('Disponibilité FR-NL')).toBe('Disponibilité_FR_NL')
  })
  it('rogne les underscores aux extrémités', () => {
    expect(sanitizeEcName(' (Prix) ')).toBe('Prix')
  })
  it('retombe sur "field" si vide', () => {
    expect(sanitizeEcName('   ')).toBe('field')
  })
})

describe('buildEcFieldNames', () => {
  it('mappe chaque clé de colonne vers un nom assaini', () => {
    const m = buildEcFieldNames([col('col_1', 'Prix TTC'), col('col_2', 'Nom')])
    expect(m.get('col_1')).toBe('Prix_TTC')
    expect(m.get('col_2')).toBe('Nom')
  })
  it('déduplique les collisions avec un suffixe stable', () => {
    const m = buildEcFieldNames([col('a', 'Prix'), col('b', 'Prix'), col('c', 'prix')])
    expect(m.get('a')).toBe('Prix')
    expect(m.get('b')).toBe('Prix_2')
    expect(m.get('c')).toBe('Prix_3')
  })
  it('est déterministe (même entrée → même sortie)', () => {
    const cols = [col('a', 'X'), col('b', 'X')]
    expect([...buildEcFieldNames(cols)]).toEqual([...buildEcFieldNames(cols)])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/easycatalog/ecFieldName.test.ts`
Expected: FAIL — `Failed to resolve import "./ecFieldName"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/easycatalog/ecFieldName.ts
import type { ExcelColumn } from '@/features/excel/types'

/** Assainit un libellé en nom de champ EasyCatalog : garde lettres/chiffres (accents inclus), collapse le reste en '_'. */
export function sanitizeEcName(label: string): string {
  const cleaned = (label ?? '')
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
  return cleaned || 'field'
}

/** Construit un ecFieldName stable et unique par clé de colonne.
 *  La dédup est insensible à la casse et ancre le suffixe sur la casse vue en
 *  premier (Prix / Prix / prix → Prix / Prix_2 / Prix_3). */
export function buildEcFieldNames(columns: ExcelColumn[]): Map<string, string> {
  const result = new Map<string, string>()
  const used = new Set<string>()
  const canonicalByLower = new Map<string, string>()
  for (const col of columns) {
    const rawBase = sanitizeEcName(col.label || col.key)
    const lower = rawBase.toLowerCase()
    const base = canonicalByLower.get(lower) ?? rawBase
    if (!canonicalByLower.has(lower)) canonicalByLower.set(lower, rawBase)
    let name = base
    let n = 2
    while (used.has(name.toLowerCase())) {
      name = `${base}_${n}`
      n++
    }
    used.add(name.toLowerCase())
    result.set(col.key, name)
  }
  return result
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/easycatalog/ecFieldName.test.ts`
Expected: PASS (3 describes, 6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/easycatalog/ecFieldName.ts src/features/easycatalog/ecFieldName.test.ts
git commit -m "feat(easycatalog): contrat de nommage ecFieldName (assaini, unique, déterministe)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Helpers d'export — type EC, nom de fichier image, champ-clé

**Files:**
- Create: `src/features/easycatalog/ecExport.ts`
- Test: `src/features/easycatalog/ecExport.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/easycatalog/ecExport.test.ts
import { describe, it, expect } from 'vitest'
import { ecTypeFor, imageFileName, resolveKeyInfo } from './ecExport'
import { buildEcFieldNames } from './ecFieldName'
import type { ExcelSheet, ExcelColumn, ExcelRow } from '@/features/excel/types'

function col(key: string, label: string, extra: Partial<ExcelColumn> = {}): ExcelColumn {
  return { key, label, fieldType: 'text', detectedType: 'text', isPrimary: false, width: 120, ...extra }
}
function sheet(columns: ExcelColumn[], rows: ExcelRow[]): ExcelSheet {
  return { name: 'S', columns, rows, taxonomy: [] }
}

describe('ecTypeFor', () => {
  it('mappe les types numériques', () => {
    expect(ecTypeFor('number')).toBe('numeric')
    expect(ecTypeFor('currency')).toBe('numeric')
    expect(ecTypeFor('percent')).toBe('numeric')
    expect(ecTypeFor('rating')).toBe('numeric')
  })
  it('mappe image et le reste', () => {
    expect(ecTypeFor('image')).toBe('image')
    expect(ecTypeFor('text')).toBe('alphanumeric')
    expect(ecTypeFor('email')).toBe('alphanumeric')
  })
})

describe('imageFileName', () => {
  it('extrait le nom depuis une URL Firebase encodée', () => {
    expect(imageFileName('https://x/o/images%2Fabc.png?alt=media&token=z')).toBe('abc.png')
  })
  it('gère un chemin simple', () => {
    expect(imageFileName('/path/to/photo.jpg')).toBe('photo.jpg')
  })
  it('renvoie vide pour une entrée vide', () => {
    expect(imageFileName('')).toBe('')
  })
})

describe('resolveKeyInfo', () => {
  it('utilise la colonne primaire si unique et non vide', () => {
    const cols = [col('sku', 'SKU', { isPrimary: true }), col('n', 'Nom')]
    const s = sheet(cols, [
      { _id: 'r0', sku: 'A1', n: 'x' },
      { _id: 'r1', sku: 'A2', n: 'y' },
    ])
    const info = resolveKeyInfo(s, buildEcFieldNames(cols))
    expect(info).toEqual({ keyName: 'SKU', synthesized: false })
  })
  it('synthétise une clé si la primaire a des doublons', () => {
    const cols = [col('sku', 'SKU', { isPrimary: true })]
    const s = sheet(cols, [
      { _id: 'r0', sku: 'A1' },
      { _id: 'r1', sku: 'A1' },
    ])
    expect(resolveKeyInfo(s, buildEcFieldNames(cols))).toEqual({ keyName: '_ec_key', synthesized: true })
  })
  it('synthétise une clé si la primaire a une valeur vide', () => {
    const cols = [col('sku', 'SKU', { isPrimary: true })]
    const s = sheet(cols, [
      { _id: 'r0', sku: 'A1' },
      { _id: 'r1', sku: null },
    ])
    expect(resolveKeyInfo(s, buildEcFieldNames(cols)).synthesized).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/easycatalog/ecExport.test.ts`
Expected: FAIL — `Failed to resolve import "./ecExport"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/easycatalog/ecExport.ts
import type { ExcelSheet, FieldTypeId } from '@/features/excel/types'

export type EcDelimiter = 'tab' | 'comma'
export type EcFieldType = 'alphanumeric' | 'numeric' | 'image'

export interface EcKeyInfo {
  /** ecFieldName de la colonne-clé, ou '_ec_key' si synthétisée */
  keyName: string
  /** true quand aucune colonne primaire unique n'existait → clé générée */
  synthesized: boolean
}

/** Mappe un FieldTypeId interne vers le type de champ EasyCatalog. */
export function ecTypeFor(fieldType: FieldTypeId): EcFieldType {
  if (fieldType === 'image') return 'image'
  if (fieldType === 'number' || fieldType === 'currency' || fieldType === 'percent' || fieldType === 'rating') {
    return 'numeric'
  }
  return 'alphanumeric'
}

/** Dérive un nom de fichier depuis une URL/chemin image ; entrée vide → ''. */
export function imageFileName(url: string): string {
  if (!url) return ''
  let s = url.split('?')[0].split('#')[0]
  try {
    s = decodeURIComponent(s)
  } catch {
    /* garder s tel quel si décodage impossible */
  }
  const last = s.substring(s.lastIndexOf('/') + 1)
  return last || 'image'
}

/** Détermine le champ-clé EasyCatalog : colonne primaire si valeurs uniques & non vides, sinon synthèse. */
export function resolveKeyInfo(sheet: ExcelSheet, ecNames: Map<string, string>): EcKeyInfo {
  const primary = sheet.columns.find((c) => c.isPrimary) ?? sheet.columns[0]
  if (primary && sheet.rows.length > 0) {
    const values = sheet.rows.map((r) => r[primary.key])
    const nonEmpty = values.every((v) => v !== null && v !== undefined && String(v).trim() !== '')
    const unique = new Set(values.map((v) => String(v))).size === values.length
    if (nonEmpty && unique) {
      return { keyName: ecNames.get(primary.key) ?? '_ec_key', synthesized: false }
    }
  }
  return { keyName: '_ec_key', synthesized: true }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/easycatalog/ecExport.test.ts`
Expected: PASS (3 describes).

- [ ] **Step 5: Commit**

```bash
git add src/features/easycatalog/ecExport.ts src/features/easycatalog/ecExport.test.ts
git commit -m "feat(easycatalog): helpers ecTypeFor + imageFileName + resolveKeyInfo" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Génération CSV

**Files:**
- Modify: `src/features/easycatalog/ecExport.ts`
- Modify: `src/features/easycatalog/ecExport.test.ts`

- [ ] **Step 1: Write the failing test (ajouter au fichier existant)**

```ts
// Ajouter ces imports en tête de ecExport.test.ts
import { buildCsv } from './ecExport'

// Ajouter ce bloc à la fin de ecExport.test.ts
describe('buildCsv', () => {
  const cols = [
    col('sku', 'SKU', { isPrimary: true }),
    col('name', 'Désignation'),
    col('img', 'Visuel', { fieldType: 'image' }),
  ]
  const s = sheet(cols, [
    { _id: 'r0', sku: 'A1', name: 'Marteau', img: 'https://x/o/p%2Fm.png?token=z' },
    { _id: 'r1', sku: 'A2', name: 'Vis, lot "L"', img: '' },
  ])
  const ecNames = buildEcFieldNames(cols)
  const keyInfo = resolveKeyInfo(s, ecNames)

  it('commence par un BOM UTF-8', () => {
    expect(buildCsv(s, ecNames, keyInfo, 'tab').charCodeAt(0)).toBe(0xfeff)
  })
  it('écrit l’en-tête en ecFieldName, séparé par tab', () => {
    const header = buildCsv(s, ecNames, keyInfo, 'tab').replace('﻿', '').split('\r\n')[0]
    expect(header).toBe('SKU\tDésignation\tVisuel')
  })
  it('échappe le délimiteur et les guillemets en mode virgule', () => {
    const line = buildCsv(s, ecNames, keyInfo, 'comma').split('\r\n')[2]
    expect(line).toBe('A2,"Vis, lot ""L""",')
  })
  it('remplace les colonnes image par le nom de fichier', () => {
    const line = buildCsv(s, ecNames, keyInfo, 'tab').split('\r\n')[1]
    expect(line).toBe('A1\tMarteau\tm.png')
  })
  it('préfixe une colonne _ec_key quand la clé est synthétisée', () => {
    const cols2 = [col('sku', 'SKU', { isPrimary: true })]
    const s2 = sheet(cols2, [{ _id: 'r0', sku: 'A1' }, { _id: 'r1', sku: 'A1' }])
    const names2 = buildEcFieldNames(cols2)
    const key2 = resolveKeyInfo(s2, names2)
    const csv = buildCsv(s2, names2, key2, 'tab').replace('﻿', '')
    expect(csv.split('\r\n')[0]).toBe('_ec_key\tSKU')
    expect(csv.split('\r\n')[1]).toBe('row_1\tA1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/easycatalog/ecExport.test.ts`
Expected: FAIL — `buildCsv is not a function` / import manquant.

- [ ] **Step 3: Write minimal implementation (ajouter à ecExport.ts)**

```ts
// Ajouter à la fin de src/features/easycatalog/ecExport.ts

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v)
}

function escapeCsv(value: string, sep: string): string {
  if (value.includes(sep) || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/** Construit le CSV flat-file : BOM UTF-8, en-têtes ecFieldName, colonne _ec_key si synthétisée, images → nom de fichier. */
export function buildCsv(
  sheet: ExcelSheet,
  ecNames: Map<string, string>,
  keyInfo: EcKeyInfo,
  delimiter: EcDelimiter,
): string {
  const sep = delimiter === 'tab' ? '\t' : ','
  const headers: string[] = []
  if (keyInfo.synthesized) headers.push('_ec_key')
  for (const c of sheet.columns) headers.push(ecNames.get(c.key) ?? c.key)

  const lines: string[] = [headers.map((h) => escapeCsv(h, sep)).join(sep)]
  sheet.rows.forEach((row, idx) => {
    const cells: string[] = []
    if (keyInfo.synthesized) cells.push(escapeCsv(`row_${idx + 1}`, sep))
    for (const c of sheet.columns) {
      const raw =
        c.fieldType === 'image' ? imageFileName(cellToString(row[c.key])) : cellToString(row[c.key])
      cells.push(escapeCsv(raw, sep))
    }
    lines.push(cells.join(sep))
  })
  return '﻿' + lines.join('\r\n')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/easycatalog/ecExport.test.ts`
Expected: PASS (4 describes désormais).

- [ ] **Step 5: Commit**

```bash
git add src/features/easycatalog/ecExport.ts src/features/easycatalog/ecExport.test.ts
git commit -m "feat(easycatalog): génération CSV (BOM, échappement, clé synthétisée, images)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Descripteurs de champs, manifeste images, lignes XLSX

**Files:**
- Modify: `src/features/easycatalog/ecExport.ts`
- Modify: `src/features/easycatalog/ecExport.test.ts`

- [ ] **Step 1: Write the failing test (ajouter au fichier existant)**

```ts
// Ajouter aux imports de ecExport.test.ts
import { buildFieldDescriptors, buildImagesCsv, buildXlsxRows } from './ecExport'

// Ajouter à la fin de ecExport.test.ts
describe('buildFieldDescriptors', () => {
  const cols = [
    col('sku', 'SKU', { isPrimary: true }),
    col('price', 'Prix', { fieldType: 'currency' }),
    col('img', 'Visuel', { fieldType: 'image' }),
  ]
  const s = sheet(cols, [{ _id: 'r0', sku: 'A1', price: 10, img: 'u' }])
  const names = buildEcFieldNames(cols)
  const key = resolveKeyInfo(s, names)

  it('décrit chaque colonne avec son type EC et marque la clé', () => {
    const d = buildFieldDescriptors(s, names, key)
    expect(d).toEqual([
      { ecFieldName: 'SKU', sourceKey: 'sku', label: 'SKU', ecType: 'alphanumeric', isKey: true },
      { ecFieldName: 'Prix', sourceKey: 'price', label: 'Prix', ecType: 'numeric', isKey: false },
      { ecFieldName: 'Visuel', sourceKey: 'img', label: 'Visuel', ecType: 'image', isKey: false },
    ])
  })
  it('ajoute un descripteur _ec_key en tête si synthétisée', () => {
    const cols2 = [col('sku', 'SKU', { isPrimary: true })]
    const s2 = sheet(cols2, [{ _id: 'r0', sku: 'A1' }, { _id: 'r1', sku: 'A1' }])
    const n2 = buildEcFieldNames(cols2)
    const d = buildFieldDescriptors(s2, n2, resolveKeyInfo(s2, n2))
    expect(d[0]).toEqual({ ecFieldName: '_ec_key', sourceKey: '_ec_key', label: 'Clé EasyCatalog', ecType: 'alphanumeric', isKey: true })
  })
})

describe('buildImagesCsv', () => {
  it('renvoie null sans colonne image', () => {
    const cols = [col('sku', 'SKU')]
    expect(buildImagesCsv(sheet(cols, [{ _id: 'r0', sku: 'A' }]), buildEcFieldNames(cols))).toBeNull()
  })
  it('liste url→filename pour les cellules image non vides', () => {
    const cols = [col('img', 'Visuel', { fieldType: 'image' })]
    const s = sheet(cols, [
      { _id: 'r0', img: 'https://x/o/p%2Fm.png?token=z' },
      { _id: 'r1', img: '' },
    ])
    const csv = buildImagesCsv(s, buildEcFieldNames(cols))!.replace('﻿', '')
    expect(csv.split('\r\n')).toEqual([
      'ecFieldName,row_key,url,filename',
      'Visuel,row_1,https://x/o/p%2Fm.png?token=z,m.png',
    ])
  })
})

describe('buildXlsxRows', () => {
  it('produit des objets clés par ecFieldName, images en nom de fichier', () => {
    const cols = [col('sku', 'SKU', { isPrimary: true }), col('img', 'Visuel', { fieldType: 'image' })]
    const s = sheet(cols, [{ _id: 'r0', sku: 'A1', img: 'https://x/o/m.png?t=1' }])
    const names = buildEcFieldNames(cols)
    expect(buildXlsxRows(s, names, resolveKeyInfo(s, names))).toEqual([{ SKU: 'A1', Visuel: 'm.png' }])
  })
  it('inclut _ec_key quand synthétisée', () => {
    const cols = [col('sku', 'SKU', { isPrimary: true })]
    const s = sheet(cols, [{ _id: 'r0', sku: 'A1' }, { _id: 'r1', sku: 'A1' }])
    const names = buildEcFieldNames(cols)
    const rows = buildXlsxRows(s, names, resolveKeyInfo(s, names))
    expect(rows[0]).toEqual({ _ec_key: 'row_1', SKU: 'A1' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/easycatalog/ecExport.test.ts`
Expected: FAIL — imports `buildFieldDescriptors`/`buildImagesCsv`/`buildXlsxRows` introuvables.

- [ ] **Step 3: Write minimal implementation (ajouter à ecExport.ts)**

```ts
// Ajouter à la fin de src/features/easycatalog/ecExport.ts

export interface EcFieldDescriptor {
  ecFieldName: string
  sourceKey: string
  label: string
  ecType: EcFieldType
  isKey: boolean
}

/** Décrit chaque colonne exportée (type EC + clé), pour fields.json et l’UI. */
export function buildFieldDescriptors(
  sheet: ExcelSheet,
  ecNames: Map<string, string>,
  keyInfo: EcKeyInfo,
): EcFieldDescriptor[] {
  const out: EcFieldDescriptor[] = []
  if (keyInfo.synthesized) {
    out.push({ ecFieldName: '_ec_key', sourceKey: '_ec_key', label: 'Clé EasyCatalog', ecType: 'alphanumeric', isKey: true })
  }
  for (const c of sheet.columns) {
    const ecFieldName = ecNames.get(c.key) ?? c.key
    out.push({
      ecFieldName,
      sourceKey: c.key,
      label: c.label,
      ecType: ecTypeFor(c.fieldType),
      isKey: !keyInfo.synthesized && ecFieldName === keyInfo.keyName,
    })
  }
  return out
}

/** Manifeste url→filename des champs image, ou null si aucun. */
export function buildImagesCsv(sheet: ExcelSheet, ecNames: Map<string, string>): string | null {
  const imageCols = sheet.columns.filter((c) => c.fieldType === 'image')
  if (imageCols.length === 0) return null
  const lines: string[] = ['ecFieldName,row_key,url,filename']
  sheet.rows.forEach((row, idx) => {
    for (const c of imageCols) {
      const url = cellToString(row[c.key])
      if (!url) continue
      lines.push(
        [ecNames.get(c.key) ?? c.key, `row_${idx + 1}`, url, imageFileName(url)]
          .map((v) => escapeCsv(v, ','))
          .join(','),
      )
    }
  })
  return '﻿' + lines.join('\r\n')
}

/** Objets de lignes clés par ecFieldName (pour l’export XLSX). */
export function buildXlsxRows(
  sheet: ExcelSheet,
  ecNames: Map<string, string>,
  keyInfo: EcKeyInfo,
): Record<string, unknown>[] {
  return sheet.rows.map((row, idx) => {
    const obj: Record<string, unknown> = {}
    if (keyInfo.synthesized) obj['_ec_key'] = `row_${idx + 1}`
    for (const c of sheet.columns) {
      obj[ecNames.get(c.key) ?? c.key] =
        c.fieldType === 'image' ? imageFileName(cellToString(row[c.key])) : (row[c.key] ?? '')
    }
    return obj
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/easycatalog/ecExport.test.ts`
Expected: PASS (7 describes au total).

- [ ] **Step 5: Commit**

```bash
git add src/features/easycatalog/ecExport.ts src/features/easycatalog/ecExport.test.ts
git commit -m "feat(easycatalog): descripteurs de champs + manifeste images + lignes XLSX" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Assemblage du zip (`buildEcZip`)

**Files:**
- Create: `src/features/easycatalog/ecZip.ts`
- Test: `src/features/easycatalog/ecZip.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/easycatalog/ecZip.test.ts
import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { buildEcZip } from './ecZip'
import type { ExcelSheet, ExcelColumn, ExcelRow } from '@/features/excel/types'

function col(key: string, label: string, extra: Partial<ExcelColumn> = {}): ExcelColumn {
  return { key, label, fieldType: 'text', detectedType: 'text', isPrimary: false, width: 120, ...extra }
}
function sheet(columns: ExcelColumn[], rows: ExcelRow[]): ExcelSheet {
  return { name: 'Produits', columns, rows, taxonomy: [] }
}

const cols = [col('sku', 'SKU', { isPrimary: true }), col('img', 'Visuel', { fieldType: 'image' })]
const s = sheet(cols, [{ _id: 'r0', sku: 'A1', img: 'https://x/o/m.png?t=1' }])

describe('buildEcZip', () => {
  it('inclut data.csv + fields.json + images.csv + README.txt en mode CSV', async () => {
    const zip = await buildEcZip(s, 'Ma Source', { format: 'csv-tab' })
    const names = Object.keys(zip.files).sort()
    expect(names).toEqual(['README.txt', 'data.csv', 'fields.json', 'images.csv'])
    const fields = JSON.parse(await zip.file('fields.json')!.async('string'))
    expect(fields.fields[0].ecFieldName).toBe('SKU')
  })
  it('produit data.xlsx en mode xlsx et omet images.csv sans champ image', async () => {
    const noImg = sheet([col('sku', 'SKU', { isPrimary: true })], [{ _id: 'r0', sku: 'A1' }])
    const zip = await buildEcZip(noImg, 'S', { format: 'xlsx' })
    const names = Object.keys(zip.files).sort()
    expect(names).toEqual(['README.txt', 'data.xlsx', 'fields.json'])
  })
  it('réimporte data.xlsx avec un en-tête ecFieldName', async () => {
    const zip = await buildEcZip(s, 'S', { format: 'xlsx' })
    const buf = await zip.file('data.xlsx')!.async('uint8array')
    const XLSX = await import('xlsx')
    const wb = XLSX.read(buf, { type: 'array' })
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]])
    expect(Object.keys(json[0])).toContain('Visuel')
    expect(json[0].Visuel).toBe('m.png')
  })
})

// garantit que JSZip est bien la dépendance utilisée
void JSZip
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/easycatalog/ecZip.test.ts`
Expected: FAIL — `Failed to resolve import "./ecZip"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/easycatalog/ecZip.ts
import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import type { ExcelSheet } from '@/features/excel/types'
import { buildEcFieldNames } from './ecFieldName'
import {
  buildCsv,
  buildFieldDescriptors,
  buildImagesCsv,
  buildXlsxRows,
  resolveKeyInfo,
  type EcKeyInfo,
} from './ecExport'

export type EcFormat = 'csv-tab' | 'csv-comma' | 'xlsx'

export interface EcExportOptions {
  format: EcFormat
}

function buildReadme(keyInfo: EcKeyInfo): string {
  return [
    'Export EasyCatalog — Web2Print',
    '',
    '1. Dans EasyCatalog : File > New Data Source > Delimited (CSV) ou Microsoft Excel.',
    `2. Champ-clé : "${keyInfo.keyName}"${keyInfo.synthesized ? ' (généré automatiquement)' : ''}.`,
    '3. fields.json décrit le type EasyCatalog de chaque champ (alphanumeric / numeric / image).',
    '4. images.csv (si présent) : table url → nom de fichier pour rapatrier les visuels',
    '   dans le dossier image du data source.',
    '',
    'Round-trip document : ré-importer le template via EasyCatalog (Adopt Fields) pour relier',
    'le texte des champs à cette data source.',
  ].join('\n')
}

/** Assemble le zip d’export EasyCatalog (data + fields.json + images.csv + README). */
export async function buildEcZip(
  sheet: ExcelSheet,
  sourceName: string,
  options: EcExportOptions,
): Promise<JSZip> {
  const ecNames = buildEcFieldNames(sheet.columns)
  const keyInfo = resolveKeyInfo(sheet, ecNames)
  const descriptors = buildFieldDescriptors(sheet, ecNames, keyInfo)
  const imagesCsv = buildImagesCsv(sheet, ecNames)

  const zip = new JSZip()

  if (options.format === 'xlsx') {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(buildXlsxRows(sheet, ecNames, keyInfo))
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31) || 'Data')
    const wbout = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    zip.file('data.xlsx', wbout)
  } else {
    const delimiter = options.format === 'csv-tab' ? 'tab' : 'comma'
    zip.file('data.csv', buildCsv(sheet, ecNames, keyInfo, delimiter))
  }

  zip.file('fields.json', JSON.stringify({ key: keyInfo, fields: descriptors }, null, 2))
  if (imagesCsv) zip.file('images.csv', imagesCsv)
  zip.file('README.txt', buildReadme(keyInfo))

  return zip
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/easycatalog/ecZip.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/easycatalog/ecZip.ts src/features/easycatalog/ecZip.test.ts
git commit -m "feat(easycatalog): assemblage du zip d'export (CSV/XLSX + fields.json + images.csv + README)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Hook de download `useEasyCatalogExport`

**Files:**
- Create: `src/features/easycatalog/useEasyCatalogExport.ts`

> Glue I/O (génère le blob + déclenche le download navigateur). Pas de test unitaire — couvert par `buildEcZip` (Task 5) + `npx tsc -b`.

- [ ] **Step 1: Write the implementation**

```ts
// src/features/easycatalog/useEasyCatalogExport.ts
import type { ExcelSheet } from '@/features/excel/types'
import { buildEcZip, type EcExportOptions } from './ecZip'

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export function useEasyCatalogExport() {
  const exportSheet = async (sheet: ExcelSheet, sourceName: string, options: EcExportOptions) => {
    const zip = await buildEcZip(sheet, sourceName, options)
    const blob = await zip.generateAsync({ type: 'blob' })
    const safeName = (sourceName || 'export').replace(/[^a-z0-9]/gi, '_')
    downloadBlob(blob, `EasyCatalog_${safeName}.zip`)
  }
  return { exportSheet }
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc -b`
Expected: pas d’erreur.

- [ ] **Step 3: Commit**

```bash
git add src/features/easycatalog/useEasyCatalogExport.ts
git commit -m "feat(easycatalog): hook useEasyCatalogExport (génère le zip + download)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Modale d’export `EasyCatalogExportModal`

**Files:**
- Create: `src/features/easycatalog/EasyCatalogExportModal.tsx`

> Composant < 150 lignes. Dark mode (`#1a1a1a` surfaces, accent `#6366f1`). ⚠️ Le projet n’a **pas** de `Dialog` shadcn (seulement `src/components/ui/alert-dialog.tsx`). On suit le pattern de modale custom de `src/features/merge/ExportModal.tsx` : `if (!open) return null` + overlay `fixed inset-0 z-50 … bg-black/60`, panneau `bg-[#1a1a1a] border border-white/10 rounded-xl`, fermeture par icône `X` de `lucide-react`.

- [ ] **Step 1: Write the implementation**

```tsx
// src/features/easycatalog/EasyCatalogExportModal.tsx
import { useMemo, useState } from 'react'
import { Download, X } from 'lucide-react'
import type { ExcelSheet } from '@/features/excel/types'
import { buildEcFieldNames } from './ecFieldName'
import { buildFieldDescriptors, resolveKeyInfo } from './ecExport'
import { useEasyCatalogExport } from './useEasyCatalogExport'
import type { EcFormat } from './ecZip'

interface Props {
  open: boolean
  onClose: () => void
  sheet: ExcelSheet | null
  sourceName: string
}

const FORMATS: { id: EcFormat; label: string }[] = [
  { id: 'csv-tab', label: 'CSV (tabulation)' },
  { id: 'csv-comma', label: 'CSV (virgule)' },
  { id: 'xlsx', label: 'Excel (.xlsx)' },
]

export function EasyCatalogExportModal({ open, onClose, sheet, sourceName }: Props) {
  const [format, setFormat] = useState<EcFormat>('csv-tab')
  const [busy, setBusy] = useState(false)
  const { exportSheet } = useEasyCatalogExport()

  const { descriptors, keyName } = useMemo(() => {
    if (!sheet) return { descriptors: [], keyName: '' }
    const ecNames = buildEcFieldNames(sheet.columns)
    const keyInfo = resolveKeyInfo(sheet, ecNames)
    return { descriptors: buildFieldDescriptors(sheet, ecNames, keyInfo), keyName: keyInfo.keyName }
  }, [sheet])

  if (!open) return null

  const handleExport = async () => {
    if (!sheet) return
    setBusy(true)
    try {
      await exportSheet(sheet, sourceName, { format })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-xl w-[420px] max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-sm font-medium text-white/90">Exporter pour EasyCatalog</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white/70">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <div className="text-[11px] uppercase text-white/40 mb-1.5">Format</div>
            <div className="flex gap-2">
              {FORMATS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFormat(f.id)}
                  className={`px-3 py-1.5 rounded text-sm border ${
                    format === f.id
                      ? 'bg-[#6366f1] border-[#6366f1] text-white'
                      : 'border-white/10 text-white/60 hover:border-white/30'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[11px] uppercase text-white/40 mb-1.5">
              Champ-clé : <span className="text-[#6366f1]">{keyName}</span>
            </div>
            <div className="max-h-52 overflow-auto rounded border border-white/10 divide-y divide-white/10">
              {descriptors.map((d) => (
                <div key={d.ecFieldName} className="flex items-center justify-between px-3 py-1.5 text-sm">
                  <span className="text-white/80">{d.ecFieldName}</span>
                  <span className="text-xs text-white/40">
                    {d.ecType}
                    {d.isKey ? ' · clé' : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={handleExport}
            disabled={busy || !sheet}
            className="w-full flex items-center justify-center gap-2 bg-[#6366f1] hover:bg-[#5457e5] disabled:opacity-40 text-white rounded py-2 text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            {busy ? 'Export…' : 'Télécharger le zip'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc -b`
Expected: pas d’erreur.

- [ ] **Step 3: Commit**

```bash
git add src/features/easycatalog/EasyCatalogExportModal.tsx
git commit -m "feat(easycatalog): modale d'export (format + aperçu champs/clé)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Brancher la modale dans `DataPage`

**Files:**
- Modify: `src/pages/DataPage.tsx` (zone actions fichier, ~426-449)

- [ ] **Step 1: Ajouter l’import et l’état**

En tête de `src/pages/DataPage.tsx`, près des autres imports `@/features`, ajouter :

```tsx
import { EasyCatalogExportModal } from '@/features/easycatalog/EasyCatalogExportModal'
```

Dans le composant, près des autres `useState` (ex. à côté de `updateModalOpen`), ajouter :

```tsx
const [ecExportOpen, setEcExportOpen] = useState(false)
```

- [ ] **Step 2: Ajouter le bouton à côté de « Exporter »**

Juste après le bloc `{canExport && ( <button … Exporter … /> )}` (la balise fermante `)}` à la ligne ~446), insérer :

```tsx
              {canExport && (
                <button onClick={() => setEcExportOpen(true)} className={headerBtn}>
                  <Download className="w-3.5 h-3.5" />
                  EasyCatalog
                </button>
              )}
```

- [ ] **Step 3: Monter la modale**

Avant le dernier `)` de retour du JSX (au niveau des autres modales montées dans la page), ajouter :

```tsx
      <EasyCatalogExportModal
        open={ecExportOpen}
        onClose={() => setEcExportOpen(false)}
        sheet={sheet ?? null}
        sourceName={currentFileName ?? sheet?.name ?? 'export'}
      />
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc -b`
Expected: pas d’erreur. (`Download` est déjà importé depuis `lucide-react` dans `DataPage.tsx` ; `sheet` et `currentFileName` existent déjà dans le composant — vérifier les noms à l’endroit du `exportToXlsx` existant.)

- [ ] **Step 5: Commit**

```bash
git add src/pages/DataPage.tsx
git commit -m "feat(easycatalog): bouton d'export EasyCatalog dans le data workspace" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Vérification finale

- [ ] **Step 1: Types**

Run: `npx tsc -b`
Expected: aucune erreur.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: pas d’erreur bloquante (warnings tolérés).

- [ ] **Step 3: Tests**

Run: `npm run test:run`
Expected: toute la suite passe, dont `ecFieldName.test.ts`, `ecExport.test.ts`, `ecZip.test.ts`.

- [ ] **Step 4: Smoke test manuel (navigateur)**

Lancer `npm run dev`, ouvrir le data workspace, charger une feuille avec au moins une colonne image, cliquer **EasyCatalog** → choisir un format → **Télécharger le zip**. Vérifier que le zip contient `data.csv`/`data.xlsx`, `fields.json`, `images.csv`, `README.txt` et que les en-têtes sont des `ecFieldName`.

- [ ] **Step 5: Commit éventuel (si correctifs)**

```bash
git add -A
git commit -m "chore(easycatalog): correctifs vérification finale export data" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (rempli par l’auteur du plan)

- **Couverture spec §5** : 5.1 ecFieldName → T1 ; 5.2 champ-clé → T2 (`resolveKeyInfo`) ; 5.3 CSV → T3 ; 5.4 XLSX → T4 (`buildXlsxRows`) + T5 ; 5.5 images → T4 (`buildImagesCsv`) ; 5.6 fields.json → T4 (`buildFieldDescriptors`) + T5 ; 5.7 zip + README → T5 ; 5.8 UI → T7 + T8. ✓
- **Hors scope respecté** : pas de téléchargement de binaires images, pas de dossier natif, pas de moitié document.
- **Cohérence des types** : `EcKeyInfo`, `EcFieldType`, `EcFieldDescriptor`, `EcFormat`/`EcExportOptions` définis en T2/T4/T5 et réutilisés tels quels en T5/T6/T7. `buildEcFieldNames`/`resolveKeyInfo`/`buildFieldDescriptors` signatures stables.
- **Pas de placeholder** : chaque step de code est complet.
- **Conventions vérifiées dans le repo** : modale custom (pas de shadcn `Dialog` — seul `alert-dialog.tsx` existe → pattern `ExportModal.tsx` suivi en T7). `DataPage.tsx` : `Download` déjà importé (ligne 5), `sheet = sheets[activeSheetIndex]` (l.101), `currentFileName` (l.50), `canExport = useCan('pim.export')` (l.59), `headerBtn` (l.379). Vitest `environment: 'jsdom'` → JSZip/XLSX OK en test.
