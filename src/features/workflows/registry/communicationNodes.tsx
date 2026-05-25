// src/features/workflows/registry/communicationNodes.tsx
import { useState, useEffect, useRef } from 'react'
import { Mail, CheckCircle2, AlertCircle, LogOut, Loader2, Copy, Check } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import {
  getStoredGmailToken,
  requestGmailToken,
  clearGmailToken,
  sendGmail,
  fileToBase64,
  type SendGmailAttachment,
} from '@/lib/gmailAuth'
import { interpolate } from '../runtime/interpolate'
import { extractRows, buildInterpolationContext } from '../runtime/executor'

const TABLE_TOKEN_RE = /\{\{\s*table(?:\s*:\s*([^}]+?))?\s*\}\}/g

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/**
 * Extrait les colonnes mentionnées dans un body via {{Col}} et {{table: a, b}}.
 * Retourne une liste dédupliquée dans l'ordre d'apparition. Les `availableCols`
 * filtrent les noms qui ne correspondent pas à de vraies colonnes.
 */
function extractMentionedColumns(body: string, availableCols: Set<string>): string[] {
  const out: string[] = []
  const tokenRe = /\{\{\s*([^{}]+?)\s*\}\}/g
  let m: RegExpExecArray | null
  while ((m = tokenRe.exec(body)) !== null) {
    const name = m[1].trim()
    const tableMatch = /^table\s*:\s*(.+)$/i.exec(name)
    if (tableMatch) {
      for (const c of tableMatch[1].split(',').map((s) => s.trim()).filter(Boolean)) {
        if (availableCols.has(c) && !out.includes(c)) out.push(c)
      }
    } else if (name === 'table') {
      for (const c of availableCols) if (!out.includes(c)) out.push(c)
    } else if (availableCols.has(name) && !out.includes(name)) {
      out.push(name)
    }
  }
  return out
}

/** CSV-escape (RFC 4180) : entoure de "" si la valeur contient virgule, ", \n. */
function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

function generateCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.map(csvEscape).join(',')
  const lines = rows.map((r) => columns.map((c) => csvEscape(r[c])).join(','))
  // BOM UTF-8 pour qu'Excel ouvre correctement les caractères accentués
  return '﻿' + [header, ...lines].join('\r\n')
}

