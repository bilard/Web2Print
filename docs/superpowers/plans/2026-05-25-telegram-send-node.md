# Node « Envoyer vers Telegram » — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un node de workflow `send-telegram` qui pousse un message texte et/ou un fichier vers un chat Telegram, depuis le navigateur, sans backend.

**Architecture:** Une couche d'accès `src/lib/telegramApi.ts` (fonctions pures `fetch` vers `api.telegram.org`, qui renvoie `Access-Control-Allow-Origin: *`) et un node `src/features/workflows/registry/telegramNodes.tsx` calqué sur `send-gmail` : runtime `client`, interpolation `{{Colonne}}` via le runtime existant, port `attachment` pour les fichiers, mode itératif « 1 message par ligne ». Le bot token vit dans la config du node (choix utilisateur ; risque documenté dans le spec).

**Tech Stack:** TypeScript strict, React 18, Vitest (jsdom, globals), API Bot Telegram (`sendMessage` JSON, `sendDocument` FormData).

**Spec de référence:** `docs/superpowers/specs/2026-05-25-telegram-send-node-design.md`

---

## File Structure

- **Create** `src/lib/telegramApi.ts` — couche réseau Telegram. Responsabilité unique : construire et émettre les requêtes `sendMessage` / `sendDocument`, parser la réponse en `{ messageId }` ou lever une `Error` lisible. Aucune dépendance à React ou au runtime workflows.
- **Create** `src/lib/telegramApi.test.ts` — tests unitaires de la couche réseau (fetch mocké).
- **Create** `src/features/workflows/registry/telegramNodes.tsx` — `NodeSpec` `send-telegram` : types de config, composant d'UI de config, fonction `run`, auto-enregistrement. Responsabilité unique : le node Telegram.
- **Create** `src/features/workflows/registry/telegramNodes.test.ts` — tests de la logique `run` (telegramApi mocké).
- **Modify** `src/features/workflows/registry/builtin.ts` — une ligne d'import à effet de bord.

---

## Task 1 : Couche réseau `telegramApi.ts`

**Files:**
- Create: `src/lib/telegramApi.ts`
- Test: `src/lib/telegramApi.test.ts`

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `src/lib/telegramApi.test.ts` :

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendTelegramMessage, sendTelegramDocument } from './telegramApi'

function mockFetch(json: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(json),
  } as unknown as Response)
}

describe('telegramApi', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('sendTelegramMessage POST sendMessage avec chat_id + text', async () => {
    const fetchMock = mockFetch({ ok: true, result: { message_id: 42 } })
    vi.stubGlobal('fetch', fetchMock)

    const out = await sendTelegramMessage('TKN', { chatId: '123', text: 'hello' })

    expect(out).toEqual({ messageId: 42 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.telegram.org/botTKN/sendMessage')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ chat_id: '123', text: 'hello' })
  })

  it("n'ajoute parse_mode que s'il vaut HTML ou MarkdownV2", async () => {
    const fetchMock = mockFetch({ ok: true, result: { message_id: 1 } })
    vi.stubGlobal('fetch', fetchMock)

    await sendTelegramMessage('TKN', { chatId: '1', text: 't', parseMode: 'none' })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).not.toHaveProperty('parse_mode')

    await sendTelegramMessage('TKN', { chatId: '1', text: 't', parseMode: 'HTML' })
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string).parse_mode).toBe('HTML')
  })

  it('sendTelegramDocument envoie un FormData avec le fichier', async () => {
    const fetchMock = mockFetch({ ok: true, result: { message_id: 7 } })
    vi.stubGlobal('fetch', fetchMock)

    const file = new File(['data'], 'export.pdf', { type: 'application/pdf' })
    const out = await sendTelegramDocument('TKN', { chatId: '9', file, caption: 'voici' })

    expect(out).toEqual({ messageId: 7 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.telegram.org/botTKN/sendDocument')
    const form = init.body as FormData
    expect(form).toBeInstanceOf(FormData)
    expect(form.get('chat_id')).toBe('9')
    expect(form.get('caption')).toBe('voici')
    expect(form.get('document')).toBeInstanceOf(File)
  })

  it('lève une Error lisible quand ok:false', async () => {
    const fetchMock = mockFetch({ ok: false, error_code: 400, description: 'chat not found' })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      sendTelegramMessage('TKN', { chatId: 'x', text: 't' }),
    ).rejects.toThrow('Telegram API 400 : chat not found')
  })
})
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run src/lib/telegramApi.test.ts`
Expected: FAIL — `Failed to resolve import "./telegramApi"` (le module n'existe pas encore).

- [ ] **Step 3 : Implémenter `telegramApi.ts`**

Créer `src/lib/telegramApi.ts` :

```ts
// src/lib/telegramApi.ts
// Couche d'accès à l'API Bot Telegram. Appels fetch directs depuis le navigateur :
// api.telegram.org renvoie Access-Control-Allow-Origin: *, donc pas de proxy.

