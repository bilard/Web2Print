import { useState, useRef } from 'react'
import { Mail, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import { sendGmail, fileToBase64, type SendGmailAttachment } from '@/lib/gmailAuth'
import { downloadDriveFile } from '@/features/gdrive/gdriveCore'
import { getServerGoogleToken } from '@/features/gdrive/serverGoogleToken'
import { useGoogleServerConnect } from '@/features/settings/useGoogleServerConnect'
import { interpolate } from '../runtime/interpolate'
import { extractRows, buildInterpolationContext } from '../runtime/executor'
// `run()` n'est pas un composant : helper `t()` de module (lit la locale courante).
import { t } from '@/lib/i18n'

const TABLE_TOKEN_RE = /\{\{\s*table(?:\s*:\s*([^}]+?))?\s*\}\}/g
const HTML_TOKEN_RE = /\{\{\s*html\s*\}\}/g

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

// Thème sombre/coloré des tableaux email (calque du rapport « Rapport de coûts IA » :
// en-tête accent indigo, lignes zébrées, séparateurs discrets, ligne TOTAL mise en avant).
// Styles 100 % inline → survivent dans Gmail (qui strippe les <style>).
const TBL = {
  wrap:
    "border-collapse:collapse;width:100%;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;background:#0b0b0f;border:1px solid #26262e;border-radius:12px;overflow:hidden;",
  th: 'background:rgba(99,102,241,.16);color:#c7d2fe;text-transform:uppercase;letter-spacing:.05em;font-size:10.5px;font-weight:700;padding:10px 12px;border-bottom:1px solid #26262e;',
  td: 'padding:9px 12px;border-bottom:1px solid #1c1c22;color:#e8e8ea;vertical-align:top;',
  zebra: 'background:rgba(255,255,255,.02);',
  totalRow: 'background:rgba(99,102,241,.12);font-weight:600;color:#ffffff;',
  mono: 'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;',
}

/** Heuristique : cellule à aligner à droite (nombre, montant, tokens) vs texte. */
function isNumericCell(s: string): boolean {
  const t = s.trim()
  return /\d/.test(t) && !/[A-Za-zÀ-ÿ]{3,}/.test(t)
}

