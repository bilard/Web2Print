/**
 * Sélecteur partagé de source d'URLs pour le scraping.
 *
 * Quatre modes :
 *   - `single` : une seule URL (la prop `singleUrl` du parent)
 *   - `list`   : textarea où l'user colle un texte ; toutes les http(s) URLs
 *                sont auto-détectées
 *   - `file`   : import CSV/Excel/TSV ; auto-détection de la colonne URL
 *   - `sheet`  : import Google Sheet via OAuth Drive (requiert connexion)
 *
 * Exporte le UrlSource type + les URLs résolues via `onChange`. Utilisé dans
 * ScrapeTab, CrawlTab et MapExtractTab pour cohérence d'expérience.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link2, ListPlus, FileSpreadsheet, Cloud, Loader2, X as XIcon } from 'lucide-react'
import { extractUrlsFromFile, extractUrlsFromGoogleSheet, extractUrlsFromText } from './urlSourceParsers'
import { useGDriveStore } from '@/stores/gdrive.store'
import { toast } from 'sonner'

export type UrlSource = 'single' | 'list' | 'file' | 'sheet'

interface Props {
  /** L'URL "principale" affichée dans le mode `single` (ex: la barre d'URL du modal). */
  singleUrl: string
  /** Callback : émis chaque fois que la liste résolue change.
   *  - mode `single` → [singleUrl] si non vide, sinon []
   *  - autres modes → URLs détectées/importées */
  onChange: (urls: string[], source: UrlSource) => void
  /** Affiche l'aperçu inline des 10 premières URLs en mode multi.
   *  `false` si le parent veut afficher son propre aperçu. */
  showPreview?: boolean
}

