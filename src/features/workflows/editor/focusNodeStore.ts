// Signal transitoire « sauter à ce node » : le popup de cohérence (ou tout autre
// panneau) demande le focus d'une carte ; l'éditeur ReactFlow y répond en la
// SÉLECTIONNANT (ouvre sa config) et — sauf `fit: false` — en la CENTRANT.
// `token` s'incrémente à chaque demande pour re-déclencher même sur le même node.
import { create } from 'zustand'

interface FocusNodeState {
  nodeId: string | null
  token: number
  /** false = sélectionner sans recadrer la vue (ex : auto-sélection au lancement d'un run). */
  fit: boolean
  focus: (id: string, opts?: { fit?: boolean }) => void
}

export const useFocusNode = create<FocusNodeState>((set) => ({
  nodeId: null,
  token: 0,
  fit: true,
  focus: (id, opts) => set((s) => ({ nodeId: id, token: s.token + 1, fit: opts?.fit ?? true })),
}))
