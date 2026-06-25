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
    const url = buildUrl(this.baseUrl, path)
    console.log('[W2P] GET →', url)
    const res = await fetch(url, { headers: { Authorization: `Bearer ${this.token}` } })
    console.log('[W2P] GET ← status', res.status)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    console.log('[W2P] GET ← json OK', path)
    return json as T
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
}
