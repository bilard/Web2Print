// src/stores/demoExpress.store.ts
// État du wizard « Démo express » : phase, progression des étapes du pipeline
// d'ensemencement et liens vers les artefacts créés. L'orchestrateur
// (useDemoExpress) écrit ici ; les composants UI ne font que lire.
import { create } from 'zustand'
import type { DemoStep, DemoStepId, DemoResultLinks } from '@/features/demo-express/types'

const STEP_LABELS: [DemoStepId, string][] = [
  ['charte', 'Charte graphique du site'],
  ['discover', 'Découverte des produits'],
  ['enrich', 'Enrichissement des fiches'],
  ['dam', 'Images → DAM (Google Drive)'],
  ['sheet', 'Feuille PIM'],
  ['catalog', 'Catalogue studio'],
  ['promo', 'Fiche promo'],
  ['workflow', 'Workflow personnalisé'],
]

function freshSteps(): DemoStep[] {
  return STEP_LABELS.map(([id, label]) => ({ id, label, status: 'pending' }))
}

interface DemoExpressState {
  phase: 'form' | 'running' | 'done'
  company: string
  url: string
  steps: DemoStep[]
  links: DemoResultLinks
  abortRequested: boolean
  begin: (company: string, url: string) => void
  updateStep: (id: DemoStepId, patch: Partial<Omit<DemoStep, 'id'>>) => void
  setLinks: (patch: Partial<DemoResultLinks>) => void
  finish: () => void
  requestAbort: () => void
  reset: () => void
}

export const useDemoExpressStore = create<DemoExpressState>((set) => ({
  phase: 'form',
  company: '',
  url: '',
  steps: freshSteps(),
  links: {},
  abortRequested: false,

  begin: (company, url) =>
    set({ phase: 'running', company, url, steps: freshSteps(), links: {}, abortRequested: false }),

  updateStep: (id, patch) =>
    set((s) => ({ steps: s.steps.map((st) => (st.id === id ? { ...st, ...patch } : st)) })),

  setLinks: (patch) => set((s) => ({ links: { ...s.links, ...patch } })),

  finish: () => set({ phase: 'done' }),

  requestAbort: () => set({ abortRequested: true }),

  reset: () => set({ phase: 'form', steps: freshSteps(), links: {}, abortRequested: false }),
}))
