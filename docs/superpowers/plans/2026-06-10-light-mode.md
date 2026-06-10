# Mode clair — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un mode clair à toute l'app avec bascule Clair/Sombre/Système, sans régression du mode sombre par défaut.

**Architecture:** Re-pointage de la couleur Tailwind `white` (et des crans pâles 100-400 des couleurs d'accent) vers des variables CSS qui basculent via `html.light` ; migration mécanique des hex littéraux vers 4 tokens sémantiques ; store Zustand + synchro Firestore pour la préférence. Spec : `docs/superpowers/specs/2026-06-10-light-mode-design.md`.

**Tech Stack:** Tailwind v3 (`<alpha-value>` + canaux RGB), Zustand v4, Firestore (`users/{uid}.uiSettings.theme`), Vitest.

**Conventions générales :**
- macOS / BSD sed : toujours `sed -i ''`.
- Vérification types : `npx tsc -b` (jamais `tsc --noEmit`).
- Après chaque tâche : commit sur master.
- ⚠️ Pendant toute la migration, le mode sombre NE DOIT PAS changer visuellement : `:root` garde les valeurs actuelles.

---

### Task 1: Fondations — variables CSS + re-pointage Tailwind

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `src/index.css`

- [ ] **Step 1.1 : Vérifier qu'aucun fond pâle ne casserait le re-pointage**

```bash
grep -rhEo '(bg|border|ring|from|to|via)-(indigo|red|emerald|amber|green|violet|blue|sky|cyan|teal|rose|purple|orange|fuchsia|pink|yellow|neutral|gray)-(100|200|300|400)(/[0-9]+)?' src --include="*.tsx" | sort | uniq -c | sort -rn
```

Attendu : ~27 `bg-indigo-400`, ~8 `bg-emerald-400`, etc. (petits volumes, surtout des pastilles/badges). Ces fonds deviendront un cran 600 en mode clair — **acceptable** (meilleur contraste sur fond clair). Ne rien faire, c'est un constat. Si un usage `bg-{famille}-{100..400}` plein écran apparaît (grande surface), le noter pour la QA (Task 8).

- [ ] **Step 1.2 : Générer les blocs de variables CSS des crans pâles**

```bash
node -e "
const c = require('tailwindcss/colors');
const fams = ['indigo','red','emerald','amber','green','violet','blue','sky','cyan','teal','rose','purple','orange','fuchsia','pink','yellow','neutral','gray'];
const crans = ['100','200','300','400'];
const map = {100:'900',200:'800',300:'700',400:'600'};
const toRgb = (hex) => { const h = hex.replace('#',''); return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)).join(' '); };
let dark='', light='';
for (const f of fams) for (const cr of crans) {
  dark  += '    --'+f+'-'+cr+': '+toRgb(c[f][cr])+';\n';
  light += '    --'+f+'-'+cr+': '+toRgb(c[f][map[cr]])+';\n';
}
console.log('/* === crans pâles — valeurs sombres (originales) === */\n'+dark);
console.log('/* === crans pâles — valeurs claires (600-900) === */\n'+light);
" 2>/dev/null | head -80
```

(Si `tailwindcss/colors` émet un warning de dépréciation sur certains noms, ignorer — on n'utilise que les familles listées.)

- [ ] **Step 1.3 : Réécrire `tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss'
import typography from '@tailwindcss/typography'

// Familles dont les crans pâles (100-400) sont re-pointés via variables CSS :
// en sombre = valeurs Tailwind d'origine, en clair = crans 600-900 (lisibles sur fond clair).
const PALE_FAMILIES = [
  'indigo', 'red', 'emerald', 'amber', 'green', 'violet', 'blue', 'sky', 'cyan',
  'teal', 'rose', 'purple', 'orange', 'fuchsia', 'pink', 'yellow', 'neutral', 'gray',
] as const
const PALE_SHADES = ['100', '200', '300', '400'] as const

const paleOverrides = Object.fromEntries(
  PALE_FAMILIES.map((f) => [
    f,
    Object.fromEntries(PALE_SHADES.map((s) => [s, `rgb(var(--${f}-${s}) / <alpha-value>)`])),
  ]),
)

const config: Config = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // « white » = couleur d'AVANT-PLAN thémable (blanc en sombre, quasi-noir en clair).
        // Pour du blanc véritable (texte sur bouton coloré), utiliser text-[#fff].
        white: 'rgb(var(--base) / <alpha-value>)',
        background: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
        well: 'rgb(var(--well) / <alpha-value>)',
        accent: '#6366f1',
        ...paleOverrides,
      },
    },
  },
  plugins: [typography],
}

export default config
```

Note : `theme.extend.colors.{famille}` avec un objet partiel **fusionne** par cran (les crans 500-950 gardent leurs valeurs Tailwind d'origine) — comportement documenté de Tailwind v3.

- [ ] **Step 1.4 : Ajouter les variables dans `src/index.css`**

Dans le premier `@layer base`, remplacer le bloc `:root { ... }` existant par (en conservant les variables shadcn actuelles dans `:root`) :

```css
@layer base {
  :root {
    /* Tokens thémables — valeurs sombres (défaut) */
    --base: 255 255 255;      /* avant-plan : blanc */
    --bg: 36 36 36;           /* #242424 */
    --surface: 48 48 48;      /* #303030 */
    --surface-2: 38 38 38;    /* #262626 */
    --well: 22 22 22;         /* #161616 */

    /* … coller ici le bloc « crans pâles — valeurs sombres » généré au Step 1.2 … */

    /* Variables shadcn existantes : NE PAS MODIFIER (les conserver telles quelles) */
    --background: 0 0% 14%;
    /* … etc. (bloc existant inchangé jusqu'à --radius) … */
  }

  html.light {
    /* Tokens thémables — valeurs claires */
    --base: 23 23 23;         /* avant-plan : quasi-noir #171717 */
    --bg: 245 245 246;        /* #f5f5f6 */
    --surface: 255 255 255;   /* #ffffff */
    --surface-2: 237 237 238; /* #ededee */
    --well: 228 228 231;      /* #e4e4e7 */

    /* … coller ici le bloc « crans pâles — valeurs claires » généré au Step 1.2 … */

    /* shadcn — palette claire */
    --background: 0 0% 96%;
    --foreground: 0 0% 12%;
    --card: 0 0% 100%;
    --card-foreground: 0 0% 12%;
    --popover: 0 0% 100%;
    --popover-foreground: 0 0% 12%;
    --primary: 239 84% 60%;
    --primary-foreground: 0 0% 100%;
    --secondary: 0 0% 91%;
    --secondary-foreground: 0 0% 15%;
    --muted: 0 0% 91%;
    --muted-foreground: 0 0% 42%;
    --accent: 239 84% 60%;
    --accent-foreground: 0 0% 100%;
    --destructive: 0 84% 50%;
    --destructive-foreground: 0 0% 100%;
    --border: 0 0% 85%;
    --input: 0 0% 85%;
    --ring: 239 84% 60%;
  }
}
```

⚠️ Les tokens custom (`--base`, `--bg`…) sont des canaux RGB bruts (`255 255 255`) consommés par `rgb(var(--x) / <alpha-value>)`. Les variables shadcn restent en HSL (`0 0% 96%`) consommées par `hsl(var(--x))`. Ne pas mélanger les formats.

- [ ] **Step 1.5 : Vérifier — build + zéro changement visuel en sombre**

```bash
npx tsc -b && npm run build 2>&1 | tail -3
```

Attendu : build OK. Puis `npm run dev`, ouvrir l'app : strictement identique (les variables `:root` reproduisent les valeurs d'origine). Test rapide du mode clair : dans la console DevTools, `document.documentElement.classList.replace('dark','light')` → les textes `text-white` deviennent sombres, le fond reste sombre (hex littéraux pas encore migrés — normal à ce stade).

- [ ] **Step 1.6 : Commit**

```bash
git add tailwind.config.ts src/index.css
git commit -m "feat(theme): fondations mode clair — white/tokens/crans pâles re-pointés via variables CSS"
```

---

### Task 2: Migration mécanique des hex littéraux (~292 occurrences)

**Files:** ~80 fichiers `src/**/*.tsx|ts` (sed global)

- [ ] **Step 2.1 : Inventaire de contrôle (backgrounds + bordures/textes hex sombres)**

```bash
grep -rhEo '(bg|border|text|from|to|via|ring|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]' src --include="*.tsx" --include="*.ts" | sort | uniq -c | sort -rn
```

Inventaire bg- connu : `#242424`×108, `#303030`×92, `#262626`×52, `#2a2a2a`×39, `#161616`×36, `#111113`×4, `#252525`×3, `#202020`×3, `#1d1d1d`×3, `#222222`×2, `#141416`×2, `#111`×2, `#0c0c0c`×2, `#1f1f1f`, `#1a1a1e`, `#1a1a1a`, `#161618`, `#131313`, `#0b0b0b`, plus `#6366f1`×2, `#5457e5`, `#f0f0f0`. Si l'inventaire révèle des `border-[#...]`/`text-[#...]` sombres non listés ici, les mapper au même barème ci-dessous.

- [ ] **Step 2.2 : Remplacements sed (mapping hex → token)**

Barème : `background` ← {242424, 222222, 202020, 1f1f1f, 1d1d1d, 252525} ; `surface` ← {303030} ; `surface-2` ← {262626, 2a2a2a} ; `well` ← {161616, 111113, 141416, 161618, 131313, 1a1a1a, 1a1a1e, 111, 0c0c0c, 0b0b0b}.

```bash
cd /Applications/_IA/Claude_workspace/Web2Print
for hex in 242424 222222 202020 1f1f1f 1d1d1d 252525; do
  grep -rl "bg-\[#$hex\]" src | xargs -r sed -i '' "s/bg-\[#$hex\]/bg-background/g"
done
grep -rl 'bg-\[#303030\]' src | xargs -r sed -i '' 's/bg-\[#303030\]/bg-surface/g'
for hex in 262626 2a2a2a; do
  grep -rl "bg-\[#$hex\]" src | xargs -r sed -i '' "s/bg-\[#$hex\]/bg-surface-2/g"
done
for hex in 161616 111113 141416 161618 131313 1a1a1a 1a1a1e 111 0c0c0c 0b0b0b; do
  grep -rl "bg-\[#$hex\]" src | xargs -r sed -i '' "s/bg-\[#$hex\]/bg-well/g"
done
grep -rl 'bg-\[#6366f1\]' src | xargs -r sed -i '' 's/bg-\[#6366f1\]/bg-accent/g'
```

`bg-[#5457e5]` (hover du bouton accent) et `bg-[#f0f0f0]` : **laisser tels quels** (couleurs véritables, correctes dans les deux thèmes).

⚠️ Exclusion : si un hex apparaît dans `src/components/ui/**` (shadcn, interdit de modification), vérifier avec `git diff --stat | grep components/ui` et restaurer via `git checkout -- src/components/ui` le cas échéant.

- [ ] **Step 2.3 : Traiter les hex sombres utilisés hors `bg-`**

Pour chaque `border-[#...]`/`ring-[#...]` sombre trouvé au Step 2.1 (probablement peu nombreux) : remplacer par le token équivalent (`border-well`, etc.) au même barème, via le même pattern sed. Les `text-[#...]` sombres : remplacer par `text-background`/`text-well` SEULEMENT s'ils désignent du texte sur fond clair inversé (ex. texte sombre sur pastille blanche) — sinon laisser et noter pour QA.

- [ ] **Step 2.4 : Vérifier**

```bash
grep -rEo 'bg-\[#(242424|303030|262626|2a2a2a|161616)\]' src | wc -l   # attendu : 0
npx tsc -b && npm run test:run 2>&1 | tail -3
```

Puis contrôle visuel rapide en dev (mode sombre) : Dashboard + éditeur identiques. En console : `document.documentElement.classList.replace('dark','light')` → cette fois les fonds basculent aussi en clair.

- [ ] **Step 2.5 : Commit**

```bash
git add -A && git commit -m "feat(theme): migration des hex littéraux sombres vers les tokens background/surface/surface-2/well"
```

---

### Task 3: Préserver le blanc véritable (~152 occurrences, 88 fichiers)

**Files:** ~88 fichiers listés par le grep ci-dessous + `src/features/dam/components/DamGenerate.tsx`

- [ ] **Step 3.1 : Lister les candidats (blanc sur fond coloré, même ligne)**

```bash
grep -rnE 'class(Name)?=("|{`)[^"`]*(bg|from|to)-(indigo|red|emerald|amber|blue|violet|purple|rose|orange|green|sky|cyan|teal|fuchsia|pink)-(400|500|600|700)[^"`]*text-white|class(Name)?=("|{`)[^"`]*text-white[^"`]*(bg|from|to)-(indigo|red|emerald|amber|blue|violet|purple|rose|orange|green|sky|cyan|teal|fuchsia|pink)-(400|500|600|700)' src --include="*.tsx" > /tmp/true-white-candidates.txt
wc -l /tmp/true-white-candidates.txt
```

- [ ] **Step 3.2 : Remplacer `text-white` → `text-[#fff]` sur ces lignes**

Pour chaque ligne candidate : si le `text-white` est porté par le MÊME élément que le fond coloré (bouton plein, badge, gradient), remplacer `text-white` par `text-[#fff]` (et `hover:text-white` par `hover:text-[#fff]` si le hover est coloré). Si le `text-white` et le fond coloré appartiennent à des éléments différents dans la même ligne (rare), juger au cas par cas.

Procéder par lots de fichiers (Edit par fichier, pas de sed aveugle — le jugement même-élément est requis). Points d'attention récurrents : boutons primaires `bg-indigo-500 text-white`, badges de statut, boutons destructifs `bg-red-500/600`.

- [ ] **Step 3.3 : Cas connus hors grep**

Champ prompt DAM (`src/features/dam/components/DamGenerate.tsx`, textarea ~ligne 500) — blanc volontaire validé par l'utilisateur, doit rester blanc/noir dans les deux thèmes :

```
- className="w-full min-h-[96px] bg-white border border-white/10 rounded-lg px-3 py-2 text-sm text-black placeholder:text-black/40 outline-none focus:border-indigo-500/50 resize-y"
+ className="w-full min-h-[96px] bg-[#fff] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#111] placeholder:text-[#111]/40 outline-none focus:border-indigo-500/50 resize-y"
```

Vérifier aussi : `grep -rn 'bg-white[" ]' src --include="*.tsx" | grep -v 'bg-white/'` — chaque `bg-white` plein (sans alpha) doit être examiné : surface qui doit suivre le thème → `bg-surface` ; blanc véritable (pastille sur fond coloré, document papier) → `bg-[#fff]`.

- [ ] **Step 3.4 : Vérifier + commit**

```bash
npx tsc -b && npm run lint 2>&1 | tail -3
git add -A && git commit -m "feat(theme): blanc véritable en littéral text-[#fff] sur les fonds colorés"
```

---

### Task 4: Store de thème + anti-flash

**Files:**
- Create: `src/stores/theme.store.ts`
- Create: `src/stores/theme.store.test.ts`
- Modify: `index.html`
- Modify: `src/main.tsx` (import d'init)

- [ ] **Step 4.1 : Écrire le test qui échoue**

`src/stores/theme.store.test.ts` :

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

// matchMedia n'existe pas en jsdom — mock avant l'import du store.
const matchMediaMock = vi.fn().mockReturnValue({
  matches: false,
  addEventListener: vi.fn(),
})
vi.stubGlobal('matchMedia', matchMediaMock)

const { useThemeStore, initialThemePref } = await import('./theme.store')

describe('theme.store', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = 'dark'
    useThemeStore.getState().setThemePref('dark')
  })

  it('défaut = dark sans préférence enregistrée', () => {
    expect(initialThemePref()).toBe('dark')
  })

  it('setThemePref(light) pose html.light, retire html.dark et persiste', () => {
    useThemeStore.getState().setThemePref('light')
    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem('themePref')).toBe('light')
    expect(useThemeStore.getState().resolvedTheme).toBe('light')
  })

  it('system résout via matchMedia (mock → dark)', () => {
    useThemeStore.getState().setThemePref('system')
    expect(useThemeStore.getState().resolvedTheme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('ignore une valeur corrompue en localStorage', () => {
    localStorage.setItem('themePref', 'banana')
    expect(initialThemePref()).toBe('dark')
  })
})
```

- [ ] **Step 4.2 : Vérifier l'échec**

```bash
npm run test:run -- src/stores/theme.store.test.ts
```

Attendu : FAIL (module `./theme.store` introuvable).

- [ ] **Step 4.3 : Implémenter `src/stores/theme.store.ts`**

```ts
import { create } from 'zustand'

export type ThemePref = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'themePref'

function systemIsLight(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: light)').matches
}

function resolve(pref: ThemePref): 'light' | 'dark' {
  return pref === 'system' ? (systemIsLight() ? 'light' : 'dark') : pref
}

export function initialThemePref(): ThemePref {
  const v = localStorage.getItem(STORAGE_KEY)
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'dark'
}

function applyToDom(resolved: 'light' | 'dark') {
  const el = document.documentElement
  el.classList.toggle('light', resolved === 'light')
  el.classList.toggle('dark', resolved === 'dark')
}

interface ThemeState {
  themePref: ThemePref
  resolvedTheme: 'light' | 'dark'
  setThemePref: (pref: ThemePref) => void
}

export const useThemeStore = create<ThemeState>((set) => ({
  themePref: initialThemePref(),
  resolvedTheme: resolve(initialThemePref()),
  setThemePref: (pref) => {
    localStorage.setItem(STORAGE_KEY, pref)
    const resolved = resolve(pref)
    applyToDom(resolved)
    set({ themePref: pref, resolvedTheme: resolved })
  },
}))

// Init à l'import : aligne le DOM (l'anti-flash d'index.html a déjà posé la classe
// pour les utilisateurs en clair ; ici on couvre aussi le cas « system »).
applyToDom(resolve(initialThemePref()))

// Suit les changements de thème OS quand la préférence est « system ».
if (typeof window.matchMedia === 'function') {
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    const { themePref } = useThemeStore.getState()
    if (themePref !== 'system') return
    const resolved = resolve('system')
    applyToDom(resolved)
    useThemeStore.setState({ resolvedTheme: resolved })
  })
}
```

- [ ] **Step 4.4 : Vérifier que les tests passent**

```bash
npm run test:run -- src/stores/theme.store.test.ts
```

Attendu : 4 PASS.

- [ ] **Step 4.5 : Anti-flash dans `index.html`**

Dans `<head>`, après `<title>` :

```html
    <script>
      // Anti-flash : pose la classe de thème avant le premier paint.
      // Défaut CSS = sombre ; seuls les utilisateurs en préférence claire sont concernés.
      try {
        var p = localStorage.getItem('themePref')
        var sysLight = window.matchMedia('(prefers-color-scheme: light)').matches
        if (p === 'light' || (p === 'system' && sysLight)) {
          document.documentElement.classList.add('light')
          document.documentElement.classList.remove('dark')
        }
      } catch (e) { /* localStorage indisponible : rester en sombre */ }
    </script>
