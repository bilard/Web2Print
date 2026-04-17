# Chrome Extension Capture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer une extension Chrome MV3 qui, lorsqu'installée, permet à Web2Print d'injecter `overlayScript.ts` dans un onglet réel du fournisseur et d'y tagger les éléments avec rendu fidèle. L'iframe `srcdoc` actuelle reste le fallback automatique.

**Architecture:** Extension MV3 isolée dans `extension/` (projet Vite indépendant). Communication via `externally_connectable` + ports `chrome.runtime.connect`. Réutilisation de `overlayScript.ts` tel quel : le content script relaie ses `window.postMessage` vers le background. Côté React : un hook `useChromeExtension` détecte + pilote, `VisualTemplateBuilder` bascule en mode extension quand disponible.

**Tech Stack:** Chrome Manifest V3, TypeScript strict, Vite (build indépendant pour l'extension), React 18 (côté Web2Print), Firebase Hosting (domaines prod pour `externally_connectable`).

**Spec source:** `docs/superpowers/specs/2026-04-17-chrome-extension-capture-design.md`

**Validation:** Pas de tests unitaires dans ce repo. Chaque task se valide par `npm run build` (Web2Print) + `npm run build:ext` (extension) + un smoke test manuel (side-load + capture sur une page réelle). Le build principal doit rester clean à chaque commit.

---

## File Structure

**Nouveaux (9 fichiers) :**
- `extension/manifest.json` — manifest MV3
- `extension/vite.config.ts` — build Vite indépendant (entrées multiples, output `extension/dist/`)
- `extension/tsconfig.json` — config TS
- `extension/src/background.ts` — service worker : ping, ouverture onglet, relais port
- `extension/src/content.ts` — injecte `overlayScript.ts`, relaie postMessage ↔ chrome.runtime
- `extension/src/popup.html` + `extension/src/popup.ts` — UI minimale (statut connexion)
- `extension/README.md` — instructions side-load
- `src/features/scraping-templates/useChromeExtension.ts` — hook React de pilotage

**Modifiés (3 fichiers) :**
- `package.json` — nouveau script `build:ext`
- `src/features/scraping-templates/VisualTemplateBuilder.tsx` — branchement double mode
- `.env.local.example` (créer si absent) — documenter `VITE_CHROME_EXTENSION_ID`

**Non touchés :** `src/features/scraping-templates/overlayScript.ts` reste la source de vérité unique. Aucune modification.

---

## Phase 1 — Scaffolding de l'extension

### Task 1 : Créer le squelette `extension/` (manifest, vite, tsconfig)

**Files:**
- Create: `extension/manifest.json`
- Create: `extension/vite.config.ts`
- Create: `extension/tsconfig.json`
- Create: `extension/.gitignore`

- [ ] **Step 1: Créer `extension/manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Web2Print Capture",
  "version": "0.1.0",
  "description": "Capture d'éléments pour le Scraping Hub de Web2Print",
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "permissions": ["activeTab", "scripting", "tabs"],
  "host_permissions": ["<all_urls>"],
  "action": {
    "default_popup": "popup.html",
    "default_title": "Web2Print Capture"
  },
  "icons": {
    "16": "icons/16.png",
    "48": "icons/48.png",
    "128": "icons/128.png"
  },
  "externally_connectable": {
    "matches": [
      "http://localhost:5173/*",
      "http://localhost:4173/*",
      "https://web2print-6fe5a.web.app/*",
      "https://web2print-6fe5a.firebaseapp.com/*"
    ]
  }
}
```

- [ ] **Step 2: Créer `extension/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "types": ["chrome"]
  },
  "include": ["src/**/*", "../src/features/scraping-templates/overlayScript.ts"]
}
```

- [ ] **Step 3: Créer `extension/vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import path from 'path'
import { copyFileSync, mkdirSync, existsSync } from 'fs'

export default defineConfig({
  resolve: {
    alias: {
      '@overlay': path.resolve(__dirname, '../src/features/scraping-templates/overlayScript.ts'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: path.resolve(__dirname, 'src/background.ts'),
        content: path.resolve(__dirname, 'src/content.ts'),
        popup: path.resolve(__dirname, 'src/popup.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',
      },
    },
    target: 'es2022',
    minify: false,
  },
  plugins: [
    {
      name: 'copy-manifest-and-icons',
      writeBundle() {
        copyFileSync('manifest.json', 'dist/manifest.json')
        if (existsSync('icons')) {
          mkdirSync('dist/icons', { recursive: true })
          for (const size of ['16', '48', '128']) {
            const src = `icons/${size}.png`
            if (existsSync(src)) copyFileSync(src, `dist/icons/${size}.png`)
          }
        }
      },
    },
  ],
})
```

- [ ] **Step 4: Créer `extension/.gitignore`**

```
dist/
node_modules/
```

- [ ] **Step 5: Installer les types chrome**

Run : `cd /Applications/_IA/Claude_workspace/Web2Print && npm install --legacy-peer-deps -D @types/chrome`
Expected : `@types/chrome` apparaît dans `package.json` devDeps.

- [ ] **Step 6: Commit**

```bash
cd /Applications/_IA/Claude_workspace/Web2Print
git add extension/manifest.json extension/vite.config.ts extension/tsconfig.json extension/.gitignore package.json package-lock.json
git commit -m "feat(extension): scaffold Chrome MV3 project (manifest + vite + tsconfig)"
```

---

### Task 2 : Ajouter le script `build:ext` et vérifier la chaîne de build (avec stubs)

**Files:**
- Modify: `package.json`
- Create: `extension/src/background.ts` (stub)
- Create: `extension/src/content.ts` (stub)
- Create: `extension/src/popup.html` (stub)
- Create: `extension/src/popup.ts` (stub)

- [ ] **Step 1: Ajouter le script dans `package.json`**

Localiser le bloc `"scripts"` et y ajouter :

```json
    "build:ext": "cd extension && vite build"
```

(Insérer après `"build": "tsc -b && vite build",`.)

- [ ] **Step 2: Créer les 4 fichiers stubs pour que le build ne casse pas**

`extension/src/background.ts` :
```ts
// Stub — remplacé dans Task 3
console.log('[w2p-ext] background loaded')
```

`extension/src/content.ts` :
```ts
// Stub — remplacé dans Task 4
console.log('[w2p-ext] content loaded')
```

`extension/src/popup.html` :
```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Web2Print Capture</title>
    <style>
      body { width: 280px; padding: 16px; font: 13px -apple-system, sans-serif; background: #1a1a1a; color: #eee; margin: 0; }
    </style>
  </head>
  <body>
    <div id="root">Chargement…</div>
    <script type="module" src="./popup.ts"></script>
  </body>
</html>
```

`extension/src/popup.ts` :
```ts
// Stub — remplacé dans Task 5
document.getElementById('root')!.textContent = 'Popup OK'
```

- [ ] **Step 3: Lancer le build de l'extension**

Run : `cd /Applications/_IA/Claude_workspace/Web2Print && npm run build:ext`
Expected : build réussit, `extension/dist/` contient `background.js`, `content.js`, `popup.html`, `popup.js`, `manifest.json`.

- [ ] **Step 4: Vérifier que le build principal passe toujours**

Run : `cd /Applications/_IA/Claude_workspace/Web2Print && npm run build`
Expected : pas de régression, les stubs n'entrent pas dans le bundle React.

- [ ] **Step 5: Commit**

```bash
cd /Applications/_IA/Claude_workspace/Web2Print
git add package.json extension/src/
git commit -m "feat(extension): add build:ext script and stub entries"
```

---

## Phase 2 — Background worker

### Task 3 : Background — ping, port, relais messaging

**Files:**
- Modify: `extension/src/background.ts`

- [ ] **Step 1: Remplacer le stub par l'implémentation complète**

Contenu de `extension/src/background.ts` :

```ts
/**
 * Service worker de l'extension Web2Print Capture.
 *
 * Rôles :
 *  1. Répondre au ping de Web2Print (externally_connectable → sendMessage).
 *  2. Accepter une connexion port (chrome.runtime.connect) depuis Web2Print
 *     et la garder ouverte tant que le user utilise le Scraping Hub.
 *  3. Ouvrir un onglet cible (open-and-capture) et injecter le content script.
 *  4. Relayer les messages dans les 2 sens entre le port Web2Print et l'onglet.
 */

type TabId = number

interface WebPort {
  port: chrome.runtime.Port
  activeTabId: TabId | null
  tags: Array<{ selector: string; label: string }>
}

let webPort: WebPort | null = null

// ─── Messaging one-shot (ping) ─────────────────────────────────────────────
chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'ping') {
    sendResponse({ type: 'pong', version: chrome.runtime.getManifest().version })
    return true
  }
  return false
})

// ─── Connexion port persistant ─────────────────────────────────────────────
chrome.runtime.onConnectExternal.addListener((port) => {
  if (port.name !== 'w2p-capture') return
  console.log('[w2p-bg] port connected')
  webPort = { port, activeTabId: null, tags: [] }

  port.onMessage.addListener((msg) => {
    handleWebMessage(msg).catch((err) => {
      port.postMessage({ type: 'error', message: String(err?.message ?? err) })
    })
  })

  port.onDisconnect.addListener(() => {
    console.log('[w2p-bg] port disconnected')
    if (webPort?.activeTabId) {
      chrome.tabs.remove(webPort.activeTabId).catch(() => { /* déjà fermé */ })
    }
    webPort = null
  })
})

async function handleWebMessage(msg: unknown): Promise<void> {
  if (!webPort) return
  const m = msg as { type: string } & Record<string, unknown>
  switch (m.type) {
    case 'open-and-capture':
      await openCaptureTab(m.url as string, m.templateTags as Array<{ selector: string; label: string }>)
      return
    case 'set-persistent-tags':
      webPort.tags = (m.tags as Array<{ selector: string; label: string }>) ?? []
      await sendToTab({ type: 'pim-set-persistent-tags', tags: webPort.tags })
      return
    case 'set-active-selector':
      await sendToTab({ type: 'pim-set-active-selector', selector: m.selector as string | null })
      return
    case 'clear-tags':
      webPort.tags = []
      await sendToTab({ type: 'pim-clear-persistent-tags' })
      return
    case 'set-mode':
      await sendToTab({ type: 'pim-set-mode', mode: m.mode as string })
      return
    case 'close-tab':
      if (webPort.activeTabId) {
        await chrome.tabs.remove(webPort.activeTabId).catch(() => { /* noop */ })
        webPort.activeTabId = null
      }
      return
    default:
      console.warn('[w2p-bg] unknown message type:', m.type)
  }
}

async function openCaptureTab(url: string, tags: Array<{ selector: string; label: string }>): Promise<void> {
  if (!webPort) return
  // Fermer l'ancien onglet si présent.
  if (webPort.activeTabId) {
    await chrome.tabs.remove(webPort.activeTabId).catch(() => { /* noop */ })
  }
  const tab = await chrome.tabs.create({ url, active: true })
  if (typeof tab.id !== 'number') throw new Error('Impossible de créer l\'onglet')
  webPort.activeTabId = tab.id
  webPort.tags = tags
  // L'injection du content script se fera automatiquement via le listener
  // chrome.tabs.onUpdated ci-dessous quand la page sera complètement chargée.
}

// ─── Injection auto du content script au chargement de l'onglet capture ────
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== 'complete') return
  if (!webPort || webPort.activeTabId !== tabId) return
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    })
    // Le content script répondra avec 'ready' → on relaie à Web2Print
    // via relayFromTab ci-dessous.
  } catch (err) {
    webPort.port.postMessage({ type: 'error', message: `Injection impossible : ${String((err as Error)?.message)}` })
  }
})

// ─── Relais des messages depuis le content script vers Web2Print ───────────
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!webPort || sender.tab?.id !== webPort.activeTabId) return false
  const m = msg as { type: string }
  // Filtrer : seuls les messages du protocole pim- et 'ready' sont relayés.
  if (!m?.type?.startsWith('pim-') && m?.type !== 'ready') return false
  if (m.type === 'ready') {
    webPort.port.postMessage({ type: 'ready', tabId: sender.tab!.id, url: sender.tab!.url ?? '' })
    // Ré-envoyer les tags bufferisés une fois le content prêt.
    if (webPort.tags.length > 0) {
      sendToTab({ type: 'pim-set-persistent-tags', tags: webPort.tags })
    }
  } else if (m.type === 'pim-capture') {
    webPort.port.postMessage({
      type: 'capture',
      ...(msg as Record<string, unknown>),
    })
  } else if (m.type === 'pim-preview-result') {
    // Ignoré — le protocole multi-tags n'en a plus besoin, mais on évite le warning.
  }
  return false
})

// ─── Détection fermeture onglet ────────────────────────────────────────────
chrome.tabs.onRemoved.addListener((tabId) => {
  if (webPort && webPort.activeTabId === tabId) {
    webPort.activeTabId = null
    webPort.port.postMessage({ type: 'tab-closed', tabId })
  }
})

async function sendToTab(msg: unknown): Promise<void> {
  if (!webPort?.activeTabId) return
  try {
    await chrome.tabs.sendMessage(webPort.activeTabId, msg)
  } catch (err) {
    console.warn('[w2p-bg] sendMessage to tab failed', err)
  }
}

console.log('[w2p-bg] background ready')
```

- [ ] **Step 2: Build**

Run : `cd /Applications/_IA/Claude_workspace/Web2Print && npm run build:ext`
Expected : build OK, `extension/dist/background.js` pèse ~3-5 Ko.

- [ ] **Step 3: Commit**

```bash
cd /Applications/_IA/Claude_workspace/Web2Print
git add extension/src/background.ts
git commit -m "feat(extension): background worker (ping, port, relay to tab)"
```

---

## Phase 3 — Content script

### Task 4 : Content — inject overlay + relais postMessage ↔ chrome.runtime

**Files:**
- Modify: `extension/src/content.ts`

- [ ] **Step 1: Remplacer le stub par l'implémentation**

Contenu de `extension/src/content.ts` :

```ts
/**
 * Content script injecté dans l'onglet source (site fournisseur).
 *
 * Rôles :
 *  1. Injecter `overlayScript.ts` dans le contexte de la page (même code que
 *     l'iframe utilise côté Web2Print → source de vérité unique).
 *  2. Relayer les `window.postMessage` du script overlay vers le background
 *     via `chrome.runtime.sendMessage`.
 *  3. Relayer les messages du background (envoyés via `chrome.tabs.sendMessage`)
 *     vers le script overlay via `window.postMessage`.
 */

import { OVERLAY_SCRIPT } from '@overlay'

if (!(window as Window & { __w2pInstalled?: boolean }).__w2pInstalled) {
  ;(window as Window & { __w2pInstalled?: boolean }).__w2pInstalled = true

  // Injecter overlayScript.ts dans le MAIN world pour qu'il ait accès au DOM
  // réel (le content script tourne dans l'ISOLATED world par défaut).
  const script = document.createElement('script')
  script.textContent = OVERLAY_SCRIPT
  ;(document.head || document.documentElement).appendChild(script)
  script.remove()

  // Relayer page → background
  window.addEventListener('message', (e: MessageEvent) => {
    const msg = e.data as { type?: string } | null
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return
    if (!msg.type.startsWith('pim-') && msg.type !== 'ready') return
    // overlayScript émet 'pim-ready', on le convertit en 'ready' pour le bg.
    if (msg.type === 'pim-ready') {
      chrome.runtime.sendMessage({ type: 'ready' })
      return
    }
    chrome.runtime.sendMessage(msg)
  })

  // Relayer background → page
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || typeof msg !== 'object') return false
    // Re-poster dans la fenêtre pour que overlayScript.ts le capte.
    window.postMessage(msg, '*')
    return false
  })

  // Quand l'overlay est prêt, il postera 'pim-ready' — relayé ci-dessus.
}
```

- [ ] **Step 2: Build**

Run : `cd /Applications/_IA/Claude_workspace/Web2Print && npm run build:ext`
Expected : build OK. `extension/dist/content.js` inclut le texte de `overlayScript.ts` (vérifier la taille ≥ 8 Ko).

**Important** : `overlayScript.ts` exporte une constante `OVERLAY_SCRIPT` qui EST une grande chaîne JS. L'alias vite `@overlay` pointe vers ce fichier ; l'import Vite tree-shake et inline la constante.

- [ ] **Step 3: Commit**

```bash
cd /Applications/_IA/Claude_workspace/Web2Print
git add extension/src/content.ts
git commit -m "feat(extension): content script injects overlayScript and relays messages"
```

---

## Phase 4 — Popup UI

### Task 5 : Popup minimale (statut + lien docs)

**Files:**
- Modify: `extension/src/popup.ts`
- Modify: `extension/src/popup.html`

- [ ] **Step 1: Mettre à jour `extension/src/popup.html`**

Contenu complet :

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Web2Print Capture</title>
    <style>
      body { width: 300px; padding: 14px; font: 13px -apple-system, Segoe UI, sans-serif; background: #1a1a1a; color: #eee; margin: 0; }
      h1 { margin: 0 0 8px; font-size: 13px; font-weight: 600; color: #a5b4fc; }
      p { margin: 4px 0; color: #aaa; }
      .status { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; }
      .ok { background: rgba(16,185,129,0.15); color: #6ee7b7; }
      .idle { background: rgba(148,163,184,0.15); color: #cbd5e1; }
      code { background: rgba(255,255,255,0.06); padding: 1px 4px; border-radius: 3px; font-size: 11px; color: #fcd34d; }
      .muted { color: #666; font-size: 11px; margin-top: 12px; line-height: 1.5; }
      a { color: #a5b4fc; }
    </style>
  </head>
  <body>
    <h1>Web2Print Capture</h1>
    <p id="status" class="status idle">En attente</p>
    <p class="muted">
      Ouvre le <a href="http://localhost:5173" target="_blank">Scraping Hub</a> de Web2Print puis un template : le bouton « Ouvrir dans Chrome & tagger » apparaîtra dans l'éditeur visuel.
    </p>
    <p class="muted">
      ID extension : <code id="ext-id"></code>
    </p>
    <script type="module" src="./popup.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Mettre à jour `extension/src/popup.ts`**

Contenu complet :

```ts
// Popup : affiche l'ID de l'extension (utile pour la config Web2Print) et
// un statut basique (idle / connected). L'état "connected" est écrit dans
// chrome.storage.local par le background dès qu'un port est ouvert.

const extIdEl = document.getElementById('ext-id')!
const statusEl = document.getElementById('status')!

extIdEl.textContent = chrome.runtime.id

chrome.storage.local.get('connected').then(({ connected }) => {
  if (connected) {
    statusEl.textContent = 'Connecté à Web2Print'
    statusEl.className = 'status ok'
  } else {
    statusEl.textContent = 'En attente'
    statusEl.className = 'status idle'
  }
})

chrome.storage.onChanged.addListener((changes) => {
  if (changes.connected) {
    const v = changes.connected.newValue
    statusEl.textContent = v ? 'Connecté à Web2Print' : 'En attente'
    statusEl.className = 'status ' + (v ? 'ok' : 'idle')
  }
})
```

- [ ] **Step 3: Marquer `connected` dans le background**

Éditer `extension/src/background.ts`. Juste après la ligne `webPort = { port, activeTabId: null, tags: [] }` dans `chrome.runtime.onConnectExternal.addListener`, ajouter :

```ts
  chrome.storage.local.set({ connected: true })
```

Juste avant `webPort = null` dans le `port.onDisconnect.addListener`, ajouter :

```ts
    chrome.storage.local.set({ connected: false })
```

- [ ] **Step 4: Ajouter `storage` aux permissions**

Éditer `extension/manifest.json`. Modifier :

```json
"permissions": ["activeTab", "scripting", "tabs"],
```

en :

```json
"permissions": ["activeTab", "scripting", "tabs", "storage"],
```

- [ ] **Step 5: Build**

Run : `cd /Applications/_IA/Claude_workspace/Web2Print && npm run build:ext`
Expected : build OK.

- [ ] **Step 6: Commit**

```bash
cd /Applications/_IA/Claude_workspace/Web2Print
git add extension/src/popup.html extension/src/popup.ts extension/src/background.ts extension/manifest.json
git commit -m "feat(extension): popup with connection status and extension ID"
```

---

## Phase 5 — Hook React `useChromeExtension`

### Task 6 : Hook de détection et pilotage de l'extension

**Files:**
- Create: `src/features/scraping-templates/useChromeExtension.ts`
- Create: `.env.local.example` (si absent)

- [ ] **Step 1: Documenter la variable dans `.env.local.example`**

Si le fichier n'existe pas :

```bash
cd /Applications/_IA/Claude_workspace/Web2Print
ls .env.local.example 2>/dev/null || touch .env.local.example
```

Ajouter (ou créer) `.env.local.example` avec (en plus du contenu existant s'il y a lieu) :

```
# ID de l'extension Chrome Web2Print Capture (visible dans chrome://extensions après side-load)
VITE_CHROME_EXTENSION_ID=abcdefghijklmnopqrstuvwxyzabcdef
```

- [ ] **Step 2: Créer le hook**

Fichier `src/features/scraping-templates/useChromeExtension.ts` :

```ts
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Détecte la présence de l'extension Web2Print Capture et fournit les
 * primitives de contrôle (ouvrir un onglet, synchroniser les tags, capter
 * les événements de capture).
 *
 * L'ID de l'extension est lu depuis VITE_CHROME_EXTENSION_ID (env Vite).
 * Si absent ou si l'extension ne répond pas, `isAvailable` reste false et
 * tous les appels sont des no-ops (fallback iframe reste actif).
 */

export interface CaptureMessage {
  type: 'capture'
  selectors: string[]
  attr: string | null
  tag: string
  text: string
  mode?: string
}

export interface Tag {
  selector: string
  label: string
}

interface ExtensionAPI {
  isAvailable: boolean
  openAndCapture: (url: string, tags: Tag[]) => void
  syncTags: (tags: Tag[]) => void
  setActiveSelector: (selector: string | null) => void
  setMode: (mode: 'off' | 'single' | 'multiple') => void
  closeCaptureTab: () => void
  lastCapture: CaptureMessage | null
  tabOpen: boolean
}

// Fenêtre étendue Chrome runtime (seulement dans les navigateurs Chromium).
interface ChromeRuntime {
  sendMessage: (id: string, msg: unknown, cb: (resp: unknown) => void) => void
  connect: (id: string, opts: { name: string }) => ChromePort
  lastError?: { message: string }
}
interface ChromePort {
  postMessage: (msg: unknown) => void
  onMessage: { addListener: (cb: (msg: unknown) => void) => void }
  onDisconnect: { addListener: (cb: () => void) => void }
  disconnect: () => void
}

const EXT_ID = import.meta.env.VITE_CHROME_EXTENSION_ID as string | undefined

function getChromeRuntime(): ChromeRuntime | null {
  const win = window as unknown as { chrome?: { runtime?: ChromeRuntime } }
  return win.chrome?.runtime ?? null
}

export function useChromeExtension(): ExtensionAPI {
  const [isAvailable, setIsAvailable] = useState(false)
  const [lastCapture, setLastCapture] = useState<CaptureMessage | null>(null)
  const [tabOpen, setTabOpen] = useState(false)
  const portRef = useRef<ChromePort | null>(null)

  const disconnectPort = useCallback(() => {
    portRef.current?.disconnect()
    portRef.current = null
    setTabOpen(false)
  }, [])

  const connectPort = useCallback(() => {
    if (portRef.current) return
    const runtime = getChromeRuntime()
    if (!runtime || !EXT_ID) return
    try {
      const port = runtime.connect(EXT_ID, { name: 'w2p-capture' })
      port.onMessage.addListener((msg) => {
        const m = msg as { type?: string } & Record<string, unknown>
        if (m?.type === 'ready') setTabOpen(true)
        else if (m?.type === 'tab-closed') setTabOpen(false)
        else if (m?.type === 'capture') setLastCapture(m as unknown as CaptureMessage)
        else if (m?.type === 'error') console.warn('[useChromeExtension]', m.message)
      })
      port.onDisconnect.addListener(() => {
        portRef.current = null
        setTabOpen(false)
      })
      portRef.current = port
    } catch (err) {
      console.warn('[useChromeExtension] connect failed', err)
    }
  }, [])

  // Détection au montage (ping) — avec retry toutes 5s si pas dispo.
  useEffect(() => {
    const runtime = getChromeRuntime()
    if (!runtime || !EXT_ID) {
      setIsAvailable(false)
      return
    }
    let cancelled = false
    const ping = () => {
      runtime.sendMessage(EXT_ID!, { type: 'ping' }, (resp) => {
        if (cancelled) return
        const r = resp as { type?: string } | undefined
        if (r?.type === 'pong') {
          setIsAvailable(true)
          connectPort()
        } else {
          setIsAvailable(false)
        }
      })
    }
    ping()
    const interval = window.setInterval(() => {
      if (!portRef.current) ping()
    }, 5000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
      disconnectPort()
    }
  }, [connectPort, disconnectPort])

  const openAndCapture = useCallback((url: string, tags: Tag[]) => {
    connectPort()
    portRef.current?.postMessage({ type: 'open-and-capture', url, templateTags: tags })
  }, [connectPort])

  const syncTags = useCallback((tags: Tag[]) => {
    portRef.current?.postMessage({ type: 'set-persistent-tags', tags })
  }, [])

  const setActiveSelector = useCallback((selector: string | null) => {
    portRef.current?.postMessage({ type: 'set-active-selector', selector })
  }, [])

  const setMode = useCallback((mode: 'off' | 'single' | 'multiple') => {
    portRef.current?.postMessage({ type: 'set-mode', mode })
  }, [])

  const closeCaptureTab = useCallback(() => {
    portRef.current?.postMessage({ type: 'close-tab' })
  }, [])

  return {
    isAvailable,
    openAndCapture,
    syncTags,
    setActiveSelector,
    setMode,
    closeCaptureTab,
    lastCapture,
    tabOpen,
  }
}
```

- [ ] **Step 3: Build**

Run : `cd /Applications/_IA/Claude_workspace/Web2Print && npm run build`
Expected : build OK, pas de TS error. Le hook compile sans dépendre de l'extension installée.

- [ ] **Step 4: Commit**

```bash
cd /Applications/_IA/Claude_workspace/Web2Print
git add src/features/scraping-templates/useChromeExtension.ts .env.local.example
git commit -m "feat(scraping-templates): useChromeExtension hook (detection + port + messaging)"
```

---

## Phase 6 — Branchement dans `VisualTemplateBuilder`

### Task 7 : Bouton « Ouvrir dans Chrome & tagger » + double mode

**Files:**
- Modify: `src/features/scraping-templates/VisualTemplateBuilder.tsx`

- [ ] **Step 1: Importer le hook et l'icône `Chrome`**

Dans `VisualTemplateBuilder.tsx`, ajouter aux imports en haut :

```ts
import { Chrome } from 'lucide-react'
```

(Ajouter à la ligne d'import `lucide-react` existante — préserver les icônes déjà importées.)

Juste après les imports existants, ajouter :

```ts
import { useChromeExtension } from './useChromeExtension'
```

- [ ] **Step 2: Utiliser le hook dans le composant**

Au début du corps du composant `VisualTemplateBuilder` (juste après le dernier `useState`), insérer :

```ts
  const ext = useChromeExtension()
```

- [ ] **Step 3: Synchroniser les tags avec l'extension quand un onglet est ouvert**

Juste après le `useEffect` existant qui gère `rewrittenHtml` et `showAllTags` (celui qui envoie `pim-set-persistent-tags` à l'iframe), ajouter un 2e `useEffect` dédié à l'extension :

```tsx
  useEffect(() => {
    if (!ext.tabOpen) return
    if (showAllTags) {
      ext.syncTags(template.fields
        .map((f) => ({ selector: f.strategies[0]?.expression ?? '', label: f.field }))
        .filter((t) => t.selector))
    } else {
      ext.syncTags([])
    }
  }, [ext, ext.tabOpen, template.fields, showAllTags])
```

- [ ] **Step 4: Réutiliser le même `pendingCapture` quand l'extension remonte une capture**

Ajouter un 3e `useEffect` juste après :

```tsx
  useEffect(() => {
    if (!ext.lastCapture) return
    setPendingCapture({
      type: 'pim-capture',
      selectors: ext.lastCapture.selectors,
      attr: ext.lastCapture.attr,
      tag: ext.lastCapture.tag,
      text: ext.lastCapture.text,
    })
  }, [ext.lastCapture])
```

- [ ] **Step 5: Ajouter le bouton « Ouvrir dans Chrome » dans la toolbar**

Dans le JSX, localiser le bouton `Charger` de la toolbar (celui qui a l'icône `Eye` et appelle `load`). Juste AVANT ce bouton, ajouter :

```tsx
        {ext.isAvailable && (
          <button
            onClick={() => {
              if (!sourceUrl) { toast.error('Entre une URL'); return }
              ext.openAndCapture(sourceUrl, template.fields
                .map((f) => ({ selector: f.strategies[0]?.expression ?? '', label: f.field }))
                .filter((t) => t.selector))
              if (sourceUrl !== template.lastTestUrl) {
                onChange({ ...template, lastTestUrl: sourceUrl, updatedAt: Date.now() })
              }
              ext.setMode('single')
            }}
            className="px-3 py-2 rounded bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30 border border-emerald-400/40 text-xs inline-flex items-center gap-2"
            title="Ouvrir l'URL dans un onglet Chrome et activer la capture"
          >
            <Chrome className="w-3.5 h-3.5" />
            Ouvrir dans Chrome & tagger
          </button>
        )}
```

- [ ] **Step 6: Ajouter un bandeau statut quand l'onglet est ouvert**

Dans le bloc sticky de la toolbar (juste après la notice jaune `Rendu dégradé attendu` — dans le même conteneur sticky), ajouter un bandeau conditionnel :

```tsx
      {ext.tabOpen && (
        <div className="px-3 py-2 bg-emerald-500/[0.08] border border-emerald-400/20 rounded text-[10px] text-emerald-200/80 flex items-center justify-between">
          <span>
            <b>Onglet Chrome actif</b> — double-clique sur la page source pour capturer. Les surbrillances suivent tes fields.
          </span>
          <button
            onClick={() => ext.closeCaptureTab()}
            className="text-emerald-200/70 hover:text-emerald-200 underline"
          >
            Fermer l'onglet
          </button>
        </div>
      )}
```

- [ ] **Step 7: Propager `set-active-selector` depuis le toggle d'un field**

Localiser la fonction `toggleFieldPreview`. Juste APRÈS `sendToIframe({ type: 'pim-set-active-selector', selector: sel })`, ajouter :

```ts
    if (ext.tabOpen) ext.setActiveSelector(sel)
```

Et juste APRÈS le `sendToIframe({ type: 'pim-set-active-selector', selector: null })` dans la branche « désélection », ajouter :

```ts
    if (ext.tabOpen) ext.setActiveSelector(null)
```

- [ ] **Step 8: Build**

Run : `cd /Applications/_IA/Claude_workspace/Web2Print && npm run build`
Expected : build OK.

- [ ] **Step 9: Validation manuelle minimale (extension pas encore side-loadée)**

Ouvrir `npm run dev`, aller sur un template dans Scraping Hub → Templates scraping. Vérifier que :
- Le bouton « Ouvrir dans Chrome & tagger » **n'apparaît pas** (car l'extension n'est pas installée) — `ext.isAvailable === false`.
- Le comportement iframe actuel est intact (bouton « Charger » fonctionnel).

- [ ] **Step 10: Commit**

```bash
cd /Applications/_IA/Claude_workspace/Web2Print
git add src/features/scraping-templates/VisualTemplateBuilder.tsx
git commit -m "feat(scraping-templates): branch Chrome extension capture into visual builder"
```

---

## Phase 7 — Documentation side-load + icônes

### Task 8 : README de l'extension + icônes placeholder

**Files:**
- Create: `extension/README.md`
- Create: `extension/icons/16.png`, `48.png`, `128.png` (placeholders)

- [ ] **Step 1: Créer `extension/README.md`**

Contenu :

````markdown
# Web2Print Capture — Extension Chrome

Extension Manifest V3 qui permet à Web2Print d'injecter son mode capture directement dans un onglet natif. Évite le rendu dégradé de l'iframe (polices custom, icon-fonts).

## Build

```bash
npm run build:ext
```

Produit `extension/dist/` (à charger dans Chrome).

## Side-load en dev

1. Ouvrir `chrome://extensions`
2. Activer **Mode développeur** (toggle en haut à droite)
3. Cliquer **Charger l'extension non empaquetée**
4. Sélectionner le dossier `extension/dist/`
5. Copier l'**ID de l'extension** affiché sous le nom (ex : `abcdef…`)

## Configuration Web2Print

Créer / éditer `/Applications/_IA/Claude_workspace/Web2Print/.env.local` :

```
VITE_CHROME_EXTENSION_ID=<l'ID copié à l'étape 5>
```

Relancer `npm run dev`. Dans le Scraping Hub → n'importe quel template, l'éditeur visuel affichera un bouton **« Ouvrir dans Chrome & tagger »** (vert) à côté du bouton **Charger**.

## Utilisation

1. Saisir l'URL du produit dans le champ source du template.
2. Cliquer **Ouvrir dans Chrome & tagger** → un nouvel onglet s'ouvre avec la page réelle (polices natives, JS exécuté).
3. Un bandeau « Onglet Chrome actif » s'affiche dans le Scraping Hub.
4. Dans l'onglet source : **double-clic** pour capturer un élément (simple-clic navigue, accordéons ouvrent…).
5. La modal de mappage apparaît dans Web2Print → assigner à un field.
6. Les surbrillances multi-couleurs suivent en temps réel dans l'onglet.

## Désinstaller / désactiver

`chrome://extensions` → interrupteur de l'extension. Web2Print bascule automatiquement sur le mode iframe (fallback).

## Permissions expliquées

- `activeTab` + `scripting` : injecter le script de capture à la demande.
- `tabs` : ouvrir / fermer l'onglet de capture.
- `host_permissions: <all_urls>` : l'utilisateur saisit des URLs de fournisseurs variés ; pas de liste fixe possible.
- `storage` : mémoriser l'état de connexion pour la popup.
- `externally_connectable` : seules les origines Web2Print connues (`localhost:5173/4173`, `web2print-6fe5a.web.app`, `web2print-6fe5a.firebaseapp.com`) peuvent communiquer avec l'extension.
````

- [ ] **Step 2: Créer les icônes placeholder**

Tant qu'on n'a pas de vraies icônes, générer 3 PNG unis violets (#6366f1) aux tailles 16, 48, 128. Run (chaque commande pour chaque taille) :

```bash
cd /Applications/_IA/Claude_workspace/Web2Print
mkdir -p extension/icons
# Générer un PNG uni via ImageMagick si installé ; sinon, créer via Node.
node -e "
const { writeFileSync } = require('fs');
for (const size of [16, 48, 128]) {
  // PNG minimal uni violet (simplification : 1x1 PNG stretché, les navigateurs acceptent)
  // Source : PNG 1x1 violet encodé en base64 (image de 23 octets), Chrome resize.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYHj4HwADCgGBmtrJ4gAAAABJRU5ErkJggg==', 'base64');
  writeFileSync(\`extension/icons/\${size}.png\`, png);
}
"
```

- [ ] **Step 3: Build et vérifier**

Run : `cd /Applications/_IA/Claude_workspace/Web2Print && npm run build:ext`
Expected : build OK, `extension/dist/icons/` contient les 3 png.

- [ ] **Step 4: Commit**

```bash
cd /Applications/_IA/Claude_workspace/Web2Print
git add extension/README.md extension/icons/
git commit -m "feat(extension): README for side-load and placeholder icons"
```

---

## Phase 8 — Smoke test end-to-end

### Task 9 : Side-load l'extension et valider le flux complet

**Files:** aucune modification — validation manuelle uniquement.

- [ ] **Step 1: Build final des deux côtés**

Run :

```bash
cd /Applications/_IA/Claude_workspace/Web2Print
npm run build:ext && npm run build
```

Expected : les deux builds passent sans erreur.

- [ ] **Step 2: Side-load l'extension**

- Ouvrir `chrome://extensions`
- Activer « Mode développeur »
- Charger l'extension non empaquetée → pointer sur `extension/dist/`
- Copier l'ID de l'extension.

- [ ] **Step 3: Configurer `.env.local`**

Éditer `/Applications/_IA/Claude_workspace/Web2Print/.env.local` (le créer sinon) :

```
VITE_CHROME_EXTENSION_ID=<id_copié>
```

Redémarrer le dev server : `npm run dev`.

- [ ] **Step 4: Valider dans le navigateur**

- [ ] Ouvrir `http://localhost:5173` → Scraping Hub → Templates scraping → sélectionner le template Nicoll.
- [ ] Le bouton **« Ouvrir dans Chrome & tagger »** (vert, icône Chrome) est visible dans la toolbar à côté de « Charger ».
- [ ] Cliquer sur **« Ouvrir dans Chrome & tagger »** → un nouvel onglet s'ouvre sur `nicoll.fr/fr/fr/caniveau…` avec le rendu natif (polices Nicoll chargées, icônes rouges visibles).
- [ ] Bandeau vert « Onglet Chrome actif » dans le Scraping Hub avec un bouton « Fermer l'onglet ».
- [ ] Surbrillances multi-couleurs visibles sur l'onglet natif : title en vert, description en rose, etc., avec labels.
- [ ] Double-clic sur un élément (par ex le prix si présent) → la modal de mappage apparaît dans le Scraping Hub.
- [ ] Assigner à un field → le tag est ajouté au template et la surbrillance correspondante apparaît instantanément dans l'onglet natif.
- [ ] Simple-clic sur un accordéon dans l'onglet natif → l'accordéon s'ouvre (navigation normale préservée).
- [ ] Fermer l'onglet natif → le bandeau vert disparaît, `ext.tabOpen` repasse à `false`.
- [ ] Désactiver l'extension depuis `chrome://extensions` → rafraîchir `localhost:5173` → le bouton « Ouvrir dans Chrome » disparaît, le flux iframe est de nouveau le seul disponible.

- [ ] **Step 5: Commit éventuels ajustements**

Si des micro-corrections ont été nécessaires pendant le smoke test :

```bash
cd /Applications/_IA/Claude_workspace/Web2Print
git add <fichiers-modifiés>
git commit -m "fix(extension): tweaks after end-to-end smoke test"
```

---

## Récapitulatif des fichiers

**Nouveaux (9)** :
- `extension/manifest.json`
- `extension/vite.config.ts`
- `extension/tsconfig.json`
- `extension/.gitignore`
- `extension/src/background.ts`
- `extension/src/content.ts`
- `extension/src/popup.html`
- `extension/src/popup.ts`
- `extension/README.md`
- `extension/icons/{16,48,128}.png` (3 placeholders)
- `src/features/scraping-templates/useChromeExtension.ts`

**Modifiés (3)** :
- `package.json` (script `build:ext` + devDeps `@types/chrome`)
- `src/features/scraping-templates/VisualTemplateBuilder.tsx` (branchement hook + bouton + bandeau)
- `.env.local.example` (documenter `VITE_CHROME_EXTENSION_ID`)

**Intouchés (clé)** :
- `src/features/scraping-templates/overlayScript.ts` — source de vérité unique, partagé entre iframe et extension via alias Vite `@overlay`.
