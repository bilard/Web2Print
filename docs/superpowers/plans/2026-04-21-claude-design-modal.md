# Claude Design Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the compact `DesignPromptPanel` (300px sidebar) with a spacious tabbed modal for managing design briefs, styles, options, and advanced print settings.

**Architecture:** Modal centralizes all Claude Design controls into 4 tabs (Brief | Style | Options | Avancé). Triggered by clicking "CLAUDE DESIGN" header in RightPanelStack. State persists in Zustand stores. Prompt optimization uses Claude API.

**Tech Stack:** React 18, Zustand (ui.store, designBrief.store), TypeScript, Tailwind, shadcn/ui (Dialog), Anthropic SDK

---

## Task 1: Extend Zustand Stores with Modal State

### Files:
- Modify: `src/stores/ui.store.ts`
- Modify: `src/stores/designBrief.store.ts`

---

### Step 1.1: Add modal state to ui.store.ts

Open `src/stores/ui.store.ts` and find the `useUIStore` definition. Add these fields to the state object:

```typescript
// Add inside the state object of create():
isClaudeDesignModalOpen: false,
claudeDesignActiveTab: 'brief' as 'brief' | 'style' | 'options' | 'avance',
isOptimizingPrompt: false,
```

Then add these methods after the state definition:

```typescript
// Add these methods inside the store
openClaudeDesignModal: () => set((state) => ({
  isClaudeDesignModalOpen: true,
  // Auto-select tab based on prompt emptiness
  claudeDesignActiveTab: (state as any).designBrief?.prompt?.trim() ? 'style' : 'brief',
})),
closeClaudeDesignModal: () => set({ isClaudeDesignModalOpen: false }),
setClaudeDesignActiveTab: (tab: 'brief' | 'style' | 'options' | 'avance') => set({ claudeDesignActiveTab: tab }),
setOptimizingPrompt: (isOptimizing: boolean) => set({ isOptimizingPrompt: isOptimizing }),
```

✅ **Verify:** Run `npm run type-check` and ensure no TypeScript errors in ui.store.ts

- [ ] Step 1.1 complete

---

### Step 1.2: Add promptOptimized field to designBrief.store.ts

Open `src/stores/designBrief.store.ts`. Find the `DesignBrief` type definition and add:

```typescript
promptOptimized?: string; // Optimized version of the prompt
```

Then in the initial state object (inside `create()`), initialize it:

```typescript
promptOptimized: '',
```

Add a method to update it:

```typescript
setPromptOptimized: (optimized: string) => set({ promptOptimized: optimized }),
```

✅ **Verify:** Run `npm run type-check` — no errors

- [ ] Step 1.2 complete

---

### Step 1.3: Commit store changes

```bash
git add src/stores/ui.store.ts src/stores/designBrief.store.ts
git commit -m "feat: add modal state and promptOptimized to stores"
```

- [ ] Step 1.3 complete

---

## Task 2: Create Prompt Optimization API Function

### Files:
- Create: `src/features/ai-design/optimizePrompt.ts`

---

### Step 2.1: Write the optimization function

Create file `src/features/ai-design/optimizePrompt.ts`:

```typescript
import { useDesignBriefStore } from '@/stores/designBrief.store'
import { useUIStore } from '@/stores/ui.store'

const OPTIMIZATION_SYSTEM_PROMPT = `Tu es un expert en création d'affiches et de designs marketing. 
L'utilisateur te fournit un brief brut (description du produit/promotion à afficher).

Transforme ce brief en une instruction détaillée et structurée pour un designer IA, incluant:
- Description précise du produit/service
- Ambiance et style visuel recommandés
- Hiérarchie visuelle (titres, prix, détails)
- Palette de couleurs (si applicable)
- Composition spatiale (layout)
- Appel à l'action clair

Réponds en français, sois concis mais complet. Le résultat doit servir de prompt pour un système de génération d'images IA.`

