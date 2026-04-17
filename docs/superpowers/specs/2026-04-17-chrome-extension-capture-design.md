# Chrome Extension — rendu fidèle de la page source pour le Scraping Hub

**Date** : 2026-04-17
**Statut** : Design validé, en attente de plan d'implémentation
**Contexte** : Suite du Scraping Hub (spec `2026-04-17-scraping-hub-design.md`). L'éditeur visuel actuel charge la page source dans une iframe `srcdoc` qui ne peut pas rendre les polices custom ni les icon-fonts (CORS sur `@font-face`). Rendu dégradé qui complique le tagging visuel.

---

## 1. Problème

L'éditeur « Pointer & cliquer » dans `VisualTemplateBuilder.tsx` charge le HTML d'un fournisseur via proxy CORS puis l'affiche dans une iframe sandboxée. Les limitations connues :

1. **`@font-face` cross-origin bloqué** — les CDN des fournisseurs ne renvoient pas `Access-Control-Allow-Origin`, donc toutes les polices custom tombent sur la fallback système.
2. **Icon fonts (FontAwesome, fonts custom)** — même cause, les boutons apparaissent vides.
3. **CSP envoyée en headers HTTP** — impossible à retirer côté client, bloque certaines feuilles secondaires.
4. **JS du site non ré-exécuté fidèlement** — certains composants dynamiques (accordéons, carousels) manquent ou apparaissent cassés.

Résultat : l'utilisateur travaille sur une page « moche » qui ne correspond pas visuellement à celle qu'il voit en navigation normale. Ça rend le tagging plus laborieux et crée un écart de confiance.

## 2. Objectif

Livrer une **extension Chrome MV3** qui, lorsqu'elle est installée, permet à Web2Print d'injecter `overlayScript.ts` directement dans un onglet réel du fournisseur (rendu natif, polices OK, JS exécuté). Les captures remontent au Scraping Hub via le protocole de messaging Chrome. L'iframe `srcdoc` actuelle reste le **fallback** quand l'extension est absente.

## 3. Non-objectifs

- Pas de publication sur le Chrome Web Store dans cette livraison (side-load unpacked suffisant pour la v1).
- Pas de support Firefox / Safari / Edge — MV3 Chrome uniquement.
- Pas de refonte de `overlayScript.ts` — il est réutilisé tel quel, juste adapté à `chrome.runtime` au lieu de `window.parent.postMessage`.
- Pas de scraping en arrière-plan ni d'automation. L'utilisateur reste maître de l'onglet.
- Pas de remplacement complet de l'iframe — double mode maintenu pour les devs qui n'installent pas l'extension.

## 4. Architecture

### 4.1 Vue d'ensemble

```
┌─────────────────┐       externally_connectable       ┌─────────────────┐
│   Web2Print     │  ────────  chrome.runtime  ──────► │ Ext. background │
│  (localhost /   │                                    │  (service worker│
│   prod domain)  │◄────── Port bidirectionnel ───────►│   de l'ext.)    │
└─────────────────┘                                    └────────┬────────┘
                                                                │
                                                 chrome.scripting│chrome.tabs
                                                                ▼
                                                       ┌─────────────────┐
                                                       │  Onglet source  │
                                                       │  (ex: nicoll.fr)│
                                                       │                 │
                                                       │  + overlayScript│
                                                       │    + bootstrap  │
                                                       └─────────────────┘
```

### 4.2 Détection auto — double mode

Au montage de `VisualTemplateBuilder`, un ping est envoyé :

```ts
chrome.runtime.sendMessage(EXT_ID, { type: 'ping' }, (resp) => { /* pong ou undefined */ })
```

- Réponse `pong` → **mode extension** : affiche un bouton « Ouvrir dans Chrome & tagger » (vert) ; cache le bouton « Charger » (iframe).
- Pas de réponse → **mode iframe** (fallback) : comportement actuel inchangé.

L'utilisateur peut basculer entre les deux via un toggle si les deux sont disponibles.

### 4.3 Structure du projet

```
Web2Print/
├── src/                                           (app React existante)
│   └── features/scraping-templates/
│       ├── overlayScript.ts                       (source de vérité, inchangé)
│       ├── useChromeExtension.ts                  (NOUVEAU — hook)
│       └── VisualTemplateBuilder.tsx              (modifié — branchement)
└── extension/                                      (NOUVEAU — projet MV3)
    ├── manifest.json
    ├── src/
    │   ├── background.ts                          (service worker)
    │   ├── content.ts                             (bootstrap injection)
    │   ├── popup.html
    │   └── popup.ts
    ├── icons/16.png 48.png 128.png
    ├── tsconfig.json
    ├── vite.config.ts                             (build → extension/dist/)
    └── README.md                                  (instructions side-load)
```

