// src/features/workflows/registry/telegramNodes.tsx
import { Send } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import {
  sendTelegramMessage,
  sendTelegramDocument,
  type TelegramParseMode,
} from '@/lib/telegramApi'
import { interpolate } from '../runtime/interpolate'
import { extractRows } from '../runtime/executor'

// Limite Telegram pour une légende de document.
const CAPTION_MAX = 1024

interface SendTelegramConfig {
  botToken: string
  chatId: string
  text: string
  parseMode: TelegramParseMode
  iterate: boolean
}

interface SendTelegramOutput {
  sent: boolean
  count: number
  messageIds: number[]
}

interface SendTelegramConfigUiProps {
  config: SendTelegramConfig
  onChange: (next: SendTelegramConfig) => void
}

const inputCls =
  'w-full bg-[#0f0f0f] border border-neutral-700 rounded-md px-2 py-1.5 text-[12px] text-white placeholder:text-neutral-600 focus:border-cyan-500 outline-none'

function SendTelegramConfigUi({ config, onChange }: SendTelegramConfigUiProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-neutral-400 mb-1 block">Bot token</label>
        <input
          type="password"
          autoComplete="off"
          value={config.botToken}
          onChange={(e) => onChange({ ...config, botToken: e.target.value })}
          placeholder="123456789:ABCdef..."
          className={inputCls}
        />
        <div className="text-[10px] text-neutral-600 mt-1.5 leading-snug space-y-1.5">
          <p>
            Crée un bot via{' '}
            <a
              href="https://t.me/BotFather"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2"
            >
              @BotFather
            </a>{' '}
            et colle le token ici.
          </p>
          <div className="px-2 py-1.5 rounded-md bg-amber-500/5 border border-amber-500/20 text-amber-200/90">
            Ce token est enregistré <strong>avec le workflow</strong>. Ne partage pas /
            n'exporte pas un workflow contenant un token que tu veux garder secret.
          </div>
        </div>
      </div>

      <div>
        <label className="text-xs text-neutral-400 mb-1 block">Chat ID</label>
        <input
          type="text"
          value={config.chatId}
          onChange={(e) => onChange({ ...config, chatId: e.target.value })}
          placeholder="123456789, @nomducanal (ou {{id}})"
          className={inputCls}
        />
        <p className="text-[10px] text-neutral-600 mt-1.5 leading-snug">
          Parle d'abord à ton bot, puis récupère ton chat_id via{' '}
          <a
            href="https://t.me/userinfobot"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2"
          >
            @userinfobot
          </a>
          . Pour un canal public : <code className="text-amber-300/80">@nomducanal</code>.
        </p>
      </div>

      <div>
        <label className="text-xs text-neutral-400 mb-1 block">Message</label>
        <textarea
          value={config.text}
          onChange={(e) => onChange({ ...config, text: e.target.value })}
          rows={5}
          placeholder={'Texte du message. Utilise {{NomColonne}} pour insérer une valeur.'}
          className={`${inputCls} resize-y font-mono`}
        />
        <p className="text-[10px] text-neutral-600 mt-1.5 leading-snug">
          Si le port <code className="text-emerald-300/80">attachment</code> est connecté, le
          fichier est envoyé en pièce jointe et ce texte sert de légende (max {CAPTION_MAX}{' '}
          caractères).
        </p>
      </div>

      <div>
        <label className="text-xs text-neutral-400 mb-1 block">Format (parse_mode)</label>
        <select
          value={config.parseMode}
          onChange={(e) =>
            onChange({ ...config, parseMode: e.target.value as TelegramParseMode })
          }
          className={inputCls}
        >
          <option value="none">Aucun</option>
          <option value="HTML">HTML</option>
          <option value="MarkdownV2">MarkdownV2</option>
        </select>
      </div>

      <label className="flex items-start gap-2 px-2 py-2 rounded-md border border-cyan-500/20 bg-cyan-500/5 cursor-pointer hover:bg-cyan-500/10 transition-colors">
        <input
          type="checkbox"
          checked={config.iterate}
          onChange={(e) => onChange({ ...config, iterate: e.target.checked })}
          className="accent-cyan-500 mt-0.5"
        />
        <div className="flex-1">
          <div className="text-[12px] text-cyan-200">Envoyer 1 message par ligne</div>
          <div className="text-[10px] text-neutral-500 leading-snug mt-0.5">
            Si l'entrée <code className="text-emerald-300/80">data</code> est un tableau de
            lignes, envoie un message par ligne (le <code>{'{{...}}'}</code> est réévalué pour
            chaque ligne). Sinon, un message unique.
          </div>
        </div>
      </label>
    </div>
  )
}