```

Et dans `src/main.tsx`, ajouter en tête d'imports : `import '@/stores/theme.store'` (garantit l'init même si aucun composant ne consomme encore le store).

- [ ] **Step 4.6 : Commit**

```bash
git add src/stores/theme.store.ts src/stores/theme.store.test.ts index.html src/main.tsx
git commit -m "feat(theme): store de thème (clair/sombre/système) + anti-flash au chargement"
```

---

### Task 5: Synchro Firestore de la préférence

**Files:**
- Create: `src/features/settings/useThemeSync.ts`
- Modify: `src/features/auth/AuthProvider.tsx` (ajouter `useThemeSync()` à côté de `useAiSettingsSync()`, ligne ~15)

- [ ] **Step 5.1 : Créer `src/features/settings/useThemeSync.ts`**

Modelé sur `useAiSettingsSync.ts` (mêmes garde-fous : dépendre de `[uid]`, baseline anti-écrasement pendant l'hydratation, pas de push avant hydratation) :

```ts
import { useEffect, useRef } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { useThemeStore, type ThemePref } from '@/stores/theme.store'

const DEBOUNCE_MS = 500
const isPref = (v: unknown): v is ThemePref => v === 'light' || v === 'dark' || v === 'system'

export function useThemeSync() {
  // [uid] et non [user] : évite le re-run (→ getDoc annulé) à chaque refresh de token. Cf. useAiSettingsSync.
  const uid = useAuthStore((s) => s.user?.uid)
  const hydratedRef = useRef(false)
  const timerRef = useRef<number | null>(null)

  // Hydratation au login
  useEffect(() => {
    hydratedRef.current = false
    if (!uid) return
    const baseline = useThemeStore.getState().themePref
    let cancelled = false
    getDoc(doc(db, 'users', uid))
      .then((snap) => {
        if (cancelled) return
        const remote = (snap.data()?.uiSettings as { theme?: unknown } | undefined)?.theme
        // N'applique le distant que si l'utilisateur n'a pas basculé pendant l'hydratation.
        if (isPref(remote) && useThemeStore.getState().themePref === baseline) {
          useThemeStore.getState().setThemePref(remote)
        }
      })
      .catch((e) => console.warn('[useThemeSync] hydrate failed:', e))
      .finally(() => { if (!cancelled) hydratedRef.current = true })
    return () => { cancelled = true }
  }, [uid])

  // Push débouncé sur changement
  useEffect(() => {
    if (!uid) return
    const unsubscribe = useThemeStore.subscribe((state, prev) => {
      if (!hydratedRef.current) return
      if (state.themePref === prev.themePref) return
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        setDoc(doc(db, 'users', uid), { uiSettings: { theme: state.themePref } }, { merge: true })
          .catch((e) => console.warn('[useThemeSync] sync failed:', e))
      }, DEBOUNCE_MS)
    })
    return () => {
      unsubscribe()
      if (timerRef.current !== null) { window.clearTimeout(timerRef.current); timerRef.current = null }
    }
  }, [uid])
}
```

Note : `themePref` reste volontairement HORS de `purgeLocalUserData` (cosmétique, non sensible — évite un flash au logout ; l'hydratation au login suivant remet la préférence du compte).

- [ ] **Step 5.2 : Monter le hook dans `AuthProvider.tsx`**

```
  useAiSettingsSync()
