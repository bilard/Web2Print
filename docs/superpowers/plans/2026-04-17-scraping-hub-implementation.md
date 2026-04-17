# Scraping Hub — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un écran « Scraping Hub » centralisant règles / fournisseurs / debug, étendre les templates avec un `vendorPrompt` propagé, et améliorer l'éditeur visuel (surbrillance multi-blocs + capture double-clic).

**Architecture:** Extension du schéma template existant (pas de nouvelle entité), nouvelle feature `scraping-hub/` avec 3 onglets markdown, modifications ciblées de `overlayScript.ts` et `VisualTemplateBuilder.tsx`. Integration dans `DashboardPage` (pattern sidebar existant).

**Tech Stack:** React 18, TypeScript strict, Zustand, Firebase Firestore, Tailwind v3, `react-markdown` + `remark-gfm` (nouveaux), `lucide-react`, `sonner`.

**Spec source:** `docs/superpowers/specs/2026-04-17-scraping-hub-design.md`

**Validation:** Pas de tests unitaires dans ce repo. Chaque phase se valide par `npm run build` (type-check Vite) + validation manuelle dans le navigateur. Le build doit passer sans erreur à chaque commit.

---

## Phase 1 — Prompt fournisseur (extension schéma + UI + propagation)

### Task 1 : Étendre le schéma Zod avec `vendorPrompt`

**Files:**
- Modify: `src/features/scraping-templates/types.ts`

- [ ] **Step 1: Ajouter le champ `vendorPrompt` au schéma Zod**

Ouvrir `src/features/scraping-templates/types.ts` et, dans `scrapingTemplateSchema`, insérer la ligne `vendorPrompt` juste après `globalPrompt` (ligne ~90) :

```ts
  /** Prompt global pour reformater/traduire la sortie via LLM (optionnel). */
  globalPrompt: z.string().optional(),
  /** Prompt commun à tous les templates du même vendorDomain.
   *  Propagé automatiquement lors de la sauvegarde (cf. saveTemplateWithVendorSync). */
  vendorPrompt: z.string().optional(),
```

- [ ] **Step 2: Vérifier que le build passe**

Run : `npm run build`
Expected : `vite build` se termine sans erreur TS. Le nouveau champ est optionnel, aucun template existant ne casse.

- [ ] **Step 3: Commit**

```bash
git add src/features/scraping-templates/types.ts
git commit -m "feat(scraping-templates): add optional vendorPrompt field to schema"
```

---

### Task 2 : Ajouter une fonction de sauvegarde avec propagation cross-templates

**Files:**
- Modify: `src/features/scraping-templates/templatesStore.ts`

- [ ] **Step 1: Ajouter les imports nécessaires**

En haut de `src/features/scraping-templates/templatesStore.ts`, remplacer la ligne d'import `firebase/firestore` par :

```ts
import { collection, doc, getDocs, setDoc, deleteDoc, query, orderBy, where, writeBatch } from 'firebase/firestore'
```

- [ ] **Step 2: Ajouter `saveTemplateWithVendorSync`**

Après la fonction `saveTemplate` existante (après la ligne 44), ajouter cette fonction :

```ts
/**
 * Sauvegarde un template ET propage son `vendorPrompt` à tous les autres
 * templates du même `vendorDomain`. Utilise un writeBatch Firestore.
 *
 * Pourquoi : pas d'entité Fournisseur séparée → chaque template stocke sa
 * copie du prompt fournisseur. La sync garantit la cohérence sans refonte.
 */
export async function saveTemplateWithVendorSync(template: ScrapingTemplate): Promise<{ syncedCount: number }> {
  const parsed = scrapingTemplateSchema.safeParse(template)
  if (!parsed.success) {
    throw new Error(`Template invalide : ${parsed.error.issues.map((i) => i.message).join(', ')}`)
  }

  const batch = writeBatch(db)
  let syncedCount = 0

  // 1. Lire les autres templates du même vendorDomain
  const q = query(collection(db, COLLECTION), where('vendorDomain', '==', template.vendorDomain))
  const snap = await getDocs(q)
  for (const d of snap.docs) {
    if (d.id === template.id) continue
    const otherParsed = scrapingTemplateSchema.safeParse({ ...d.data(), id: d.id })
    if (!otherParsed.success) continue
    const other = otherParsed.data
    if ((other.vendorPrompt ?? '') !== (template.vendorPrompt ?? '')) {
      const updated = stripUndefined({
        ...other,
        vendorPrompt: template.vendorPrompt,
        updatedAt: Date.now(),
      })
      batch.set(doc(db, COLLECTION, d.id), updated)
      syncedCount += 1
    }
  }

  // 2. Écrire le template principal en dernier dans le batch
  const data = stripUndefined({ ...parsed.data, updatedAt: Date.now() })
  batch.set(doc(db, COLLECTION, template.id), data)

  await batch.commit()
  invalidateTemplatesCache()
  return { syncedCount }
}
```

- [ ] **Step 3: Vérifier que le build passe**

Run : `npm run build`
Expected : build OK.

- [ ] **Step 4: Commit**

```bash
git add src/features/scraping-templates/templatesStore.ts
git commit -m "feat(scraping-templates): add saveTemplateWithVendorSync for vendorPrompt propagation"
```

---

### Task 3 : UI — textarea `vendorPrompt` dans TemplateEditor

**Files:**
- Modify: `src/features/scraping-templates/TemplateEditor.tsx`

- [ ] **Step 1: Importer la nouvelle fonction de save**

Dans `TemplateEditor.tsx`, remplacer la ligne 7 :

```ts
import { saveTemplate } from './templatesStore'
```

par :

```ts
import { saveTemplate, saveTemplateWithVendorSync } from './templatesStore'
```

- [ ] **Step 2: Utiliser `saveTemplateWithVendorSync` dans la fonction `save`**

Remplacer le bloc `save` actuel (lignes ~91-109) par :

```tsx
  const save = async () => {
    setSaving(true)
    try {
      console.log('[TemplateEditor] saving template', template)
      const { syncedCount } = await saveTemplateWithVendorSync(template)
      if (syncedCount > 0) {
        toast.success(`Template enregistré — prompt fournisseur propagé à ${syncedCount} autre(s) template(s)`)
      } else {
        toast.success('Template enregistré')
      }
      onSaved?.()
    } catch (err) {
      console.error('[TemplateEditor] save failed', err)
      const msg = err instanceof Error ? err.message : String(err)
      if (/permission/i.test(msg) || /insufficient/i.test(msg)) {
        toast.error('Sauvegarde refusée par Firestore — règles manquantes sur la collection "scrapingTemplates". Voir README.')
      } else {
        toast.error('Échec sauvegarde : ' + msg)
      }
    } finally {
      setSaving(false)
    }
  }
```

- [ ] **Step 3: Ajouter la section `VendorPromptSection` sous `GlobalPromptSection`**

Dans le JSX de `TemplateEditor`, juste après le bloc `<GlobalPromptSection ...>` (ligne ~218), insérer :

```tsx
      <VendorPromptSection
        value={template.vendorPrompt ?? ''}
        vendorDomain={template.vendorDomain}
        onChange={(v) => update({ vendorPrompt: v || undefined })}
      />
```

- [ ] **Step 4: Ajouter le composant `VendorPromptSection` en bas du fichier**

