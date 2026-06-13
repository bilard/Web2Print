import { create } from 'zustand'
import { resolveContextArticle, type HelpContext } from './helpContext'

interface HelpState {
  open: boolean
  currentSectionId: string | null
  highlightTarget: string | null
  searchQuery: string
  /** Module/écran actif de l'app (sections Dashboard + `editor`), pour pré-sélectionner l'article. */
  activeContext: HelpContext | null
  /** Vrai ⟺ l'article affiché suit le contexte : changer de module rafraîchit l'aide en live.
   *  Passe à false dès que l'utilisateur choisit lui-même un article (sommaire, recherche). */
  followContext: boolean
  openDrawer: () => void
  closeDrawer: () => void
  toggleDrawer: () => void
  goToSection: (id: string) => void
  setActiveContext: (ctx: HelpContext | null) => void
  setHighlightTarget: (id: string | null) => void
  setSearchQuery: (q: string) => void
}

/** À l'ouverture : article du contexte courant si résolu (et on le suivra en live), sinon on garde la sélection. */
function openState(s: HelpState): Partial<HelpState> {
  const target = resolveContextArticle(s.activeContext)
  return target ? { open: true, currentSectionId: target, followContext: true } : { open: true }
}

let resetTimer: ReturnType<typeof setTimeout> | null = null

export const useHelpStore = create<HelpState>((set) => ({
  open: false,
  currentSectionId: null,
  highlightTarget: null,
  searchQuery: '',
  activeContext: null,
  followContext: false,

  // Ouverture « générique » (bouton ?, ⇧?) → bascule sur l'article du contexte courant.
  // `goToSection` reste le chemin ciblé (MenuLink, recherche, sommaire) qui contourne ça.
  openDrawer: () => set((s) => openState(s)),
  closeDrawer: () => set({ open: false }),
  toggleDrawer: () => set((s) => (s.open ? { open: false } : openState(s))),

  // Navigation explicite (sommaire, recherche) → on quitte le mode « suivi du contexte ».
  goToSection: (id) => set({ open: true, currentSectionId: id, followContext: false }),

  // Changement de module : si le panneau est ouvert et qu'on suit le contexte, on rafraîchit
  // l'article affiché en live. Sinon on mémorise juste le contexte pour la prochaine ouverture.
  setActiveContext: (ctx) =>
    set((s) => {
      if (s.open && s.followContext) {
        const target = resolveContextArticle(ctx)
        if (target) return { activeContext: ctx, currentSectionId: target }
      }
      return { activeContext: ctx }
    }),

  setSearchQuery: (q) => set({ searchQuery: q }),

  setHighlightTarget: (id) => {
    if (resetTimer) {
      clearTimeout(resetTimer)
      resetTimer = null
    }
    set({ highlightTarget: id })
    if (id !== null) {
      resetTimer = setTimeout(() => {
        set({ highlightTarget: null })
        resetTimer = null
      }, 3000)
    }
  },
}))
