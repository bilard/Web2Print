import { describe, it, expect, vi, beforeEach } from 'vitest'

// Couche réseau / auth stubée : on teste l'ASSEMBLAGE des pièces jointes, pas l'I/O.
vi.mock('@/features/gdrive/serverGoogleToken', () => ({
  getServerGoogleToken: vi.fn(() => Promise.resolve('TOKEN')),
}))
vi.mock('@/lib/gmailAuth', () => ({
  sendGmail: vi.fn(() => Promise.resolve({ id: 'msg-1' })),
  fileToBase64: vi.fn(() => Promise.resolve('XLSX_B64')),
}))
vi.mock('@/features/gdrive/gdriveCore', () => ({
  downloadDriveFile: vi.fn(() =>
    Promise.resolve(
      new File([new Uint8Array([1, 2, 3])], 'Workflow Export.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    ),
  ),
}))
// Hook React (ConfigComponent) — évite de tirer Firebase à l'import du module.
vi.mock('@/features/settings/useGoogleServerConnect', () => ({
  useGoogleServerConnect: vi.fn(),
  OAUTH_REDIRECT_URI: '',
}))

import { sendGmail } from '@/lib/gmailAuth'
import { downloadDriveFile } from '@/features/gdrive/gdriveCore'
import { nodeRegistry } from './index'
import './communicationNodes' // effet de bord : enregistre le node
import type { RunContextApi } from '../types'

const node = nodeRegistry.get('send-gmail')!

function mkCtx(): RunContextApi {
  return { signal: new AbortController().signal, log: vi.fn(), rawConfig: undefined }
}

// Config minimale ; le mail unique exige `to`. Les défauts opt-out (attachGSheet /
// attachBodyHtml) sont `?? true` → on les laisse undefined pour tester le défaut.
const baseConfig = {
  to: 'dest@example.com',
  subject: 'traitement OK',
  body: 'Bonjour',
  isHtml: false,
  iterate: false,
  attachmentMode: 'none' as const,
  attachmentFilename: 'extract.csv',
}

const REPORT_HTML = '<html><body><h1>Coûts du mois</h1></body></html>'
const EXPORT_RESULT = {
  id: 'sheet-123',
  name: 'Workflow Export',
  mimeType: 'application/vnd.google-apps.spreadsheet',
  webViewLink: 'https://docs.google.com/x',
}

function sentAttachments() {
  return vi.mocked(sendGmail).mock.calls[0][1].attachments ?? []
}

describe('send-gmail — assemblage des pièces jointes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('HTML sur data + export-result sur gsheet → 2 PJ (rapport.html + .xlsx)', async () => {
    await node.run(mkCtx(), baseConfig, { data: REPORT_HTML, gsheet: EXPORT_RESULT })

    const atts = sentAttachments()
    expect(atts).toHaveLength(2)
    expect(atts.map((a) => a.filename).sort()).toEqual(['Workflow Export.xlsx', 'rapport.html'])
    expect(downloadDriveFile).toHaveBeenCalledWith('sheet-123', 'TOKEN')
  })

  it('export-result seul → 1 PJ .xlsx', async () => {
    await node.run(mkCtx(), baseConfig, { gsheet: EXPORT_RESULT })

    const atts = sentAttachments()
    expect(atts).toHaveLength(1)
    expect(atts[0].filename).toBe('Workflow Export.xlsx')
  })

  it('HTML seul sur data → 1 PJ rapport.html', async () => {
    await node.run(mkCtx(), baseConfig, { data: REPORT_HTML })

    const atts = sentAttachments()
    expect(atts).toHaveLength(1)
    expect(atts[0].filename).toBe('rapport.html')
    expect(atts[0].mimeType).toContain('text/html')
  })

  it('les cases décochées désactivent chaque PJ auto', async () => {
    await node.run(
      mkCtx(),
      { ...baseConfig, attachGSheet: false, attachBodyHtml: false },
      { data: REPORT_HTML, gsheet: EXPORT_RESULT },
    )

    expect(sentAttachments()).toHaveLength(0)
  })

  it('une chaîne NON-HTML sur data n\'est PAS jointe (pas de surprise)', async () => {
    await node.run(mkCtx(), baseConfig, { data: 'juste du texte brut sans balise' })

    expect(sentAttachments()).toHaveLength(0)
  })

  it('une ligne de données avec une colonne `id` n\'est PAS prise pour un export-result', async () => {
    await node.run(mkCtx(), baseConfig, { gsheet: { id: 'ABC', name: 'produit' } })

    expect(downloadDriveFile).not.toHaveBeenCalled()
    expect(sentAttachments()).toHaveLength(0)
  })
})
