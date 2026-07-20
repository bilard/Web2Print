// src/features/workflows/editor/focusNodeStore.ts
// Signal transitoire « sauter à ce node » : le popup de cohérence (ou tout autre
// panneau) demande le focus d'une carte ; l'éditeur ReactFlow y répond en la
// SÉLECTIONNANT (ouvre sa config) et en la CENTRANT. `token` s'incrémente à chaque
// demande pour re-déclencher même sur le même node.
import { create } from 'zustand'

interface FocusNodeState {
  nodeId: string | null
  token: number
  focus: (id: string) => void
}

export const useFocusNode = create<FocusNodeState>((set) => ({
  nodeId: null,
  token: 0,
  focus: (id) => set((s) => ({ nodeId: id, token: s.token + 1 })),
}))