### 4.4 Manifest MV3

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
  "action": { "default_popup": "popup.html" },
  "icons": { "16": "icons/16.png", "48": "icons/48.png", "128": "icons/128.png" },
  "externally_connectable": {
    "matches": [
      "http://localhost:5173/*",
      "https://web2print-6fe5a.web.app/*",
      "https://web2print-6fe5a.firebaseapp.com/*"
    ]
  }
}
```

### 4.5 Protocole de messaging

**Web2Print → Extension** (via `chrome.runtime.connect(EXT_ID, {name:'w2p-capture'})` + `port.postMessage`) :

| Type | Payload | Réponse | Rôle |
|------|---------|---------|------|
| `ping` | – | `pong` | Détection présence |
| `open-and-capture` | `{ url, templateTags: [{selector, label}] }` | – | Ouvre un onglet, injecte l'overlay, active le mode capture |
| `set-persistent-tags` | `{ tags: [{selector, label}] }` | – | Rafraîchit les surbrillances sur l'onglet actif |
| `set-active-selector` | `{ selector }` | – | Met le field actif en teinte renforcée |
| `clear-tags` | – | – | Efface toutes les surbrillances |
| `set-mode` | `{ mode: 'off' \| 'single' \| 'multiple' }` | – | Active/désactive la capture |
| `close-tab` | – | – | Ferme l'onglet capture |

**Extension → Web2Print** (via le même port, `port.postMessage` côté extension) :

| Type | Payload | Rôle |
|------|---------|------|
| `ready` | `{ tabId, url }` | Onglet ouvert, overlay injecté |
| `capture` | `{ selectors, attr, tag, text, mode }` | L'utilisateur a double-cliqué un élément |
| `tab-closed` | `{ tabId }` | Utilisateur a fermé l'onglet |
| `error` | `{ message }` | Problème (permissions refusées, URL invalide, etc.) |

### 4.6 Adaptation de `overlayScript.ts`

Le script actuel poste vers `window.parent` via `postMessage`. Dans le contexte extension, il doit poster vers le content script via `chrome.runtime.sendMessage` OU via `window.postMessage` vers lui-même (le content script écoute et relaie).

**Choix** : **pas de modification de `overlayScript.ts`**. Au lieu d'ajouter des branches, le content script de l'extension **écoute** les `window.postMessage` que le script produit et les **relaie** au background via `chrome.runtime.sendMessage`. Inversement pour les messages descendants. Zéro divergence entre les deux modes.

```
overlayScript.ts  ──postMessage──►  content.ts  ──chrome.runtime──►  background.ts  ──port──►  Web2Print
                 ◄──postMessage──               ◄──chrome.runtime──                  ◄──port──
```

### 4.7 Hook `useChromeExtension`

Nouveau fichier `src/features/scraping-templates/useChromeExtension.ts` :

```ts
export function useChromeExtension(): {
  isAvailable: boolean
  openAndCapture: (url: string, tags: Array<{selector: string; label: string}>) => void
  syncTags: (tags: Array<{selector: string; label: string}>) => void
  setActiveSelector: (selector: string | null) => void
  setMode: (mode: 'off' | 'single' | 'multiple') => void
  closeCaptureTab: () => void
  lastCapture: CaptureMessage | null
}
```

Ping au montage, ré-essai toutes les 5s pour robustesse au `page reload` de l'extension. Maintient un port persistant (`chrome.runtime.connect`) pour éviter les reconnexions à chaque message.

### 4.8 Branchement dans `VisualTemplateBuilder`

- Toolbar : si `isAvailable`, bouton principal « Ouvrir dans Chrome & tagger » (vert) qui remplace « Charger » + « Activer capture » en un seul clic.
- `lastCapture` du hook → réutilise le même `setPendingCapture(capture)` que le mode iframe → modal d'assignment identique.
- `syncTags(template.fields)` remplace le `sendToIframe({type:'pim-set-persistent-tags', tags})` quand l'onglet est actif.
- Fallback iframe intact : si `isAvailable` est `false`, le code actuel tourne sans modification.

## 5. Build & distribution

### 5.1 Build

- Vite séparé dans `extension/vite.config.ts`, entrées multiples (`background.ts`, `content.ts`, `popup.ts`).
- Script npm : `npm run build:ext` → produit `extension/dist/` avec `manifest.json` copié + bundles JS + HTML popup.
- **Pas** de dépendance au build de l'app React (build indépendants).

### 5.2 Side-load (v1)

README avec instructions :
1. `npm run build:ext`
2. Ouvrir `chrome://extensions`
3. Activer « Mode développeur »
4. « Charger l'extension non empaquetée » → sélectionner `extension/dist/`
5. Récupérer l'ID de l'extension affiché
6. Saisir cet ID dans `.env.local` : `VITE_CHROME_EXTENSION_ID=xxxxxx` (lu par le hook)

