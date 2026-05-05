/**
 * Console de logs catégorisés — affiche les entrées textuelles `addLog()` du
 * store enrichment, en les classifiant par type (scrape / llm / parse / network
 * / warning / info) via regex sur le contenu, avec filtre-chips multi-sélection.
 *
 * Pas de breaking change côté store : on garde `logs: string[]` et l'inférence
 * se fait à l'affichage. Cohérent avec les autres parsers du projet (regex >
 * structured tag) — le coût d'inférence est négligeable (<1 ms pour 200 lignes).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Code2, Globe, Sparkles, Filter, AlertTriangle, Info } from 'lucide-react'

export type LogType = 'scrape' | 'llm' | 'parse' | 'network' | 'warning' | 'info'

interface TypeMeta {
  label: string
  Icon: typeof Code2
  className: string
  chipClassName: string
}

const TYPE_META: Record<LogType, TypeMeta> = {
  warning: {
    label: 'Alerte',
    Icon: AlertTriangle,
    className: 'text-amber-400/80',
    chipClassName: 'bg-amber-500/15 border-amber-500/40 text-amber-300',
  },
  scrape: {
    label: 'Scrape',
    Icon: Code2,
    className: 'text-cyan-400/80',
    chipClassName: 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300',
  },
  llm: {
    label: 'LLM',
    Icon: Sparkles,
    className: 'text-fuchsia-400/80',
    chipClassName: 'bg-fuchsia-500/15 border-fuchsia-500/40 text-fuchsia-300',
  },
  parse: {
    label: 'Parse',
    Icon: Filter,
    className: 'text-indigo-400/80',
    chipClassName: 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300',
  },
  network: {
    label: 'Réseau',
    Icon: Globe,
    className: 'text-sky-400/80',
    chipClassName: 'bg-sky-500/15 border-sky-500/40 text-sky-300',
  },
  info: {
    label: 'Info',
    Icon: Info,
    className: 'text-white/45',
    chipClassName: 'bg-white/[0.05] border-white/10 text-white/60',
  },
}

const TYPE_ORDER: LogType[] = ['warning', 'scrape', 'llm', 'parse', 'network', 'info']

/** Infère le type d'un log à partir de son contenu — priorité aux marqueurs
 *  d'avertissement (qui peuvent être présents dans n'importe quelle catégorie),
 *  puis classification par mots-clés métier. */
export function inferLogType(message: string): LogType {
  const m = message.toLowerCase()
  // 1. Warning : symboles + lexique d'échec (priorité absolue, peu importe le sujet)
  if (/^[⚠✗]/.test(message) || /\b(?:bloqué|bloque|échou[eé]|insuffisant|abandonn[eé]|erreur|invalidé|invalid|fail)/i.test(m)) {
    return 'warning'
  }
  // 2. Scrape : sources / cascade
  if (/\b(?:jina|firecrawl|brightdata|datadome|akamai|cloudflare|stealth|premium[_\s]proxy|crawl|scrape|deep[\s-]scrape|fallback|host\s+connu|bypass|anti[\s-]bot|captcha|asp\b)/i.test(m)) {
    return 'scrape'
  }
  // 3. LLM : modèles / IA / tokens
  if (/\b(?:gemini|claude|gpt|deepseek|qwen|kimi|llm|prompt|token[s]?|model[eè]?\s|opus|sonnet|haiku|nano[\s-]?banana|extraction\s+ia)/i.test(m)) {
    return 'llm'
  }
  // 4. Parse : extraction structurée
  if (/\b(?:score|spec[s]?|sp[eé]cifications?|avantages?|images?|pdf[s]?|documents?|breadcrumb|fil\s+d['']ariane|bullet|prix|price|tva|ttc|ht\b|json[-_]?ld|microdata|taxonomie)/i.test(m)) {
    return 'parse'
  }
  // 5. Network : transport
  if (/\b(?:cache|cors|proxy|http|fetch|response|status\s+\d|cloud\s+function|puppeteer|timeout)/i.test(m)) {
    return 'network'
  }
  return 'info'
}

interface Props {
  logs: string[]
  /** Hauteur max du conteneur scrollable. */
  maxHeight?: string
  /** Affiche le compteur total au-dessus des chips (par défaut true). */
  showHeader?: boolean
}

export function TypedLogConsole({ logs, maxHeight = '24rem', showHeader = true }: Props) {
  const typedLogs = useMemo(
    () => logs.map((msg, i) => ({ index: i, message: msg, type: inferLogType(msg) })),
    [logs],
  )

  const counts = useMemo(() => {
    const c: Record<LogType, number> = { warning: 0, scrape: 0, llm: 0, parse: 0, network: 0, info: 0 }
    for (const l of typedLogs) c[l.type]++
    return c
  }, [typedLogs])

  // Par défaut : tous les types activés. Toggle indépendant.
  const [enabled, setEnabled] = useState<Set<LogType>>(
    () => new Set<LogType>(['warning', 'scrape', 'llm', 'parse', 'network', 'info']),
  )

  const filtered = useMemo(
    () => typedLogs.filter((l) => enabled.has(l.type)),
    [typedLogs, enabled],
  )

  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [filtered.length])

  const toggleType = (t: LogType) => {
    setEnabled((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  if (typedLogs.length === 0) return null

  return (
    <div className="rounded-lg bg-black/40 border border-white/[0.06] p-2.5">
      {showHeader && (
        <div className="flex items-center gap-1.5 mb-2">
          <Code2 className="w-3 h-3 text-white/20" />
          <span className="text-[9px] font-semibold text-white/25 uppercase tracking-wider">Console</span>
          <span className="text-[9px] text-white/15 ml-auto tabular-nums">
            {filtered.length}
            {filtered.length !== typedLogs.length && (
              <span className="text-white/15"> / {typedLogs.length}</span>
            )}
          </span>
        </div>
      )}

      {/* Filtre-chips par type — affichés seulement si le type a au moins 1 entrée */}
      <div className="flex flex-wrap gap-1 mb-2">
        {TYPE_ORDER.map((t) => {
          if (counts[t] === 0) return null
          const meta = TYPE_META[t]
          const isOn = enabled.has(t)
          const Icon = meta.Icon
          return (
            <button
              key={t}
              type="button"
              onClick={() => toggleType(t)}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-medium transition-colors ${
                isOn ? meta.chipClassName : 'bg-white/[0.02] border-white/[0.05] text-white/25 hover:text-white/40'
              }`}
              title={`${isOn ? 'Masquer' : 'Afficher'} les logs de type "${meta.label}"`}
            >
              <Icon className="w-2.5 h-2.5" />
              <span>{meta.label}</span>
              <span className="tabular-nums opacity-70">{counts[t]}</span>
            </button>
          )
        })}
      </div>

      {/* Liste des logs filtrés */}
      <div className="space-y-0.5 font-mono overflow-y-auto" style={{ maxHeight }}>
        {filtered.map((entry) => {
          const meta = TYPE_META[entry.type]
          return (
            <div
              key={entry.index}
              className={`text-[10px] leading-relaxed px-1.5 py-0.5 rounded flex items-baseline gap-1.5 ${meta.className}`}
            >
              <span className="text-white/15 select-none tabular-nums shrink-0">
                {String(entry.index + 1).padStart(2, '0')}
              </span>
              <span className="text-white/30 select-none uppercase tracking-wider text-[8px] shrink-0 w-12">
                {meta.label}
              </span>
              <span className="break-words flex-1">{entry.message}</span>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>
    </div>
  )
}
