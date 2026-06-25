// indesign-plugin/src/lib/client.ts
export interface DatasetSummary { docId: string; fileName: string; sheetCount: number; rowCount: number }
export interface ColumnInfo { key: string; label: string; fieldType: string }
interface ValueEntry { key: string; label: string; value: string }
export interface RowResult { rowIndex: number; total: number; values: ValueEntry[] }

export function buildUrl(baseUrl: string, path: string): string {
  return baseUrl.replace(/\/+$/, '') + path
}

export class PluginClient {
  constructor(private baseUrl: string, private token: string) {}

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(buildUrl(this.baseUrl, path), { headers: { Authorization: `Bearer ${this.token}` } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json() as Promise<T>
  }

  async listDatasets(): Promise<DatasetSummary[]> {
    return (await this.get<{ datasets: DatasetSummary[] }>('/datasets')).datasets
  }
  async columns(docId: string): Promise<ColumnInfo[]> {
    return (await this.get<{ columns: ColumnInfo[] }>(`/datasets/${docId}`)).columns
  }
  async row(docId: string, i: number): Promise<RowResult> {
    return this.get<RowResult>(`/datasets/${docId}/row?i=${i}`)
  }
  /** CSV complet (Fusion de données InDesign) — indépendant de l'objet app InDesign. */
  async csv(docId: string): Promise<string> {
    const res = await fetch(buildUrl(this.baseUrl, `/datasets/${docId}/csv`), {
      headers: { Authorization: `Bearer ${this.token}` },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.text()
  }
}
