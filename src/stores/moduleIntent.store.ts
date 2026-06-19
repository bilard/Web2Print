import { create } from 'zustand'

/**
 * Intent de navigation « fonction » poussé par le menu en arbre (sidebar/drawer)
 * et consommé une seule fois par l'écran cible via `useModuleIntent`.
 *
 * `seq` s'incrémente à chaque `set` : re-cliquer la même fonction (intent
 * identique) re-déclenche les abonnés. Format de l'intent : '<module>:<action>'.
 */
interface ModuleIntentState {
  intent: string | null
  seq: number
  set: (intent: string | null) => void
}

export const useModuleIntentStore = create<ModuleIntentState>((set) => ({
  intent: null,
  seq: 0,
  set: (intent) => set((s) => ({ intent, seq: s.seq + 1 })),
}))
