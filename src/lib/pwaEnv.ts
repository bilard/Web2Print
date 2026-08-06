// Détection de l'environnement d'exécution des PWA (Pulse, radarPrice). Partagé plutôt
// que recopié dans chaque module de formatage : les deux applications posent la MÊME
// question au navigateur, et la réponse d'iOS a déjà changé de forme une fois
// (`navigator.standalone` propriétaire, puis `display-mode: standalone`). Deux copies,
// c'est une correction sur une seule le jour où elle changera encore.

/** Vrai si l'app tourne en mode installé (écran d'accueil iOS ou display-mode standalone). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches
}

/** Vrai sur iPhone/iPad (pour n'afficher l'astuce « Ajouter à l'écran d'accueil » que là).
 *  ⚠ Un iPad récent s'annonce « MacIntel » : c'est le nombre de points tactiles qui le
 *  trahit, l'user-agent seul le classerait en poste fixe. */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && (navigator as unknown as { maxTouchPoints: number }).maxTouchPoints > 1)
}
