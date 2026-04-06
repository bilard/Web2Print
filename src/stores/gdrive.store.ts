import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface GDriveState {
  connected: boolean
  accessToken: string | null
  accountEmail: string | null
  connect: (token: string, email: string) => void
  disconnect: () => void
}

export const useGDriveStore = create<GDriveState>()(
  persist(
    (set) => ({
      connected: false,
      accessToken: null,
      accountEmail: null,
      connect: (accessToken, accountEmail) => set({ connected: true, accessToken, accountEmail }),
      disconnect: () => set({ connected: false, accessToken: null, accountEmail: null }),
    }),
    {
      name: 'gdrive-connection',
      partialize: (state) => ({
        connected: state.connected,
        accessToken: state.accessToken,
        accountEmail: state.accountEmail,
      }),
    },
  ),
)
