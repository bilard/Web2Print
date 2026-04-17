/**
 * Content script injecté dans l'onglet source (site fournisseur).
 *
 * Rôle : relayer les messages entre le script overlay (MAIN world, injecté
 * par le background via chrome.scripting.executeScript) et le background.
 *
 * L'overlay s'exécute en MAIN world pour contourner la CSP des sites
 * fournisseur qui interdisent les inline scripts.
 */

if (!(window as Window & { __w2pBridgeInstalled?: boolean }).__w2pBridgeInstalled) {
  ;(window as Window & { __w2pBridgeInstalled?: boolean }).__w2pBridgeInstalled = true

  // Relayer page (MAIN world) → background
  window.addEventListener('message', (e: MessageEvent) => {
    const msg = e.data as { type?: string } | null
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return
    if (!msg.type.startsWith('pim-') && msg.type !== 'ready') return
    if (msg.type === 'pim-ready') {
      chrome.runtime.sendMessage({ type: 'ready' })
      return
    }
    chrome.runtime.sendMessage(msg)
  })

  // Relayer background → page (MAIN world)
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || typeof msg !== 'object') return false
    window.postMessage(msg, '*')
    return false
  })
}