+ useThemeSync()
```

(+ import correspondant.)

- [ ] **Step 5.3 : Vérifier + commit**

```bash
npx tsc -b && npm run test:run 2>&1 | tail -3
git add -A && git commit -m "feat(theme): synchro Firestore users/{uid}.uiSettings.theme"
```

---

### Task 6: ThemeToggle + Réglages + Toaster

**Files:**
- Create: `src/components/shared/ThemeToggle.tsx`
- Modify: `src/components/panels/EditorHeader.tsx` (header, zone droite)
- Modify: `src/pages/DashboardPage.tsx` (footer sidebar, à côté du bouton Réglages, ~ligne 355-420)
- Modify: `src/components/shared/SettingsPanel.tsx` (section « Apparence »)
- Modify: `src/app/App.tsx:27` (Toaster)

- [ ] **Step 6.1 : Créer `src/components/shared/ThemeToggle.tsx`**

```tsx
import { Sun, Moon, Monitor } from 'lucide-react'
import { useThemeStore, type ThemePref } from '@/stores/theme.store'

const NEXT: Record<ThemePref, ThemePref> = { dark: 'light', light: 'system', system: 'dark' }
const LABELS: Record<ThemePref, string> = {
  dark: 'Mode sombre',
  light: 'Mode clair',
  system: 'Suivre le système',
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const themePref = useThemeStore((s) => s.themePref)
  const setThemePref = useThemeStore((s) => s.setThemePref)
  const Icon = themePref === 'light' ? Sun : themePref === 'dark' ? Moon : Monitor
  return (
    <button
      onClick={() => setThemePref(NEXT[themePref])}
      className={`p-1.5 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-colors ${className}`}
      title={`${LABELS[themePref]} — cliquer pour changer`}
      aria-label="Changer de thème"
    >
      <Icon className="w-4 h-4" />
    </button>
  )
}
```

- [ ] **Step 6.2 : Placer le toggle**

1. `EditorHeader.tsx` : insérer `<ThemeToggle />` dans la zone droite du header (avant le bouton Export), même rangée que les autres boutons icône.
2. `DashboardPage.tsx` : dans le footer de la sidebar (bloc « User + Settings », versions ouverte ET repliée de la sidebar), insérer `<ThemeToggle />` à côté du bouton `Settings`.
3. `SettingsPanel.tsx` : ajouter une section « Apparence » (en tête de l'onglet général/profil — repérer la structure d'onglets existante au moment de l'édition) :

```tsx
{/* Apparence */}
<div className="space-y-2">
  <h3 className="text-sm font-medium text-white/80">Apparence</h3>
  <div className="flex gap-2">
    {([['light', 'Clair'], ['dark', 'Sombre'], ['system', 'Système']] as const).map(([value, label]) => (
      <button
        key={value}
        onClick={() => setThemePref(value)}
        className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
          themePref === value
            ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
            : 'border-white/10 text-white/50 hover:text-white/80 hover:bg-white/5'
        }`}
      >
        {label}
      </button>
    ))}
  </div>
</div>
```

(avec `const themePref = useThemeStore((s) => s.themePref)` et `const setThemePref = useThemeStore((s) => s.setThemePref)` dans le composant — si SettingsPanel approche les 150 lignes max, extraire en `ThemeSettingsSection.tsx` à côté.)

- [ ] **Step 6.3 : Toaster thémé dans `App.tsx`**

```
- import { Toaster } from 'sonner'
+ import { Toaster } from 'sonner'
+ import { useThemeStore } from '@/stores/theme.store'
...
 export default function App() {
+  const resolvedTheme = useThemeStore((s) => s.resolvedTheme)
...
-          <Toaster theme="dark" position="bottom-right" richColors />
+          <Toaster theme={resolvedTheme} position="bottom-right" richColors />
```

- [ ] **Step 6.4 : Vérifier en dev**

`npm run dev` : le toggle apparaît dans le header éditeur + sidebar Dashboard ; cliquer cycle Sombre→Clair→Système ; la préférence survit au reload (anti-flash : pas de clignotement) ; la section Apparence des Réglages reflète le même état ; un toast (ex. sauvegarde) suit le thème.

- [ ] **Step 6.5 : Commit**

```bash
git add -A && git commit -m "feat(theme): ThemeToggle (header éditeur + sidebar dashboard) + section Apparence + Toaster thémé"
```

---

### Task 7: Cas particuliers

**Files:**
- Modify: `src/features/tour/tour.css`
- Modify: fichiers révélés par les inventaires ci-dessous

- [ ] **Step 7.1 : tour.css (driver.js)**

Lire `src/features/tour/tour.css` : si les couleurs du popover sont des hex sombres en dur, les basculer sur les variables (`rgb(var(--surface))`, `rgb(var(--base) / 0.x)`) pour que le tour soit lisible dans les deux thèmes.

- [ ] **Step 7.2 : Styles inline & scrollbars**

```bash
grep -rn '::-webkit-scrollbar' src --include="*.css" --include="*.tsx" | head
grep -rnE "rgba?\(\s*(255\s*,\s*255\s*,\s*255|0\s*,\s*0\s*,\s*0)" src --include="*.tsx" | grep -iv "shadow" | head -30
```

Pour chaque hit pertinent à l'UI (pas les exports/canvas offscreen) : remplacer le blanc/noir en dur par `rgb(var(--base) / x)` si c'est un avant-plan, sinon laisser. Les ombres (`boxShadow`, `shadow-*`) restent noires dans les deux thèmes — ne pas toucher.

- [ ] **Step 7.3 : Chrome de l'éditeur Fabric**

Dans `src/features/editor/CanvasContainer.tsx` (et overlays de règles/guides s'il y en a) : vérifier que la zone de travail utilise désormais les tokens (fait en Task 2) et que les éventuels traits/textes dessinés en overlay DOM utilisent `white` thémable. Le document Fabric lui-même (papier blanc) ne change pas.

- [ ] **Step 7.4 : Logo sidebar**

`DashboardPage.tsx` ~ligne 295 affiche `/logo.png`. Vérifier sa lisibilité sur fond clair (DevTools mode clair). S'il est blanc sur transparent → ajouter une variante ou un filtre CSS conditionnel : `className="... [html.light_&]:invert"` n'existe pas en Tailwind → utiliser une règle CSS dans `index.css` :

```css
html.light .theme-invertible-logo { filter: invert(0.85); }
```

et poser `theme-invertible-logo` sur l'`<img>` SEULEMENT si le test visuel le justifie.

- [ ] **Step 7.5 : Vérifier + commit**

```bash
npx tsc -b && npm run lint 2>&1 | tail -3
git add -A && git commit -m "feat(theme): cas particuliers — tour driver.js, styles inline, chrome éditeur, logo"
```

---

### Task 8: QA visuelle des deux thèmes + CLAUDE.md + livraison

**Files:**
- Modify: `CLAUDE.md`
- Modify: fichiers révélés par la QA

- [ ] **Step 8.1 : QA visuelle systématique**

`npm run dev` puis, au navigateur (Chrome MCP ou Playwright), pour CHAQUE thème (basculer via le toggle) screenshoter et inspecter : Dashboard (sidebar + grille projets), PIM (grille + menus colonne + « Ajouter un champ »), DAM (bibliothèque + Création d'image + dialogs), Workflows (éditeur de graphe), Éditeur (canvas + panneaux + header), Réglages (tous onglets), modales (onboarding, export, pickers).

Chasse aux défauts type : texte invisible (blanc véritable raté → `text-[#fff]` ; ou l'inverse), contraste insuffisant (teinte pâle non re-pointée, ex. `text-{famille}-50`), fond resté sombre (hex littéral oublié), bordure invisible. Corriger au fil de l'eau ; si un pattern récurrent émerge, le traiter en sed global.

- [ ] **Step 8.2 : Garde-fous build complets**

```bash
npx tsc -b && npm run lint && npm run test:run && npx knip && npm run build
```

Attendu : tout passe (knip exit 0 — si `ThemeToggle`/`useThemeSync` apparaissent, c'est qu'un montage a été oublié).

- [ ] **Step 8.3 : Mettre à jour CLAUDE.md**

Remplacer la ligne « **Dark mode obligatoire** (palette adoucie) : fond `#242424`, surfaces `#303030`, accents `#6366f1` » par :

```markdown
- **Théming clair/sombre par tokens** (défaut : sombre) : utiliser `bg-background` / `bg-surface` / `bg-surface-2` / `bg-well` (jamais d'hex sombre en dur). Convention : `white` = couleur d'avant-plan THÉMABLE (blanc en sombre, quasi-noir en clair) ; pour du blanc véritable (texte sur bouton coloré), utiliser `text-[#fff]`. Les crans pâles 100-400 des couleurs d'accent basculent automatiquement vers 600-900 en clair (variables CSS, cf. `tailwind.config.ts`). Préférence : `stores/theme.store.ts` + synchro `users/{uid}.uiSettings.theme`.
```

- [ ] **Step 8.4 : Commit final + déploiement**

```bash
git add -A && git commit -m "feat(theme): QA visuelle deux thèmes + convention théming dans CLAUDE.md"
npm run build && firebase deploy --only hosting
```

Vérifier en prod (`https://ibs-studio.com`) : défaut sombre inchangé, bascule clair fonctionnelle, préférence persistée après reload et re-login.

---

## Self-review (faite à l'écriture du plan)

- **Couverture spec** : fondations (T1), migration hex (T2), blanc véritable + champ DAM (T3), store+anti-flash (T4), sync Firestore (T5), toggle+Réglages+Sonner (T6), tour/scrollbars/inline/canvas (T7), QA+CLAUDE.md+deploy (T8). ✔
- **Pièges mémoire intégrés** : hooks de sync sur `[uid]`, baseline anti-écrasement, pas de push avant hydratation, `purgeLocalUserData` volontairement exclu (documenté), shadcn `src/components/ui/**` intouché. ✔
- **Cohérence types** : `ThemePref` exporté par le store, consommé par sync/toggle/settings ; `resolvedTheme: 'light' | 'dark'` compatible avec la prop `theme` de Sonner. ✔
