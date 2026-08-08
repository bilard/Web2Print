// functions/src/workflow/nodes/pairingRules.ts
// Jumeau SERVEUR (headless/cron) du node « Règles d'appariement »
// (src/features/workflows/registry/pairingRulesNode.ts).
//
// ⚠ Sans lui, le cron s'arrête sur « Type inconnu : pairing-rules » et marque le node en
// erreur — ce qui SAUTE tout ce qui en dépend. Un node branché en amont de « Comparer
// catalogue » y aurait donc supprimé la comparaison à chaque run planifié, alors qu'elle
// marchait la veille. C'est la panne exacte que `serverTwins.test.ts` existe pour empêcher.
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { registerServerNode } from '../registry'
import { deriveWatchId, isSourceSitesPayload } from '../../priceWatch/sourceSites'
import { pairingRulesDoc } from '../../priceWatch/paths'
import { configToRules } from '../../priceWatch/pairingRulesConfig'
import { rulesDifferFromDefault, summarizeRules } from '../../priceWatch/catalog/pairingRules'
import { t } from '../../i18n'

registerServerNode({
  type: 'pairing-rules',
  run: async (ctx, config, inputs) => {
    // Même règle que le client : le port `sites` fixe l'identifiant du suivi. Un port
    // branché mais vide viendrait d'un amont en échec ; écrire alors sous un watchId
    // dérivé du workflow rangerait les règles à côté du suivi que la moisson alimente,
    // où elles ne s'appliqueraient jamais.
    const port = (inputs as { sites?: unknown } | undefined)?.sites
    if (port != null && !isSourceSitesPayload(port)) {
      throw new Error(t(ctx.locale, 'run.pairingRules.badPortPayload'))
    }
    const watchId = isSourceSitesPayload(port)
      ? port.watchId
      : deriveWatchId(String(config.watchId ?? ''), ctx.workflowId)

    const rules = configToRules(config as Parameters<typeof configToRules>[0])
    await getFirestore().doc(pairingRulesDoc(ctx.uid, watchId)).set({
      rules, updatedAt: Date.now(), updatedBy: 'node', touchedAt: FieldValue.serverTimestamp(),
    }, { merge: true })

    if (rulesDifferFromDefault(rules)) {
      ctx.log('info', t(ctx.locale, 'run.pairingRules.saved', {
        watchId, summary: JSON.stringify(summarizeRules(rules)),
      }))
      if (!rules.unifyDirectedVetoes) ctx.log('info', t(ctx.locale, 'run.pairingRules.asymmetric'))
    } else {
      ctx.log('info', t(ctx.locale, 'run.pairingRules.savedDefault', { watchId }))
    }
    return { rules: { watchId } }
  },
})
