import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Trash2, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'
import { readDebugLog, clearDebugLog, type DebugEntry } from './debugLog'

export function DebugTab() {
  const [entries, setEntries] = useState<DebugEntry[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const refresh = () => setEntries(readDebugLog())

  useEffect(() => {
    refresh()
    const id = window.setInterval(refresh, 2000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
        <span className="text-xs text-white/50">
          {entries.length} requête{entries.length > 1 ? 's' : ''} loggée{entries.length > 1 ? 's' : ''} (max 30 · rafraîchi toutes les 2s)
        </span>
        <div className="flex gap-2">
          <button
            onClick={refresh}
            className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-white/60 text-[11px] inline-flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" /> Rafraîchir
          </button>
          <button
            onClick={() => { clearDebugLog(); refresh() }}
            className="px-2 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-300 text-[11px] inline-flex items-center gap-1 border border-red-400/20"
          >
            <Trash2 className="w-3 h-3" /> Vider
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4 space-y-2">
        {entries.length === 0 && (
          <div className="text-center text-white/40 text-sm mt-8">
            Aucune requête encore. Lance un enrichissement pour voir ce qui est envoyé à Jina et au LLM.
          </div>
        )}
        {entries.map((e) => {
          const isOpen = expanded[e.id] ?? false
          return (
            <div key={e.id} className="border border-white/10 rounded-lg overflow-hidden bg-black/30">
              <button
                onClick={() => setExpanded((prev) => ({ ...prev, [e.id]: !isOpen }))}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.03] text-left"
              >
                {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-white/40" /> : <ChevronRight className="w-3.5 h-3.5 text-white/40" />}
                <span className={`px-1.5 py-0.5 text-[9px] uppercase tracking-wider rounded ${e.kind === 'jina' ? 'bg-amber-500/15 text-amber-300' : 'bg-indigo-500/15 text-indigo-300'}`}>
                  {e.kind}
                </span>
                <span className="text-[11px] text-white/70 font-mono flex-1 truncate">
                  {e.kind === 'jina' ? e.url : `${e.provider}/${e.model} — ${e.task}`}
                </span>
                <span className="text-[10px] text-white/40">{new Date(e.timestamp).toLocaleTimeString()}</span>
                {e.error && <span className="text-[10px] text-red-400">error</span>}
              </button>
              {isOpen && (
                <div className="px-3 pb-3 space-y-2 text-[11px]">
                  {e.kind === 'jina' ? (
                    <>
                      <Section title="URL">{e.url}</Section>
                      <Section title="Headers">{JSON.stringify(e.headers, null, 2)}</Section>
                      {e.error && <Section title="Erreur" error>{e.error}</Section>}
                      {e.response && (
                        <details className="border border-white/10 rounded">
                          <summary className="px-2 py-1 cursor-pointer text-white/60">Réponse markdown ({e.response.length} caractères)</summary>
                          <div className="p-3 prose prose-invert prose-sm max-w-none max-h-96 overflow-auto">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{e.response}</ReactMarkdown>
                          </div>
                        </details>
                      )}
                    </>
                  ) : (
                    <>
                      <Section title="Provider / modèle / tâche">{`${e.provider} · ${e.model} · ${e.task} (T=${e.temperature})`}</Section>
                      {e.tool_name && <Section title="Tool">{e.tool_name}</Section>}
                      <Section title="Messages">
                        {e.messages.map((m, i) => (
                          <div key={i} className="mb-2">
                            <div className="text-[10px] text-white/50 uppercase tracking-wider">{m.role}</div>
                            <pre className="whitespace-pre-wrap bg-black/40 p-2 rounded border border-white/5 text-white/80">{m.content}</pre>
                          </div>
                        ))}
                      </Section>
                      {e.error && <Section title="Erreur" error>{e.error}</Section>}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Section({ title, children, error = false }: { title: string; children: React.ReactNode; error?: boolean }) {
  return (
    <div>
      <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">{title}</div>
      <pre className={`whitespace-pre-wrap bg-black/40 p-2 rounded border border-white/5 ${error ? 'text-red-300' : 'text-white/80'}`}>{children}</pre>
    </div>
  )
}
