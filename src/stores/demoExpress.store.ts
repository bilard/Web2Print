// src/stores/demoExpress.store.ts
// État du wizard « Démo express » : phase, progression des étapes du pipeline
// d'ensemencement et liens vers les artefacts créés. L'orchestrateur
// (useDemoExpress) écrit ici ; les composants UI ne font que lire.
import { create } from 'zustand'
import type { DemoStep, DemoStepId, DemoResultLinks, DemoLogKind, DemoLogLine } from '@/features/demo-express/types'

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

/** Plafond du journal : au-delà, les plus anciennes lignes sortent (run très longs). */
const MAX_LOG_LINES = 600

interface DemoExpressState {
  phase: 'form' | 'running' | 'done'
  company: string
  url: string
  /** Volumétrie présélectionnée du formulaire (menu « Scraper N produits »). */
  formVolume: number
  setFormVolume: (n: number) => void
  steps: DemoStep[]
  /** Journal live : actions du pipeline, appels IA, connecteurs (Jina, Drive…). */
  logs: DemoLogLine[]
  links: DemoResultLinks
  abortRequested: boolean
  begin: (company: string, url: string) => void
  updateStep: (id: DemoStepId, patch: Partial<Omit<DemoStep, 'id'>>) => void
  appendLog: (kind: DemoLogKind, text: string) => void
  setLinks: (patch: Partial<DemoResultLinks>) => void
  finish: () => void
  requestAbort: () => void
  reset: () => void
}

const push = (logs: DemoLogLine[], line: DemoLogLine): DemoLogLine[] =>
  [...logs, line].slice(-MAX_LOG_LINES)

export const useDemoExpressStore = create<DemoExpressState>((set) => ({
  phase: 'form',
  company: '',
  url: '',
  formVolume: 12,
  setFormVolume: (n) => set({ formVolume: Math.max(1, Math.min(48, Math.round(n) || 12)) }),
  steps: freshSteps(),
  logs: [],
  links: {},
  abortRequested: false,

  begin: (company, url) =>
    set({ phase: 'running', company, url, steps: freshSteps(), logs: [], links: {}, abortRequested: false }),

  // Chaque nouveau détail d'étape alimente AUSSI le journal (historique complet,
  // là où la checklist n'affiche que le dernier état).
  updateStep: (id, patch) =>
    set((s) => {
      const prev = s.steps.find((st) => st.id === id)
      const steps = s.steps.map((st) => (st.id === id ? { ...st, ...patch } : st))
      const logs = patch.detail && patch.detail !== prev?.detail
        ? push(s.logs, {
            ts: Date.now(),
            kind: patch.status === 'error' ? 'error' : 'step',
            text: `${prev?.label ?? id} — ${patch.detail}`,
          })
        : s.logs
      return { steps, logs }
    }),

  appendLog: (kind, text) => set((s) => ({ logs: push(s.logs, { ts: Date.now(), kind, text }) })),

  setLinks: (patch) => set((s) => ({ links: { ...s.links, ...patch } })),

  finish: () => set({ phase: 'done' }),

  requestAbort: () => set({ abortRequested: true }),

  reset: () => set({ phase: 'form', steps: freshSteps(), logs: [], links: {}, abortRequested: false }),
}))
