// Node « Cadence d'envoi » : laisse passer ce qui le traverse SEULEMENT aux moments
// voulus — le lundi à 8 h, une fois par semaine, une fois par mois…
//
// Pourquoi une carte, et pas le node Cron : celui-ci planifie le WORKFLOW entier. Un
// workflow de veille qui tourne toutes les trente minutes pour rafraîchir ses prix ne doit
// pas poster quarante-huit mails par jour. Cette carte se place JUSTE AVANT l'envoi et
// suspend tout ce qui la suit hors créneau — le run reste vert : rien n'a échoué, il n'y
// avait pas lieu d'agir.
//
// La mémoire du dernier envoi vit dans Firestore, PAS dans la config : le cron et le
// navigateur doivent voir la même chose, sinon chacun enverrait son mail.
import { CalendarCheck } from 'lucide-react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import { getWorkspaceUid } from '@/features/access/useWorkspaceUid'
import {
  evaluateWindow, describeWindow, DEFAULT_SEND_WINDOW, type SendFrequency, type SendWindowConfig,
} from '../runtime/sendWindow'
import { t } from '@/lib/i18n'

interface SendWindowNodeConfig {
  frequency: SendFrequency
  atTime: string
  /** Jours autorisés, saisis « 1,2,3,4,5 » (0 = dimanche). Vide = tous les jours. */
  weekdays: string
  timeZone: string
  /** Distingue deux cadences d'un même workflow (ex. « hebdo » et « mensuel »). */
  key: string
}

const FREQUENCIES = [
  { value: 'always', label: 'À chaque run (dans le créneau)' },
  { value: 'daily', label: 'Une fois par jour' },
  { value: 'weekly', label: 'Une fois par semaine' },
  { value: 'monthly', label: 'Une fois par mois' },
]

/** Chemin de la mémoire d'envoi. Une entrée par workflow et par clé de cadence. */
const stateDoc = (uid: string, workflowId: string, key: string) =>
  `users/${uid}/sendWindows/${workflowId}__${key || 'default'}`

function toConfig(c: SendWindowNodeConfig): SendWindowConfig {
  const weekdays = String(c.weekdays ?? '')
    .split(/[,\s]+/).map((v) => Number(v)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
  return {
    frequency: (c.frequency ?? DEFAULT_SEND_WINDOW.frequency) as SendFrequency,
    atTime: (c.atTime ?? '').trim(),
    weekdays,
    timeZone: (c.timeZone ?? '').trim() || DEFAULT_SEND_WINDOW.timeZone,
  }
}

const sendWindowNode: NodeSpec<SendWindowNodeConfig, { value: unknown }, { value: unknown }> = {
  type: 'send-window',
  category: 'logic',
  labelKey: 'node.send-window.label',
  descriptionKey: 'node.send-window.desc',
  icon: CalendarCheck,
  inputs: [{ name: 'value', type: 'any' }],
  outputs: [{ name: 'value', type: 'any' }],
  configSchema: [
    { name: 'frequency', kind: 'select', labelKey: 'node.send-window.freq.label', options: FREQUENCIES, default: 'daily' },
    { name: 'atTime', kind: 'text', labelKey: 'node.send-window.atTime.label', helpKey: 'node.send-window.atTime.help' },
    { name: 'weekdays', kind: 'text', labelKey: 'node.send-window.weekdays.label', helpKey: 'node.send-window.weekdays.help' },
    { name: 'timeZone', kind: 'text', labelKey: 'node.send-window.tz.label', helpKey: 'node.send-window.tz.help' },
    { name: 'key', kind: 'text', labelKey: 'node.send-window.key.label', helpKey: 'node.send-window.key.help' },
  ],
  defaultConfig: {
    frequency: 'daily', atTime: '08:00', weekdays: '1,2,3,4,5',
    timeZone: DEFAULT_SEND_WINDOW.timeZone, key: '',
  },
  runtime: 'client',
  cardSummary: (c) => describeWindow(toConfig(c)),
  run: async (ctx, config, inputs) => {
    const uid = getWorkspaceUid()
    if (!uid) throw new Error(t('run.notSignedIn'))
    const cfg = toConfig(config)
    const ref = doc(db, stateDoc(uid, ctx.workflowId ?? 'wf', config.key))
    const lastKey = (await getDoc(ref).catch(() => null))?.data()?.lastKey as string | undefined

    const verdict = evaluateWindow(new Date(), cfg, lastKey ?? null)
    if (!verdict.open) {
      // ⚠ `skip` et non une erreur : ne pas envoyer est le comportement NORMAL hors
      // créneau. Marquer le run en échec ferait sonner une alerte chaque demi-heure.
      ctx.skip?.(t('run.sendWindow.closed', { reason: verdict.reason }))
      return { value: undefined }
    }
    // Mémorisé AVANT de laisser passer : si l'envoi échoue en aval, mieux vaut un mail
    // manqué qu'un mail envoyé deux fois — un doublon se remarque, une absence se rattrape
    // au créneau suivant.
    await setDoc(ref, { lastKey: verdict.key, at: Date.now() }, { merge: true }).catch(() => {})
    ctx.log('info', t('run.sendWindow.open', { key: verdict.key }))
    return { value: inputs.value }
  },
}

nodeRegistry.register(sendWindowNode)