export const sendTelegramNode: NodeSpec<
  SendTelegramConfig,
  { data?: unknown; attachment?: File | Blob },
  { result: SendTelegramOutput }
> = {
  type: 'send-telegram',
  category: 'communication',
  label: 'Envoyer via Telegram',
  description:
    "Envoie un message (et un fichier optionnel) vers un chat Telegram via un bot. Appel direct à l'API, aucun backend.",
  icon: Send,
  inputs: [
    { name: 'data', type: 'any' },
    { name: 'attachment', type: 'file' },
  ],
  outputs: [{ name: 'result', type: 'any' }],
  configSchema: [],
  defaultConfig: {
    botToken: '',
    chatId: '',
    text: '',
    parseMode: 'none',
    iterate: false,
  },
  runtime: 'client',
  ConfigComponent: SendTelegramConfigUi,
  run: async (ctx, config, inputs) => {
    if (!config.botToken?.trim()) {
      throw new Error('Bot token Telegram manquant. Renseigne-le dans la config du node.')
    }

    const file = inputs.attachment instanceof Blob ? inputs.attachment : null
    const rawConfig = ctx.rawConfig as SendTelegramConfig | undefined
    const inputRows = extractRows(inputs.data)

    // Mode iterate : 1 message par ligne (ré-interpolation par row, comme send-gmail).
    if (config.iterate && !inputRows) {
      ctx.log(
        'warn',
        "Mode « 1 message par ligne » activé mais aucune ligne en entrée (port data) — envoi d'un message unique.",
      )
    }

    if (config.iterate && inputRows && rawConfig) {
      if (inputRows.length === 0) {
        ctx.log('warn', 'Mode "1 message par ligne" activé mais le tableau d\'entrée est vide.')
        return { result: { sent: true, count: 0, messageIds: [] } }
      }
      ctx.log('info', `Mode iterate : envoi de ${inputRows.length} messages…`)
      const messageIds: number[] = []
      for (let i = 0; i < inputRows.length; i++) {
        if (ctx.signal.aborted) {
          ctx.log('warn', `Run interrompu après ${messageIds.length} messages.`)
          break
        }
        const row = inputRows[i]
        const r = interpolate(rawConfig, { ...row, row, index: i })
        if (!r.chatId?.trim()) {
          ctx.log('warn', `Ligne ${i + 1} ignorée : chat_id vide après interpolation.`)
          continue
        }
        try {
          const out = file
            ? await sendTelegramDocument(r.botToken, {
                chatId: r.chatId,
                file,
                caption: r.text.slice(0, CAPTION_MAX),
                parseMode: r.parseMode,
              })
            : await sendTelegramMessage(r.botToken, {
                chatId: r.chatId,
                text: r.text,
                parseMode: r.parseMode,
              })
          messageIds.push(out.messageId)
          ctx.log('info', `[${i + 1}/${inputRows.length}] → ${r.chatId} (msg ${out.messageId})`)
        } catch (err) {
          ctx.log(
            'warn',
            `Ligne ${i + 1} échouée : ${err instanceof Error ? err.message : String(err)}`,
          )
        }
      }
      return { result: { sent: true, count: messageIds.length, messageIds } }
    }

    // Mode message unique.
    if (!config.chatId?.trim()) {
      throw new Error('Chat ID Telegram manquant.')
    }
    const out = file
      ? await sendTelegramDocument(config.botToken, {
          chatId: config.chatId,
          file,
          caption: config.text.slice(0, CAPTION_MAX),
          parseMode: config.parseMode,
        })
      : await sendTelegramMessage(config.botToken, {
          chatId: config.chatId,
          text: config.text,
          parseMode: config.parseMode,
        })
    ctx.log('info', `Message Telegram envoyé → ${config.chatId} (msg ${out.messageId}).`)
    return { result: { sent: true, count: 1, messageIds: [out.messageId] } }
  },
}

nodeRegistry.register(sendTelegramNode)