function htmlSingleColumnTable(col: string, values: string[]): string {
  if (values.length === 0) return ''
  const numeric = values.every((v) => v.trim() === '' || isNumericCell(v))
  const align = numeric ? 'text-align:right;' : 'text-align:left;'
  const cellExtra = numeric ? TBL.mono : ''
  const trs = values
    .map((v, i) => {
      const isTotal = v.trim().toUpperCase() === 'TOTAL'
      const rowStyle = isTotal ? TBL.totalRow : i % 2 ? TBL.zebra : ''
      return `<tr style="${rowStyle}"><td style="${TBL.td}${align}${cellExtra}">${escapeHtml(v)}</td></tr>`
    })
    .join('')
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="${TBL.wrap}"><thead><tr><th style="${TBL.th}${align}">${escapeHtml(col)}</th></tr></thead><tbody>${trs}</tbody></table>`
}

/** Lit une déclaration CSS (`prop: valeur`) dans un bloc de règle. */
function readDecl(ruleBody: string, prop: string): string | null {
  const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i').exec(ruleBody)
  return m ? m[1].trim() : null
}

/**
 * Adapte un document HTML autonome (ex : sortie « html » du node « Rapport de coûts IA »)
 * pour un CORPS de mail. Les clients mail strippent `<html>`/`<head>` : on extrait donc
 * le contenu de `<body>`, on remonte les blocs `<style>` devant (Apple Mail / Outlook les
 * honorent), ET surtout on réécrit `background`/`color`/`padding` de la règle `body {}` en
 * style INLINE sur un wrapper `<div>`. Sans ça, Gmail garde les couleurs de classe
 * (texte clair) mais droppe le fond du `body` → texte clair sur fond blanc = invisible.
 * Le wrapper utilise les couleurs DU document source (donc neutre clair/sombre).
 * Si l'entrée n'est PAS un document complet (déjà un fragment), elle est renvoyée telle quelle.
 */
function prepareHtmlForEmail(html: string): string {
  const isFullDoc = /<html[\s>]/i.test(html) || /<body[\s>]/i.test(html)
  if (!isFullDoc) return html
  const styles = Array.from(html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi))
    .map((m) => m[1])
    .join('\n')
    .trim()
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html)
  const inner = bodyMatch ? bodyMatch[1] : html

  const bodyRule = /(?:^|[^-\w])body\s*\{([^}]*)\}/i.exec(styles)?.[1] ?? ''
  const wrapStyle = [
    (readDecl(bodyRule, 'background') ?? readDecl(bodyRule, 'background-color')) &&
      `background:${readDecl(bodyRule, 'background') ?? readDecl(bodyRule, 'background-color')}`,
    readDecl(bodyRule, 'color') && `color:${readDecl(bodyRule, 'color')}`,
    readDecl(bodyRule, 'padding') && `padding:${readDecl(bodyRule, 'padding')}`,
  ]
    .filter(Boolean)
    .join(';')

  const styleBlock = styles ? `<style>\n${styles}\n</style>\n` : ''
  return wrapStyle ? `${styleBlock}<div style="${wrapStyle}">${inner}</div>` : `${styleBlock}${inner}`
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
    // Alignement par colonne : à droite + mono si toutes les valeurs non vides sont numériques.
    const colNumeric = cols.map((c) =>
      rows.some((r) => isNumericCell(formatCell(r[c]))) &&
      rows.every((r) => {
        const v = formatCell(r[c])
        return v.trim() === '' || isNumericCell(v)
      }),
    )
    const align = (i: number): string => (colNumeric[i] ? `text-align:right;${TBL.mono}` : 'text-align:left;')
    const headers = cols
      .map((c, i) => `<th style="${TBL.th}${colNumeric[i] ? 'text-align:right;' : 'text-align:left;'}">${escapeHtml(c)}</th>`)
      .join('')
    const trs = rows
      .map((r, ri) => {
        const isTotal = formatCell(r[cols[0]]).trim().toUpperCase() === 'TOTAL'
        const rowStyle = isTotal ? TBL.totalRow : ri % 2 ? TBL.zebra : ''
        return (
          `<tr style="${rowStyle}">` +
          cols.map((c, i) => `<td style="${TBL.td}${align(i)}">${escapeHtml(formatCell(r[c]))}</td>`).join('') +
          '</tr>'
        )
      })
      .join('\n')
    return `<table role="presentation" cellpadding="0" cellspacing="0" style="${TBL.wrap}">\n<thead><tr>${headers}</tr></thead>\n<tbody>\n${trs}\n</tbody>\n</table>`
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

/** Extrait l'ID Drive d'un export-result (`DriveFileMeta`) câblé sur un port d'entrée.
 *  Sortie du node « Export Google Sheets » : `{ id, name, mimeType, webViewLink }`.
 *  Discriminant STRICT (mimeType google-apps OU webViewLink) pour ne pas confondre
 *  un export-result avec une ligne de données qui aurait une colonne `id`. */
function extractDriveFileId(input: unknown): { id: string; name?: string } | null {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const meta = input as { id?: unknown; name?: unknown; mimeType?: unknown; webViewLink?: unknown }
    const id = typeof meta.id === 'string' ? meta.id.trim() : ''
    const isExportResult =
      (typeof meta.mimeType === 'string' && meta.mimeType.startsWith('application/vnd.google-apps')) ||
      typeof meta.webViewLink === 'string'
    if (id && isExportResult) {
      return { id, name: typeof meta.name === 'string' ? meta.name : undefined }
    }
  }
  return null
}

interface SendGmailConfig {
  to: string
  subject: string
  body: string
  isHtml: boolean
  iterate: boolean
  attachmentMode: AttachmentMode
  attachmentFilename: string
  /** Joint AUSSI le Google Sheet exporté (.xlsx) reçu sur `data`/`attachment`
   *  (sortie « result » du node « Export Google Sheets »). Additif au mode ci-dessus. */
  attachGSheet?: boolean
  /** Joint AUSSI le HTML du corps (chaîne reçue sur `data`, ex : sortie « html » de
   *  « Rapport de coûts IA ») en fichier .html. Évite une 2ᵉ arête vers `attachment`. */
  attachBodyHtml?: boolean
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
  // Statut de la connexion Google GLOBALE (connecteur serveur, refresh token persistant).
  // C'est la même connexion qu'utilisent le cron et les nodes Drive/Sheets : aucune
  // connexion par-node à refaire. `connectedAt` : number = connecté, null = non, undefined = chargement.
  const { connectedAt } = useGoogleServerConnect()

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

  // Suggestions filtrées : colonnes du CSV upstream + variables spéciales "table"/"html"
  const allSuggestions = [...availableColumns, 'table', 'html']
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

  const inputCls =
    'w-full bg-background border border-neutral-700 rounded-md px-2 py-1.5 text-[12px] text-white placeholder:text-neutral-600 focus:border-cyan-500 outline-none'

  return (
    <div className="space-y-3">
      {/* Statut de la connexion Google GLOBALE — plus de Client ID ni de bouton par-node.
          Le node réutilise le connecteur serveur (cron + Drive/Sheets) : une seule connexion,
          jamais à refaire. */}
      {connectedAt === undefined ? (
        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-neutral-500/10 border border-neutral-500/30">
          <Loader2 className="w-3 h-3 text-neutral-400 shrink-0 animate-spin" />
          <span className="text-[11px] text-neutral-400">{t('node.send-gmail.checkingGoogle')}</span>
        </div>
      ) : connectedAt !== null ? (
        <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/30">
          <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
          <span className="text-[11px] text-emerald-300 leading-snug">
            {t('node.send-gmail.connected')}
          </span>
        </div>
      ) : (
        <div className="flex items-start gap-1.5 px-2 py-2 rounded-md bg-amber-500/10 border border-amber-500/30">
          <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
          <span className="text-[11px] text-amber-200 leading-snug">
            {t('node.send-gmail.notConnected')}
          </span>
        </div>
      )}

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
            placeholder={t('node.send-gmail.body.placeholder')}
            className={`${inputCls} resize-y font-mono`}
          />
          {autocomplete?.open && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-surface border border-cyan-500/40 rounded-md shadow-xl z-20">
              {availableColumns.length === 0 && (
                <div className="px-2 py-1.5 text-[10px] text-neutral-500 italic border-b border-neutral-800">
                  {t('node.send-gmail.noColumn')}
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
                    <span className="text-emerald-300">{`{{table}}`} <span className="text-neutral-500 text-[10px]">{t('node.send-gmail.hint.table')}</span></span>
                  ) : col === 'html' ? (
                    <span className="text-emerald-300">{`{{html}}`} <span className="text-neutral-500 text-[10px]">{t('node.send-gmail.hint.html')}</span></span>
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
          <div className="text-[12px] text-cyan-200">{t('node.send-gmail.iterate.label')}</div>
          <div className="text-[10px] text-neutral-500 leading-snug mt-0.5">
            {t('node.send-gmail.iterate.note')}
          </div>
        </div>
      </label>

      {/* Pièce jointe : mode sélecteur */}
      <div className="space-y-1.5 px-2 py-2 rounded-md border border-cyan-500/20 bg-cyan-500/5">
        <div className="text-[12px] text-cyan-200">{t('node.send-gmail.attachment.label')}</div>
        <div className="space-y-1">
          {([
            { v: 'none', label: t('opt.attachment.none'), hint: t('opt.attachment.none.hint') },
            { v: 'source', label: t('opt.attachment.source'), hint: t('opt.attachment.source.hint') },
            { v: 'filtered', label: t('opt.attachment.filtered'), hint: t('opt.attachment.filtered.hint') },
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
            <label className="text-[10px] text-neutral-500 mb-0.5 block">{t('node.send-gmail.filename.label')}</label>
            <input
              type="text"
              value={config.attachmentFilename}
              onChange={(e) => onChange({ ...config, attachmentFilename: e.target.value })}
              placeholder="extract.csv"
              className="w-full bg-background border border-neutral-700 rounded-md px-2 py-1 text-[11px] text-white placeholder:text-neutral-600 focus:border-cyan-500 outline-none"
            />
          </div>
        )}

        {/* Pièce jointe additionnelle : le Google Sheet exporté en .xlsx. S'ADDITIONNE
            au mode ci-dessus → permet d'envoyer 2 fichiers (ex: rapport .html + .xlsx). */}
        <label className="flex items-start gap-2 mt-1.5 pt-1.5 border-t border-cyan-500/15 cursor-pointer hover:bg-cyan-500/10 rounded px-1.5 py-1 transition-colors">
          <input
            type="checkbox"
            checked={config.attachGSheet ?? true}
            onChange={(e) => onChange({ ...config, attachGSheet: e.target.checked })}
            className="accent-cyan-500 mt-0.5"
          />
          <div className="flex-1">
            <div className="text-[11px] text-neutral-200">{t('node.send-gmail.attachGSheet.label')}</div>
            <div className="text-[10px] text-neutral-500 leading-snug">
              {t('node.send-gmail.attachGSheet.note')}
            </div>
          </div>
        </label>

        {/* Pièce jointe additionnelle : le corps HTML lui-même en .html. Reprend la
            chaîne HTML reçue sur `data` → pas besoin d'une 2ᵉ arête vers `attachment`. */}
        <label className="flex items-start gap-2 cursor-pointer hover:bg-cyan-500/10 rounded px-1.5 py-1 transition-colors">
          <input
            type="checkbox"
            checked={config.attachBodyHtml ?? true}
            onChange={(e) => onChange({ ...config, attachBodyHtml: e.target.checked })}
            className="accent-cyan-500 mt-0.5"
          />
          <div className="flex-1">
            <div className="text-[11px] text-neutral-200">{t('node.send-gmail.attachBody.label')}</div>
            <div className="text-[10px] text-neutral-500 leading-snug">
              {t('node.send-gmail.attachBody.note')}
            </div>
          </div>
        </label>
      </div>
    </div>
  )
}

const sendGmailNode: NodeSpec<
  SendGmailConfig,
  { data?: unknown; attachment?: File | Blob; gsheet?: unknown },
  { result: SendGmailOutput }
> = {
  type: 'send-gmail',
  category: 'communication',
  labelKey: 'node.send-gmail.label',
  descriptionKey: 'node.send-gmail.desc',
  icon: Mail,
  inputs: [
    { name: 'data', type: 'any' },
    { name: 'attachment', type: 'file' },
    { name: 'gsheet', type: 'export-result' },
  ],
  outputs: [{ name: 'result', type: 'any' }],
  configSchema: [],
  defaultConfig: {
    to: '',
    subject: '',
    body: '',
    isHtml: false,
    iterate: false,
    attachmentMode: 'source',
    attachmentFilename: 'extract.csv',
    // Opt-OUT : un Google Sheet (sur `gsheet`) ou un HTML (sur `data`) s'attache
    // AUTOMATIQUEMENT. L'utilisateur décoche s'il n'en veut pas. Les deux sont
    // des no-op quand l'entrée correspondante est absente.
    attachGSheet: true,
    attachBodyHtml: true,
  },
  runtime: 'client',
  ConfigComponent: SendGmailConfigUi,
  run: async (ctx, config, inputs) => {
    // Jeton du connecteur Google SERVEUR (refresh token persistant, rafraîchi tout seul) :
    // même identité OAuth que le cron et les nodes Drive/Sheets. Plus de popup ~1 h par-node.
    let accessToken: string
    try {
      accessToken = await getServerGoogleToken()
    } catch (err) {
      // Remonter la cause réelle (réseau, invalid_grant…) sans la masquer derrière un
      // message générique : distingue « jamais connecté » d'« autorisation révoquée/réseau ».
      const detail = err instanceof Error ? err.message : String(err)
      throw new Error(t('run.gm.accountUnavailable', { detail }), { cause: err })
    }

    // Récupérer rows + rawConfig en amont (utilisés par le mode pièce jointe filtrée).
    const rawConfig = ctx.rawConfig as SendGmailConfig | undefined
    const inputRows = extractRows(inputs.data)

    // Préparer la pièce jointe selon le mode sélectionné.
    let attachments: SendGmailAttachment[] | undefined
    if (config.attachmentMode === 'source') {
      // Tolérance de câblage : on accepte le fichier sur le port dédié `attachment`,
      // ou — à défaut — un fichier branché sur le port `data` (cas fréquent quand on
      // relie une sortie « file » au port principal, ex. node « Rapport de coûts IA »).
      const srcFile = inputs.attachment instanceof Blob ? inputs.attachment
        : inputs.data instanceof Blob ? inputs.data
        : null
      if (srcFile) {
        const filename = (srcFile as File).name || 'attachment.bin'
        const mimeType = srcFile.type || 'application/octet-stream'
        const base64 = await fileToBase64(srcFile)
        attachments = [{ filename, mimeType, base64 }]
        ctx.log('info', t('run.gm.attachmentSource', { name: filename, size: (srcFile.size / 1024).toFixed(1) }))
      } else if (typeof (inputs.attachment as unknown) === 'string' && (inputs.attachment as unknown as string).trim()) {
        // Câblage fréquent : on relie la sortie « html » (CHAÎNE, pas un File) du node
        // « Rapport de coûts IA » au port `attachment`. On l'emballe en fichier .html.
        const raw = inputs.attachment as unknown as string
        const looksHtml = /<\s*[a-z!]/i.test(raw)
        const fallback = looksHtml ? 'rapport.html' : 'contenu.txt'
        const filename = (config.attachmentFilename || fallback).trim() || fallback
        const mimeType = looksHtml ? 'text/html; charset=UTF-8' : 'text/plain; charset=UTF-8'
        const base64 = utf8ToBase64(raw)
        attachments = [{ filename, mimeType, base64 }]
        ctx.log('info', t('run.gm.attachmentString', { ext: looksHtml ? '.html' : '.txt', name: filename, size: (raw.length / 1024).toFixed(1) }))
      } else {
        ctx.log('info', t('run.gm.sourceModeNoPort'))
      }
    } else if (config.attachmentMode === 'filtered') {
      if (!inputRows || inputRows.length === 0) {
        ctx.log('warn', t('run.gm.filteredNoRow'))
      } else if (!rawConfig) {
        ctx.log('warn', t('run.gm.filteredNoConfig'))
      } else {
        const colSet = new Set<string>()
        for (const r of inputRows) for (const k of Object.keys(r)) if (k !== '_id') colSet.add(k)
        let cols = extractMentionedColumns(rawConfig.body, colSet)
        if (cols.length === 0) {
          // Aucune {{Col}} dans le body → toutes les colonnes
          cols = Array.from(colSet)
          ctx.log('info', t('run.gm.allColumns', { count: cols.length }))
        } else {
          ctx.log('info', t('run.gm.filteredAttachment', { count: cols.length, columns: cols.join(', ') }))
        }
        const csv = generateCsv(inputRows, cols)
        const base64 = utf8ToBase64(csv)
        const filename = (config.attachmentFilename || 'extract.csv').trim() || 'extract.csv'
        attachments = [{ filename, mimeType: 'text/csv; charset=UTF-8', base64 }]
      }
    }

    // Pièce jointe ADDITIONNELLE : le Google Sheet exporté en .xlsx. S'ajoute à la
    // pièce jointe du mode ci-dessus (ex : rapport .html sur `attachment` + .xlsx) →
    // le mail porte alors 2 fichiers. L'export-result arrive sur le port DÉDIÉ `gsheet`
    // (typé export-result) → laisse `data` libre pour le HTML du corps ({{html}}).
    // Repli sur `data`/`attachment` pour les anciens câblages.
    if (config.attachGSheet ?? true) {
      const meta = extractDriveFileId(inputs.gsheet)
        ?? extractDriveFileId(inputs.data)
        ?? extractDriveFileId(inputs.attachment)
      if (meta) {
        ctx.log('info', t('run.gm.exportingSheet', { name: meta.name ?? meta.id }))
        const file = await downloadDriveFile(meta.id, accessToken)
        const base64 = await fileToBase64(file)
        const gsheetAttachment: SendGmailAttachment = {
          filename: file.name,
          mimeType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          base64,
        }
        attachments = attachments ? [...attachments, gsheetAttachment] : [gsheetAttachment]
        ctx.log('info', t('run.gm.attachmentSheet', { name: file.name, size: (file.size / 1024).toFixed(1) }))
      }
    }

    // Pièce jointe ADDITIONNELLE : le corps HTML lui-même en .html. Reprend la chaîne
    // HTML reçue sur `data` (sortie « html » de « Rapport de coûts IA ») → permet de
    // joindre le rapport SANS 2ᵉ arête vers `attachment`.
    if (config.attachBodyHtml ?? true) {
      // N'attache QUE si `data` porte une chaîne qui ressemble à du HTML (balises) :
      // évite de joindre par surprise un texte brut ou des données non-HTML.
      const raw = typeof inputs.data === 'string' ? inputs.data : null
      const html = raw && /<\s*[a-z!]/i.test(raw) ? raw : null
      if (html) {
        const base64 = utf8ToBase64(html)
        const bodyHtmlAttachment: SendGmailAttachment = {
          filename: 'rapport.html',
          mimeType: 'text/html; charset=UTF-8',
          base64,
        }
        attachments = attachments ? [...attachments, bodyHtmlAttachment] : [bodyHtmlAttachment]
        ctx.log('info', t('run.gm.attachmentHtml', { size: (html.length / 1024).toFixed(1) }))
      }
    }

    if (config.iterate && inputRows && rawConfig) {
      const rows = inputRows
      if (rows.length === 0) {
        ctx.log('warn', t('run.gm.iterateEmptyArray'))
        return { result: { sent: true, count: 0, ids: [] } }
      }
      ctx.log('info', t('run.gm.iterating', { count: rows.length }))
      const ids: string[] = []
      for (let i = 0; i < rows.length; i++) {
        if (ctx.signal.aborted) {
          ctx.log('warn', t('run.gm.interrupted', { count: ids.length }))
          break
        }
        const row = rows[i]
        const interpolatedRow = interpolate(rawConfig, {
          ...row,
          row,
          index: i,
        })
        if (!interpolatedRow.to) {
          ctx.log('warn', t('run.gm.rowNoRecipientInterp', { i: i + 1 }))
          continue
        }
        const result = await sendGmail(accessToken, {
          to: interpolatedRow.to,
          subject: interpolatedRow.subject,
          body: interpolatedRow.body,
          isHtml: interpolatedRow.isHtml,
          attachments,
        })
        ids.push(result.id)
        ctx.log('info', t('run.gm.rowSentId', { i: i + 1, total: rows.length, to: String(interpolatedRow.to), id: result.id }))
      }
      return { result: { sent: true, count: ids.length, ids } }
    }

    // Mode mail unique
    if (!config.to) throw new Error(t('run.gm.noRecipientConfig'))

    let finalBody = config.body

    // Injection {{html}} : insère dans le CORPS le contenu HTML/texte brut reçu sur le
    // port `data` (ex : sortie « html » du node « Rapport de coûts IA »). En mode HTML,
    // on adapte un document autonome pour un mail (extraction <body> + <style>).
    const rawString = typeof inputs.data === 'string' ? inputs.data : null
    // CORPS VIDE + du HTML en entrée : l'intention ne fait aucun doute, on l'injecte.
    // Sans cela, le mail partait VIDE parce qu'il manquait un `{{html}}` que rien
    // n'obligeait à connaître — le champ affiche une aide en gris, qu'on prend pour du
    // contenu. Un corps explicitement rempli reste évidemment prioritaire.
    if (rawString !== null && !finalBody.trim()) {
      finalBody = '{{html}}'
      ctx.log('info', t('run.gm.bodyFromData'))
    }
    const hasHtmlToken = /\{\{\s*html\s*\}\}/.test(finalBody)
    if (rawString !== null && hasHtmlToken) {
      if (!config.isHtml) {
        ctx.log('warn', t('run.gm.htmlUnchecked'))
      }
      const injected = config.isHtml ? prepareHtmlForEmail(rawString) : rawString
      finalBody = finalBody.replace(HTML_TOKEN_RE, () => injected)
      ctx.log('info', t('run.gm.htmlInjected', { count: injected.length }))
    } else if (hasHtmlToken && rawString === null) {
      // {{html}} demandé mais le port `data` ne porte pas de chaîne. Cause fréquente :
      // plusieurs edges sur `data` (le fan-in écrase la string), ou c'est une sheet/rows.
      ctx.log('warn', t('run.gm.htmlTokenNoData'))
    } else if (rawString !== null && !hasHtmlToken) {
      ctx.log('warn', t('run.gm.dataNotInserted'))
    }

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
        ctx.log('info', t('run.gm.combinedTable', {
          count: referencedCols.length, columns: referencedCols.join(', '), rows: inputRows.length,
        }))
      } else {
        // 0 ou 1 colonne référencée → mini-tableau par colonne via renderer custom
        const customCtx = buildInterpolationContext(inputs, {}, {
          arrayRenderer: (col, values) => htmlSingleColumnTable(col, values),
        })
        finalBody = interpolate(rawConfig.body, customCtx)
        ctx.log('info', t('run.gm.htmlTable', { rows: inputRows.length }))
      }
    }

    // Injection {{table}} ou {{table: col1, col2}} si présent dans le body.
    const hasTableToken = /\{\{\s*table\b/.test(finalBody)
    if (inputRows && hasTableToken) {
      finalBody = injectTable(finalBody, inputRows, config.isHtml)
      ctx.log('info', t('run.gm.tableInjected', { rows: inputRows.length }))
    } else if (inputRows && inputRows.length > 1 && !config.isHtml) {
      ctx.log('warn', t('run.gm.manyRowsHint', { count: inputRows.length }))
    }

    ctx.log('info', t('run.gm.sending', { to: config.to }))
    const result = await sendGmail(accessToken, {
      to: config.to,
      subject: config.subject,
      body: finalBody,
      isHtml: config.isHtml,
      attachments,
    })
    ctx.log('info', t('run.gm.sentId', { id: result.id }))
    return { result: { sent: true, count: 1, ids: [result.id] } }
  },
}

nodeRegistry.register(sendGmailNode)
