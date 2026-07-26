// Pages « virtuelles » : les modules du dashboard ne changent PAS l'URL (section en
// état local React, cf. navigation/modules.ts) — le beacon (public/analytics-beacon.js)
// ne voit donc rien. On lui pousse un chemin synthétique `/dashboard/<section>`,
// rendu lisible par `pageLabel` (SECTION_LABELS).

declare global {
  interface Window {
    /** Exposé par public/analytics-beacon.js : enregistre une page vue « virtuelle ». */
    __w2pTrack?: (path: string) => void
  }
}

/** Enregistre l'ouverture d'un module du dashboard dans les analytics. */
export function trackSection(section: string): void {
  window.__w2pTrack?.('/dashboard/' + section)
}