export function UrlSourceSelector({ singleUrl, onChange, showPreview = true }: Props) {
  const [source, setSource] = useState<UrlSource>('single')
  const [listText, setListText] = useState('')
  const [importedUrls, setImportedUrls] = useState<string[]>([])
  const [sheetIdOrUrl, setSheetIdOrUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const gdriveAccessToken = useGDriveStore((s) => s.accessToken)
  const gdriveConnected = useGDriveStore((s) => s.connected)
  const gdriveDisconnect = useGDriveStore((s) => s.disconnect)

  const listUrls = useMemo(
    () => (source === 'list' ? extractUrlsFromText(listText) : []),
    [source, listText],
  )
  const resolved = useMemo(() => {
    if (source === 'single') return singleUrl ? [singleUrl] : []
    if (source === 'list') return listUrls
    return importedUrls
  }, [source, singleUrl, listUrls, importedUrls])

  // Émet vers le parent à chaque changement
  useEffect(() => {
    onChange(resolved, source)
  }, [resolved, source, onChange])

  const handleFileUpload = async (file: File | null) => {
    if (!file) return
    setImporting(true)
    try {
      const urls = await extractUrlsFromFile(file)
      setImportedUrls(urls)
      if (urls.length === 0) toast.warning(`Aucune URL trouvée dans ${file.name}`)
      else toast.success(`${urls.length} URL(s) détectée(s) dans ${file.name}`)
    } catch (e) {
      toast.error(`Échec import : ${e instanceof Error ? e.message : 'inconnu'}`)
    } finally {
      setImporting(false)
    }
  }

  const handleSheetImport = async () => {
    if (!gdriveAccessToken) {
      toast.error('Connecte Google Drive dans Paramètres → Connectors')
      return
    }
    const idMatch = sheetIdOrUrl.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/) ?? sheetIdOrUrl.match(/^([a-zA-Z0-9-_]{20,})$/)
    const fileId = idMatch?.[1]
    if (!fileId) {
      toast.error('ID ou URL de Sheet invalide')
      return
    }
    setImporting(true)
    try {
      const result = await extractUrlsFromGoogleSheet(fileId, gdriveAccessToken)
      setImportedUrls(result.urls)
      if (result.urls.length === 0) {
        toast.warning(
          `Aucune URL trouvée dans le Sheet (${result.rowCount} lignes, colonne : "${result.detectedColumn ?? 'non détectée'}", méthode : ${result.method})`
        )
      } else {
        const colInfo = result.detectedColumn ? `colonne "${result.detectedColumn}"` : 'fallback texte'
        toast.success(`${result.urls.length} URL(s) importée(s) sur ${result.rowCount} lignes (${colInfo})`)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'inconnu'
      if (msg === 'TOKEN_EXPIRED') {
        gdriveDisconnect()
        toast.error('Session Google Drive expirée — reconnecte-toi dans Paramètres → Connectors')
      } else {
        toast.error(`Échec import Sheet : ${msg}`)
      }
    } finally {
      setImporting(false)
    }
  }

  const isMulti = source !== 'single'
  const multiUrls = source === 'list' ? listUrls : importedUrls

  return (
    <div className="space-y-3">
      {/* Sélecteur 4 boutons */}
      <div>
        <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1">Source des URLs</label>
        <div className="flex rounded-md overflow-hidden border border-white/10">
          {([
            ['single', '1 URL', Link2],
            ['list', 'Liste', ListPlus],
            ['file', 'Fichier', FileSpreadsheet],
            ['sheet', 'Google Sheet', Cloud],
          ] as [UrlSource, string, typeof Link2][]).map(([s, label, Icon]) => (
            <button
              key={s}
              onClick={() => { setSource(s); setImportedUrls([]) }}
              className={`flex-1 flex items-center justify-center gap-1.5 text-[11px] px-2 py-1.5 transition-colors ${
                source === s ? 'bg-indigo-500/20 text-indigo-300' : 'text-white/30 hover:text-white/50'
              }`}
            >
              <Icon className="w-3 h-3" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Mode "Liste" */}
      {source === 'list' && (
        <div>
          <label className="text-[10px] text-white/30 uppercase tracking-wider flex items-center justify-between mb-1.5">
            <span>Liste d'URLs (une par ligne)</span>
            {listUrls.length > 0 && (
              <span className="text-[10px] text-emerald-400/80 normal-case tracking-normal">
                {listUrls.length} URL{listUrls.length > 1 ? 's' : ''} détectée{listUrls.length > 1 ? 's' : ''}
              </span>
            )}
          </label>
          <textarea
            value={listText}
            onChange={(e) => setListText(e.target.value)}
            placeholder={'https://example.com/produit-1\nhttps://example.com/produit-2\nhttps://example.com/produit-3'}
            rows={6}
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/70 placeholder:text-white/20 focus:border-indigo-500/50 focus:outline-none resize-y transition-colors font-mono"
          />
          <p className="text-[10px] text-white/25 mt-1">Colle un texte libre — toutes les URLs http(s) sont détectées automatiquement.</p>
        </div>
      )}

      {/* Mode "Fichier" */}
      {source === 'file' && (
        <div className="space-y-2">
          <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1.5">Fichier CSV ou Excel</label>
          <div className="flex gap-2">
            <input
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm,.ods"
              onChange={(e) => handleFileUpload(e.target.files?.[0] ?? null)}
              disabled={importing}
              className="flex-1 text-[11px] text-white/60 file:mr-2 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-[11px] file:bg-indigo-500/20 file:text-indigo-300 hover:file:bg-indigo-500/30 file:cursor-pointer"
            />
            {importing && <Loader2 className="w-4 h-4 text-indigo-400 animate-spin self-center" />}
          </div>
          <p className="text-[10px] text-white/25">Auto-détection de la colonne URL (header "url"/"lien"/"link" ou contenu http).</p>
          {importedUrls.length > 0 && (
            <div className="flex items-center justify-between p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
              <span className="text-[11px] text-emerald-300">{importedUrls.length} URL{importedUrls.length > 1 ? 's' : ''} importée{importedUrls.length > 1 ? 's' : ''}</span>
              <button onClick={() => setImportedUrls([])} className="text-emerald-400/60 hover:text-emerald-300">
                <XIcon className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Mode "Google Sheet" */}
      {source === 'sheet' && (
        <div className="space-y-2">
          <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1.5">URL ou ID du Google Sheet</label>
          {!gdriveConnected && (
            <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-300/80">
              Connecte Google Drive dans Paramètres → Connectors avant d'importer un Sheet.
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={sheetIdOrUrl}
              onChange={(e) => setSheetIdOrUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/ABC.../edit  ou  ABC..."
              disabled={!gdriveConnected || importing}
              className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/70 placeholder:text-white/20 focus:border-indigo-500/50 focus:outline-none transition-colors font-mono disabled:opacity-40"
            />
            <button
              onClick={handleSheetImport}
              disabled={!gdriveConnected || importing || !sheetIdOrUrl.trim()}
              className="px-3 py-1.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 text-[11px] font-medium disabled:opacity-40 transition-colors"
            >
              {importing ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Importer'}
            </button>
          </div>
          {importedUrls.length > 0 && (
            <div className="flex items-center justify-between p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
              <span className="text-[11px] text-emerald-300">{importedUrls.length} URL{importedUrls.length > 1 ? 's' : ''} importée{importedUrls.length > 1 ? 's' : ''}</span>
              <button onClick={() => setImportedUrls([])} className="text-emerald-400/60 hover:text-emerald-300">
                <XIcon className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Aperçu des URLs en mode multi */}
      {showPreview && isMulti && multiUrls.length > 0 && (
        <div className="max-h-32 overflow-y-auto space-y-0.5 p-2 bg-black/20 border border-white/[0.06] rounded-lg">
          {multiUrls.slice(0, 10).map((u, i) => (
            <p key={i} className="text-[10px] text-white/40 font-mono truncate" title={u}>
              <span className="text-white/15 mr-1.5">{String(i + 1).padStart(2, '0')}</span>{u}
            </p>
          ))}
          {multiUrls.length > 10 && (
            <p className="text-[10px] text-white/25 italic">… et {multiUrls.length - 10} autre{multiUrls.length - 10 > 1 ? 's' : ''}</p>
          )}
        </div>
      )}
    </div>
  )
}
