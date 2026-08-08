import { create } from 'zustand'

/**
 * Vue courante À L'INTÉRIEUR d'un module, publiée par l'écran lui-même pour que le menu
 * en arbre puisse marquer l'entrée correspondante.
 *
 * Pourquoi un store : l'état de vue vit dans le panneau du module (« Veille tarifaire »
 * bascule entre son comparatif et ses règles d'appariement) alors que le menu est rendu
 * bien plus haut, dans la page du tableau de bord. Sans ce canal, aucune des entrées
 * enfants ne pouvait s'afficher comme active — le menu montrait deux fonctions
 * équivalentes, sans dire laquelle on regardait.
 *
 * La clé est l'identifiant du module, la valeur celui de l'ENFANT actif — donc la même
 * valeur que `ModuleItem.children[].id` (« section:comparison »), sinon rien ne s'allume.
 */
interface ModuleViewState {
  /** module → id de l'enfant actif. */
  views: Record<string, string | null>
  set: (module: string, childId: string | null) => void
}

export const useModuleViewStore = create<ModuleViewState>((set) => ({
  views: {},
  set: (module, childId) => set((s) => (
    // Comparaison AVANT écriture : les écrans publient leur vue depuis un effet qui
    // rejoue à chaque rendu, et un `set` inconditionnel relancerait les abonnés en boucle.
    s.views[module] === childId ? s : { views: { ...s.views, [module]: childId } }
  )),
}))
