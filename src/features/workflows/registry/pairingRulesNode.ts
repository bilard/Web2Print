// Node « Règles d'appariement » : la partition du moteur de veille tarifaire — quelles
// clés essayer, quelles preuves acceptent un rapprochement, quels démentis le refusent.
//
// ⚠ Le node ÉCRIT les règles en Firestore ; il ne les transporte pas sur son port. Ses
// consommateurs ne sont pas tous joignables par un edge : l'écran « Concurrents »
// n'appartient à aucun workflow, la passe Kramp tourne côté serveur, et les crons ne
// voient jamais la config d'un node client. Un réglage porté par le seul port ne
// s'appliquerait qu'à moitié — exactement le piège déjà rencontré avec le budget de pages.
//
// Le port `rules` existe malgré tout, mais pour l'ORDONNANCEMENT : le brancher sur
// « Comparer catalogue » garantit que les règles sont écrites AVANT que la comparaison ne
// les relise, dans un même run.
import { SlidersHorizontal } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import { resolveSitesInput } from '@/features/priceWatch/sourceSites'
import { savePairingRules } from '@/features/priceWatch/pairingRulesStore'
import {
  configToRules, DEFAULT_RULES_CONFIG, type PairingRulesConfig,
} from '@/features/priceWatch/pairingRulesConfig'
import { MATCH_EVIDENCES, rulesDifferFromDefault, summarizeRules } from '@/features/priceWatch/catalog/pairingRules'
import { getWorkspaceUid } from '@/features/access/useWorkspaceUid'
// `run()` n'est pas un composant : helper `t()` de module (lit la locale courante).
import { t } from '@/lib/i18n'

interface RulesInputs { sites?: unknown }
type RulesOutputs = { rules: { watchId: string } }

/** Libellés des preuves — mêmes valeurs que `MATCH_EVIDENCES`, dans le même ordre. Une
 *  preuve ajoutée au moteur sans l'être ici deviendrait invisible dans le node, donc
 *  impossible à couper : le test de ce module vérifie que les deux listes coïncident. */
export const EVIDENCE_LABELS: Record<string, string> = {
  gtin13: 'Code-barres déclaré (toujours actif)',
  'ean-in-url': 'Code-barres dans l’adresse',
  sku: 'Référence déclarée (sku)',
  mpn: 'Référence constructeur (mpn)',
  'ref-in-name': 'Référence en tête de libellé',
  'ref-in-url': 'Référence dans l’adresse',
  'ref-in-title': 'Référence ailleurs dans le libellé',
}