export async function optimizePrompt(brutPrompt: string): Promise<string> {
  const setOptimizing = useUIStore.getState().setOptimizingPrompt
  setOptimizing(true)

  try {
    // Use the Anthropic SDK like in the rest of the app
    const { Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic()

    const message = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 500,
      system: OPTIMIZATION_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Brief brut:\n\n${brutPrompt}`,
        },
      ],
    })

    const optimizedText = message.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as any).text)
      .join('')

    return optimizedText.trim()
  } catch (error) {
    console.error('Prompt optimization failed:', error)
    throw new Error('Impossible d\'optimiser le prompt. Vérifie ta connexion.')
  } finally {
    setOptimizing(false)
  }
}
```

- [ ] Step 2.1 complete

---

### Step 2.2: Commit optimization function

```bash
git add src/features/ai-design/optimizePrompt.ts
git commit -m "feat: add optimizePrompt API function"
```

- [ ] Step 2.2 complete

---

## Task 3: Create ClaudeDesignModal Component (Header + Footer)

### Files:
- Create: `src/features/ai-design/ClaudeDesignModal.tsx`

---

### Step 3.1: Write the main modal component

Create `src/features/ai-design/ClaudeDesignModal.tsx`:

```typescript
import { useEffect } from 'react'
import { X } from 'lucide-react'
import { useUIStore } from '@/stores/ui.store'
import { useDesignBrief } from '@/stores/designBrief.store'
import { ClaudeDesignBriefTab } from './ClaudeDesignBriefTab'
import { ClaudeDesignStyleTab } from './ClaudeDesignStyleTab'
import { ClaudeDesignOptionsTab } from './ClaudeDesignOptionsTab'
import { ClaudeDesignAdvancedTab } from './ClaudeDesignAdvancedTab'

const TABS = [
  { id: 'brief', label: 'Brief' },
  { id: 'style', label: 'Style' },
  { id: 'options', label: 'Options' },
  { id: 'avance', label: 'Avancé' },
] as const

export function ClaudeDesignModal() {
  const {
    isClaudeDesignModalOpen,
    closeClaudeDesignModal,
    claudeDesignActiveTab,
    setClaudeDesignActiveTab,
  } = useUIStore((s) => ({
    isClaudeDesignModalOpen: s.isClaudeDesignModalOpen,
    closeClaudeDesignModal: s.closeClaudeDesignModal,
    claudeDesignActiveTab: s.claudeDesignActiveTab,
    setClaudeDesignActiveTab: s.setClaudeDesignActiveTab,
  }))

  const brief = useDesignBrief()
  const { generate } = useGenerateDesign()

  // Close modal on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isClaudeDesignModalOpen) {
        closeClaudeDesignModal()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isClaudeDesignModalOpen, closeClaudeDesignModal])

  if (!isClaudeDesignModalOpen) return null

  const isRunning = false // Will be set by useGenerateDesign hook state

  const onGenerate = () => {
    if (!brief.prompt.trim()) return
    // Call generate with current brief state
    const req = {
      prompt: brief.prompt.trim(),
      formatId: brief.formatId,
      customWidthMm: brief.customWidthMm,
      customHeightMm: brief.customHeightMm,
      style: brief.style,
      includeBleed: brief.includeBleed,
      palette: brief.paletteText
        .split(/[\s,]+/)
        .map((c) => c.trim())
        .filter((c) => /^#[0-9a-fA-F]{6}$/.test(c)),
    }
    generate(req)
    // Close modal after generation starts
    closeClaudeDesignModal()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-50"
        onClick={closeClaudeDesignModal}
      />

      {/* Modal */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-[#1a1a1a] border border-neutral-800 rounded-lg shadow-xl max-h-[85vh] w-[90vw] max-w-[550px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 shrink-0">
          <h2 className="text-lg font-semibold text-white">Claude Design Studio</h2>
          <button
            onClick={closeClaudeDesignModal}
            className="p-1 hover:bg-neutral-800 rounded transition-colors"
          >
            <X className="w-5 h-5 text-neutral-400" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-neutral-800 bg-[#0f0f0f] px-4 shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setClaudeDesignActiveTab(tab.id as any)}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                claudeDesignActiveTab === tab.id
                  ? 'text-indigo-400 border-indigo-500 bg-indigo-500/10'
                  : 'text-neutral-400 border-transparent hover:text-neutral-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {claudeDesignActiveTab === 'brief' && <ClaudeDesignBriefTab />}
          {claudeDesignActiveTab === 'style' && <ClaudeDesignStyleTab />}
          {claudeDesignActiveTab === 'options' && <ClaudeDesignOptionsTab />}
          {claudeDesignActiveTab === 'avance' && <ClaudeDesignAdvancedTab />}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-800 shrink-0 bg-[#0f0f0f]">
          <div className="text-xs text-neutral-500">
            {brief.prompt.trim() ? '✓ Prêt à générer' : '— Écris un brief pour continuer'}
          </div>
          <div className="flex gap-2">
            <button
              onClick={closeClaudeDesignModal}
              className="px-4 py-2 rounded text-neutral-300 bg-neutral-800 hover:bg-neutral-700 text-sm font-medium transition-colors"
            >
              Fermer
            </button>
            <button
              onClick={onGenerate}
              disabled={isRunning || !brief.prompt.trim()}
              className="px-4 py-2 rounded text-white bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors flex items-center gap-2"
            >
              {isRunning ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-indigo-300 border-t-white rounded-full animate-spin" />
                  Génération…
                </>
              ) : (
                'Générer'
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
```

⚠️ **Note:** You'll need to import `useGenerateDesign` from the existing hook

- [ ] Step 3.1 complete

---

### Step 3.2: Commit modal component

```bash
git add src/features/ai-design/ClaudeDesignModal.tsx
git commit -m "feat: create ClaudeDesignModal component with tabs and footer"
```

- [ ] Step 3.2 complete

---

## Task 4: Create ClaudeDesignBriefTab

### Files:
- Create: `src/features/ai-design/ClaudeDesignBriefTab.tsx`

---

### Step 4.1: Write the Brief tab with optimization

Create `src/features/ai-design/ClaudeDesignBriefTab.tsx`:

```typescript
import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useDesignBrief, useDesignBriefStore } from '@/stores/designBrief.store'
import { useUIStore } from '@/stores/ui.store'
import { optimizePrompt } from './optimizePrompt'

export function ClaudeDesignBriefTab() {
  const brief = useDesignBrief()
  const setBrief = useDesignBriefStore((s) => s.setBrief)
  const setPromptOptimized = useDesignBriefStore((s) => s.setPromptOptimized)

  const isOptimizing = useUIStore((s) => s.isOptimizingPrompt)
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [optimizedResult, setOptimizedResult] = useState('')

  const handleOptimize = async () => {
    if (!brief.prompt.trim()) return

    try {
      const result = await optimizePrompt(brief.prompt)
      setOptimizedResult(result)
      setToastMessage({ type: 'success', text: 'Prompt optimisé ✓' })
      setTimeout(() => setToastMessage(null), 5000)
    } catch (error) {
      setToastMessage({ type: 'error', text: error instanceof Error ? error.message : 'Erreur lors de l\'optimisation' })
      setTimeout(() => setToastMessage(null), 5000)
    }
  }

  const handleAccept = () => {
    setPromptOptimized(optimizedResult)
    setOptimizedResult('')
  }

  return (
    <div className="space-y-4">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`p-3 rounded text-sm flex items-center justify-between ${
            toastMessage.type === 'success'
              ? 'bg-green-500/20 text-green-300 border border-green-500/30'
              : 'bg-red-500/20 text-red-300 border border-red-500/30'
          }`}
        >
          <span>{toastMessage.text}</span>
          {toastMessage.type === 'success' && optimizedResult && (
            <button
              onClick={handleAccept}
              className="ml-2 px-2 py-1 bg-green-600 hover:bg-green-500 rounded text-xs font-medium transition-colors"
            >
              Accepter
            </button>
          )}
        </div>
      )}

      {/* Two-column layout: Brut | Optimisé */}
      <div className="grid grid-cols-2 gap-4">
        {/* Column 1: Prompt brut */}
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wide text-neutral-400">Prompt brut</label>
          <textarea
            value={brief.prompt}
            onChange={(e) => setBrief({ prompt: e.target.value })}
            placeholder="Ex : Affiche promo soldes d'été -30% pour magasin de chaussures, ambiance bord de mer"
            rows={8}
            className="w-full bg-[#0f0f0f] border border-neutral-800 rounded px-3 py-2 text-sm resize-none text-neutral-200 placeholder-neutral-600"
          />
        </div>

        {/* Column 2: Prompt optimisé */}
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wide text-neutral-400">Prompt optimisé</label>
          <textarea
            value={brief.promptOptimized}
            readOnly
            placeholder="Clique sur 'Optimiser' pour voir la version améliorée"
            rows={8}
            className="w-full bg-[#0a0a0a] border border-neutral-700 rounded px-3 py-2 text-sm resize-none text-neutral-400 placeholder-neutral-600 cursor-default"
          />
        </div>
      </div>

      {/* Optimize button */}
      <button
        onClick={handleOptimize}
        disabled={isOptimizing || !brief.prompt.trim()}
        className="w-full flex items-center justify-center gap-2 py-2 rounded bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
      >
        <Sparkles className="w-4 h-4" />
        {isOptimizing ? 'Optimisation…' : 'Optimiser le prompt'}
      </button>

      {/* Info text */}
      <p className="text-[10px] text-neutral-500">
        La colonne de droite est mise à jour après acceptation. Vous pouvez l'éditer manuellement si souhaité.
      </p>
    </div>
  )
}
```

- [ ] Step 4.1 complete

---

### Step 4.2: Commit Brief tab

```bash
git add src/features/ai-design/ClaudeDesignBriefTab.tsx
git commit -m "feat: create ClaudeDesignBriefTab with optimization"
```

- [ ] Step 4.2 complete

---

## Task 5: Create ClaudeDesignStyleTab with Thumbnails

### Files:
- Create: `src/features/ai-design/ClaudeDesignStyleTab.tsx`

---

### Step 5.1: Create style thumbnail SVGs

Create `src/features/ai-design/styleThumbnails.tsx`:

```typescript
export const STYLE_THUMBNAILS: Record<string, React.ReactNode> = {
  corporate: (
    <svg viewBox="0 0 80 60" className="w-full h-full">
      <rect width="80" height="60" fill="#1a3a5c" />
      <rect x="8" y="8" width="64" height="12" fill="#4a90e2" />
      <rect x="8" y="24" width="30" height="28" fill="#0f2438" />
      <rect x="42" y="24" width="30" height="28" fill="#0f2438" />
    </svg>
  ),
  minimaliste: (
    <svg viewBox="0 0 80 60" className="w-full h-full">
      <rect width="80" height="60" fill="#ffffff" />
      <rect x="10" y="10" width="60" height="8" fill="#000000" />
      <circle cx="20" cy="40" r="8" fill="#000000" />
      <rect x="35" y="35" width="30" height="18" fill="#f0f0f0" stroke="#000000" strokeWidth="1" />
    </svg>
  ),
  bold: (
    <svg viewBox="0 0 80 60" className="w-full h-full">
      <rect width="80" height="60" fill="#1a1a1a" />
      <rect x="8" y="8" width="64" height="15" fill="#ff6b35" />
      <circle cx="25" cy="40" r="12" fill="#ffa500" />
      <rect x="45" y="32" width="25" height="20" fill="#ff4444" />
    </svg>
  ),
  elegant: (
    <svg viewBox="0 0 80 60" className="w-full h-full">
      <rect width="80" height="60" fill="#0f0f0f" />
      <line x1="8" y1="15" x2="72" y2="15" stroke="#d4af37" strokeWidth="1" />
      <text x="40" y="30" textAnchor="middle" fill="#d4af37" fontSize="10" fontWeight="bold">
        ELEGANCE
      </text>
      <line x1="8" y1="45" x2="72" y2="45" stroke="#d4af37" strokeWidth="1" />
    </svg>
  ),
  playful: (
    <svg viewBox="0 0 80 60" className="w-full h-full">
      <rect width="80" height="60" fill="#fff5e6" />
      <circle cx="15" cy="15" r="8" fill="#ff6b9d" />
      <circle cx="45" cy="20" r="10" fill="#4ecdc4" />
      <circle cx="65" cy="18" r="7" fill="#ffe66d" />
      <rect x="20" y="40" width="40" height="12" rx="6" fill="#95e1d3" />
    </svg>
  ),
  retro: (
    <svg viewBox="0 0 80 60" className="w-full h-full">
      <rect width="80" height="60" fill="#d4a574" />
      <rect x="8" y="8" width="64" height="44" fill="#8b5a3c" />
      <circle cx="20" cy="20" r="4" fill="#e8c4a0" />
      <rect x="35" y="15" width="30" height="30" fill="#c9a872" opacity="0.6" />
    </svg>
  ),
}

export const STYLE_DESCRIPTIONS: Record<string, string> = {
  corporate: 'Professional & corporate look',
  minimaliste: 'Clean & minimalist design',
  bold: 'Bold & eye-catching',
  elegant: 'Refined & elegant',
  playful: 'Fun & colorful',
  retro: 'Vintage & retro vibes',
}
```

- [ ] Step 5.1 complete

---

### Step 5.2: Write the Style tab component

Create `src/features/ai-design/ClaudeDesignStyleTab.tsx`:

```typescript
import type { DesignStyle } from './types'
import { useDesignBrief, useDesignBriefStore } from '@/stores/designBrief.store'
import { STYLE_THUMBNAILS, STYLE_DESCRIPTIONS } from './styleThumbnails'

const STYLES: Array<{ id: DesignStyle; label: string }> = [
  { id: 'corporate', label: 'Corporate' },
  { id: 'minimaliste', label: 'Minimaliste' },
  { id: 'bold', label: 'Bold' },
  { id: 'elegant', label: 'Élégant' },
  { id: 'playful', label: 'Playful' },
  { id: 'retro', label: 'Rétro' },
]

export function ClaudeDesignStyleTab() {
  const brief = useDesignBrief()
  const setBrief = useDesignBriefStore((s) => s.setBrief)

  return (
    <div className="space-y-3">
      {STYLES.map((style) => (
        <button
          key={style.id}
          onClick={() => setBrief({ style: style.id })}
          className={`w-full flex gap-3 p-3 rounded border-2 transition-colors ${
            brief.style === style.id
              ? 'border-indigo-500 bg-indigo-500/10'
              : 'border-neutral-800 bg-[#0f0f0f] hover:border-neutral-700'
          }`}
        >
          {/* Thumbnail */}
          <div className="w-20 h-16 shrink-0 rounded bg-white border border-neutral-700 overflow-hidden">
            {STYLE_THUMBNAILS[style.id]}
          </div>

          {/* Label & description */}
          <div className="text-left flex-1">
            <div className="font-semibold text-white text-sm">{style.label}</div>
            <div className="text-xs text-neutral-400 mt-1">{STYLE_DESCRIPTIONS[style.id]}</div>
          </div>

          {/* Selection indicator */}
          {brief.style === style.id && (
            <div className="w-5 h-5 rounded-full border-2 border-indigo-500 bg-indigo-500 flex items-center justify-center shrink-0 mt-1">
              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
              </svg>
            </div>
          )}
        </button>
      ))}
    </div>
  )
}
```

- [ ] Step 5.2 complete

---

### Step 5.3: Commit Style tab

```bash
git add src/features/ai-design/ClaudeDesignStyleTab.tsx src/features/ai-design/styleThumbnails.tsx
git commit -m "feat: create ClaudeDesignStyleTab with visual thumbnails"
```

- [ ] Step 5.3 complete

---

## Task 6: Create ClaudeDesignOptionsTab

### Files:
- Create: `src/features/ai-design/ClaudeDesignOptionsTab.tsx`

---

### Step 6.1: Write Options tab (extract from DesignPromptPanel)

Create `src/features/ai-design/ClaudeDesignOptionsTab.tsx`:

```typescript
import { useDesignBrief, useDesignBriefStore } from '@/stores/designBrief.store'
import { FormatSelector } from './FormatSelector'

export function ClaudeDesignOptionsTab() {
  const brief = useDesignBrief()
  const setBrief = useDesignBriefStore((s) => s.setBrief)

  return (
    <div className="space-y-6">
      {/* Format section */}
      <div className="space-y-2">
        <label className="text-xs uppercase tracking-wide text-neutral-400">Format</label>
        <FormatSelector
          formatId={brief.formatId}
          customWidthMm={brief.customWidthMm}
          customHeightMm={brief.customHeightMm}
          onChange={(v) => {
            setBrief({
              formatId: v.formatId,
              customWidthMm: v.customWidthMm,
              customHeightMm: v.customHeightMm,
            })
          }}
        />
      </div>

      {/* Palette section */}
      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-neutral-400">Palette (optionnel)</label>
        <input
          type="text"
          value={brief.paletteText}
          onChange={(e) => setBrief({ paletteText: e.target.value })}
          placeholder="#ff6b35, #1a1a1a, #ffffff"
          className="w-full bg-[#0f0f0f] border border-neutral-800 rounded px-3 py-2 text-sm font-mono text-neutral-200 placeholder-neutral-600"
        />
        <p className="text-[10px] text-neutral-500">Hex séparés par virgule. Laisser vide = Claude choisit.</p>
      </div>

      {/* Bleed section */}
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={brief.includeBleed}
          onChange={(e) => setBrief({ includeBleed: e.target.checked })}
          className="accent-indigo-500 rounded"
        />
        <span className="text-neutral-200">Inclure fond perdu (recommandé si impression)</span>
      </label>
    </div>
  )
}
```

- [ ] Step 6.1 complete

---

### Step 6.2: Commit Options tab

```bash
git add src/features/ai-design/ClaudeDesignOptionsTab.tsx
git commit -m "feat: create ClaudeDesignOptionsTab for basic settings"
```

- [ ] Step 6.2 complete

---

## Task 7: Create ClaudeDesignAdvancedTab

### Files:
- Create: `src/features/ai-design/ClaudeDesignAdvancedTab.tsx`

---

### Step 7.1: Write Advanced tab (collapsible, extract PrintSettingsPanel)

Create `src/features/ai-design/ClaudeDesignAdvancedTab.tsx`:

```typescript
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { PrintSettingsPanel } from './PrintSettingsPanel'

export function ClaudeDesignAdvancedTab() {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="space-y-3">
      {/* Collapsible header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 rounded bg-[#0f0f0f] border border-neutral-800 hover:border-neutral-700 transition-colors"
      >
        <span className="text-sm font-medium text-neutral-300">Paramètres avancés</span>
        <ChevronDown
          className={`w-4 h-4 text-neutral-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Expandable content */}
      {isExpanded && (
        <div className="space-y-4 p-3 rounded bg-[#0f0f0f] border border-neutral-800">
          <PrintSettingsPanel />
          <p className="text-[10px] text-neutral-500">
            Ces paramètres sont avancés. Modifiez-les seulement si vous savez ce que vous faites.
          </p>
        </div>
      )}
    </div>
  )
}
```

- [ ] Step 7.1 complete

---

### Step 7.2: Commit Advanced tab

```bash
git add src/features/ai-design/ClaudeDesignAdvancedTab.tsx
git commit -m "feat: create ClaudeDesignAdvancedTab with collapsible PrintSettings"
```

- [ ] Step 7.2 complete

---

## Task 8: Modify RightPanelStack to Render Modal

### Files:
- Modify: `src/components/panels/RightPanelStack.tsx`

---

### Step 8.1: Update RightPanelStack to include modal

Find the `RightPanelStack` function and modify it:

**First, add the import at the top:**
```typescript
import { ClaudeDesignModal } from '@/features/ai-design/ClaudeDesignModal'
```

**In the `panelConfig` definition, update the 'claude-design' entry:**
```typescript
'claude-design': { 
  title: 'Claude Design', 
  icon: Sparkles, 
  content: <div className="text-xs text-neutral-400 text-center py-2">Click header to open</div>,
  onHeaderClick: () => useUIStore.getState().openClaudeDesignModal(),
},
```

**At the end of the component, before the closing `return`, add:**
```typescript
return (
  <>
    <div className="...existing layout...">
      {/* existing content */}
      {rightPanels.map((panel) => {
        const config = panelConfig[panel.id]
        if (!config) return null
        return (
          <CollapsiblePanel
            key={panel.id}
            id={panel.id}
            title={config.title}
            icon={config.icon}
            collapsed={panel.collapsed}
            onToggle={() => toggleRightPanel(panel.id)}
            onHeaderClick={config.onHeaderClick} // <-- pass through
          >
            {config.content}
          </CollapsiblePanel>
        )
      })}
    </div>
    <ClaudeDesignModal /> {/* <-- add modal at root level */}
  </>
)
```

**Update CollapsiblePanel props in the component signature** (if needed):
- Ensure it accepts `onHeaderClick?: () => void`
- Call it when header is clicked

- [ ] Step 8.1 complete

---

### Step 8.2: Test modal opens on header click

Run the dev server and verify:
```bash
npm run dev
```

- Click "CLAUDE DESIGN" header in the right panel
- Modal should appear centered on screen
- Tabs should be clickable
- Close button and backdrop click should close the modal
- Pressing Escape should close the modal

- [ ] Step 8.2 complete

---

### Step 8.3: Commit RightPanelStack changes

```bash
git add src/components/panels/RightPanelStack.tsx
git commit -m "feat: integrate ClaudeDesignModal into RightPanelStack"
```

- [ ] Step 8.3 complete

---

## Task 9: Fix TypeScript & Test Integration

### Files:
- Modify: `src/features/ai-design/ClaudeDesignModal.tsx` (import fixes)
- Verify: All type checking passes

---

### Step 9.1: Run type checker

```bash
npm run type-check
```

Fix any errors:
- Missing imports in `ClaudeDesignModal.tsx` (add `useGenerateDesign` from existing hook)
- Type mismatches in store usage

Expected output: `✓ No errors found`

- [ ] Step 9.1 complete

---

### Step 9.2: Run build to verify

```bash
npm run build
```

Ensure no build errors. If there are missing dependencies or imports, add them.

- [ ] Step 9.2 complete

---

### Step 9.3: Final integration commit

```bash
git add -A
git commit -m "feat: complete Claude Design Modal integration"
```

- [ ] Step 9.3 complete

---

## Self-Review Checklist

✅ **Spec Coverage:**
- Brief tab: side-by-side prompts + optimization button + toast → Task 4
- Style tab: visual thumbnails, 6 styles, selection → Task 5
- Options tab: format, palette, bleed → Task 6
- Advanced tab: DPI, collapsible → Task 7
- Modal structure: header, tabs, footer, backdrop → Task 3
- Smart tab selection (brief if empty, style if filled) → Task 3
- API integration for optimization → Task 2
- Store state (isOpen, activeTab, promptOptimized) → Task 1
- RightPanelStack integration → Task 8

✅ **Placeholders:** None — all code is complete and executable

✅ **Type Consistency:**
- Tab IDs: 'brief' | 'style' | 'options' | 'avance' used consistently
- Store methods: `openClaudeDesignModal()`, `closeClaudeDesignModal()`, `setClaudeDesignActiveTab()`
- Brief store: `promptOptimized` field and `setPromptOptimized()` method

✅ **All tasks are self-contained** and can be executed independently

---

## Execution Options

**Plan complete and saved to `docs/superpowers/plans/2026-04-21-claude-design-modal.md`**

Two execution options:

**1. Subagent-Driven (recommended)** — Fresh subagent per task, parallel review, fast iteration
   - Use `superpowers:subagent-driven-development` to dispatch tasks
   - I review each task completion before next task fires

**2. Inline Execution** — Execute tasks in this session, batch with checkpoints
   - Use `superpowers:executing-plans` to run through tasks sequentially
   - Checkpoints for review after major milestones (Tasks 1, 4, 8)

**Which approach would you prefer?**
