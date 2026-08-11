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
import { PairingRulesConfigPanel } from './pairingRulesConfig'
import { getWorkspaceUid } from '@/features/access/useWorkspaceUid'
// `run()` n'est pas un composant : helper `t()` de module (lit la locale courante).
import { t } from '@/lib/i18n'

interface RulesInputs { sites?: unknown }
type RulesOutputs = { rules: { watchId: string } }

/** Libellés COURTS des preuves, pour le résumé de carte et la palette. L'arbre, lui, tire
 *  les siens du catalogue i18n. Conservé comme garde-fou : une preuve ajoutée au moteur
 *  sans l'être ici serait invisible dans la brique, donc impossible à couper — le test de
 *  ce module vérifie que les deux listes coïncident. */
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
  // Tout est rendu par le ConfigComponent : l'arbre de décision, ses poids réels et
  // l'aperçu. Un schéma non vide empilerait la liste générique par-dessus.
  configSchema: [],
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
  ConfigComponent: PairingRulesConfigPanel,
  runtime: 'client',
  run: async (ctx, config, inputs) => {
    const uid = getWorkspaceUid()
    if (!uid) throw new Error(t('run.notSignedIn'))
    const { watchId, fromPort } = resolveSitesInput(inputs.sites, {
      sitesText: '', watchIdRaw: config.watchId, workflowId: ctx.workflowId,
    })
    // ⚠ Le port est branché mais son contenu n'est PAS un payload « Sites sources » :
    // l'amont a échoué ou émis autre chose. On retomberait alors sur un watchId dérivé de
    // l'identifiant du workflow — un AUTRE suivi que celui de la moisson, où les règles
    // s'écriraient pour ne s'appliquer nulle part. Et le champ « Identifiant du suivi »
    // étant grisé dès que le port est câblé, l'utilisateur n'a aucun moyen de le voir.
    if (inputs.sites != null && !fromPort) {
      throw new Error(t('run.pairingRules.badPortPayload'))
    }
    // Journalisé DANS TOUS LES CAS : des règles écrites sous le mauvais identifiant sont
    // parfaitement silencieuses — elles ne cassent rien, elles ne servent simplement à rien.
    ctx.log('info', fromPort
      ? t('run.pairingRules.watchFromPort', { watchId })
      : t('run.pairingRules.watchLocal', { watchId }))

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
    // Chiffre de la carte sur l'écran « Suivi » — jumeau du node serveur.
    ctx.reportCount?.(Object.keys(summarizeRules(rules)).length)
    return { rules: { watchId } }
  },
}

nodeRegistry.register(pairingRulesNode)
