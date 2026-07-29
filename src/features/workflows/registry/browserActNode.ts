// Node « BrowserAct » : exécute un BOT BrowserAct et rend ses lignes en feuille.
//
// ⚠ Pourquoi un node dédié plutôt qu'un palier de la cascade de scraping : BrowserAct ne
// sait pas lire une URL qu'on lui donne. Il exécute un bot que l'utilisateur a construit
// dans son tableau de bord (Amazon, LinkedIn, sites à anti-bot dur), de façon ASYNCHRONE
// et facturée à la tâche — 1 tâche concurrente en gratuit, 20 en payant. Le brancher dans
// la moisson (des dizaines de pages par passe) coûterait des heures et des crédits ; ici,
// une exécution = une intention explicite de l'utilisateur, avec ses propres paramètres.
//
// Sortie : `sheet` (une ligne par enregistrement rendu par le bot, colonnes déduites de
// l'union des clés) + `text` (sortie brute, pour les bots qui rendent de la prose).
import { Bot } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import type { ExcelSheet } from '@/features/excel/types'
import { getApiKey } from '@/lib/apiKeys'
import { runBrowserActWorkflow, listBrowserActWorkflows } from '@/features/scraping/core/browserAct'
import { parseBotRows } from '@/features/priceWatch/catalog/botListing'
import { parseParamLines, rowsToSheet } from './browserActRows'

interface BrowserActConfig {
  /** Identifiant du bot (tableau de bord BrowserAct → le bot → son ID). */
  workflowId: string
  /** Paramètres d'entrée du bot, une paire `nom = valeur` par ligne. */
  parameters: string
  /** Nom du paramètre alimenté par l'entrée `value` quand elle est branchée. */
  inputParam: string
  /** Budget d'attente en secondes (un bot peut tourner plusieurs minutes). */
  timeoutSec: number
}

interface BrowserActInputs {
  /** Valeur amont (URL, référence, mot-clé) injectée dans le paramètre `inputParam`. */
  value?: unknown
}

interface BrowserActOutputs {
  sheet: ExcelSheet
  text: string
}

const browserActNode: NodeSpec<BrowserActConfig, BrowserActInputs, BrowserActOutputs> = {
  type: 'browseract',
  // 'import' : c'est une SOURCE autonome (un bot rend des données sans entrée amont),
  // donc elle doit pouvoir démarrer un workflow seule.
  category: 'import',
  labelKey: 'node.browseract.label',
  descriptionKey: 'node.browseract.desc',
  icon: Bot,
  connectors: ['browseract'],
  inputs: [{ name: 'value', type: 'any', required: false }],
  outputs: [
    { name: 'sheet', type: 'sheet' },
    { name: 'text', type: 'any' },
  ],
  configSchema: [
    {
      name: 'workflowId', kind: 'text', label: 'ID du bot', required: true,
      help: 'Tableau de bord BrowserAct → votre bot → son identifiant. Le test de la clé (Réglages › Clés API) liste les bots du compte.',
    },
    {
      name: 'parameters', kind: 'textarea', label: 'Paramètres',
      help: 'Une paire « nom = valeur » par ligne, avec les noms définis par le bot (ex. « url = https://… »).',
    },
    {
      name: 'inputParam', kind: 'text', label: 'Paramètre alimenté par l’entrée', default: 'url',
      help: 'Nom du paramètre qui reçoit la valeur branchée en entrée. Elle prime sur la même clé ci-dessus.',
    },
    {
      name: 'timeoutSec', kind: 'number', label: 'Attente max (s)', default: 300,
      help: 'Un bot navigue réellement le site : compter des minutes, pas des secondes.',
    },
  ],
  defaultConfig: { workflowId: '', parameters: '', inputParam: 'url', timeoutSec: 300 },
  // 'client' tant que le canal navigateur n'est pas confirmé par un appel authentifié réel
  // (cf. l'hypothèse CORS dans `browserAct.ts`). ⚠ Conséquence assumée : ce node ne tourne
  // PAS dans `executeWorkflowHeadless`, donc ni en cron, ni par webhook, ni depuis Telegram.
  // L'ouvrir au serveur demande un jumeau côté functions lisant la clé par `getUserApiKey`,
  // sur le modèle de `workflow/nodes/harvestCompetitor.ts`.
  runtime: 'client',
  cardSummary: (config) => (config.workflowId ? `bot ${config.workflowId.slice(0, 12)}` : 'bot non choisi'),
  run: async (ctx, config, inputs) => {
    const apiKey = getApiKey('browseract').trim()
    if (!apiKey) {
      throw new Error('Clé API BrowserAct manquante — Réglages › Clés API.')
    }
    const workflowId = (config.workflowId ?? '').trim()
    if (!workflowId) {
      // Panne la plus probable : l'utilisateur ne sait pas où trouver l'ID. On le lui donne.
      const bots = await listBrowserActWorkflows(apiKey, 20)
      const hint = bots?.length
        ? ` Bots disponibles : ${bots.map((b) => `${b.name} (${b.id})`).join(', ')}`
        : ''
      throw new Error(`ID du bot BrowserAct manquant.${hint}`)
    }

    const params = parseParamLines(config.parameters ?? '')
    const upstream = inputs.value
    const injected = typeof upstream === 'string' ? upstream.trim()
      : typeof upstream === 'number' ? String(upstream) : ''
    const inputParam = (config.inputParam ?? '').trim()
    if (injected && inputParam) params[inputParam] = injected

    const timeoutMs = Math.max(30, Number(config.timeoutSec) || 300) * 1000
    ctx.log('info', `🤖 BrowserAct : lancement du bot ${workflowId}${Object.keys(params).length ? ` (${Object.entries(params).map(([k, v]) => `${k}=${v}`).join(', ')})` : ''}…`)

    const result = await runBrowserActWorkflow(apiKey, workflowId, params, {
      timeoutMs,
      log: (m) => ctx.log('info', m),
    })
    if (!result) {
      throw new Error(`BrowserAct n’a pas pu lancer le bot ${workflowId} (clé refusée ou ID inconnu ?).`)
    }
    if (result.status !== 'finished') {
      throw new Error(
        `Bot BrowserAct « ${result.status} »${result.error ? ` : ${result.error}` : ''}` +
        (result.status === 'running' ? ` — augmentez l’attente max (actuellement ${config.timeoutSec} s).` : ''),
      )
    }

    const rows = parseBotRows(result.output)
    if (rows.length === 0) {
      // La sortie n'est pas exploitable en tableau : on ne fabrique PAS de demi-feuille,
      // on rend le texte brut pour que l'utilisateur voie ce que son bot a produit.
      ctx.log('warn', '⚠️ Sortie du bot non tabulaire — renvoyée telle quelle dans « text ».')
      return { sheet: rowsToSheet([], 'BrowserAct'), text: result.output ?? '' }
    }
    ctx.log('info', `✓ ${rows.length} ligne(s) récupérée(s)${result.credit != null ? ` — ${result.credit} crédit(s)` : ''}.`)
    return { sheet: rowsToSheet(rows, 'BrowserAct'), text: result.output ?? '' }
  },
}

nodeRegistry.register(browserActNode)
