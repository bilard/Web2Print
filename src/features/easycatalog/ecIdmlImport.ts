// Détection des marqueurs de champ EasyCatalog dans un IDML.
// Format (relevé sur échantillon réel, cf. spec §11) : sur les <CharacterStyleRange>,
// l'attribut ECTagData="$ID/4 <nom>" ouvre un champ et "$ID/5 <nom>" le ferme ;
// le <Content> du marqueur ne contient qu'un U+FEFF (invisible). Noms URL-encodés.

export interface EcTagInfo {
  kind: 'open' | 'close' | 'none'
  field?: string
}

/** Décode un nom de champ EasyCatalog (URL-encodé) ; fallback sur la valeur brute si invalide. */
export function decodeEcName(raw: string): string {
  try {
    return decodeURIComponent(raw).trim()
  } catch {
    return raw.trim()
  }
}

/** Classe un attribut ECTagData. Forme simple $ID/4 (ouvre) / $ID/5 (ferme) uniquement ;
 *  la forme qualifiée $ID/2 / $ID/3 (chemin data source) est ignorée (ambiguë). */
export function parseEcTag(raw: string | null): EcTagInfo {
  if (!raw) return { kind: 'none' }
  const open = /^\$ID\/4 (.+)$/.exec(raw)
  if (open) return { kind: 'open', field: decodeEcName(open[1]) }
  const close = /^\$ID\/5 (.+)$/.exec(raw)
  if (close) return { kind: 'close', field: decodeEcName(close[1]) }
  return { kind: 'none' }
}

/** Extrait le nom de champ d'un cadre image EasyCatalog : ECPageItemData="2 2 <nom>". */
export function parseEcImageField(raw: string | null): string | null {
  if (!raw) return null
  const m = /^2 2 (.+)$/.exec(raw.trim())
  if (!m) return null
  return decodeEcName(m[1])
}
