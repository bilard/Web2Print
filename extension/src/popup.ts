// Popup : affiche l'ID de l'extension (utile pour la config IBS-Studio) et
// un statut basique (idle / connected). L'état "connected" est écrit dans
// chrome.storage.local par le background dès qu'un port est ouvert.

const extIdEl = document.getElementById('ext-id')!
const statusEl = document.getElementById('status')!

extIdEl.textContent = chrome.runtime.id

chrome.storage.local.get('connected').then(({ connected }) => {
  if (connected) {
    statusEl.textContent = 'Connecté à IBS-Studio'
    statusEl.className = 'status ok'
  } else {
    statusEl.textContent = 'En attente'
    statusEl.className = 'status idle'
  }
})

chrome.storage.onChanged.addListener((changes) => {
  if (changes.connected) {
    const v = changes.connected.newValue
    statusEl.textContent = v ? 'Connecté à IBS-Studio' : 'En attente'
    statusEl.className = 'status ' + (v ? 'ok' : 'idle')
  }
})
