# Claude Design Modal — Spec Design

**Date:** 2026-04-21  
**Status:** Design approved, ready for implementation plan  
**Scope:** Replace collapsible `DesignPromptPanel` with a tabbed modal interface for managing design briefs, styles, options, and advanced settings.

---

## Overview

Replace the current right-panel `DesignPromptPanel` (compact 300px accordion) with a **centered modal dialog** featuring 4 organized tabs. This gives users ample space to manage prompts, view optimization results, choose styles visually, and configure print settings—without squeezing everything into a narrow sidebar.

**Key benefit:** Room for a "Brief" tab with side-by-side prompt comparison (brut + optimisé), visual style thumbnails, and a clean settings layout.

---

## User Flow

### Opening the Modal

1. User clicks "CLAUDE DESIGN" header (currently the collapsible panel title) in `RightPanelStack`
2. Modal opens, centered on viewport
3. **Smart tab selection:**
   - If `brief.prompt` is empty → default to "Brief" tab
   - If `brief.prompt` has content → default to "Style" tab
4. All other right panels (Layers, Images, Palette, Assets, Properties) remain unchanged in the sidebar

### Closing the Modal

- User clicks "Fermer" button, or clicks outside the modal (backdrop), or presses Escape
- Modal closes, design state persists in `designBrief.store`

---

## Modal Layout & Structure

### Dimensions

- **Width:** 550px (or responsive, max 90vw)
- **Max height:** 85vh (scrollable body if needed)
- **Centered:** absolute/fixed positioning, centered both horizontally and vertically
- **Backdrop:** semi-transparent dark overlay (rgba(0,0,0,0.6))

### Header

- Title: "Claude Design Studio"
- Close button (X icon, top-right)

### Tab Navigation

Four tabs, displayed as horizontal buttons below the header:

1. **Brief** — Prompt management
2. **Style** — Visual style selection
3. **Options** — Basic settings (format, palette, bleed)
4. **Avancé** — Advanced settings (DPI, resolution, etc.)

Active tab: highlighted with indigo background + underline. Inactive: neutral gray.

### Footer

- **Left side:** Info text or status (e.g., "Ready to generate" or loading indicator)
- **Right side:** Two buttons
  - "Fermer" (gray, closes modal)
  - "Générer" (indigo, disabled if prompt empty or generation running)
  - During generation: "Générer" becomes a spinner + "Génération…" text

---

## Tab Contents

### Tab 1: "Brief"

**Layout:** Two-column side-by-side

**Left column (Prompt brut):**
- Label: "Prompt brut"
- Textarea, 8 rows, unbounded text
- Placeholder: "Ex : Affiche promo soldes d'été -30% pour magasin de chaussures…"
- Fully editable, syncs to `brief.prompt` on every keystroke

