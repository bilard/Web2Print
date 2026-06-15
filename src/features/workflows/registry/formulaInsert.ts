// src/features/workflows/registry/formulaInsert.ts
// Pont d'insertion : le champ formule actuellement focalisé enregistre son
// inséreur (insertion au curseur) ; le popup (clic sur une fonction / colonne)
// l'appelle pour insérer le texte dans CE champ.
type Inserter = (text: string) => void

let active: Inserter | null = null

export const formulaInsert = {
  setActive(fn: Inserter): void {
    active = fn
  },
  clearIf(fn: Inserter): void {
    if (active === fn) active = null
  },
  /** Insère `text` au curseur du champ formule focalisé. Retourne false si aucun. */
  insert(text: string): boolean {
    if (active) {
      active(text)
      return true
    }
    return false
  },
}
