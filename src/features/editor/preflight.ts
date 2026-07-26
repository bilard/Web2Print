// Preflight d'impression : contrôles pré-export sur les objets du canvas.
// Cœur pur (runPreflight, testable) + collecteur Fabric (collectPreflightInfo).
import type { Canvas, FabricObject, FabricImage, Textbox } from 'fabric'

const TYPE_LABELS: Record<string, string> = {
  image: 'Image',
  textbox: 'Texte',
  'i-text': 'Texte',
  text: 'Texte',
  rect: 'Rectangle',
  circle: 'Cercle',
  group: 'Groupe',
  path: 'Tracé',
}

/** Nom lisible : name explicite, sinon extrait du texte, sinon le type. */
function objectLabel(o: FabricObject): string {
  const name = (o.data?.name as string | undefined) ?? (o as { name?: string }).name
  if (name) return name
  const text = (o as Textbox).text
  if (typeof text === 'string' && text.trim()) return `« ${text.trim().slice(0, 24)}${text.trim().length > 24 ? '…' : ''} »`
  return TYPE_LABELS[o.type ?? ''] ?? 'Objet'
}

type PreflightKind = 'low-res-image' | 'out-of-page' | 'tiny-text' | 'near-edge-text'

export interface PreflightIssue {
  /** data.id de l'objet — permet de le sélectionner au clic. */
  objectId: string | null
  objectName: string
  severity: 'error' | 'warning'
  kind: PreflightKind
  message: string
}

export interface PreflightObjectInfo {
  id: string | null
  name: string
  isImage: boolean
  isText: boolean
  /** Bbox affichée (px document, scaling inclus). */
  left: number
  top: number
  width: number
  height: number
  /** Largeur native du bitmap (images). */
  naturalWidth?: number
  /** Taille de police effective en px (fontSize × scaleY). */
  fontSizePx?: number
}

export interface PreflightDocInfo {
  width: number
  height: number
  dpi: number
  /** Marge de sécurité texte (mm) — défaut 3. */
  safeMm?: number
  /** Fond perdu toléré pour le dépassement de page (mm). */
  bleedMm?: number
}

const mmToPx = (mm: number, dpi: number) => (mm / 25.4) * dpi
const pxToPt = (px: number, dpi: number) => (px / dpi) * 72

/** Seuils : < 150 DPI effectif = erreur, < 225 = avertissement ; texte < 5 pt. */
export function runPreflight(objects: PreflightObjectInfo[], doc: PreflightDocInfo): PreflightIssue[] {
  const issues: PreflightIssue[] = []
  const safePx = mmToPx(doc.safeMm ?? 3, doc.dpi)
  const bleedPx = mmToPx(doc.bleedMm ?? 0, doc.dpi)

  for (const o of objects) {
    // Résolution effective des images : pixels natifs ÷ largeur imprimée (pouces).
    if (o.isImage && o.naturalWidth && o.width > 0) {
      const printedInches = o.width / doc.dpi
      const effectiveDpi = Math.round(o.naturalWidth / printedInches)
      if (effectiveDpi < 150) {
        issues.push({
          objectId: o.id, objectName: o.name, severity: 'error', kind: 'low-res-image',
          message: `Image à ${effectiveDpi} DPI effectifs (min. 150) — risque de pixellisation à l'impression.`,
        })
      } else if (effectiveDpi < 225) {
        issues.push({
          objectId: o.id, objectName: o.name, severity: 'warning', kind: 'low-res-image',
          message: `Image à ${effectiveDpi} DPI effectifs — correct mais sous les 225 DPI recommandés.`,
        })
      }
    }

    // Dépassement de page au-delà du fond perdu toléré.
    const out =
      o.left < -bleedPx || o.top < -bleedPx ||
      o.left + o.width > doc.width + bleedPx || o.top + o.height > doc.height + bleedPx
    if (out) {
      const fullyOut = o.left + o.width < 0 || o.top + o.height < 0 || o.left > doc.width || o.top > doc.height
      issues.push({
        objectId: o.id, objectName: o.name,
        severity: fullyOut ? 'error' : 'warning', kind: 'out-of-page',
        message: fullyOut
          ? 'Objet entièrement hors page — il ne sera pas imprimé.'
          : `Objet déborde de la page au-delà du fond perdu (${doc.bleedMm ?? 0} mm).`,
      })
    }

    if (o.isText && o.fontSizePx !== undefined) {
      const pt = pxToPt(o.fontSizePx, doc.dpi)
      if (pt < 5) {
        issues.push({
          objectId: o.id, objectName: o.name, severity: 'warning', kind: 'tiny-text',
          message: `Texte à ${pt.toFixed(1)} pt — illisible à l'impression (min. conseillé 5 pt).`,
        })
      }
      // Texte dans la marge de sécurité (hors objets déjà signalés hors page).
      const nearEdge =
        !out && (o.left < safePx || o.top < safePx ||
          o.left + o.width > doc.width - safePx || o.top + o.height > doc.height - safePx)
      if (nearEdge) {
        issues.push({
          objectId: o.id, objectName: o.name, severity: 'warning', kind: 'near-edge-text',
          message: `Texte à moins de ${doc.safeMm ?? 3} mm du bord — risque d'être rogné à la coupe.`,
        })
      }
    }
  }
  return issues
}

/** Extrait les infos preflight des objets « réels » du canvas (hors grille/fond/marques). */
export function collectPreflightInfo(canvas: Canvas): PreflightObjectInfo[] {
  return canvas
    .getObjects()
    .filter((o) => !o.data?.isGrid && !o.data?.isPageBg && !o.data?.isPrintMark)
    .map((o: FabricObject) => {
      const isImage = o.type === 'image'
      const isText = o.type === 'textbox' || o.type === 'i-text' || o.type === 'text'
      const el = isImage ? (o as FabricImage).getElement() as HTMLImageElement | HTMLCanvasElement | undefined : undefined
      const naturalWidth = el
        ? ('naturalWidth' in el && el.naturalWidth ? el.naturalWidth : el.width)
        : undefined
      return {
        id: (o.data?.id as string | undefined) ?? null,
        name: objectLabel(o),
        isImage,
        isText,
        left: o.left ?? 0,
        top: o.top ?? 0,
        width: o.getScaledWidth(),
        height: o.getScaledHeight(),
        naturalWidth,
        fontSizePx: isText ? ((o as Textbox).fontSize ?? 16) * (o.scaleY ?? 1) : undefined,
      }
    })
}