### 5.3 Publication (v2, non incluse)

Futur : compte dev Chrome Web Store (5 $), review Google (~3 jours), ID fixe. Pas dans cette livraison.

## 6. Points de vigilance

- **Permissions** : `<all_urls>` est large mais nécessaire — le user ne devrait pas reconfigurer pour chaque fournisseur. Le popup mentionne explicitement que l'extension ne fait rien sans action utilisateur.
- **Service worker qui s'endort** : MV3 tue le background après 30s d'inactivité. Le port `chrome.runtime.connect` réveille automatiquement. Tester le cas où l'utilisateur laisse le Scraping Hub ouvert 10 min.
- **Onglet fermé par l'utilisateur** : background détecte via `chrome.tabs.onRemoved` → envoie `tab-closed` à Web2Print pour nettoyer l'état.
- **Content script double-injection** : `overlayScript.ts` a déjà un guard `window.__pimCaptureInstalled` — on s'en sert pour idempotence.
- **Sécurité** : `externally_connectable.matches` limité aux domaines Web2Print connus. Pas de `chrome.runtime.sendMessage` depuis une page tierce.
- **Tags envoyés avant injection** : s'il y a une race (port ouvert avant que `overlayScript.ts` ne soit prêt), buffer côté content script jusqu'au message `pim-ready`.

## 7. Plan de livraison

| Étape | Fichiers | Taille | Risque |
|-------|----------|--------|--------|
| 1. Scaffolding (manifest + vite + tsconfig) | `extension/manifest.json`, `extension/vite.config.ts`, `extension/tsconfig.json`, `package.json` | ~60 lignes + 1 script npm | Faible |
| 2. Background : ping + port + relais | `extension/src/background.ts` | ~100 lignes | Moyen |
| 3. Content : bootstrap + relais postMessage | `extension/src/content.ts` | ~80 lignes | Moyen |
| 4. Popup minimal | `extension/src/popup.html`, `extension/src/popup.ts` | ~50 lignes | Faible |
| 5. Hook `useChromeExtension` | `src/features/scraping-templates/useChromeExtension.ts` | ~150 lignes | Moyen |
| 6. Branchement `VisualTemplateBuilder` | modif `src/features/scraping-templates/VisualTemplateBuilder.tsx` | ~60 lignes | Moyen |
| 7. README side-load + icons | `extension/README.md`, `extension/icons/*` | ~30 lignes + 3 png | Faible |

Chaque étape est indépendante (2 et 3 peuvent être développées en parallèle). Commit par étape.

## 8. Validation (manuelle)

- [ ] `npm run build:ext` produit `extension/dist/` sans erreur.
- [ ] Side-load dans Chrome réussit, icône apparaît dans la toolbar.
- [ ] Popup s'ouvre et affiche « Prêt ».
- [ ] Ouvrir Web2Print localhost → Scraping Hub → un template Nicoll → la toolbar affiche « Ouvrir dans Chrome & tagger » (vert).
- [ ] Cliquer → nouvel onglet s'ouvre sur l'URL du template → overlay injecté → polices natives visibles → tags multi-couleurs en haut des blocs.
- [ ] Double-clic sur un élément dans l'onglet → modal d'assignment apparaît dans le Scraping Hub.
- [ ] Assignation → tag ajouté, nouvelle surbrillance immédiate dans l'onglet.
- [ ] Fermer l'onglet → Web2Print nettoie l'état (pas de bouton fantôme).
- [ ] Désinstaller l'extension → Web2Print bascule sur l'iframe (mode fallback) sans erreur.
