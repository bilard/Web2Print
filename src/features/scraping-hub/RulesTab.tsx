import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import { loadRules, saveRules } from './rulesStore'

export function RulesTab() {
  const user = useAuthStore((s) => s.user)
  const [content, setContent] = useState('')
  const [saved, setSaved] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    loadRules()
      .then((doc) => {
        if (!active) return
        setContent(doc.content)
        setSaved(doc.content)
      })
      .catch((err) => toast.error('Échec du chargement : ' + (err as Error).message))
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const dirty = content !== saved

  const onSave = async () => {
    setSaving(true)
    try {
      await saveRules(content, user?.email ?? undefined)
      setSaved(content)
      toast.success('Règles enregistrées')
    } catch (err) {
      toast.error('Échec sauvegarde : ' + (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
        <span className="text-xs text-white/50">
          Règles rédactionnelles — stockées dans Firestore, partagées par l'équipe
        </span>
        <button
          onClick={onSave}
          disabled={!dirty || saving}
          className="px-3 py-1.5 rounded bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30 border border-emerald-400/30 text-xs inline-flex items-center gap-1.5 disabled:opacity-40"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Enregistrer
        </button>
      </div>
      <div className="flex-1 grid grid-cols-2 gap-0 overflow-hidden">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={"# Règles de scraping\n\n## Conventions\n- Jamais de parser par marque\n- Les prix sont toujours TTC sauf mention contraire\n\n## Pièges connus\n- Puppeteer mass-click…\n"}
          className="p-4 bg-black/40 text-white/80 font-mono text-[12px] leading-relaxed resize-none outline-none border-r border-white/10"
        />
        <div className="p-4 overflow-auto bg-[#0f0f0f] prose prose-invert prose-sm max-w-none prose-headings:text-white/90 prose-a:text-indigo-300 prose-code:text-amber-300 prose-code:bg-white/5 prose-code:px-1 prose-code:rounded">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content || '_Zone vide — écris du markdown à gauche_'}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  )
}
