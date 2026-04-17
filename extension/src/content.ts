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
