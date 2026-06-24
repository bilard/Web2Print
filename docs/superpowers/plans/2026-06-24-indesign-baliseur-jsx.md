# Baliseur InDesign (ExtendScript .jsx) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre de baliser texte/cadres dans InDesign avec les champs d'une base via un export `.txt` côté app + un script ExtendScript `.jsx` (palette) qui applique les balises XML en 1 clic.

**Architecture:** Côté app, une fonction pure `buildFieldsListText` génère un `.txt` (`ecFieldName<TAB>label`) téléchargé depuis la modal EasyCatalog. Côté InDesign, un script `.jsx` autonome (palette ScriptUI) charge ce fichier et applique les tags via `selection.markup(tag)`. Les deux livrables communiquent uniquement par le fichier texte.

**Tech Stack:** TypeScript strict + Vitest (app) ; ExtendScript ES3 + ScriptUI + InDesign DOM (script).

## ⚠️ Risque principal — gate de validation round-trip (manuel, prioritaire)

Le design suppose que `selection.markup(tag)` produit **exactement** ce que lit la Phase 1 :
texte → `<XMLElement MarkupTag>` **inline dans la Story** ; image → entrée dans
`XML/BackingStory.xml` (`XMLContent`→Self de l'`<Image>`). Ceci est spécifié **de mémoire de
l'API**, non vérifié sur un fichier réel. **T1/T2 (export app) sont sûrs et indépendants ; tout
le risque est dans T3.**

**Avant de polir T3**, faire (utilisateur, InDesign requis) un **spike round-trip** :
1. lancer un script minimal (ou le `.jsx` de T3) qui tague un **texte** sélectionné, puis un
   **cadre image** sélectionné, avec un tag en dur ;
2. **Fichier > Exporter > IDML** ;
3. importer l'IDML dans l'app **OU** passer les fichiers dans `parseIdml` et confirmer que le
   champ texte ressort ET que l'image porte `ecImageField`.

Si `markup()` ne place pas les balises là où la Phase 1 regarde (surtout le chemin **image**,
lu uniquement via `BackingStory`), **le design du `.jsx` change** (il faudra écrire la structure
XML explicitement plutôt que via `markup`). Lancer ce gate tôt.

## Global Constraints

- TypeScript strict, pas d'`any` ; `npx tsc -b` clean (project references — `tsc --noEmit` ne vérifie rien). Tests : `npm run test:run -- <chemin>`. Knip exit 0.
- **Ne jamais modifier** `src/components/ui/**`, `src/lib/firebase/config.ts`, `public/fonts/`.
- Théming par tokens dans l'UI.
- Le `.jsx` est de l'**ExtendScript ES3** : pas de `let`/`const`/arrow/`JSON`/template literals ; `var` + `function` uniquement. Il NE re-sanitise PAS les noms (déjà faits par l'app).
- Le `.jsx` n'a **aucun test automatisé** (InDesign requis) : il est validé par relecture de l'API + une checklist manuelle dans son README. C'est explicite et conforme à la spec.
- Format du fichier de champs : 1re ligne `# Web2Print …` (commentaire), puis une ligne par champ `ecFieldName<TAB>label` ; lignes vides et `#` ignorées à la lecture.

---

### Task 1 : Export texte de la liste de champs (app, pur)

**Files:**
- Create: `src/features/easycatalog/buildFieldsListExport.ts`
- Test: `src/features/easycatalog/buildFieldsListExport.test.ts`

**Interfaces:**
- Consumes: `EcFieldDescriptor` (`@/features/easycatalog/ecExport` — `{ ecFieldName: string; sourceKey: string; label: string; ecType: 'alphanumeric'|'numeric'|'image'; isKey: boolean }`).
- Produces: `buildFieldsListText(descriptors: EcFieldDescriptor[], sourceName: string): string`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/features/easycatalog/buildFieldsListExport.test.ts
import { describe, it, expect } from 'vitest'
import { buildFieldsListText } from './buildFieldsListExport'
import type { EcFieldDescriptor } from './ecExport'