**Right column (Prompt optimisé):**
- Label: "Prompt optimisé"
- Textarea, 8 rows, read-only or lightly editable (light gray background #0a0a0a)
- Placeholder: "Cliquez sur 'Optimiser' pour voir la version améliorée"
- Initially empty until user clicks "Optimiser"
- Once optimized: shows the LLM-generated improved prompt
- Can be manually edited by user if they want to tweak

**Action button (below both textareas):**
- Button: "✨ Optimiser le prompt"
- On click:
  1. Disable button, show spinner
  2. Send current `brief.prompt` to Claude API (or Gemini) with a "enhance this design brief" prompt
  3. Receive optimized text
  4. Show a **toast notification** with the result + "Accepter" button
  5. If user clicks "Accepter": copy optimized text to the right textarea
  6. If user dismisses toast: right textarea stays as-is

**Info text (small, below button):**
"Hex séparés par virgule. Laisser vide = Claude choisit."

---

### Tab 2: "Style"

**Layout:** Vertical list of 6 style cards

**Card structure (per style):**
- **Thumbnail:** 80×60px visual preview of the style
  - Corporate: grid/building icon + blue palette
  - Minimaliste: simple geometric shapes + white/black
  - Bold: large, vibrant shapes + orange/yellow
  - Élégant: refined lines + gold/black
  - Playful: colorful, rounded shapes + rainbow
  - Rétro: retro patterns + muted colors
- **Name:** Style label (Corporate, Minimaliste, etc.)
- **Description:** One-line descriptor (e.g., "Professional & corporate look")
- **Selection indicator:** When selected, border highlights + light indigo background

**Behavior:**
- No scroll (all 6 fit vertically)
- Click any card → set `brief.style` to that style ID
- Currently selected style shows visual indicator

---

### Tab 3: "Options" (Basic Settings)

**Layout:** Vertical stacked sections

**Section 1: Format**
- Label: "Format"
- Dropdown selector (same as current `FormatSelector`)
- Options: Personnalisé, A4, A3, Instagram Banner, LinkedIn Banner, etc.
- If "Personnalisé" selected: two input fields appear below
  - Largeur (mm): number input
  - Hauteur (mm): number input

**Section 2: Palette (Optionnel)**
- Label: "Palette (optionnel)"
- Input field: text, monospace font
- Placeholder: "#ff6b35, #1a1a1a, #ffffff"
- Info text: "Hex séparés par virgule. Laisser vide = Claude choisit."

**Section 3: Impression**
- Checkbox: "Inclure fond perdu (recommandé si impression)"
- Checked by default (per current behavior)

---

### Tab 4: "Avancé" (Advanced Settings)

**Collapsible by default** (user can expand if needed)

**When expanded, shows:**
- DPI / Résolution selector (current from `PrintSettingsPanel`)
- Any other advanced print settings
- Note: "Ces paramètres sont avancés. Modifiez-les seulement si vous savez ce que vous faites."

---

## State Management

**Source of truth:** `designBrief.store` (Zustand)
  - `brief.prompt` → textarea brut
  - `brief.promptOptimized` → textarea optimisé (new field)
  - `brief.style` → selected style
  - `brief.formatId`, `brief.customWidthMm`, `brief.customHeightMm` → format options
  - `brief.paletteText` → palette input
  - `brief.includeBleed` → checkbox

**New state needed:**
- `isModalOpen` (boolean, in `useUIStore`)
- `activeTab` (string: "brief" | "style" | "options" | "avance", in `useUIStore`)
- `isOptimizingPrompt` (boolean, loading state for optimize button)

**Modal interaction:**
- Click "CLAUDE DESIGN" header → `isModalOpen = true`, set default tab based on `brief.prompt` length
- Click "Fermer" or backdrop → `isModalOpen = false`
- Click tab button → `activeTab = "tab-name"`
- Click "Optimiser" → call API, show toast, update `brief.promptOptimized` on user accept

---

## API Integration (Prompt Optimization)

**Endpoint:** Claude API or Gemini API (per project standards)

**Input:**
- Current `brief.prompt`
- Optional context: `brief.style`, format, etc.

**System prompt for optimization:**
```
Tu es un expert en création d'affiches et de designs marketing. 
L'utilisateur te fournit un brief brut (description du produit/promotion à afficher).

Transforme ce brief en une instruction détaillée et structurée pour un designer IA, incluant:
- Description précise du produit/service
- Ambiance et style visuel recommandés
- Hiérarchie visuelle (titres, prix, détails)
- Palette de couleurs (si applicable)
- Composition spatiale (layout)
- Appel à l'action clair

Réponds en français, sois concis mais complet. Le résultat doit servir de prompt pour un système de génération d'images IA.
```

**Response:** Optimized prompt text (1-5 sentences, structured)

**Error handling:**
- If API fails: toast error message, keep right textarea empty
- If rate-limited: show user-friendly message

---

## Component Structure

### New Components

1. **`ClaudeDesignModal.tsx`** (new)
   - Wraps the entire modal: header, tabs, footer, backdrop
   - Manages modal state (`isModalOpen`, `activeTab`)
   - Handles close on backdrop click, Escape key
   - Renders tab content conditionally

2. **`ClaudeDesignBriefTab.tsx`** (new)
   - Two-column layout (brut | optimisé)
   - "Optimiser" button + API integration
   - Toast notification for results

3. **`ClaudeDesignStyleTab.tsx`** (new)
   - Grid/list of 6 style cards with thumbnails
   - Selection handling

4. **`ClaudeDesignOptionsTab.tsx`** (refactored from existing)
   - Extract format, palette, bleed checkbox from current `DesignPromptPanel`

5. **`ClaudeDesignAdvancedTab.tsx`** (refactored from existing)
   - Extract `PrintSettingsPanel` into collapsible section

### Modified Components

1. **`RightPanelStack.tsx`**
   - Keep the accordion panel structure (no change)
   - Replace `DesignPromptPanel` content with a button: "Ouvrir Claude Design"
   - That button opens `ClaudeDesignModal`
   - Alternatively: click on "CLAUDE DESIGN" header itself opens the modal

2. **`DesignPromptPanel.tsx`**
   - Can be deleted OR repurposed as a minimal "quick access" preview (optional)
   - If kept: show current style + format as read-only badges, "Ouvrir" button to open modal

### Store Updates

**`useUIStore` (ui.store.ts):**
- Add `isClaudeDesignModalOpen: boolean`
- Add `claudeDesignActiveTab: 'brief' | 'style' | 'options' | 'avance'`
- Methods: `openClaudeDesignModal()`, `closeClaudeDesignModal()`, `setClaudeDesignTab(tab)`

**`useDesignBriefStore` (designBrief.store.ts):**
- Add `promptOptimized: string` field
- Sync from textarea on user accept (not on every keystroke)

---

## Error Handling & Edge Cases

1. **Empty prompt:** "Générer" button disabled until prompt has content
2. **Optimization API failure:** Toast error, right textarea stays empty
3. **User edits optimized prompt manually:** OK, it's a textarea, no restriction
4. **Modal closes during generation:** Generation continues in background (state persists)
5. **Escape key / backdrop click:** Close modal only if not generating

---

## Testing Checklist

- [ ] Modal opens on "CLAUDE DESIGN" click
- [ ] Default tab = "Brief" if prompt empty, "Style" if prompt filled
- [ ] Tab switching works (Brief → Style → Options → Avancé)
- [ ] Close button, backdrop click, Escape key all close modal
- [ ] "Optimiser" button calls API and shows toast with result
- [ ] "Accepter" in toast fills right textarea
- [ ] Style selection updates `brief.style`
- [ ] Format, palette, bleed changes sync to state
- [ ] "Générer" button disabled if prompt empty or generation running
- [ ] Generation initiates from modal and closes modal on success
- [ ] All other right panels (Layers, Images, etc.) still work while modal is closed

---

## Success Criteria

✅ Users have ample space (550px width) to write and optimize detailed design briefs  
✅ Visual style selection is clearer with thumbnail previews  
✅ Basic and advanced settings are logically separated  
✅ Prompt optimization is discoverable and easy to use  
✅ No disruption to existing panel behavior (layers, assets, etc. still work)  
✅ Modal feels native to the Canva-like editor aesthetic
