// src/features/workflows/runtime/connectionDragStore.ts
// Tiny store that tracks the in-progress port drag so that *other* nodes can
// highlight their compatible ports while the user is connecting.
import { create } from 'zustand'
import type { PortType } from '../types'

interface ConnectionDragState {
  /**
   * Type of the port the drag started from. `null` when no drag is active.
   */
  fromType: PortType | null
  /**
   * - 'source' : drag started from an OUTPUT handle (looking for INPUT targets)
   * - 'target' : drag started from an INPUT handle (looking for OUTPUT sources)
   */
  fromKind: 'source' | 'target' | null
  start: (fromType: PortType, fromKind: 'source' | 'target') => void
  end: () => void
}

export const useConnectionDrag = create<ConnectionDragState>((set) => ({
  fromType: null,
  fromKind: null,
  start: (fromType, fromKind) => set({ fromType, fromKind }),
  end: () => set({ fromType: null, fromKind: null }),
}))