function utf8ToBase64(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function htmlSingleColumnTable(col: string, values: string[]): string {
  if (values.length === 0) return ''
  const thStyle =
    'border:1px solid #d0d7de;padding:6px 10px;background:#f6f8fa;text-align:left;font-weight:600;'
  const tdStyle = 'border:1px solid #d0d7de;padding:6px 10px;'
  const trs = values
    .map((v) => `<tr><td style="${tdStyle}">${escapeHtml(v)}</td></tr>`)
    .join('')
  return `<table style="border-collapse:collapse;font-family:-apple-system,sans-serif;font-size:14px;"><thead><tr><th style="${thStyle}">${escapeHtml(col)}</th></tr></thead><tbody>${trs}</tbody></table>`
}

function generateTable(
  rows: Record<string, unknown>[],
  columns: string[] | null,
  isHtml: boolean,
): string {
  if (rows.length === 0) return isHtml ? '<p><em>Aucune donnée.</em></p>' : '(aucune donnée)'
  const cols =
    columns ??
    Array.from(new Set(rows.flatMap((r) => Object.keys(r)))).filter(
      (k) => k !== '_id' && !k.startsWith('__'),
    )

  if (isHtml) {
    const thStyle =
      'border:1px solid #d0d7de;padding:6px 10px;background:#f6f8fa;text-align:left;font-weight:600;'
    const tdStyle = 'border:1px solid #d0d7de;padding:6px 10px;'
    const headers = cols.map((c) => `<th style="${thStyle}">${escapeHtml(c)}</th>`).join('')
    const trs = rows
      .map(
        (r) =>
          '<tr>' +
          cols.map((c) => `<td style="${tdStyle}">${escapeHtml(formatCell(r[c]))}</td>`).join('') +
          '</tr>',
      )
      .join('\n')
    return `<table style="border-collapse:collapse;font-family:-apple-system,sans-serif;font-size:14px;">\n<thead><tr>${headers}</tr></thead>\n<tbody>\n${trs}\n</tbody>\n</table>`
  }

  // Plain text
  const widths = cols.map((c) =>
    Math.max(c.length, ...rows.map((r) => formatCell(r[c]).length)),
  )
  const lines: string[] = []
  lines.push('| ' + cols.map((c, i) => c.padEnd(widths[i])).join(' | ') + ' |')
  lines.push('|' + cols.map((_, i) => '-'.repeat(widths[i] + 2)).join('|') + '|')
  for (const r of rows) {
    lines.push('| ' + cols.map((c, i) => formatCell(r[c]).padEnd(widths[i])).join(' | ') + ' |')
  }
  return lines.join('\n')
}

function injectTable(body: string, rows: Record<string, unknown>[], isHtml: boolean): string {
  return body.replace(TABLE_TOKEN_RE, (_, colsStr?: string) => {
    const cols =
      colsStr && colsStr.trim()
        ? colsStr
            .split(',')
            .map((c) => c.trim())
            .filter(Boolean)
        : null
    return generateTable(rows, cols, isHtml)
  })
}

type AttachmentMode = 'none' | 'source' | 'filtered'

interface SendGmailConfig {
  clientId: string
  to: string
  subject: string
  body: string
  isHtml: boolean
  iterate: boolean
  attachmentMode: AttachmentMode
  attachmentFilename: string
}

interface SendGmailOutput {
  sent: boolean
  count: number
  ids: string[]
}

interface SendGmailConfigUiProps {
  config: SendGmailConfig
  onChange: (next: SendGmailConfig) => void
  availableColumns?: string[]
}

interface AutoCompleteState {
  open: boolean
  query: string
  startIdx: number
  highlight: number
}

function SendGmailConfigUi({ config, onChange, availableColumns = [] }: SendGmailConfigUiProps) {
  const [token, setToken] = useState(() => getStoredGmailToken())
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Re-check token au mount au cas où une autre instance l'a refresh
  useEffect(() => {
    setToken(getStoredGmailToken())
  }, [])

  const connected = !!token && token.expiresAt > Date.now()
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : ''

  const onCopyOrigin = async () => {
    try {
      await navigator.clipboard.writeText(currentOrigin)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const [autocomplete, setAutocomplete] = useState<AutoCompleteState | null>(null)

  const updateAutocomplete = (textarea: HTMLTextAreaElement) => {
    const pos = textarea.selectionStart
    const before = textarea.value.slice(0, pos)
    const openIdx = before.lastIndexOf('{{')
    if (openIdx === -1) {
      setAutocomplete(null)
      return
    }
    // Si un }} ferme déjà entre {{ et le curseur, on n'est plus dans un token ouvert.
    const closingAfterOpen = before.indexOf('}}', openIdx)
    if (closingAfterOpen !== -1 && closingAfterOpen < pos) {
      setAutocomplete(null)
      return
    }
    const query = before.slice(openIdx + 2).trim()
    // Préserve le highlight si on est toujours dans le même token (même position
    // d'ouverture et même query). Sinon, reset à 0.
    setAutocomplete((prev) => {
      if (prev && prev.startIdx === openIdx && prev.query === query) return prev
      return { open: true, query, startIdx: openIdx, highlight: 0 }
    })
  }

  const insertColumn = (col: string) => {
    const ta = bodyRef.current
    if (!ta || !autocomplete) return
    const after = ta.value.slice(ta.selectionStart)
    const newBefore = ta.value.slice(0, autocomplete.startIdx) + `{{${col}}}`
    const newValue = newBefore + after
    onChange({ ...config, body: newValue })
    setAutocomplete(null)
    // Replacer le curseur juste après le }} inséré
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(newBefore.length, newBefore.length)
    })
  }

  // Suggestions filtrées : colonnes du CSV upstream + variable spéciale "table"
  const allSuggestions = [...availableColumns, 'table']
  const suggestions = autocomplete
    ? allSuggestions.filter((c) =>
        autocomplete.query === ''
          ? true
          : c.toLowerCase().includes(autocomplete.query.toLowerCase()),
      ).slice(0, 12)
    : []

  const onBodyKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!autocomplete || !autocomplete.open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAutocomplete({
        ...autocomplete,
        highlight: (autocomplete.highlight + 1) % suggestions.length,
      })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setAutocomplete({
        ...autocomplete,
        highlight: (autocomplete.highlight - 1 + suggestions.length) % suggestions.length,
      })
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      insertColumn(suggestions[autocomplete.highlight])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setAutocomplete(null)
    }
  }

  const onConnect = async () => {
    if (!config.clientId.trim()) {
      setError("Renseigne d'abord le Client ID OAuth Google.")
      return
    }
    setConnecting(true)
    setError(null)
    try {
      const t = await requestGmailToken(config.clientId.trim())
      setToken(t)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setConnecting(false)
    }
  }

  const onDisconnect = () => {
    clearGmailToken()
    setToken(null)
  }

  const inputCls =
    'w-full bg-[#0f0f0f] border border-neutral-700 rounded-md px-2 py-1.5 text-[12px] text-white placeholder:text-neutral-600 focus:border-cyan-500 outline-none'

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-neutral-400 mb-1 block">Client ID OAuth Google</label>
        <input
          type="text"
          value={config.clientId}
          onChange={(e) => onChange({ ...config, clientId: e.target.value })}
          placeholder="xxxxxx.apps.googleusercontent.com"
          className={inputCls}
        />
        <div className="text-[10px] text-neutral-600 mt-1.5 leading-snug space-y-1.5">
          <p>
            Crée un Client OAuth dans{' '}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2"
            >
              Google Cloud Console → Identifiants
            </a>
            . Type : <strong className="text-neutral-400">Application Web</strong>.
          </p>
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-amber-500/5 border border-amber-500/20">
            <span className="shrink-0 text-amber-300/80">Origine JS à autoriser :</span>
            <code className="flex-1 truncate text-amber-200 font-mono text-[10px]" title={currentOrigin}>
              {currentOrigin}
            </code>
            <button
              type="button"
              onClick={onCopyOrigin}
              className="shrink-0 p-1 rounded hover:bg-white/5 text-amber-300/80 hover:text-amber-200"
              title="Copier l'origine"
              aria-label="Copier l'origine"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
          <p className="text-neutral-600">
            Erreur <code className="text-amber-300/80">origin_mismatch</code> = cette URL exacte
            n'est pas listée dans <strong className="text-neutral-400">Origines JavaScript autorisées</strong>{' '}
            du Client OAuth. Ajoute-la, attends ~30 s, puis réessaie.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        {connected ? (
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
            <span className="text-[11px] text-emerald-300 flex-1">Connecté à Gmail</span>
            <button
              type="button"
              onClick={onDisconnect}
              className="flex items-center gap-1 text-[10px] text-neutral-400 hover:text-red-400"
              title="Déconnecter"
            >
              <LogOut className="w-3 h-3" /> Déconnecter
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onConnect}
            disabled={connecting || !config.clientId.trim()}
            className="w-full flex items-center justify-center gap-2 bg-cyan-500/15 border border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-40 disabled:cursor-not-allowed text-[12px] py-2 rounded-md transition-colors"
          >
            {connecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
            {connecting ? 'Connexion…' : 'Se connecter à Gmail'}
          </button>
        )}
        {error && (
          <div className="flex items-start gap-1.5 text-[11px] text-red-400 px-1">
            <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      <div>
        <label className="text-xs text-neutral-400 mb-1 block">Destinataire</label>
        <input
          type="text"
          value={config.to}
          onChange={(e) => onChange({ ...config, to: e.target.value })}
          placeholder="user@exemple.com (ou {{item.email}})"
          className={inputCls}
        />
      </div>

      <div>
        <label className="text-xs text-neutral-400 mb-1 block">Sujet</label>
        <input
          type="text"
          value={config.subject}
          onChange={(e) => onChange({ ...config, subject: e.target.value })}
          placeholder="Sujet du mail"
          className={inputCls}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-neutral-400">Corps</label>
          <label className="flex items-center gap-1 text-[10px] text-neutral-500 cursor-pointer">
            <input
              type="checkbox"
              checked={config.isHtml}
              onChange={(e) => onChange({ ...config, isHtml: e.target.checked })}
              className="accent-cyan-500"
            />
            HTML
          </label>
        </div>
        <div className="relative">
          <textarea
            ref={bodyRef}
            value={config.body}
            onChange={(e) => {
              onChange({ ...config, body: e.target.value })
              updateAutocomplete(e.target)
            }}
            onKeyDown={onBodyKeyDown}
            onKeyUp={(e) => updateAutocomplete(e.currentTarget)}
            onClick={(e) => updateAutocomplete(e.currentTarget)}
            onBlur={() => setTimeout(() => setAutocomplete(null), 150)}
            rows={6}
            placeholder={`Tape {{ pour voir les variables disponibles.\n\n  {{Nom colonne}}      → valeurs de cette colonne\n  {{table}}             → tableau de toutes les lignes\n  {{table: col1, col2}} → tableau avec colonnes ciblées`}
            className={`${inputCls} resize-y font-mono`}
          />
          {autocomplete?.open && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-[#1a1a1a] border border-cyan-500/40 rounded-md shadow-xl z-20">
              {availableColumns.length === 0 && (
                <div className="px-2 py-1.5 text-[10px] text-neutral-500 italic border-b border-neutral-800">
                  Aucune colonne détectée upstream — connecte un Upload CSV.
                </div>
              )}
              {suggestions.map((col, i) => (
                <button
                  key={col}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    insertColumn(col)
                  }}
                  onMouseEnter={() =>
                    setAutocomplete((a) => (a ? { ...a, highlight: i } : a))
                  }
                  className={`block w-full text-left px-2 py-1.5 text-[12px] font-mono transition-colors ${
                    i === autocomplete.highlight
                      ? 'bg-cyan-500/20 text-cyan-100'
                      : 'text-neutral-300 hover:bg-cyan-500/10'
                  }`}
                >
                  {col === 'table' ? (
                    <span className="text-emerald-300">{`{{table}}`} <span className="text-neutral-500 text-[10px]">— tableau de toutes les lignes</span></span>
                  ) : (
                    <span>{`{{${col}}}`}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mode iterate : 1 mail par row */}
      <label className="flex items-start gap-2 px-2 py-2 rounded-md border border-cyan-500/20 bg-cyan-500/5 cursor-pointer hover:bg-cyan-500/10 transition-colors">
        <input
          type="checkbox"
          checked={config.iterate}
          onChange={(e) => onChange({ ...config, iterate: e.target.checked })}
          className="accent-cyan-500 mt-0.5"
        />
        <div className="flex-1">
          <div className="text-[12px] text-cyan-200">Envoyer 1 mail par ligne</div>
          <div className="text-[10px] text-neutral-500 leading-snug mt-0.5">
            Si l'entrée est un tableau de lignes (ex : port <code className="text-emerald-300/80">rows</code> du Upload),
            envoie un mail pour chaque ligne. Sinon, 1 mail unique avec la 1ère ligne.
          </div>
        </div>
      </label>

      {/* Pièce jointe : mode sélecteur */}
      <div className="space-y-1.5 px-2 py-2 rounded-md border border-cyan-500/20 bg-cyan-500/5">
        <div className="text-[12px] text-cyan-200">Pièce jointe</div>
        <div className="space-y-1">
          {([
            { v: 'none', label: 'Aucune', hint: 'Mail sans pièce jointe.' },
            { v: 'source', label: 'Fichier source', hint: 'Joint le file du port `attachment` (ex: CSV brut original).' },
            { v: 'filtered', label: 'Sélection (CSV filtré)', hint: 'Génère un CSV avec uniquement les colonnes utilisées dans le corps du mail.' },
          ] as { v: AttachmentMode; label: string; hint: string }[]).map((opt) => (
            <label key={opt.v} className="flex items-start gap-2 cursor-pointer hover:bg-cyan-500/10 rounded px-1.5 py-1 transition-colors">
              <input
                type="radio"
                name="attachmentMode"
                checked={config.attachmentMode === opt.v}
                onChange={() => onChange({ ...config, attachmentMode: opt.v })}
                className="accent-cyan-500 mt-0.5"
              />
              <div className="flex-1">
                <div className="text-[11px] text-neutral-200">{opt.label}</div>
                <div className="text-[10px] text-neutral-500 leading-snug">{opt.hint}</div>
              </div>
            </label>
          ))}
        </div>
        {config.attachmentMode === 'filtered' && (
          <div className="pt-1">
            <label className="text-[10px] text-neutral-500 mb-0.5 block">Nom du fichier généré</label>
            <input
              type="text"
              value={config.attachmentFilename}
              onChange={(e) => onChange({ ...config, attachmentFilename: e.target.value })}
              placeholder="extract.csv"
              className="w-full bg-[#0f0f0f] border border-neutral-700 rounded-md px-2 py-1 text-[11px] text-white placeholder:text-neutral-600 focus:border-cyan-500 outline-none"
            />
          </div>
        )}
      </div>
    </div>
  )
}

export const sendGmailNode: NodeSpec<
  SendGmailConfig,
  { data?: unknown; attachment?: File | Blob },
  { result: SendGmailOutput }
> = {
  type: 'send-gmail',
  category: 'communication',
  label: 'Envoyer via Gmail',
  description:
    "Envoie un email via Gmail API (OAuth Google côté client). Connexion à faire une fois par session.",
  icon: Mail,
  inputs: [
    { name: 'data', type: 'any' },
    { name: 'attachment', type: 'file' },
  ],
  outputs: [{ name: 'result', type: 'any' }],
  configSchema: [],
  defaultConfig: {
    clientId: '',
    to: '',
    subject: '',
    body: '',
    isHtml: false,
    iterate: false,
    attachmentMode: 'source',
    attachmentFilename: 'extract.csv',
  },
  runtime: 'client',
  ConfigComponent: SendGmailConfigUi,
  run: async (ctx, config, inputs) => {
    const token = getStoredGmailToken()
    if (!token) {
      throw new Error(
        "Pas de token Gmail valide. Ouvre la config du node et clique 'Se connecter à Gmail'.",
      )
    }

    // Récupérer rows + rawConfig en amont (utilisés par le mode pièce jointe filtrée).
    const rawConfig = ctx.rawConfig as SendGmailConfig | undefined
    const inputRows = extractRows(inputs.data)

    // Préparer la pièce jointe selon le mode sélectionné.
    let attachments: SendGmailAttachment[] | undefined
    if (config.attachmentMode === 'source') {
      if (inputs.attachment instanceof Blob) {
        const file = inputs.attachment
        const filename = (file as File).name || 'attachment.bin'
        const mimeType = file.type || 'application/octet-stream'
        const base64 = await fileToBase64(file)
        attachments = [{ filename, mimeType, base64 }]
        ctx.log('info', `Pièce jointe (source) : ${filename} (${(file.size / 1024).toFixed(1)} KB).`)
      } else {
        ctx.log(
          'warn',
          "Mode 'Fichier source' actif mais le port 'attachment' n'est pas connecté. Le mail partira sans pièce jointe.",
        )
      }
    } else if (config.attachmentMode === 'filtered') {
      if (!inputRows || inputRows.length === 0) {
        ctx.log(
          'warn',
          "Mode 'Sélection' actif mais aucune ligne en entrée (port 'data'). Le mail partira sans pièce jointe.",
        )
      } else if (!rawConfig) {
        ctx.log('warn', 'Mode filtré : config brut indisponible.')
      } else {
        const colSet = new Set<string>()
        for (const r of inputRows) for (const k of Object.keys(r)) if (k !== '_id') colSet.add(k)
        let cols = extractMentionedColumns(rawConfig.body, colSet)
        if (cols.length === 0) {
          // Aucune {{Col}} dans le body → toutes les colonnes
          cols = Array.from(colSet)
          ctx.log('info', `Aucune colonne référencée dans le corps : toutes (${cols.length}) sont incluses dans la pièce jointe.`)
        } else {
          ctx.log('info', `Pièce jointe filtrée : ${cols.length} colonne(s) (${cols.join(', ')}).`)
        }
        const csv = generateCsv(inputRows, cols)
        const base64 = utf8ToBase64(csv)
        const filename = (config.attachmentFilename || 'extract.csv').trim() || 'extract.csv'
        attachments = [{ filename, mimeType: 'text/csv; charset=UTF-8', base64 }]
      }
    }
    if (config.iterate && inputRows && rawConfig) {
      const rows = inputRows
      if (rows.length === 0) {
        ctx.log('warn', 'Mode "1 mail par ligne" activé mais le tableau d\'entrée est vide.')
        return { result: { sent: true, count: 0, ids: [] } }
      }
      ctx.log('info', `Mode iterate : envoi de ${rows.length} mails…`)
      const ids: string[] = []
      for (let i = 0; i < rows.length; i++) {
        if (ctx.signal.aborted) {
          ctx.log('warn', `Run interrompu après ${ids.length} mails.`)
          break
        }
        const row = rows[i]
        const interpolatedRow = interpolate(rawConfig, {
          ...row,
          row,
          index: i,
        })
        if (!interpolatedRow.to) {
          ctx.log('warn', `Ligne ${i + 1} ignorée : destinataire vide après interpolation.`)
          continue
        }
        const result = await sendGmail(token.accessToken, {
          to: interpolatedRow.to,
          subject: interpolatedRow.subject,
          body: interpolatedRow.body,
          isHtml: interpolatedRow.isHtml,
          attachments,
        })
        ids.push(result.id)
        ctx.log('info', `[${i + 1}/${rows.length}] → ${interpolatedRow.to} (id : ${result.id})`)
      }
      return { result: { sent: true, count: ids.length, ids } }
    }

    // Mode mail unique
    if (!config.to) throw new Error('Destinataire manquant.')

    let finalBody = config.body

    // Si HTML coché + input contient un tableau de rows : transformer les
    // {{Colonne}} en tableau HTML.
    //  - 0 ou 1 colonne référencée → mini-tableau d'une seule colonne
    //  - ≥ 2 colonnes référencées → UN tableau combiné qui remplace la 1ère
    //    occurrence ; les autres tokens de colonne sont supprimés
    if (inputRows && rawConfig && config.isHtml) {
      const colSet = new Set<string>()
      for (const r of inputRows) for (const k of Object.keys(r)) colSet.add(k)

      const tokenRe = /\{\{\s*([^{}]+?)\s*\}\}/g
      const referencedCols: string[] = []
      let m: RegExpExecArray | null
      while ((m = tokenRe.exec(rawConfig.body)) !== null) {
        const name = m[1].trim()
        if (/^table(\s*:|$)/.test(name)) continue
        if (!colSet.has(name)) continue
        if (!referencedCols.includes(name)) referencedCols.push(name)
      }

      if (referencedCols.length >= 2) {
        // Tableau combiné : 1ère occurrence d'une colonne → table, autres → ''
        let firstReplaced = false
        const combined = generateTable(inputRows, referencedCols, true)
        finalBody = rawConfig.body.replace(tokenRe, (full, path: string) => {
          const name = path.trim()
          if (/^table(\s*:|$)/.test(name)) return full // laissé à injectTable
          if (!colSet.has(name)) return full // pas une colonne (laisser tel quel)
          if (!firstReplaced) {
            firstReplaced = true
            return combined
          }
          return ''
        })
        ctx.log(
          'info',
          `Tableau combiné : ${referencedCols.length} colonnes (${referencedCols.join(', ')}) × ${inputRows.length} lignes.`,
        )
      } else {
        // 0 ou 1 colonne référencée → mini-tableau par colonne via renderer custom
        const customCtx = buildInterpolationContext(inputs, {}, {
          arrayRenderer: (col, values) => htmlSingleColumnTable(col, values),
        })
        finalBody = interpolate(rawConfig.body, customCtx)
        ctx.log('info', `Mode HTML : colonnes rendues en tableau (${inputRows.length} lignes).`)
      }
    }

    // Injection {{table}} ou {{table: col1, col2}} si présent dans le body.
    const hasTableToken = /\{\{\s*table\b/.test(finalBody)
    if (inputRows && hasTableToken) {
      finalBody = injectTable(finalBody, inputRows, config.isHtml)
      ctx.log('info', `Tableau {{table}} injecté : ${inputRows.length} lignes.`)
    } else if (inputRows && inputRows.length > 1 && !config.isHtml) {
      ctx.log(
        'warn',
        `${inputRows.length} lignes en entrée. Coche HTML pour un tableau, ou utilise {{table}} dans le corps. Pour 1 mail par ligne, coche "Envoyer 1 mail par ligne".`,
      )
    }

    ctx.log('info', `Envoi Gmail → ${config.to}`)
    const result = await sendGmail(token.accessToken, {
      to: config.to,
      subject: config.subject,
      body: finalBody,
      isHtml: config.isHtml,
      attachments,
    })
    ctx.log('info', `Envoyé (id Gmail : ${result.id}).`)
    return { result: { sent: true, count: 1, ids: [result.id] } }
  },
}

nodeRegistry.register(sendGmailNode)
