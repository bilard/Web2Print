/**
 * Ce clic est-il un clic ORDINAIRE, que l'application doit traiter elle-même ?
 *
 * Une entrée de navigation portée par un vrai `<a href>` hérite gratuitement de tout ce
 * que le navigateur sait faire : ⌘/Ctrl+clic ouvre un onglet, ⌘+Maj+clic l'ouvre au
 * premier plan, Maj+clic ouvre une fenêtre, le clic du milieu ouvre en arrière-plan, le
 * clic droit propose « Ouvrir dans un nouvel onglet », et le survol affiche la
 * destination. Encore faut-il ne pas lui couper la parole : un `preventDefault()`
 * inconditionnel annule tout cela d'un coup, et l'entrée redevient un bouton déguisé.
 *
 * On n'intercepte donc que le clic gauche NU. Tout le reste part au navigateur.
 */
export function isPlainClick(e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; button: number }): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
}