const d = (ecFieldName: string, label: string, ecType: EcFieldDescriptor['ecType'] = 'alphanumeric'): EcFieldDescriptor =>
  ({ ecFieldName, sourceKey: ecFieldName.toLowerCase(), label, ecType, isKey: false })

describe('buildFieldsListText', () => {
  it('émet un en-tête commenté avec le nom de la base puis une ligne ecFieldName<TAB>label par champ', () => {
    const out = buildFieldsListText([d('Prix_TTC', 'Prix TTC'), d('Image', 'Visuel', 'image')], 'Monoprix TN 2026')
    const lines = out.split('\n')
    expect(lines[0]).toBe('# Web2Print — champs pour InDesign — base: Monoprix TN 2026')
    expect(lines).toContain('Prix_TTC\tPrix TTC')
    expect(lines).toContain('Image\tVisuel')
  })

  it('neutralise les TAB et retours dans le label (format ligne robuste)', () => {
    const out = buildFieldsListText([d('A', 'a\tb\nc')], 'S')
    expect(out).toContain('A\ta b c')
    expect(out.split('\n').filter((l) => l.startsWith('A\t')).length).toBe(1)
  })

  it('ignore le champ-clé technique synthétique (_ec_key)', () => {
    const out = buildFieldsListText([d('_ec_key', 'Clé'), d('Nom', 'Nom')], 'S')
    expect(out).not.toContain('_ec_key')
    expect(out).toContain('Nom\tNom')
  })

  it('liste vide → en-tête seul', () => {
    expect(buildFieldsListText([], 'Base X')).toBe('# Web2Print — champs pour InDesign — base: Base X')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/features/easycatalog/buildFieldsListExport.test.ts`
Expected: FAIL — `Cannot find module './buildFieldsListExport'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/features/easycatalog/buildFieldsListExport.ts
import type { EcFieldDescriptor } from './ecExport'

/**
 * Génère le fichier texte « liste de champs pour InDesign ».
 * Format : en-tête `# …` puis une ligne `ecFieldName<TAB>label` par champ.
 * Robuste pour ExtendScript (pas de JSON) ; TAB/newline du label neutralisés.
 * Ignore le champ-clé technique synthétique (`_ec_key`, seul nom commençant par `_`).
 */
export function buildFieldsListText(descriptors: EcFieldDescriptor[], sourceName: string): string {
  const header = `# Web2Print — champs pour InDesign — base: ${sourceName}`
  const lines = descriptors
    .filter((f) => !f.ecFieldName.startsWith('_'))
    .map((f) => {
      const label = (f.label || f.ecFieldName).replace(/[\t\r\n]+/g, ' ').trim()
      return `${f.ecFieldName}\t${label}`
    })
  return [header, ...lines].join('\n')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/features/easycatalog/buildFieldsListExport.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/easycatalog/buildFieldsListExport.ts src/features/easycatalog/buildFieldsListExport.test.ts
git commit -m "feat(easycatalog): export texte de la liste de champs pour InDesign"
```

---

### Task 2 : Bouton « Liste de champs (InDesign) » dans la modal

**Files:**
- Modify: `src/features/easycatalog/EasyCatalogExportModal.tsx`

**Interfaces:**
- Consumes: `buildFieldsListText` (Task 1) ; `descriptors` (déjà calculé dans la modal via `useMemo`, lignes ~30-35) ; `sourceName` (prop de la modal).
- Produces: aucun nouveau symbole exporté.

- [ ] **Step 1: Ajouter le handler de téléchargement**

Dans `EasyCatalogExportModal.tsx`, ajouter l'import en tête :

```typescript
import { buildFieldsListText } from './buildFieldsListExport'
```

Et un handler près de `handleExport` (le téléchargement reproduit le pattern `downloadBlob` de
`useEasyCatalogExport.ts`, inline car cette fonction y est locale) :

```typescript
const handleExportFields = () => {
  if (!sheet || descriptors.length === 0) return
  const text = buildFieldsListText(descriptors, sourceName)
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const safe = (sourceName || 'base').replace(/[^a-z0-9]/gi, '_')
  a.download = `${safe}-champs-indesign.txt`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
```

- [ ] **Step 2: Ajouter le bouton dans le JSX**

À côté du bouton d'export principal de la modal, ajouter un bouton secondaire (réutiliser le
style des boutons existants de la modal ; ne pas inventer un nouveau style) :

```tsx
<button
  type="button"
  onClick={handleExportFields}
  disabled={!sheet || descriptors.length === 0}
  className="text-[13px] text-white/70 hover:text-white/90 underline underline-offset-2 disabled:text-white/25 disabled:no-underline"
  title="Télécharge la liste des champs (.txt) à charger dans le script InDesign"
>
  Liste de champs (InDesign .txt)
</button>
```

> Si la modal utilise un conteneur de boutons spécifique, placer ce bouton dans le même
> conteneur. Adapter les classes aux tokens déjà présents dans le fichier si le style ci-dessus
> dénote (garder `text-white/*`, pas d'hex sombre en dur).

- [ ] **Step 3: Vérifier compilation + build**

Run: `npx tsc -b`
Expected: aucune erreur.

Run: `npm run build`
Expected: build OK.

- [ ] **Step 4: Commit**

```bash
git add src/features/easycatalog/EasyCatalogExportModal.tsx
git commit -m "feat(easycatalog): bouton de téléchargement de la liste de champs InDesign"
```

---

### Task 3 : Script ExtendScript `.jsx` + README

**Pas de test automatisé** (ExtendScript nécessite InDesign). Validation = relecture de l'API
InDesign + checklist manuelle du README. La relecture de tâche doit vérifier : ES3 strict (pas
de `let/const/arrow/JSON/template`), API `xmlTags.itemByName/add` + `selection.markup(tag)`,
gardes (doc ouvert / sélection / item choisi), parsing tolérant (lignes vides/`#`).

**Files:**
- Create: `indesign-scripts/web2print-baliseur.jsx`
- Create: `indesign-scripts/README.md`

**Interfaces:**
- Consumes: le fichier `.txt` produit par Task 1 (format `ecFieldName<TAB>label`, lignes `#`/vides ignorées).
- Produces: un livrable autonome (script + doc), aucun symbole côté app.

- [ ] **Step 1: Écrire le script `.jsx`**

```javascript
// indesign-scripts/web2print-baliseur.jsx
// Web2Print — Baliseur InDesign (ExtendScript). Pose des balises XML natives
// (XMLTag) sur la sélection (texte ou cadre) à partir d'une liste de champs
// exportée par l'app Web2Print. ES3 : var + function uniquement.
#target indesign
// #targetengine "session" est OBLIGATOIRE : sans lui, une Window('palette') lancée
// depuis le panneau Scripts voit son contexte détruit à la fin du script → les
// onClick/onDoubleClick deviennent inertes (palette affichée mais boutons morts).
#targetengine "session"

(function () {
  var loadedFields = []; // [{ name: 'Prix_TTC', label: 'Prix TTC' }, ...]

  // ---- Parsing du fichier de champs ----
  function trim(s) { return s.replace(/^\s+|\s+$/g, ''); }

  function parseFieldsText(content) {
    var out = [];
    var lines = content.split(/\r\n|\r|\n/);
    for (var i = 0; i < lines.length; i++) {
      var line = trim(lines[i]);
      if (line === '' || line.charAt(0) === '#') continue;
      var parts = line.split('\t');
      var name = trim(parts[0]);
      if (name === '') continue;
      var label = parts.length > 1 ? trim(parts[1]) : name;
      out.push({ name: name, label: label });
    }
    return out;
  }

  // ---- UI (palette persistante) ----
  var win = new Window('palette', 'Web2Print — Baliseur');
  win.alignChildren = 'fill';

  var loadBtn = win.add('button', undefined, 'Charger la liste de champs…');
  var list = win.add('listbox', [0, 0, 280, 240]);
  var applyBtn = win.add('button', undefined, 'Appliquer à la sélection');
  applyBtn.enabled = false;
  var status = win.add('statictext', [0, 0, 280, 48], '', { multiline: true });

  function setStatus(msg) { status.text = msg; }

  function refreshList() {
    list.removeAll();
    for (var i = 0; i < loadedFields.length; i++) {
      list.add('item', loadedFields[i].label);
    }
    applyBtn.enabled = loadedFields.length > 0;
  }

  loadBtn.onClick = function () {
    var f = File.openDialog('Choisir le fichier de champs (.txt)');
    if (f === null) return;
    try {
      f.encoding = 'UTF-8';
      f.open('r');
      var content = f.read();
      f.close();
      loadedFields = parseFieldsText(content);
      refreshList();
      setStatus(loadedFields.length + ' champ(s) chargé(s).');
    } catch (e) {
      setStatus('Erreur de lecture : ' + e);
    }
  };

  function applyTag() {
    if (app.documents.length === 0) { setStatus('Ouvrez un document InDesign.'); return; }
    if (list.selection === null) { setStatus('Sélectionnez un champ dans la liste.'); return; }
    if (app.selection.length === 0) { setStatus('Sélectionnez du texte ou un bloc à baliser.'); return; }
    var doc = app.activeDocument;
    var name = loadedFields[list.selection.index].name;
    try {
      var tag = doc.xmlTags.itemByName(name);
      if (!tag.isValid) { tag = doc.xmlTags.add(name); }
      app.selection[0].markup(tag);
      setStatus('Balise « ' + name + ' » appliquée.');
    } catch (e) {
      setStatus('Impossible de baliser cette sélection (' + e + '). Choisissez du texte ou un bloc.');
    }
  }

  applyBtn.onClick = applyTag;
  list.onDoubleClick = applyTag;

  win.show();
})();
```

- [ ] **Step 2: Écrire le README (installation + usage + checklist de validation)**

```markdown
<!-- indesign-scripts/README.md -->
# Web2Print — Baliseur InDesign

Script ExtendScript qui pose les balises XML natives d'InDesign (réutilisées par l'import
Web2Print) sur du texte ou des cadres, à partir de la liste de champs exportée par l'app.

## Installation
1. Dans l'app Web2Print : ouvrir une base → export EasyCatalog → bouton
   **« Liste de champs (InDesign .txt) »** → enregistrer le `.txt`.
2. Copier `web2print-baliseur.jsx` dans le dossier *Scripts* d'InDesign :
   - menu **Fenêtre > Utilitaires > Scripts**, clic droit sur le dossier **Utilisateur** →
     *Révéler dans le Finder/l'Explorateur*, y déposer le `.jsx`.

## Utilisation
1. **Fenêtre > Utilitaires > Scripts** → double-cliquer **web2print-baliseur** → la palette s'ouvre.
2. **Charger la liste de champs…** → choisir le `.txt` exporté → la liste se remplit.
3. Sélectionner **du texte** ou **un cadre/une image** dans la maquette.
4. Cliquer le champ voulu dans la liste → **Appliquer à la sélection** (ou double-clic).
5. Répéter pour chaque champ, puis **Fichier > Exporter > IDML** et importer l'IDML dans Web2Print.

## Validation manuelle (à faire une fois)
- [ ] La palette s'ouvre sans erreur.
- [ ] « Charger » lit le `.txt` et affiche les champs (labels).
- [ ] Baliser un **texte** sélectionné → message « Balise … appliquée » ; la balise apparaît
      dans **Affichage > Structure** (panneau Balises).
- [ ] Baliser un **cadre image** sélectionné → idem.
- [ ] Réappliquer le même champ → pas de doublon de tag, pas d'erreur.
- [ ] Sans sélection → message « Sélectionnez du texte ou un bloc ».
- [ ] Exporter l'IDML → `XML/Tags.xml` contient les `XMLTag`, et les stories/`BackingStory`
      contiennent les `<XMLElement MarkupTag>` ; l'import Web2Print les lit (Phase 1).
```

- [ ] **Step 3: Relecture statique du script**

Le script ne peut pas être exécuté hors InDesign. Vérifier à la relecture :
- aucun `let`/`const`/arrow function/`JSON`/template literal (ES3 strict) ;
- gardes présentes (doc ouvert, sélection, item choisi) ;
- `xmlTags.itemByName(name)` + `if (!tag.isValid) tag = xmlTags.add(name)` (réutilise le tag) ;
- `app.selection[0].markup(tag)` dans un `try/catch`.

Run (sanity, le fichier existe et n'est pas vide) : `wc -l indesign-scripts/web2print-baliseur.jsx`
Expected: > 40 lignes.

- [ ] **Step 4: Isoler `indesign-scripts/**` de l'outillage JS/TS**

Le `.jsx` contient `#target`/`#targetengine` — **pas du JS valide**. S'il tombe dans un glob
`tsconfig`/`vite`/eslint/knip, `tsc -b` et `npm run build` casseront. Avant de valider :
- vérifier que `indesign-scripts/` est HORS des `include` de tout `tsconfig*.json` (il l'est par
  défaut si les tsconfig ciblent `src/`) ; si un glob large l'attrape, l'ajouter en `exclude` ;
- ajouter `indesign-scripts/` à `.eslintignore` (créer le fichier s'il n'existe pas) ;
- confirmer qu'il est hors du `root` Vite (il l'est, hors `src/`).

- [ ] **Step 5: Vérifier que le build du projet n'est PAS cassé par le `.jsx`**

Run: `npx tsc -b`
Expected: aucune erreur (le `.jsx` n'est pas compilé).

Run: `npm run build`
Expected: build OK (le `.jsx` n'est pas bundlé).

Run: `npx knip`
Expected: exit 0 (si knip ramasse `indesign-scripts/**`, l'exclure via `knip.json` comme les
faux positifs déjà déclarés).

- [ ] **Step 6: Commit**

```bash
git add indesign-scripts/web2print-baliseur.jsx indesign-scripts/README.md
git commit -m "feat(indesign): script ExtendScript de balisage + README"
```

---

## Self-review

- **Couverture spec** : export texte `buildFieldsListText` (T1) ✓ ; format `ecFieldName<TAB>label`
  + en-tête `#` + neutralisation TAB/newline + filtre `_ec_key` (T1) ✓ ; bouton de téléchargement
  dans la modal (T2) ✓ ; script palette ScriptUI charge+listbox+applique via `markup` (T3) ✓ ;
  gardes/cas limites (T3 + README) ✓ ; README installation/usage/checklist (T3) ✓ ; absence de CI
  ExtendScript assumée et documentée (T3) ✓.
- **Placeholders** : aucun TODO/TBD ; code complet pour app et `.jsx`.
- **Cohérence des types** : `buildFieldsListText(descriptors, sourceName)` (T1) consommé par le
  handler de la modal (T2) ; `EcFieldDescriptor` importé depuis `ecExport` (signature réelle).
  Le `.jsx` (T3) consomme le format produit par T1 (champ `name` = `ecFieldName`, `label`).

## Points à vérifier à l'implémentation (non bloquants)

- **`descriptors`/`sourceName`** : confirmer les noms exacts dans `EasyCatalogExportModal.tsx`
  au câblage (T2) — le useMemo expose `descriptors` ; `sourceName` est une prop.
- **`File.openDialog` filtre** : volontairement sans masque de filtre (portabilité macOS/Windows).
- **`markup` portée** : `Text` et `PageItem` exposent `markup(usingTag)` dans le DOM InDesign ;
  le `try/catch` couvre les types de sélection non supportés.