À la fin de `TemplateEditor.tsx` (après la fonction `GlobalPromptSection`), ajouter :

```tsx
function VendorPromptSection({ value, vendorDomain, onChange }: { value: string; vendorDomain: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(!!value)
  const [draft, setDraft] = useState(value)
  const isDirty = draft.trim() !== (value ?? '')
  const commit = () => { onChange(draft.trim()); }
  return (
    <div className="border border-white/10 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-black/30 hover:bg-black/40 transition-colors text-left"
      >
        <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${value ? 'text-sky-400/70' : 'text-white/30'}`} />
        <span className="text-[11px] font-semibold text-white/70 uppercase tracking-wider flex-1">
          Prompt fournisseur — propagé à tous les templates de <code className="text-white/50 normal-case">{vendorDomain || '(aucun domaine)'}</code>
        </span>
        {value && <span className="text-[9px] text-sky-400/50 mr-1">actif</span>}
        <ChevronDown className={`w-3 h-3 text-white/30 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && (
        <div className="px-3 py-2.5 bg-black/20 border-t border-white/[0.06]">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit() } }}
            placeholder={"Prompt appliqué à TOUS les templates de ce fournisseur (partagé).\nExemples :\n• « Les prix sont TTC chez ce fournisseur, ne pas convertir. »\n• « Les images produit sont dans /media/catalog/, ignorer les autres. »\n• « La marque est toujours la même : écrire 'Milwaukee'. »"}
            rows={4}
            className="w-full bg-black/40 border border-white/10 rounded px-2.5 py-2 text-[11px] text-white/80 placeholder:text-white/20 resize-y outline-none focus:border-sky-400/40 leading-relaxed"
          />
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[9px] text-white/25">Propagé aux autres templates au save · ⌘+Entrée pour valider</span>
            {isDirty && <span className="text-[9px] text-sky-400/60">non sauvé</span>}
            {value && (
              <button
                onClick={() => { setDraft(''); onChange('') }}
                className="text-[9px] text-red-400/60 hover:text-red-400 ml-2"
              >Effacer</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Vérifier le build**

Run : `npm run build`
Expected : build OK.

- [ ] **Step 6: Validation manuelle**

- Ouvrir l'app (`npm run dev`), aller dans « Templates scraping ».
- Ouvrir un template existant. Vérifier que la section « Prompt fournisseur » apparaît sous « Instructions globales ».
- Saisir du texte, cliquer « Enregistrer ».
- Ouvrir un autre template du même `vendorDomain`. Vérifier que le `vendorPrompt` est bien hérité.
- Modifier le `vendorPrompt` dans le 2e template, sauver. Vérifier le toast « propagé à N template(s) ».

- [ ] **Step 7: Commit**

```bash
git add src/features/scraping-templates/TemplateEditor.tsx
git commit -m "feat(scraping-templates): UI for vendorPrompt with cross-template sync"
```

---

## Phase 2 — Injection des prompts dans le pipeline LLM

### Task 4 : Helper `buildEnrichmentPrompt` pour composer les prompts

**Files:**
- Create: `src/features/scraping-templates/buildEnrichmentPrompt.ts`

- [ ] **Step 1: Créer le helper**

Créer `src/features/scraping-templates/buildEnrichmentPrompt.ts` :

```ts
import type { ScrapingTemplate } from './types'

/**
 * Compose un prompt LLM en injectant le vendorPrompt puis le globalPrompt
 * du template, avant les instructions spécifiques à la tâche.
 *
 * Ordre fixe :
 *   1. vendorPrompt (commun au fournisseur)
 *   2. globalPrompt (spécifique au template)
 *   3. basePrompt (instructions de la tâche)
 *
 * Chaque section est séparée par "\n---\n" pour aider le modèle à distinguer
 * les niveaux d'instructions.
 */
export function buildEnrichmentPrompt(basePrompt: string, template: ScrapingTemplate | null | undefined): string {
  if (!template) return basePrompt
  const parts: string[] = []
  if (template.vendorPrompt?.trim()) {
    parts.push(`CONTEXTE FOURNISSEUR (${template.vendorDomain}) :\n${template.vendorPrompt.trim()}`)
  }
  if (template.globalPrompt?.trim()) {
    parts.push(`INSTRUCTIONS TEMPLATE (${template.name}) :\n${template.globalPrompt.trim()}`)
  }
  parts.push(basePrompt)
  return parts.join('\n---\n')
}
```

- [ ] **Step 2: Build**

Run : `npm run build`
Expected : build OK.

- [ ] **Step 3: Commit**

```bash
git add src/features/scraping-templates/buildEnrichmentPrompt.ts
git commit -m "feat(scraping-templates): add buildEnrichmentPrompt helper"
```

---

### Task 5 : Brancher l'injection dans `useProductEnrichment`

**Files:**
- Modify: `src/features/excel/ai-enrichment/useProductEnrichment.ts`

- [ ] **Step 1: Localiser les appels `generateJson` pour `product.enrichment`**

Rechercher dans le fichier :

```bash
grep -n "task: 'product.enrichment'" src/features/excel/ai-enrichment/useProductEnrichment.ts
```

Expected : 2 résultats (lignes ~3886 et ~4122).

- [ ] **Step 2: Importer le helper**

En haut de `useProductEnrichment.ts`, ajouter après les imports existants de `@/features/scraping-templates` (ou créer s'il n'y en a pas) :

```ts
import { buildEnrichmentPrompt } from '@/features/scraping-templates/buildEnrichmentPrompt'
import { findMatchingTemplate } from '@/features/scraping-templates/useMatchingTemplate'
```

> Note : `findMatchingTemplate` doit être une fonction utilitaire exportée côté store. Si elle n'existe pas encore sous ce nom, on l'ajoute à la task suivante.

- [ ] **Step 3: Vérifier / exposer `findMatchingTemplate`**

Ouvrir `src/features/scraping-templates/useMatchingTemplate.ts`. Vérifier qu'une fonction pure exportée retourne le template matchant pour une URL donnée. Si uniquement un hook existe, ajouter :

```ts
import { listTemplates } from './templatesStore'

export async function findMatchingTemplate(url: string): Promise<ScrapingTemplate | null> {
  try {
    const templates = await listTemplates()
    const host = new URL(url).hostname
    // 1. Match par urlPattern regex
    const byPattern = templates.find((t) => {
      try { return new RegExp(t.urlPattern).test(url) } catch { return false }
    })
    if (byPattern) return byPattern
    // 2. Match par vendorDomain
    const byDomain = templates.find((t) => host.includes(t.vendorDomain) || t.vendorDomain.includes(host))
    return byDomain ?? null
  } catch {
    return null
  }
}
```

(Si cette fonction existe déjà, passer à l'étape suivante.)

- [ ] **Step 4: Injecter dans le premier appel (ligne ~3885)**

Avant le `const mfrAi = await generateJson({...` (ligne ~3885), ajouter :

```ts
            const matchedTemplate = productUrl ? await findMatchingTemplate(productUrl) : null
            const wrappedPrompt = buildEnrichmentPrompt(mfrPrompt, matchedTemplate)
```

Puis remplacer `prompt: mfrPrompt,` par `prompt: wrappedPrompt,` dans l'objet passé à `generateJson`.

- [ ] **Step 5: Injecter dans le second appel (ligne ~4121)**

Localiser le 2e `const ai = await generateJson({` (ligne ~4121). Identifier la variable de prompt locale (probablement `prompt` ou similaire — utiliser `grep -B 20 "const ai = await generateJson"` pour la trouver).

Ajouter avant l'appel :

```ts
          const matchedTemplate2 = productUrl ? await findMatchingTemplate(productUrl) : null
          const wrappedPrompt2 = buildEnrichmentPrompt(<variable_prompt_existante>, matchedTemplate2)
```

Remplacer dans l'objet `generateJson` : `prompt: <variable_existante>` par `prompt: wrappedPrompt2`.

> Si `productUrl` n'est pas disponible dans ce contexte, inspecter les variables locales pour trouver l'URL active (probablement `url`, `selectedUrl`, ou similaire). Utiliser la première valeur défini.

- [ ] **Step 6: Build**

Run : `npm run build`
Expected : build OK.

- [ ] **Step 7: Validation manuelle**

- Ouvrir l'app, créer un template avec un `vendorPrompt` ex : « Ignore les prix, ils sont tous à 0 ».
- Lancer un enrichissement d'une ligne Excel dont l'URL matche ce domaine.
- Ouvrir la console navigateur → chercher le log du prompt envoyé (via `onRequestSent`). Vérifier que `CONTEXTE FOURNISSEUR` est présent en tête.

- [ ] **Step 8: Commit**

```bash
git add src/features/excel/ai-enrichment/useProductEnrichment.ts src/features/scraping-templates/useMatchingTemplate.ts
git commit -m "feat(enrichment): inject vendorPrompt and globalPrompt into LLM enrichment calls"
```

---

## Phase 3 — Debug log (rolling buffer localStorage)

### Task 6 : Créer `debugLog.ts`

**Files:**
- Create: `src/features/scraping-hub/debugLog.ts`

- [ ] **Step 1: Créer le fichier**

```ts
/**
 * Rolling buffer localStorage des 30 dernières requêtes Jina + LLM.
 * Utilisé par l'onglet Debug du Scraping Hub.
 */

const STORAGE_KEY = 'scraping.debugLog'
const MAX_ENTRIES = 30

export type DebugEntry =
  | {
      id: string
      timestamp: number
      kind: 'jina'
      url: string
      method: 'GET'
      headers: Record<string, string>
      response?: string // markdown, tronqué à 50 Ko
      durationMs: number
      error?: string
    }
  | {
      id: string
      timestamp: number
      kind: 'llm'
      provider: string
      model: string
      task: string
      temperature: number
      messages: Array<{ role: string; content: string }>
      tool_name?: string
      response?: string // JSON stringifié, tronqué à 50 Ko
      durationMs: number
      error?: string
    }

function truncate(s: string, max = 50_000): string {
  return s.length > max ? s.slice(0, max) + `\n…[tronqué à ${max} caractères]` : s
}

export function readDebugLog(): DebugEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as DebugEntry[]
  } catch {
    return []
  }
}

export function appendDebugEntry(entry: DebugEntry): void {
  const current = readDebugLog()
  if (entry.response) entry.response = truncate(entry.response)
  if (entry.kind === 'llm') {
    entry.messages = entry.messages.map((m) => ({ role: m.role, content: truncate(m.content) }))
  }
  const next = [entry, ...current].slice(0, MAX_ENTRIES)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch (err) {
    console.warn('[debugLog] localStorage write failed', err)
  }
}

export function clearDebugLog(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
```

- [ ] **Step 2: Build**

Run : `npm run build`
Expected : build OK.

- [ ] **Step 3: Commit**

```bash
git add src/features/scraping-hub/debugLog.ts
git commit -m "feat(scraping-hub): add localStorage rolling debug log"
```

---

### Task 7 : Brancher le log dans `useJina.jinaRead`

**Files:**
- Modify: `src/features/scraping/useJina.ts`

- [ ] **Step 1: Importer le logger**

En haut de `src/features/scraping/useJina.ts` (après les imports existants) :

```ts
import { appendDebugEntry, genId } from '@/features/scraping-hub/debugLog'
```

- [ ] **Step 2: Instrumenter `jinaRead`**

Remplacer la fonction `jinaRead` existante (lignes ~393-412) par :

```ts
async function jinaRead(url: string, opts: { timeout?: number; noCache?: boolean } = {}): Promise<JinaReaderResponse['data']> {
  const extra: Record<string, string> = {}
  const timeout = Math.max(opts.timeout ?? 0, 10000)
  extra['X-Timeout'] = String(Math.ceil(timeout / 1000))
  if (opts.noCache) extra['X-No-Cache'] = 'true'
  extra['X-Wait-For-Selector'] = 'body'

  const headers = jinaHeaders(extra)
  const startedAt = performance.now()
  const entryBase = {
    id: genId(),
    timestamp: Date.now(),
    kind: 'jina' as const,
    url,
    method: 'GET' as const,
    headers: sanitizeHeaders(headers),
  }

  try {
    const res = await fetch(`${JINA_READER}/${url}`, { headers })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      const error = `Jina Reader: HTTP ${res.status}${text ? ` — ${text.slice(0, 200)}` : ''}`
      appendDebugEntry({ ...entryBase, durationMs: Math.round(performance.now() - startedAt), error })
      throw new Error(error)
    }
    const json = await res.json() as JinaReaderResponse
    if (!json.data?.content && !json.data?.title) {
      const error = 'Jina Reader n\'a retourné aucun contenu — le site bloque peut-être le scraping'
      appendDebugEntry({ ...entryBase, durationMs: Math.round(performance.now() - startedAt), error })
      throw new Error(error)
    }
    appendDebugEntry({
      ...entryBase,
      durationMs: Math.round(performance.now() - startedAt),
      response: json.data.content ?? '',
    })
    return json.data
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!/Jina Reader:/.test(msg)) {
      appendDebugEntry({ ...entryBase, durationMs: Math.round(performance.now() - startedAt), error: msg })
    }
    throw err
  }
}

/** Masque la clé d'API Jina dans les headers loggés. */
function sanitizeHeaders(h: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(h)) {
    out[k] = /authorization/i.test(k) ? 'Bearer ***' : v
  }
  return out
}
```

- [ ] **Step 3: Build**

Run : `npm run build`
Expected : build OK.

- [ ] **Step 4: Commit**

```bash
git add src/features/scraping/useJina.ts
git commit -m "feat(scraping): log Jina Reader requests to debug buffer"
```

---

### Task 8 : Brancher le log dans les appels LLM via `onRequestSent`

**Files:**
- Modify: `src/features/excel/ai-enrichment/useProductEnrichment.ts`

- [ ] **Step 1: Importer le logger**

En haut du fichier, ajouter :

```ts
import { appendDebugEntry, genId } from '@/features/scraping-hub/debugLog'
```

- [ ] **Step 2: Créer un helper `logLlmRequest`**

Juste après les imports, ajouter :

```ts
function logLlmRequest(
  request: { provider: string; model: string; task: string; temperature: number; messages: Array<{ role: string; content: string }>; tool_name?: string },
  startedAt: number,
  response?: string,
  error?: string,
): void {
  appendDebugEntry({
    id: genId(),
    timestamp: Date.now(),
    kind: 'llm',
    provider: request.provider,
    model: request.model,
    task: request.task,
    temperature: request.temperature,
    messages: request.messages,
    tool_name: request.tool_name,
    durationMs: Math.round(performance.now() - startedAt),
    response,
    error,
  })
}
```

- [ ] **Step 3: Étendre le `onRequestSent` dans les 2 appels**

Pour chacun des 2 appels `generateJson({ task: 'product.enrichment', ... })` (lignes ~3885 et ~4121), remplacer le callback `onRequestSent` existant :

AVANT :
```ts
              onRequestSent: (request) => {
                setLlmRequest(sheetName, rowId, request)
              },
```

APRÈS :
```ts
              onRequestSent: (request) => {
                setLlmRequest(sheetName, rowId, request)
                logLlmRequest(request, performance.now())
              },
```

> Note : `performance.now()` à la capture n'est pas une mesure exacte de durée (l'appel n'a pas encore renvoyé) — mais `generateJson` n'expose pas de hook post-réponse. La `durationMs` sera ~0 ; on documente et on attend une v2 si besoin de mesure précise.

- [ ] **Step 4: Build**

Run : `npm run build`
Expected : build OK.

- [ ] **Step 5: Validation manuelle**

- Lancer un enrichissement, ouvrir DevTools → Application → Local Storage → clé `scraping.debugLog`.
- Vérifier que les entrées `jina` et `llm` s'accumulent (max 30).

- [ ] **Step 6: Commit**

```bash
git add src/features/excel/ai-enrichment/useProductEnrichment.ts
git commit -m "feat(enrichment): log LLM enrichment requests to debug buffer"
```

---

## Phase 4 — Page Scraping Hub avec 3 onglets

### Task 9 : Installer `react-markdown` et `remark-gfm`

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Installer les dépendances**

Run : `npm install react-markdown remark-gfm`
Expected : ajout de 2 dépendances au `package.json`.

- [ ] **Step 2: Build**

Run : `npm run build`
Expected : build OK.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add react-markdown and remark-gfm for scraping hub"
```

---

### Task 10 : Créer `rulesStore.ts`

**Files:**
- Create: `src/features/scraping-hub/rulesStore.ts`

- [ ] **Step 1: Créer le store**

```ts
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'

const COLLECTION = 'scrapingRules'
const DOC_ID = 'global'

export interface ScrapingRulesDoc {
  content: string
  updatedAt: number
  updatedBy?: string
}

export async function loadRules(): Promise<ScrapingRulesDoc> {
  const snap = await getDoc(doc(db, COLLECTION, DOC_ID))
  if (!snap.exists()) {
    return { content: '', updatedAt: Date.now() }
  }
  const data = snap.data()
  return {
    content: typeof data.content === 'string' ? data.content : '',
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now(),
    updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : undefined,
  }
}

export async function saveRules(content: string, updatedBy?: string): Promise<void> {
  await setDoc(doc(db, COLLECTION, DOC_ID), {
    content,
    updatedAt: Date.now(),
    updatedBy: updatedBy ?? null,
    _serverUpdatedAt: serverTimestamp(),
  })
}
```

- [ ] **Step 2: Build**

Run : `npm run build`
Expected : build OK.

- [ ] **Step 3: Commit**

```bash
git add src/features/scraping-hub/rulesStore.ts
git commit -m "feat(scraping-hub): add rules store (Firestore scrapingRules/global)"
```

---

### Task 11 : Créer `RulesTab.tsx` (markdown éditable split view)

**Files:**
- Create: `src/features/scraping-hub/RulesTab.tsx`

- [ ] **Step 1: Créer le composant**

```tsx
import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import { loadRules, saveRules } from './rulesStore'

export function RulesTab() {
  const user = useAuthStore((s) => s.user)
  const [content, setContent] = useState('')
  const [saved, setSaved] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    loadRules()
      .then((doc) => {
        if (!active) return
        setContent(doc.content)
        setSaved(doc.content)
      })
      .catch((err) => toast.error('Échec du chargement : ' + (err as Error).message))
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const dirty = content !== saved

  const onSave = async () => {
    setSaving(true)
    try {
      await saveRules(content, user?.email ?? undefined)
      setSaved(content)
      toast.success('Règles enregistrées')
    } catch (err) {
      toast.error('Échec sauvegarde : ' + (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
        <span className="text-xs text-white/50">
          Règles rédactionnelles — stockées dans Firestore, partagées par l'équipe
        </span>
        <button
          onClick={onSave}
          disabled={!dirty || saving}
          className="px-3 py-1.5 rounded bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30 border border-emerald-400/30 text-xs inline-flex items-center gap-1.5 disabled:opacity-40"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Enregistrer
        </button>
      </div>
      <div className="flex-1 grid grid-cols-2 gap-0 overflow-hidden">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={"# Règles de scraping\n\n## Conventions\n- Jamais de parser par marque\n- Les prix sont toujours TTC sauf mention contraire\n\n## Pièges connus\n- Puppeteer mass-click…\n"}
          className="p-4 bg-black/40 text-white/80 font-mono text-[12px] leading-relaxed resize-none outline-none border-r border-white/10"
        />
        <div className="p-4 overflow-auto bg-[#0f0f0f] prose prose-invert prose-sm max-w-none prose-headings:text-white/90 prose-a:text-indigo-300 prose-code:text-amber-300 prose-code:bg-white/5 prose-code:px-1 prose-code:rounded">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content || '_Zone vide — écris du markdown à gauche_'}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build**

Run : `npm run build`
Expected : build OK (possible warning Tailwind si `prose` pas configuré — voir prochaine étape si besoin).

- [ ] **Step 3: Vérifier que `@tailwindcss/typography` est configuré**

Run : `grep '"@tailwindcss/typography"' package.json`

- Si présent : OK, passer à l'étape suivante.
- Sinon : installer via `npm install -D @tailwindcss/typography`, puis l'ajouter dans `tailwind.config.js` `plugins: [require('@tailwindcss/typography')]`. Rebuild.

- [ ] **Step 4: Commit**

```bash
git add src/features/scraping-hub/RulesTab.tsx package.json package-lock.json tailwind.config.js
git commit -m "feat(scraping-hub): add RulesTab (markdown split editor)"
```

---

### Task 12 : Créer `VendorsTab.tsx` (arbre fournisseurs → templates)

**Files:**
- Create: `src/features/scraping-hub/VendorsTab.tsx`

- [ ] **Step 1: Créer le composant**

```tsx
import { useEffect, useMemo, useState } from 'react'
import { Loader2, ChevronRight, ChevronDown, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { listTemplates } from '@/features/scraping-templates/templatesStore'
import type { ScrapingTemplate } from '@/features/scraping-templates/types'

export function VendorsTab() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<ScrapingTemplate[] | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  useEffect(() => {
    listTemplates()
      .then(setTemplates)
      .catch((err) => {
        toast.error('Échec du chargement : ' + (err as Error).message)
        setTemplates([])
      })
  }, [])

  const grouped = useMemo(() => {
    if (!templates) return {} as Record<string, ScrapingTemplate[]>
    return templates.reduce<Record<string, ScrapingTemplate[]>>((acc, t) => {
      const key = t.vendorDomain || '(sans domaine)'
      if (!acc[key]) acc[key] = []
      acc[key].push(t)
      return acc
    }, {})
  }, [templates])

  if (!templates) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
      </div>
    )
  }

  const entries = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b))

  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/40 text-sm">
        Aucun template. Crée-en un dans « Templates scraping ».
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="max-w-4xl mx-auto space-y-2">
        {entries.map(([vendor, items]) => {
          const vendorPrompt = items.find((t) => t.vendorPrompt)?.vendorPrompt ?? ''
          const isOpen = expanded[vendor] ?? true
          return (
            <div key={vendor} className="border border-white/10 rounded-lg overflow-hidden bg-black/30">
              <button
                onClick={() => setExpanded((e) => ({ ...e, [vendor]: !isOpen }))}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.03] transition-colors text-left"
              >
                {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-white/40" /> : <ChevronRight className="w-3.5 h-3.5 text-white/40" />}
                <span className="text-[13px] font-semibold text-white/80">{vendor}</span>
                <span className="text-[11px] text-white/40">{items.length} template{items.length > 1 ? 's' : ''}</span>
                {vendorPrompt && <span className="ml-auto text-[10px] text-sky-400/60">prompt fournisseur défini</span>}
              </button>
              {isOpen && (
                <div className="px-3 pb-3">
                  {vendorPrompt && (
                    <div className="mb-2 p-2 bg-sky-500/[0.05] border border-sky-400/20 rounded">
                      <div className="text-[10px] text-sky-300/70 uppercase tracking-wider mb-1">Prompt fournisseur</div>
                      <div className="text-[11px] text-white/70 whitespace-pre-wrap font-mono leading-relaxed">{vendorPrompt}</div>
                    </div>
                  )}
                  <div className="space-y-1">
                    {items.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => navigate(`/scraping-templates?id=${t.id}`)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/[0.03] text-left text-[11px] group"
                      >
                        <span className="text-white/80 flex-1">{t.name}</span>
                        <span className="text-white/30">{t.fields.length} champs</span>
                        {t.stats && t.stats.appliedCount > 0 && (
                          <span className="text-emerald-400/60">{t.stats.successCount}/{t.stats.appliedCount} ok</span>
                        )}
                        <ExternalLink className="w-3 h-3 text-white/30 group-hover:text-white/60" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build**

Run : `npm run build`
Expected : build OK.

- [ ] **Step 3: Commit**

```bash
git add src/features/scraping-hub/VendorsTab.tsx
git commit -m "feat(scraping-hub): add VendorsTab (grouped tree of vendors and templates)"
```

---

### Task 13 : Créer `DebugTab.tsx` (dernières requêtes Jina + LLM)

**Files:**
- Create: `src/features/scraping-hub/DebugTab.tsx`

- [ ] **Step 1: Créer le composant**

```tsx
import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Trash2, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'
import { readDebugLog, clearDebugLog, type DebugEntry } from './debugLog'

export function DebugTab() {
  const [entries, setEntries] = useState<DebugEntry[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const refresh = () => setEntries(readDebugLog())

  useEffect(() => {
    refresh()
    const id = window.setInterval(refresh, 2000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
        <span className="text-xs text-white/50">
          {entries.length} requête{entries.length > 1 ? 's' : ''} loggée{entries.length > 1 ? 's' : ''} (max 30 · rafraîchi toutes les 2s)
        </span>
        <div className="flex gap-2">
          <button
            onClick={refresh}
            className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-white/60 text-[11px] inline-flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" /> Rafraîchir
          </button>
          <button
            onClick={() => { clearDebugLog(); refresh() }}
            className="px-2 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-300 text-[11px] inline-flex items-center gap-1 border border-red-400/20"
          >
            <Trash2 className="w-3 h-3" /> Vider
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4 space-y-2">
        {entries.length === 0 && (
          <div className="text-center text-white/40 text-sm mt-8">
            Aucune requête encore. Lance un enrichissement pour voir ce qui est envoyé à Jina et au LLM.
          </div>
        )}
        {entries.map((e) => {
          const isOpen = expanded[e.id] ?? false
          return (
            <div key={e.id} className="border border-white/10 rounded-lg overflow-hidden bg-black/30">
              <button
                onClick={() => setExpanded((prev) => ({ ...prev, [e.id]: !isOpen }))}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.03] text-left"
              >
                {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-white/40" /> : <ChevronRight className="w-3.5 h-3.5 text-white/40" />}
                <span className={`px-1.5 py-0.5 text-[9px] uppercase tracking-wider rounded ${e.kind === 'jina' ? 'bg-amber-500/15 text-amber-300' : 'bg-indigo-500/15 text-indigo-300'}`}>
                  {e.kind}
                </span>
                <span className="text-[11px] text-white/70 font-mono flex-1 truncate">
                  {e.kind === 'jina' ? e.url : `${e.provider}/${e.model} — ${e.task}`}
                </span>
                <span className="text-[10px] text-white/40">{new Date(e.timestamp).toLocaleTimeString()}</span>
                {e.error && <span className="text-[10px] text-red-400">error</span>}
              </button>
              {isOpen && (
                <div className="px-3 pb-3 space-y-2 text-[11px]">
                  {e.kind === 'jina' ? (
                    <>
                      <Section title="URL">{e.url}</Section>
                      <Section title="Headers">{JSON.stringify(e.headers, null, 2)}</Section>
                      {e.error && <Section title="Erreur" error>{e.error}</Section>}
                      {e.response && (
                        <details className="border border-white/10 rounded">
                          <summary className="px-2 py-1 cursor-pointer text-white/60">Réponse markdown ({e.response.length} caractères)</summary>
                          <div className="p-3 prose prose-invert prose-sm max-w-none max-h-96 overflow-auto">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{e.response}</ReactMarkdown>
                          </div>
                        </details>
                      )}
                    </>
                  ) : (
                    <>
                      <Section title="Provider / modèle / tâche">{`${e.provider} · ${e.model} · ${e.task} (T=${e.temperature})`}</Section>
                      {e.tool_name && <Section title="Tool">{e.tool_name}</Section>}
                      <Section title="Messages">
                        {e.messages.map((m, i) => (
                          <div key={i} className="mb-2">
                            <div className="text-[10px] text-white/50 uppercase tracking-wider">{m.role}</div>
                            <pre className="whitespace-pre-wrap bg-black/40 p-2 rounded border border-white/5 text-white/80">{m.content}</pre>
                          </div>
                        ))}
                      </Section>
                      {e.error && <Section title="Erreur" error>{e.error}</Section>}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Section({ title, children, error = false }: { title: string; children: React.ReactNode; error?: boolean }) {
  return (
    <div>
      <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">{title}</div>
      <pre className={`whitespace-pre-wrap bg-black/40 p-2 rounded border border-white/5 ${error ? 'text-red-300' : 'text-white/80'}`}>{children}</pre>
    </div>
  )
}
```

- [ ] **Step 2: Build**

Run : `npm run build`
Expected : build OK.

- [ ] **Step 3: Commit**

```bash
git add src/features/scraping-hub/DebugTab.tsx
git commit -m "feat(scraping-hub): add DebugTab (last Jina + LLM requests viewer)"
```

---

### Task 14 : Créer `ScrapingHubPage.tsx` (orchestrateur 3 onglets)

**Files:**
- Create: `src/features/scraping-hub/ScrapingHubPage.tsx`

- [ ] **Step 1: Créer le composant**

```tsx
import { useState } from 'react'
import { BookOpen, FolderTree, Bug } from 'lucide-react'
import { RulesTab } from './RulesTab'
import { VendorsTab } from './VendorsTab'
import { DebugTab } from './DebugTab'

type Tab = 'rules' | 'vendors' | 'debug'

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'rules',   label: 'Règles',                   icon: BookOpen },
  { id: 'vendors', label: 'Fournisseurs & Templates', icon: FolderTree },
  { id: 'debug',   label: 'Debug Jina/LLM',           icon: Bug },
]

export function ScrapingHubPage() {
  const [tab, setTab] = useState<Tab>('rules')
  return (
    <div className="h-full flex flex-col bg-[#0f0f0f]">
      <header className="flex items-center gap-1 px-4 py-2 border-b border-white/10 bg-[#1a1a1a]">
        <h1 className="text-sm font-semibold text-white/90 mr-4">Scraping Hub</h1>
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors ${
                tab === t.id
                  ? 'bg-indigo-500/20 text-indigo-200 border border-indigo-400/30'
                  : 'text-white/60 hover:text-white/90 border border-transparent'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          )
        })}
      </header>
      {tab === 'rules' && <RulesTab />}
      {tab === 'vendors' && <VendorsTab />}
      {tab === 'debug' && <DebugTab />}
    </div>
  )
}
```

- [ ] **Step 2: Build**

Run : `npm run build`
Expected : build OK.

- [ ] **Step 3: Commit**

```bash
git add src/features/scraping-hub/ScrapingHubPage.tsx
git commit -m "feat(scraping-hub): add ScrapingHubPage orchestrating the 3 tabs"
```

---

### Task 15 : Intégrer dans la sidebar de `DashboardPage`

**Files:**
- Modify: `src/pages/DashboardPage.tsx`

- [ ] **Step 1: Ajouter l'import lazy**

À la suite de la ligne `const ScrapingTemplatesPage = lazy(...)` (ligne 24) :

```ts
const ScrapingHubPage = lazy(() => import('@/features/scraping-hub/ScrapingHubPage').then((m) => ({ default: m.ScrapingHubPage })))
```

- [ ] **Step 2: Étendre le type `Section`**

Remplacer la ligne 26 :

```ts
type Section = 'blank' | 'import' | 'library' | 'images' | 'data' | 'settings' | 'taxonomies' | 'scraping-templates'
```

par :

```ts
type Section = 'blank' | 'import' | 'library' | 'images' | 'data' | 'settings' | 'taxonomies' | 'scraping-templates' | 'scraping-hub'
```

- [ ] **Step 3: Importer l'icône `BookOpen`**

Dans l'import lucide-react en haut du fichier, ajouter `BookOpen` :

```ts
import { Plus, LogOut, Loader2, Library, FilePlus, FileSpreadsheet, Settings, Upload, FolderTree, LayoutGrid, List, Image as ImageIcon, Database, BookOpen } from 'lucide-react'
```

- [ ] **Step 4: Ajouter l'entrée dans `menuItems`**

Après la ligne `{ id: 'scraping-templates', ... }` (ligne 35), insérer :

```ts
  { id: 'scraping-hub', icon: BookOpen, label: 'Scraping Hub', accent: 'text-sky-400', activeBg: 'bg-sky-500/[0.1]', activeText: 'text-sky-300' },
```

- [ ] **Step 5: Ajouter le rendu conditionnel**

Trouver le bloc `activeSection === 'scraping-templates' ? (...)` (ligne ~362). Juste après sa fermeture `)`, insérer :

```tsx
      ) : activeSection === 'scraping-hub' ? (
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center h-full bg-[#0f0f0f]">
              <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
            </div>
          }>
            <ScrapingHubPage />
          </Suspense>
        </div>
```

- [ ] **Step 6: Build**

Run : `npm run build`
Expected : build OK.

- [ ] **Step 7: Validation manuelle**

- Run : `npm run dev`
- Ouvrir l'app, se connecter. Cliquer sur « Scraping Hub » dans la sidebar.
- Onglet Règles : saisir du markdown à gauche, voir le rendu à droite, cliquer Enregistrer, rafraîchir la page → le contenu doit persister.
- Onglet Fournisseurs : vérifier l'arbre groupé par `vendorDomain`.
- Onglet Debug : lancer un enrichissement depuis l'écran PIM, revenir sur l'onglet Debug → voir les entrées Jina + LLM apparaître.

- [ ] **Step 8: Commit**

```bash
git add src/pages/DashboardPage.tsx
git commit -m "feat(scraping-hub): wire ScrapingHubPage into DashboardPage sidebar"
```

---

## Phase 5 — Surbrillance multi-blocs persistante dans l'éditeur visuel

### Task 16 : Modifier `overlayScript.ts` pour supporter les tags multiples

**Files:**
- Modify: `src/features/scraping-templates/overlayScript.ts`

- [ ] **Step 1: Remplacer le système de preview single-selector par un système multi-tags**

Remplacer intégralement le contenu entre `// Overlays persistants` (ligne 17) et la fin de `window.addEventListener('resize', ...)` (ligne 41) par :

```js
  // Tags persistants : tous les fields taggés, chacun avec son label et sa couleur.
  // Structure : [{ selector, label, color, nodes: Element[] }]
  window.__pimPersistentTags = window.__pimPersistentTags || []
  // Selector actif (clic dans la liste des fields) — teinte renforcée.
  window.__pimActiveSelector = window.__pimActiveSelector || null
  window.__pimPersistentOverlays = window.__pimPersistentOverlays || []

  var PALETTE = [
    '#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6',
    '#14b8a6', '#f97316', '#06b6d4', '#a855f7', '#22c55e',
  ]

  function colorFor(index) {
    return PALETTE[index % PALETTE.length]
  }

  function clearPersistentOverlays() {
    (window.__pimPersistentOverlays || []).forEach(function(o) { o.remove() })
    window.__pimPersistentOverlays = []
  }

  function renderPersistentOverlays() {
    clearPersistentOverlays()
    var tags = window.__pimPersistentTags || []
    if (tags.length === 0) return
    tags.forEach(function(tag) {
      var isActive = tag.selector === window.__pimActiveSelector
      var alpha = isActive ? 0.28 : 0.12
      var borderAlpha = isActive ? 1.0 : 0.65
      var nodes = tag.nodes || []
      nodes.forEach(function(n) {
        if (!n || !n.getBoundingClientRect) return
        var r = n.getBoundingClientRect()
        if (r.width === 0 && r.height === 0) return
        // Box
        var box = document.createElement('div')
        box.style.cssText =
          'position:fixed;pointer-events:none;z-index:2147483645;' +
          'border:2px solid ' + tag.color + ';' +
          'background:' + hexToRgba(tag.color, alpha) + ';' +
          'border-radius:3px;' +
          'opacity:' + borderAlpha + ';'
        box.style.left = r.left + 'px'
        box.style.top = r.top + 'px'
        box.style.width = r.width + 'px'
        box.style.height = r.height + 'px'
        document.documentElement.appendChild(box)
        window.__pimPersistentOverlays.push(box)
        // Label
        var label = document.createElement('div')
        label.textContent = tag.label
        label.style.cssText =
          'position:fixed;pointer-events:none;z-index:2147483644;' +
          'background:' + tag.color + ';color:#fff;' +
          'font:11px -apple-system,Segoe UI,sans-serif;font-weight:600;' +
          'padding:1px 5px;border-radius:3px 3px 3px 0;' +
          'white-space:nowrap;'
        label.style.left = r.left + 'px'
        label.style.top = Math.max(r.top - 16, 2) + 'px'
        document.documentElement.appendChild(label)
        window.__pimPersistentOverlays.push(label)
      })
    })
  }

  function hexToRgba(hex, alpha) {
    var h = hex.replace('#', '')
    var bigint = parseInt(h, 16)
    var r = (bigint >> 16) & 255
    var g = (bigint >> 8) & 255
    var b = bigint & 255
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')'
  }

  window.addEventListener('scroll', renderPersistentOverlays, { passive: true, capture: true })
  window.addEventListener('resize', renderPersistentOverlays, { passive: true })
```

- [ ] **Step 2: Remplacer la gestion des messages `pim-preview-selector` / `pim-clear-preview`**

Remplacer le bloc `if (msg.type === 'pim-preview-selector')` … `if (msg.type === 'pim-clear-preview') { ... }` (lignes ~166-190) par :

```js
    if (msg.type === 'pim-set-persistent-tags') {
      // msg.tags : Array<{ selector: string, label: string }>
      var tags = Array.isArray(msg.tags) ? msg.tags : []
      window.__pimPersistentTags = tags.map(function(t, i) {
        var nodes = []
        try {
          nodes = Array.from(document.querySelectorAll(t.selector))
        } catch (err) {
          // Selector invalide — on ignore, pas de crash
        }
        return { selector: t.selector, label: t.label, color: colorFor(i), nodes: nodes }
      })
      renderPersistentOverlays()
    }
    if (msg.type === 'pim-set-active-selector') {
      window.__pimActiveSelector = msg.selector || null
      // Re-calcul des nodes et re-scroll sur le field actif
      if (window.__pimActiveSelector) {
        var active = (window.__pimPersistentTags || []).find(function(t) { return t.selector === window.__pimActiveSelector })
        if (active && active.nodes[0] && active.nodes[0].scrollIntoView) {
          active.nodes[0].scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
          setTimeout(renderPersistentOverlays, 350)
        }
      }
      renderPersistentOverlays()
    }
    if (msg.type === 'pim-clear-persistent-tags') {
      window.__pimPersistentTags = []
      window.__pimActiveSelector = null
      clearPersistentOverlays()
    }
```

- [ ] **Step 3: Build**

Run : `npm run build`
Expected : build OK.

- [ ] **Step 4: Commit**

```bash
git add src/features/scraping-templates/overlayScript.ts
git commit -m "feat(scraping-templates): overlay script supports multiple persistent tags with labels"
```

---

### Task 17 : Adapter `VisualTemplateBuilder.tsx` (envoyer tous les tags + toggle)

**Files:**
- Modify: `src/features/scraping-templates/VisualTemplateBuilder.tsx`

- [ ] **Step 1: Ajouter un state `showAllTags`**

Près des autres useState (ligne ~42-47), ajouter :

```ts
  const [showAllTags, setShowAllTags] = useState(true)
```

- [ ] **Step 2: Remplacer `previewSelector` et `clearPreview` par des fonctions `syncTags` et `clearTags`**

Remplacer les fonctions `previewSelector`, `clearPreview`, `toggleFieldPreview` (lignes ~122-140) par :

```ts
  const syncTags = useCallback(() => {
    const tags = template.fields
      .map((f) => ({ selector: f.strategies[0]?.expression ?? '', label: f.field }))
      .filter((t) => t.selector)
    sendToIframe({ type: 'pim-set-persistent-tags', tags })
  }, [template.fields])

  const clearAllTags = () => {
    sendToIframe({ type: 'pim-clear-persistent-tags' })
    setSelectedFieldIdx(null)
  }

  const toggleFieldPreview = (idx: number) => {
    if (selectedFieldIdx === idx) {
      sendToIframe({ type: 'pim-set-active-selector', selector: null })
      setSelectedFieldIdx(null)
      return
    }
    const sel = template.fields[idx]?.strategies[0]?.expression ?? ''
    if (!sel) return
    sendToIframe({ type: 'pim-set-active-selector', selector: sel })
    setSelectedFieldIdx(idx)
  }
```

- [ ] **Step 3: Synchroniser les tags au chargement et à chaque modification**

Ajouter un `useEffect` après le `useEffect` existant (ligne ~92) :

```ts
  // Re-envoyer les tags persistants dès que les fields changent ou que l'iframe
  // est prête (pim-ready déclenche déjà un render initial).
  useEffect(() => {
    if (!rewrittenHtml) return
    if (showAllTags) {
      syncTags()
    } else {
      sendToIframe({ type: 'pim-clear-persistent-tags' })
    }
  }, [rewrittenHtml, template.fields, showAllTags, syncTags])
```

- [ ] **Step 4: Ajouter le toggle « Afficher/Masquer surbrillances » dans la toolbar**

Dans la toolbar (ligne ~252), juste après le bouton « Activer capture », ajouter :

```tsx
            <div className="h-6 w-px bg-white/10" />
            <button
              onClick={() => setShowAllTags((s) => !s)}
              title={showAllTags ? 'Masquer les surbrillances' : 'Afficher les surbrillances'}
              className={`px-3 py-2 rounded text-xs inline-flex items-center gap-2 border ${
                showAllTags
                  ? 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10'
                  : 'bg-white/[0.02] text-white/40 border-white/5 hover:bg-white/5'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              {showAllTags ? 'Masquer tags' : 'Afficher tags'}
            </button>
```

- [ ] **Step 5: Mettre à jour le handler `pim-ready`**

Dans le `onMessage` (ligne ~75), remplacer :

```ts
      if (msg.type === 'pim-ready') {
        // iframe prête → on peut activer le mode
      }
```

par :

```ts
      if (msg.type === 'pim-ready') {
        // iframe prête → envoyer les tags dès maintenant si showAllTags
        if (showAllTags) syncTags()
      }
```

> Note : la dépendance `syncTags` est déjà mémoizée par `useCallback`. Ajouter les deps au useEffect du onMessage : `}, [showAllTags, syncTags])`.

- [ ] **Step 6: Supprimer la toast « Selector matche N éléments »**

Supprimer le bloc `if (msg.type === 'pim-preview-result')` (lignes ~84-88) — plus pertinent maintenant qu'on affiche tous les selectors en permanence.

- [ ] **Step 7: Build**

Run : `npm run build`
Expected : build OK.

- [ ] **Step 8: Validation manuelle**

- Ouvrir un template avec ≥ 3 fields dans l'éditeur visuel.
- Charger l'URL de test.
- Vérifier que tous les fields sont surlignés avec des couleurs différentes et leur label affiché.
- Cliquer un field dans la liste à gauche → vérifier que sa surbrillance se renforce (teinte plus vive) et qu'on scroll jusqu'à lui.
- Cliquer à nouveau → la surbrillance revient à la teinte normale.
- Cliquer le bouton « Masquer tags » → tous les overlays disparaissent ; re-cliquer « Afficher tags » → ils reviennent.

- [ ] **Step 9: Commit**

```bash
git add src/features/scraping-templates/VisualTemplateBuilder.tsx
git commit -m "feat(scraping-templates): persistent multi-tag highlight with toggle in visual builder"
```

---

## Phase 6 — Capture en double-clic

### Task 18 : Modifier `overlayScript.ts` pour basculer sur `dblclick`

**Files:**
- Modify: `src/features/scraping-templates/overlayScript.ts`

- [ ] **Step 1: Remplacer le listener `click` par `dblclick`**

Localiser `document.addEventListener('click', onClick, true)` (ligne ~155) et le remplacer par :

```js
  document.addEventListener('dblclick', onClick, true)
```

- [ ] **Step 2: Modifier le handler `onClick` pour qu'il ne bloque pas les simple-clics**

La fonction `onClick` (ligne ~126) ne sera plus appelée sur simple-clic. Elle est correcte pour `dblclick` : `preventDefault` empêche uniquement la navigation au double-clic (qui sélectionne du texte par défaut).

- [ ] **Step 3: Ne bloquer les simple-clics que sur les ancres externes**

Ajouter après les listeners existants (ligne ~158, avant le `document.addEventListener('submit', ...)`):

```js
  // Simple-clic : laisser passer pour permettre la navigation dans l'iframe
  // (ouverture d'accordéons, onglets), MAIS bloquer les ancres qui navigueraient
  // hors iframe ou vers une URL différente du document courant.
  document.addEventListener('click', function(e) {
    if (mode === 'off') return
    var tgt = e.target
    // Remonter jusqu'à la 1re ancre parente s'il y en a
    while (tgt && tgt !== document.body && tgt.tagName !== 'A') tgt = tgt.parentElement
    if (!tgt || tgt.tagName !== 'A') return
    var href = tgt.getAttribute('href') || ''
    // Bloquer les liens externes qui feraient quitter l'iframe
    if (/^https?:/.test(href) || tgt.target === '_blank' || tgt.target === '_top') {
      e.preventDefault()
      e.stopPropagation()
    }
  }, true)
```

- [ ] **Step 4: Build**

Run : `npm run build`
Expected : build OK.

- [ ] **Step 5: Commit**

```bash
git add src/features/scraping-templates/overlayScript.ts
git commit -m "feat(scraping-templates): switch capture to double-click, let single-click navigate"
```

---

### Task 19 : Mettre à jour les libellés dans `VisualTemplateBuilder.tsx`

**Files:**
- Modify: `src/features/scraping-templates/VisualTemplateBuilder.tsx`

- [ ] **Step 1: Modifier le libellé du bouton « Activer capture »**

Remplacer (ligne ~264) :

```tsx
              {captureMode === 'off' ? 'Activer capture' : 'Arrêter capture'}
```

par :

```tsx
              {captureMode === 'off' ? 'Activer capture (double-clic)' : 'Arrêter capture'}
```

- [ ] **Step 2: Mettre à jour le bloc « Rendu dégradé »**

Remplacer le bloc de notice (lignes ~272-277) par :

```tsx
        <div className="px-3 py-2 bg-amber-500/[0.08] border border-amber-400/20 rounded text-[10px] text-amber-200/80">
          <b>Rendu dégradé attendu</b> — les polices custom et icônes webfont ne chargent pas
          (CORS sur <code className="text-amber-100">@font-face</code>). <b>Double-clic</b> pour capturer un élément,
          <b> simple-clic</b> pour naviguer (accordéons, onglets).
        </div>
```

- [ ] **Step 3: Build**

Run : `npm run build`
Expected : build OK.

- [ ] **Step 4: Validation manuelle**

- Charger une page à accordéons (ex : fiche Milwaukee avec sections repliables) dans l'éditeur visuel.
- Activer le mode capture.
- Simple-clic sur un accordéon fermé → il s'ouvre (pas de modal de mappage).
- Double-clic sur un élément à l'intérieur → modal de mappage apparaît.
- Simple-clic sur un lien externe `<a href="https://...">` → bloqué (aucune navigation hors iframe).

- [ ] **Step 5: Commit**

```bash
git add src/features/scraping-templates/VisualTemplateBuilder.tsx
git commit -m "feat(scraping-templates): update UI labels for double-click capture"
```

---

## Phase 7 — Validation finale

### Task 20 : Smoke test end-to-end

**Files:** (aucun code, validation)

- [ ] **Step 1: Build production**

Run : `npm run build`
Expected : build complet sans warning.

- [ ] **Step 2: Parcours utilisateur complet**

- [ ] Démarrer `npm run dev`.
- [ ] Se connecter. Sidebar : cliquer « Scraping Hub ».
- [ ] **Onglet Règles** : saisir `# Test\n\n- Rule 1` → preview markdown à droite → Enregistrer → rafraîchir la page → contenu toujours là.
- [ ] **Onglet Fournisseurs** : vérifier groupement par domaine. Cliquer un template → redirection vers `/scraping-templates?id=…` (ou section équivalente).
- [ ] **Onglet Debug** : vider le log. Lancer un enrichissement → revenir voir les entrées Jina + LLM apparaître.
- [ ] Dans un template existant, ajouter un `vendorPrompt`. Sauver. Créer un 2e template même domaine → vérifier héritage. Re-modifier le 1er → toast propagation.
- [ ] Dans l'éditeur visuel, charger une page avec ≥ 3 fields → tous surlignés avec labels. Cliquer un field → scroll + teinte vive. Masquer/Afficher tags : fonctionne.
- [ ] Activer capture, simple-cliquer un accordéon → ouverture. Double-cliquer un élément → modal de mappage.
- [ ] Lancer un enrichissement et regarder dans l'onglet Debug le prompt : vérifier que `CONTEXTE FOURNISSEUR` est présent en tête du message.

- [ ] **Step 3: Commit final si des ajustements ont été faits**

Si des micro-corrections ont été nécessaires pendant le smoke test :

```bash
git add <fichiers-modifiés>
git commit -m "fix(scraping-hub): tweaks after end-to-end smoke test"
```

---

## Récapitulatif des fichiers

**Nouveaux (7)**
- `src/features/scraping-templates/buildEnrichmentPrompt.ts`
- `src/features/scraping-hub/debugLog.ts`
- `src/features/scraping-hub/rulesStore.ts`
- `src/features/scraping-hub/RulesTab.tsx`
- `src/features/scraping-hub/VendorsTab.tsx`
- `src/features/scraping-hub/DebugTab.tsx`
- `src/features/scraping-hub/ScrapingHubPage.tsx`

**Modifiés (7)**
- `src/features/scraping-templates/types.ts`
- `src/features/scraping-templates/templatesStore.ts`
- `src/features/scraping-templates/TemplateEditor.tsx`
- `src/features/scraping-templates/overlayScript.ts`
- `src/features/scraping-templates/VisualTemplateBuilder.tsx`
- `src/features/scraping-templates/useMatchingTemplate.ts` (si `findMatchingTemplate` absent)
- `src/features/scraping/useJina.ts`
- `src/features/excel/ai-enrichment/useProductEnrichment.ts`
- `src/pages/DashboardPage.tsx`
- `package.json` + `package-lock.json` + éventuellement `tailwind.config.js`