const API_BASE = 'https://api.telegram.org'

export type TelegramParseMode = 'none' | 'HTML' | 'MarkdownV2'

export interface SendTelegramMessageOptions {
  chatId: string
  text: string
  parseMode?: TelegramParseMode
}

export interface SendTelegramDocumentOptions {
  chatId: string
  file: File | Blob
  caption?: string
  parseMode?: TelegramParseMode
}

interface TelegramOk {
  ok: true
  result: { message_id: number }
}
interface TelegramErr {
  ok: false
  error_code: number
  description: string
}

async function parseTelegramResponse(res: Response): Promise<{ messageId: number }> {
  let json: TelegramOk | TelegramErr
  try {
    json = (await res.json()) as TelegramOk | TelegramErr
  } catch {
    throw new Error(`Telegram API HTTP ${res.status} : réponse illisible.`)
  }
  if (!json.ok) {
    throw new Error(`Telegram API ${json.error_code} : ${json.description}`)
  }
  return { messageId: json.result.message_id }
}

export async function sendTelegramMessage(
  botToken: string,
  opts: SendTelegramMessageOptions,
): Promise<{ messageId: number }> {
  const body: Record<string, unknown> = { chat_id: opts.chatId, text: opts.text }
  if (opts.parseMode && opts.parseMode !== 'none') body.parse_mode = opts.parseMode

  const res = await fetch(`${API_BASE}/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseTelegramResponse(res)
}

export async function sendTelegramDocument(
  botToken: string,
  opts: SendTelegramDocumentOptions,
): Promise<{ messageId: number }> {
  const form = new FormData()
  form.append('chat_id', opts.chatId)
  const filename = (opts.file as File).name || 'document.bin'
  form.append('document', opts.file, filename)
  if (opts.caption) form.append('caption', opts.caption)
  if (opts.parseMode && opts.parseMode !== 'none') form.append('parse_mode', opts.parseMode)

  const res = await fetch(`${API_BASE}/bot${botToken}/sendDocument`, {
    method: 'POST',
    body: form,
  })
  return parseTelegramResponse(res)
}
```

- [ ] **Step 4 : Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run src/lib/telegramApi.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5 : Commit**

```bash
git add src/lib/telegramApi.ts src/lib/telegramApi.test.ts
git commit -m "feat(telegram): couche réseau sendMessage/sendDocument

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2 : Node `send-telegram` (logique + UI)

**Files:**
- Create: `src/features/workflows/registry/telegramNodes.tsx`
- Test: `src/features/workflows/registry/telegramNodes.test.ts`

- [ ] **Step 1 : Écrire les tests `run` qui échouent**

Créer `src/features/workflows/registry/telegramNodes.test.ts` :

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/telegramApi', () => ({
  sendTelegramMessage: vi.fn(),
  sendTelegramDocument: vi.fn(),
}))

import { sendTelegramMessage, sendTelegramDocument } from '@/lib/telegramApi'
import { sendTelegramNode } from './telegramNodes'
import type { RunContextApi } from '../types'

type Cfg = Parameters<typeof sendTelegramNode.run>[1]

const baseConfig: Cfg = {
  botToken: 'TKN',
  chatId: '123',
  text: 'hello',
  parseMode: 'none',
  iterate: false,
}

function mkCtx(overrides: Partial<RunContextApi> = {}): RunContextApi {
  return {
    signal: new AbortController().signal,
    log: vi.fn(),
    rawConfig: undefined,
    ...overrides,
  }
}

describe('send-telegram node', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('envoie un message texte unique', async () => {
    vi.mocked(sendTelegramMessage).mockResolvedValue({ messageId: 5 })

    const res = await sendTelegramNode.run(mkCtx(), baseConfig, {})

    expect(sendTelegramMessage).toHaveBeenCalledWith('TKN', {
      chatId: '123',
      text: 'hello',
      parseMode: 'none',
    })
    expect(res).toEqual({ result: { sent: true, count: 1, messageIds: [5] } })
  })

  it('envoie un document quand le port attachment est connecté', async () => {
    vi.mocked(sendTelegramDocument).mockResolvedValue({ messageId: 8 })
    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' })

    const res = await sendTelegramNode.run(mkCtx(), baseConfig, { attachment: file })

    expect(sendTelegramDocument).toHaveBeenCalledTimes(1)
    expect(sendTelegramMessage).not.toHaveBeenCalled()
    expect(res.result.messageIds).toEqual([8])
  })

  it('mode iterate : un message par row, chat_id ré-interpolé', async () => {
    vi.mocked(sendTelegramMessage)
      .mockResolvedValueOnce({ messageId: 1 })
      .mockResolvedValueOnce({ messageId: 2 })
    const rawConfig: Cfg = { ...baseConfig, chatId: '{{id}}', iterate: true }
    const ctx = mkCtx({ rawConfig })
    const inputs = { data: [{ id: '10' }, { id: '20' }] }

    const res = await sendTelegramNode.run(ctx, { ...baseConfig, iterate: true }, inputs)

    expect(sendTelegramMessage).toHaveBeenCalledTimes(2)
    expect(vi.mocked(sendTelegramMessage).mock.calls[0][1].chatId).toBe('10')
    expect(vi.mocked(sendTelegramMessage).mock.calls[1][1].chatId).toBe('20')
    expect(res.result.count).toBe(2)
  })

  it('lève une Error si botToken manquant', async () => {
    await expect(
      sendTelegramNode.run(mkCtx(), { ...baseConfig, botToken: '' }, {}),
    ).rejects.toThrow('Bot token')
  })

  it('lève une Error si chatId manquant (mode unique)', async () => {
    await expect(
      sendTelegramNode.run(mkCtx(), { ...baseConfig, chatId: '' }, {}),
    ).rejects.toThrow('Chat ID')
  })

  it('abort interrompt la boucle iterate', async () => {
    const ac = new AbortController()
    vi.mocked(sendTelegramMessage).mockImplementation(async () => {
      ac.abort()
      return { messageId: 1 }
    })
    const rawConfig: Cfg = { ...baseConfig, chatId: '{{id}}', iterate: true }
    const ctx = mkCtx({ rawConfig, signal: ac.signal })
    const inputs = { data: [{ id: '1' }, { id: '2' }, { id: '3' }] }

    const res = await sendTelegramNode.run(ctx, { ...baseConfig, iterate: true }, inputs)

    expect(res.result.count).toBe(1)
  })
})
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run src/features/workflows/registry/telegramNodes.test.ts`
Expected: FAIL — `Failed to resolve import "./telegramNodes"`.

- [ ] **Step 3 : Implémenter `telegramNodes.tsx`**

Créer `src/features/workflows/registry/telegramNodes.tsx` :

```tsx
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
          type="text"
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
```

- [ ] **Step 4 : Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run src/features/workflows/registry/telegramNodes.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5 : Commit**

```bash
git add src/features/workflows/registry/telegramNodes.tsx src/features/workflows/registry/telegramNodes.test.ts
git commit -m "feat(workflows): node send-telegram (logique run + UI config)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3 : Enregistrer le node + vérification globale

**Files:**
- Modify: `src/features/workflows/registry/builtin.ts`

- [ ] **Step 1 : Ajouter l'import à effet de bord**

Dans `src/features/workflows/registry/builtin.ts`, ajouter la ligne après l'import de `communicationNodes` (ligne 16) :

```ts
import './communicationNodes'
import './telegramNodes'
import './decomposeNode'
```

(seule la ligne `import './telegramNodes'` est nouvelle ; les deux autres sont déjà présentes et servent de repère.)

- [ ] **Step 2 : Vérifier les types (build TS)**

Run: `npx tsc -b`
Expected: aucune erreur.

- [ ] **Step 3 : Vérifier le lint**

Run: `npx eslint src/lib/telegramApi.ts src/features/workflows/registry/telegramNodes.tsx`
Expected: aucune erreur (warnings tolérés).

- [ ] **Step 4 : Lancer toute la suite de tests**

Run: `npx vitest run`
Expected: PASS — les 10 nouveaux tests (4 + 6) passent, aucune régression.

- [ ] **Step 5 : Commit**

```bash
git add src/features/workflows/registry/builtin.ts
git commit -m "feat(workflows): enregistrer le node send-telegram dans le registre

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6 : Vérification manuelle (smoke test)**

1. `npm run dev`, ouvrir l'éditeur de workflow.
2. Vérifier que le node **« Envoyer via Telegram »** apparaît dans la catégorie *Communication*.
3. Créer un vrai bot via @BotFather, récupérer son token et un chat_id (via @userinfobot).
4. Workflow minimal : un node source de texte → `send-telegram` configuré avec token + chat_id + message. Exécuter et confirmer la réception du message dans Telegram.
5. Brancher un node d'export (PDF/Excel) sur le port `attachment` et confirmer la réception du fichier.

---

## Notes d'implémentation

- **jsdom fournit `File`, `Blob`, `FormData`** : les tests n'ont pas besoin de polyfill.
- **`interpolate` ne touche pas les booléens** : `iterate` reste un booléen après `interpolate(rawConfig, ...)`. Les champs string (`botToken`, `chatId`, `text`, `parseMode`) sont interpolés ; sans `{{...}}` ils sont inchangés.
- **En mode unique, `config` est déjà interpolé par l'executor** (contexte construit depuis les inputs). En mode iterate on repart de `ctx.rawConfig` pour ré-interpoler par ligne — exactement le pattern de `send-gmail`.
- **Ne jamais logger le token** : aucun `ctx.log`/`console.log` ne doit inclure `botToken`.
- **Accent visuel cyan** : on suit le node frère `send-gmail` (cyan-500) pour la cohérence des nodes Communication, plutôt que l'indigo global.
```
