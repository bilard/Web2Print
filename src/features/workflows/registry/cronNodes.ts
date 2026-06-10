// src/features/workflows/registry/cronNodes.ts
import { CalendarClock } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import { describeCron, type CronConfig } from '../runtime/cronSchedule'

const SERVER_UNITS = [
  { value: 'hour', label: 'heure(s)' },
  { value: 'day', label: 'jour(s)' },
  { value: 'week', label: 'semaine(s)' },
  { value: 'month', label: 'mois' },
]

const cronNode: NodeSpec<CronConfig, Record<string, never>, { tick: { at: string } }> = {
  type: 'cron',
  category: 'import',
  label: 'Cron (planifié)',
  description:
    "Déclencheur planifié : exécute le workflow côté serveur à intervalle régulier (toutes les heures / jours / semaines / mois). Active « Planification » et sauvegarde pour enregistrer le cron.",
  icon: CalendarClock,
  inputs: [],
  outputs: [{ name: 'tick', type: 'any' }],
  configSchema: [
    { name: 'enabled', kind: 'checkbox', label: 'Planification active' },
    { name: 'every', kind: 'number', label: 'Tous les', default: 1 },
    { name: 'unit', kind: 'select', label: 'Unité', options: SERVER_UNITS, default: 'day' },
  ],
  defaultConfig: { enabled: false, every: 1, unit: 'day' },
  runtime: 'server',
  run: async (ctx, config) => {
    const at = new Date().toISOString()
    ctx.log('info', `Tick cron (tous les ${describeCron(config)}).`)
    return { tick: { at } }
  },
}

nodeRegistry.register(cronNode)
