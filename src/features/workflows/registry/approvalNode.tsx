// Node « Approbation Telegram » : met le run en PAUSE, envoie la question sur Telegram
// avec des boutons inline ✅/❌, et reprend sur le port `approved` ou `rejected` selon
// le clic. La décision transite par Firestore : le webhook (Function) écrit le verdict
// sur workflowApprovals/{id}, le run client (onSnapshot) reprend aussitôt.
import { UserCheck } from 'lucide-react'
import { doc, onSnapshot, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import {
  sendTelegramMessage,
  sendTelegramDocument,
  answerTelegramCallbackQuery,
  editTelegramMessageReplyMarkup,
  type TelegramInlineKeyboard,
} from '@/lib/telegramApi'
import { useTelegramStore } from '@/stores/telegram.store'
import { useAuthStore } from '@/stores/auth.store'
import { addOutboxMessage } from '@/features/telegram/useTelegramInbox'
import { t } from '@/lib/i18n'

// Doit rester aligné avec APPROVAL_CALLBACK_PREFIX de functions/src/telegram/evaluateUpdate.ts.
const CALLBACK_PREFIX = 'wfappr:'
const CAPTION_MAX = 1024

interface ApprovalConfig {
  botToken: string
  chatId: string
  text: string
  timeoutMin: number
  onTimeout: 'fail' | 'reject'
}

interface ApprovalDecision {
  status: 'approved' | 'rejected'
  decidedBy: string | null
  callbackQueryId?: string
}

/**
 * Attend la décision posée par le webhook sur le doc d'approbation. Résout sur la
 * décision, 'timeout' à l'expiration, ou 'aborted' si le run est interrompu.
 */
function waitForDecision(
  approvalId: string,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<ApprovalDecision | 'timeout' | 'aborted'> {
  return new Promise((resolve, reject) => {
    let done = false
    const finish = (v: ApprovalDecision | 'timeout' | 'aborted') => {
      if (done) return
      done = true
      unsub()
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      resolve(v)
    }
    const unsub = onSnapshot(
      doc(db, 'workflowApprovals', approvalId),
      (snap) => {
        const d = snap.data()
        if (d && (d.status === 'approved' || d.status === 'rejected')) {
          finish({
            status: d.status,
            decidedBy: typeof d.decidedBy === 'string' ? d.decidedBy : null,
            callbackQueryId: typeof d.callbackQueryId === 'string' ? d.callbackQueryId : undefined,
          })
        }
      },
      (err) => {
        if (done) return
        done = true
        clearTimeout(timer)
        signal.removeEventListener('abort', onAbort)
        reject(err)
      },
    )
    const timer = setTimeout(() => finish('timeout'), timeoutMs)
    const onAbort = () => finish('aborted')
    signal.addEventListener('abort', onAbort)
  })
}

const inputCls =
  'w-full bg-background border border-neutral-700 rounded-md px-2 py-1.5 text-[12px] text-white placeholder:text-neutral-600 focus:border-cyan-500 outline-none'

interface ApprovalConfigUiProps {
  config: ApprovalConfig
  onChange: (next: ApprovalConfig) => void
}

function ApprovalConfigUi({ config, onChange }: ApprovalConfigUiProps) {
  return (
    <div className="space-y-3">
      <div className="px-2 py-1.5 rounded-md bg-amber-500/5 border border-amber-500/20 text-[10px] text-amber-200/90 leading-snug">
        Le run se met en <strong>pause</strong> jusqu'au clic ✅/❌ sur Telegram (ou expiration du
        délai). Nécessite le webhook Telegram configuré et le chat dans l'allowlist.
      </div>

      <div>
        <label className="text-xs text-neutral-400 mb-1 block">Bot token</label>
        <input
          type="password"
          autoComplete="off"
          value={config.botToken}
          onChange={(e) => onChange({ ...config, botToken: e.target.value })}
          placeholder="Vide = token global (Settings → Connecteurs)"
          className={inputCls}
        />
      </div>

      <div>
        <label className="text-xs text-neutral-400 mb-1 block">Chat ID</label>
        <input
          type="text"
          value={config.chatId}
          onChange={(e) => onChange({ ...config, chatId: e.target.value })}
          placeholder={t('node.telegram-approval.chatId.placeholder')}
          className={inputCls}
        />
        <p className="text-[10px] text-neutral-600 mt-1.5 leading-snug">
          {t('node.telegram-approval.allowlist.note')}
        </p>
      </div>

      <div>
        <label className="text-xs text-neutral-400 mb-1 block">{t('node.telegram-approval.text.label')}</label>
        <textarea
          value={config.text}
          onChange={(e) => onChange({ ...config, text: e.target.value })}
          rows={4}
          placeholder={t('node.telegram-approval.text.placeholder')}
          className={`${inputCls} resize-y font-mono`}
        />
        <p className="text-[10px] text-neutral-600 mt-1.5 leading-snug">
          {t('node.telegram-approval.attachment.note')}
        </p>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs text-neutral-400 mb-1 block">{t('node.telegram-approval.timeout.label')}</label>
          <input
            type="number"
            min={1}
            value={config.timeoutMin}
            onChange={(e) => onChange({ ...config, timeoutMin: Math.max(1, Number(e.target.value) || 1) })}
            className={inputCls}
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-neutral-400 mb-1 block">{t('node.telegram-approval.onTimeout.label')}</label>
          <select
            value={config.onTimeout}
            onChange={(e) => onChange({ ...config, onTimeout: e.target.value as ApprovalConfig['onTimeout'] })}
            className={inputCls}
          >
            <option value="fail">{t('opt.onTimeout.fail')}</option>
            <option value="reject">{t('opt.onTimeout.reject')}</option>
          </select>
        </div>
      </div>
    </div>
  )
}

const telegramApprovalNode: NodeSpec<
  ApprovalConfig,
  { data?: unknown; attachment?: File | Blob },
  { approved?: unknown; rejected?: unknown }
> = {
  type: 'telegram-approval',
  category: 'communication',
  labelKey: 'node.telegram-approval.label',
  descriptionKey: 'node.telegram-approval.desc',
  icon: UserCheck,
  inputs: [
    { name: 'data', type: 'any' },
    { name: 'attachment', type: 'file' },
  ],
  outputs: [
    { name: 'approved', type: 'any' },
    { name: 'rejected', type: 'any' },
  ],
  configSchema: [],
  defaultConfig: {
    botToken: '',
    chatId: '',
    text: '',
    timeoutMin: 60,
    onTimeout: 'fail',
  },
  runtime: 'client',
  ConfigComponent: ApprovalConfigUi,
  run: async (ctx, config, inputs) => {
    const global = useTelegramStore.getState()
    const botToken = config.botToken.trim() || global.botToken.trim()
    const chatId = config.chatId.trim() || global.chatId.trim()
    if (!botToken) throw new Error(t('run.appr.noBotToken'))
    if (!chatId) throw new Error(t('run.appr.noChatId'))

    const uid = useAuthStore.getState().user?.uid
    if (!uid) throw new Error(t('run.appr.notSignedIn'))

    const text = config.text.trim() || t('run.appr.defaultQuestion')
    const file = inputs.attachment instanceof Blob ? inputs.attachment : null
    const timeoutMs = Math.max(1, config.timeoutMin) * 60_000
    const approvalId = crypto.randomUUID()

    // 1) Doc d'attente AVANT l'envoi : si l'utilisateur clique très vite, le webhook
    // doit déjà trouver le doc en 'pending'.
    await setDoc(doc(db, 'workflowApprovals', approvalId), {
      ownerId: uid,
      status: 'pending',
      question: text,
      chatId,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + timeoutMs),
    })

    // 2) Message Telegram avec boutons inline.
    const replyMarkup: TelegramInlineKeyboard = {
      inline_keyboard: [
        [
          { text: t('run.appr.btnApprove'), callback_data: `${CALLBACK_PREFIX}${approvalId}:approve` },
          { text: t('run.appr.btnReject'), callback_data: `${CALLBACK_PREFIX}${approvalId}:reject` },
        ],
      ],
    }
    const sent = file
      ? await sendTelegramDocument(botToken, { chatId, file, caption: text.slice(0, CAPTION_MAX), parseMode: 'none', replyMarkup })
      : await sendTelegramMessage(botToken, { chatId, text, parseMode: 'none', replyMarkup })
    // Trace dans la boîte Telegram de l'app (best-effort, comme send-telegram).
    void addOutboxMessage(chatId, `🔔 ${text}`, sent.messageId).catch(() => {})
    ctx.log('info', t('run.appr.sent', { chat: chatId, msg: sent.messageId }))

    // 3) Pause jusqu'à décision / expiration / abort.
    const outcome = await waitForDecision(approvalId, timeoutMs, ctx.signal)

    // Nettoyage Telegram best-effort : retirer les boutons pour bloquer les clics tardifs.
    const removeButtons = () =>
      editTelegramMessageReplyMarkup(botToken, { chatId, messageId: sent.messageId }).catch(() => {})

    if (outcome === 'aborted') {
      await updateDoc(doc(db, 'workflowApprovals', approvalId), { status: 'expired' }).catch(() => {})
      await removeButtons()
      throw new Error(t('run.appr.aborted'))
    }

    if (outcome === 'timeout') {
      await updateDoc(doc(db, 'workflowApprovals', approvalId), { status: 'expired' }).catch(() => {})
      await removeButtons()
      if (config.onTimeout === 'reject') {
        ctx.log('warn', t('run.appr.timeoutRejected', { min: config.timeoutMin }))
        return { rejected: inputs.data !== undefined ? inputs.data : { decision: 'timeout' } }
      }
      throw new Error(t('run.appr.timeoutFailed', { min: config.timeoutMin }))
    }

    // Décision reçue : fermer le spinner du bouton (toast Telegram) + retirer les boutons.
    if (outcome.callbackQueryId) {
      void answerTelegramCallbackQuery(botToken, {
        callbackQueryId: outcome.callbackQueryId,
        text: t(outcome.status === 'approved' ? 'run.appr.approvedToast' : 'run.appr.rejectedToast'),
      }).catch(() => {})
    }
    await removeButtons()

    const by = outcome.decidedBy ? t('run.appr.by', { user: outcome.decidedBy }) : ''
    const payload = inputs.data !== undefined ? inputs.data : { decision: outcome.status, decidedBy: outcome.decidedBy }
    if (outcome.status === 'approved') {
      ctx.log('info', t('run.appr.approved', { by }))
      return { approved: payload }
    }
    ctx.log('warn', t('run.appr.rejected', { by }))
    return { rejected: payload }
  },
}

nodeRegistry.register(telegramApprovalNode)
