// functions/src/workflow/nodes/emailTable.ts
// Rendu des jetons {{table}} / {{table: col1, col2}} dans un CORPS de mail, côté
// SERVEUR (cron). Port VERBATIM du renderer client (src/features/workflows/registry/
// communicationNodes.tsx) : thème sombre, lignes zébrées, ligne TOTAL mise en avant,
// alignement numérique. Styles 100 % inline → survivent dans Gmail.
// ⚠️ SYNCHRO avec le renderer client (TBL, generateTable, injectTable).

const TABLE_TOKEN_RE = /\{\{\s*table(?:\s*:\s*([^}]+?))?\s*\}\}/g

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

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

/** Remplace {{table}} / {{table: a, b}} par un tableau rendu depuis `rows`. */
export function injectTable(body: string, rows: Record<string, unknown>[], isHtml: boolean): string {
  return body.replace(TABLE_TOKEN_RE, (_, colsStr?: string) => {
    const cols =
      colsStr && colsStr.trim()
        ? colsStr.split(',').map((c) => c.trim()).filter(Boolean)
        : null
    return generateTable(rows, cols, isHtml)
  })
}

export function hasTableToken(body: string): boolean {
  return /\{\{\s*table\b/.test(body)
}