const pairingRulesNode: NodeSpec<PairingRulesConfig, RulesInputs, RulesOutputs> = {
  type: 'pairing-rules',
  category: 'logic',
  labelKey: 'node.pairing-rules.label',
  descriptionKey: 'node.pairing-rules.desc',
  icon: SlidersHorizontal,
  // Port `sites` : brancher « Sites sources » fixe l'identifiant du suivi, comme pour la
  // moisson et le comparatif. Écrire les règles sous un AUTRE watchId revient à ne rien
  // régler du tout, et c'est invisible — mieux vaut hériter que retaper.
  inputs: [{ name: 'sites', type: 'sites' }],
  outputs: [{ name: 'rules', type: 'rules' }],
  configSchema: [
    {
      name: 'watchId', kind: 'text', labelKey: 'node.pairing-rules.watchId.label',
      helpKey: 'node.pairing-rules.watchId.help',
      disabledWhen: (_c, wired) => wired('sites'),
      disabledNoteKey: 'node.pairing-rules.f1',
    },
    {
      name: 'evidence', kind: 'multiSelect',
      labelKey: 'node.pairing-rules.evidence.label', helpKey: 'node.pairing-rules.evidence.help',
      options: MATCH_EVIDENCES.map((e) => ({ value: e, label: EVIDENCE_LABELS[e] })),
    },
    { name: 'useOriginRefs', kind: 'checkbox', labelKey: 'node.pairing-rules.useOriginRefs.label', helpKey: 'node.pairing-rules.useOriginRefs.help' },
    { name: 'minRefLen', kind: 'number', labelKey: 'node.pairing-rules.minRefLen.label', helpKey: 'node.pairing-rules.minRefLen.help' },
    { name: 'weakRefLen', kind: 'number', labelKey: 'node.pairing-rules.weakRefLen.label', helpKey: 'node.pairing-rules.weakRefLen.help' },
    { name: 'familyVeto', kind: 'checkbox', labelKey: 'node.pairing-rules.familyVeto.label', helpKey: 'node.pairing-rules.familyVeto.help' },
    { name: 'extraFamilies', kind: 'textarea', labelKey: 'node.pairing-rules.extraFamilies.label', helpKey: 'node.pairing-rules.extraFamilies.help' },
    { name: 'priceAbyssRatio', kind: 'number', labelKey: 'node.pairing-rules.priceAbyssRatio.label', helpKey: 'node.pairing-rules.priceAbyssRatio.help' },
    { name: 'corroborateNumericKeys', kind: 'checkbox', labelKey: 'node.pairing-rules.corroborate.label', helpKey: 'node.pairing-rules.corroborate.help' },
    { name: 'unifyDirectedVetoes', kind: 'checkbox', labelKey: 'node.pairing-rules.unify.label', helpKey: 'node.pairing-rules.unify.help' },
    { name: 'alignedPct', kind: 'number', labelKey: 'node.pairing-rules.alignedPct.label', helpKey: 'node.pairing-rules.alignedPct.help' },
    { name: 'minPriceEur', kind: 'number', labelKey: 'node.pairing-rules.minPriceEur.label', helpKey: 'node.pairing-rules.minPriceEur.help' },
    { name: 'maxDropPct', kind: 'number', labelKey: 'node.pairing-rules.maxDropPct.label', helpKey: 'node.pairing-rules.maxDropPct.help' },
  ],
  defaultConfig: DEFAULT_RULES_CONFIG,
  cardSummary: (c) => {
    const rules = configToRules(c)
    if (!rulesDifferFromDefault(rules)) return t('node.pairing-rules.summaryDefault')
    const off = MATCH_EVIDENCES.filter((e) => !rules.evidence[e]).length
    const parts: string[] = []
    if (off > 0) parts.push(t('node.pairing-rules.summaryEvidenceOff', { count: off }))
    if (!rules.familyVeto) parts.push(t('node.pairing-rules.summaryNoFamilyVeto'))
    if (rules.unifyDirectedVetoes) parts.push(t('node.pairing-rules.summaryUnified'))
    const extra = Object.keys(rules.extraFamilies).length
    if (extra > 0) parts.push(t('node.pairing-rules.summaryExtraFamilies', { count: extra }))
    return parts.length > 0 ? parts.join(' · ') : t('node.pairing-rules.summaryTuned')
  },
  runtime: 'client',
  run: async (ctx, config, inputs) => {
    const uid = getWorkspaceUid()
    if (!uid) throw new Error(t('run.notSignedIn'))
    const { watchId, fromPort } = resolveSitesInput(inputs.sites, {
      sitesText: '', watchIdRaw: config.watchId, workflowId: ctx.workflowId,
    })
    if (fromPort) ctx.log('info', t('run.pairingRules.watchFromPort', { watchId }))

    const rules = configToRules(config)
    await savePairingRules(uid, watchId, rules, 'node')

    // Le jeu effectif est JOURNALISÉ, pas seulement écrit : un rapport dont on ne sait pas
    // sous quelles règles il a été produit n'est comparable à aucun autre.
    if (rulesDifferFromDefault(rules)) {
      ctx.log('info', t('run.pairingRules.saved', {
        watchId, summary: JSON.stringify(summarizeRules(rules)),
      }))
      // Un chemin d'appariement qui n'applique pas les mêmes démentis que la matrice peut
      // persister une fiche que le comparatif refusera ensuite — le compteur de trouvailles
      // dit alors autre chose que le rapport. On le signale tant que ce n'est pas aligné.
      if (!rules.unifyDirectedVetoes) ctx.log('info', t('run.pairingRules.asymmetric'))
    } else {
      ctx.log('info', t('run.pairingRules.savedDefault', { watchId }))
    }
    return { rules: { watchId } }
  },
}

nodeRegistry.register(pairingRulesNode)
