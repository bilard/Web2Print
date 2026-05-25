// src/features/workflows/runtime/exportResult.ts
// Détection du résultat d'export dans les outputs d'un node (partagé entre le RunPanel et le
// worker Telegram). Un node d'export produit un objet { url, filename, mime? }.

export interface ExportPayload {
  url: string
  mime?: string
  filename: string
}

export function findExportResult(
  outputs: Record<string, unknown> | undefined,
): ExportPayload | null {
  if (!outputs) return null
  for (const v of Object.values(outputs)) {
    if (
      v &&
      typeof v === 'object' &&
      'url' in v &&
      'filename' in v &&
      typeof (v as ExportPayload).url === 'string' &&
      typeof (v as ExportPayload).filename === 'string'
    ) {
      return v as ExportPayload
    }
  }
  return null
}
