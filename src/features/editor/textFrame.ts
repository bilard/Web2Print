/**
 * Bloc de texte « à la InDesign » — le Textbox EST le cadre.
 *
 * Fabric.js ne connaît qu'une boîte dont la hauteur est celle du texte : ni fond
 * de cadre, ni contour, ni marges internes, ni retraits de paragraphe. L'import
 * IDML compensait en créant DEUX objets (un Rect de fond + un Textbox), d'où un
 * texte « hors de son bloc » à l'écran et dans le panneau Calques.
 *
 * Ce module patche une instance de Textbox pour qu'elle porte elle-même son
 * cadre : dimensions propres, fond, contour, arrondi, marges (InsetSpacing),
 * justification verticale, redimensionnement automatique et retraits de
 * paragraphe. Le patch vit sur l'instance (pas de sous-classe) pour que
 * `type: 'textbox'` reste intact dans le JSON — plusieurs chemins de
 * (dé)sérialisation testent ce type sous forme de chaîne.
 *
 * Les valeurs sont stockées dans `data.textFrame` : elles survivent au
 * `toObject()`/`loadFromJSON()` de Fabric, et `patchTextFrame` les réactive
 * au rechargement du projet.
 */
import { Textbox } from 'fabric'
import type { FabricObject } from 'fabric'

export type VerticalAlign = 'top' | 'center' | 'bottom'

/** Reprend AutoSizingType d'InDesign : cadre fixe, ou grandissant en H / L / les deux. */
export type AutoSizing = 'off' | 'height' | 'width' | 'both'

/** Retraits et espaces d'un paragraphe, en unités locales du Textbox (≈ pt). */
export interface ParagraphIndents {
  left?: number
  right?: number
  firstLine?: number
  lastLine?: number
  spaceBefore?: number
  spaceAfter?: number
}

export interface TextFrameProps {
  /** Largeur du cadre en unités locales (avant scaleX de l'objet). */
  frameW: number
  /** Hauteur du cadre en unités locales (avant scaleY de l'objet). */
  frameH: number
  fill?: string | null
  stroke?: string | null
  strokeWidth?: number
  /** Alignement du contour sur le tracé — « Alignements des contours » d'InDesign. */
  strokeAlign?: 'center' | 'inside' | 'outside'
  strokeDashArray?: number[] | null
  /** Arrondi uniforme des 4 coins (unités locales). */
  cornerRadius?: number
  insetTop?: number
  insetRight?: number
  insetBottom?: number
  insetLeft?: number
  verticalAlign?: VerticalAlign
  autoSizing?: AutoSizing
  /** Bord horizontal qui reste fixe quand le cadre s'auto-redimensionne. */
  anchorX?: 'left' | 'center' | 'right'
  /** Bord vertical qui reste fixe quand le cadre s'auto-redimensionne. */
  anchorY?: 'top' | 'center' | 'bottom'
  /** Retraits appliqués à tout le bloc (valeurs éditées dans la palette). */
  indents?: ParagraphIndents
  /** Retraits par paragraphe (index de ligne logique), issus de l'import IDML. */
  paraIndents?: ParagraphIndents[]
}

type PatchedTextbox = Textbox & {
  data?: Record<string, unknown>
  __textFramePatched?: boolean
  /** Garde anti-récursion pendant l'ajustement de largeur automatique. */
  __textFrameSizing?: boolean
  /** Vrai dès la première composition : l'ancrage ne compense qu'après elle. */
  __textFrameMeasured?: boolean
  _styleMap?: Record<number, { line: number }>
  _textLines?: unknown[]
  _clearCache?: () => void
  getMinWidth?: () => number
  initDimensions: () => void
  _getTopOffset: () => number
  _getLineLeftOffset: (lineIndex: number) => number
  getHeightOfLine: (lineIndex: number) => number
  getLineWidth: (lineIndex: number) => number
  isEndOfWrapping: (lineIndex: number) => boolean
  calcTextHeight: () => number
}

/** Signature de `Textbox#_wrapLine` — non exportée par Fabric, redécrite ici. */
type WrapLineFn = (
  lineIndex: number,
  desiredWidth: number,
  data: { largestWordWidth: number; wordsData: unknown[] },
  reservedSpace?: number,
) => string[][]

const EMPTY_INDENTS: ParagraphIndents = {}

/** Lit les props de cadre d'un objet Fabric, ou `null` si ce n'est pas un bloc de texte. */
export function getTextFrame(obj: FabricObject | null | undefined): TextFrameProps | null {
  const tf = (obj as PatchedTextbox | null | undefined)?.data?.textFrame
  return tf ? (tf as TextFrameProps) : null
}

/** Vrai si l'objet est un Textbox porteur d'un cadre InDesign. */
export function isTextFrame(obj: FabricObject | null | undefined): boolean {
  return obj instanceof Textbox && getTextFrame(obj) !== null
}

/**
 * Applique (ou met à jour) les props de cadre sur un Textbox et active le patch
 * de rendu. Appeler après chaque modification depuis la palette.
 */
export function applyTextFrame(textbox: FabricObject, props: Partial<TextFrameProps>): void {
  const tb = textbox as PatchedTextbox
  // Premier passage sur un texte ordinaire (créé dans l'éditeur, importé d'un SVG) :
  // il n'avait pas de cadre. On adopte ses dimensions courantes, en hauteur
  // automatique — c'est le comportement natif d'un Textbox Fabric.
  const current: TextFrameProps = getTextFrame(textbox)
    ?? { frameW: tb.width ?? 0, frameH: tb.height ?? 0, autoSizing: 'height' }
  const next: TextFrameProps = { ...current, ...props }
  // MUTER `data`, ne pas le remplacer : il circule par référence (cf. useAutoSave,
  // connecteurs de fusion, règles conditionnelles). Le remplacer périmerait
  // silencieusement toute référence prise ailleurs — les liens de champs en tête.
  if (!tb.data) tb.data = {}
  tb.data.textFrame = next
  patchTextFrame(textbox)
  // Les retraits et les marges changent la largeur de composition → recomposer.
  tb.dirty = true
  tb._clearCache?.()
  tb.initDimensions()
  tb.setCoords()
}

/**
 * Retraits effectifs du paragraphe `paraIndex`.
 * `indents` (réglé dans la palette, pour tout le bloc) PRIME champ par champ sur
 * `paraIndents` (importé du style de paragraphe InDesign) : sans cela, une valeur
 * saisie par l'utilisateur n'aurait aucun effet sur un bloc issu d'un IDML.
 */
export function indentsFor(f: TextFrameProps, paraIndex: number): ParagraphIndents {
  const per = f.paraIndents?.[paraIndex] ?? EMPTY_INDENTS
  const base = f.indents ?? EMPTY_INDENTS
  return {
    left: base.left ?? per.left,
    right: base.right ?? per.right,
    firstLine: base.firstLine ?? per.firstLine,
    lastLine: base.lastLine ?? per.lastLine,
    spaceBefore: base.spaceBefore ?? per.spaceBefore,
    spaceAfter: base.spaceAfter ?? per.spaceAfter,
  }
}

/** Index du paragraphe (ligne logique) auquel appartient la ligne visuelle `lineIndex`. */
function paraIndexOf(tb: PatchedTextbox, lineIndex: number): number {
  return tb._styleMap?.[lineIndex]?.line ?? lineIndex
}

/** Vrai si `lineIndex` est la première ligne visuelle de son paragraphe. */
function isFirstLineOfPara(tb: PatchedTextbox, lineIndex: number): boolean {
  if (lineIndex === 0) return true
  return paraIndexOf(tb, lineIndex) !== paraIndexOf(tb, lineIndex - 1)
}

/** Vrai si `lineIndex` est la dernière ligne visuelle de son paragraphe. */
function isLastLineOfPara(tb: PatchedTextbox, lineIndex: number): boolean {
  const total = tb._textLines?.length ?? 0
  if (lineIndex >= total - 1) return true
  return paraIndexOf(tb, lineIndex) !== paraIndexOf(tb, lineIndex + 1)
}

/** Somme des espaces avant/après insérés entre les lignes (hors dernière ligne). */
function totalParagraphSpacing(tb: PatchedTextbox, f: TextFrameProps): number {
  const total = tb._textLines?.length ?? 0
  let sum = 0
  for (let i = 0; i < total - 1; i++) sum += extraSpacingAfterLine(tb, f, i)
  return sum
}

/** Espace supplémentaire inséré APRÈS la ligne visuelle `i` (espace après + espace avant du suivant). */
function extraSpacingAfterLine(tb: PatchedTextbox, f: TextFrameProps, i: number): number {
  const total = tb._textLines?.length ?? 0
  if (i >= total - 1) return 0
  let extra = 0
  if (isLastLineOfPara(tb, i)) extra += indentsFor(f, paraIndexOf(tb, i)).spaceAfter ?? 0
  if (isFirstLineOfPara(tb, i + 1)) extra += indentsFor(f, paraIndexOf(tb, i + 1)).spaceBefore ?? 0
  return extra
}

/** Largeur de mesure « sans repli » — au-delà de toute page imprimable. */
const UNWRAPPED_WIDTH = 100000
/** Un cadre ne descend pas sous cette largeur, sinon Fabric ne sait plus composer. */
const MIN_FRAME_WIDTH = 4

/**
 * Compense la position pour que le point d'ancrage du redimensionnement
 * automatique reste immobile. L'objet a son origine au centre : agrandir de `dw`
 * écarte chaque bord de `dw/2`, il faut donc rendre ce demi-écart au bord ancré.
 * Le décalage est exprimé en local, puis porté dans le monde par scale + rotation.
 */
function keepAnchorFixed(tb: PatchedTextbox, f: TextFrameProps, dw: number, dh: number): void {
  const ax = f.anchorX ?? 'center'
  const ay = f.anchorY ?? 'center'
  const dxLocal = ax === 'left' ? dw / 2 : ax === 'right' ? -dw / 2 : 0
  const dyLocal = ay === 'top' ? dh / 2 : ay === 'bottom' ? -dh / 2 : 0
  if (dxLocal === 0 && dyLocal === 0) return
  const dx = dxLocal * (tb.scaleX ?? 1)
  const dy = dyLocal * (tb.scaleY ?? 1)
  const rad = ((tb.angle ?? 0) * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  tb.left = (tb.left ?? 0) + dx * cos - dy * sin
  tb.top = (tb.top ?? 0) + dx * sin + dy * cos
  tb.setCoords()
}

/** Trace le rectangle du cadre, arrondi si besoin, avec un décalage `inset`. */
function traceFrame(ctx: CanvasRenderingContext2D, w: number, h: number, radius: number, inset: number): void {
  const iw = Math.max(w - inset * 2, 0)
  const ih = Math.max(h - inset * 2, 0)
  const r = Math.max(0, Math.min(radius, iw / 2, ih / 2))
  ctx.beginPath()
  if (r > 0 && typeof ctx.roundRect === 'function') {
    ctx.roundRect(-iw / 2, -ih / 2, iw, ih, r)
  } else {
    ctx.rect(-iw / 2, -ih / 2, iw, ih)
  }
}

/**
 * Dessine le cadre (fond + contour arrondi) dans le repère local du Textbox.
 * Le contour respecte son alignement InDesign : centré sur le tracé du bloc,
 * ou entièrement à l'intérieur / à l'extérieur.
 */
function renderFrame(ctx: CanvasRenderingContext2D, tb: PatchedTextbox, f: TextFrameProps): void {
  const w = tb.width ?? 0
  const h = tb.height ?? 0
  const fill = f.fill && f.fill !== 'transparent' ? f.fill : null
  const strokeW = f.strokeWidth ?? 0
  const stroke = strokeW > 0 && f.stroke && f.stroke !== 'transparent' ? f.stroke : null
  if (!fill && !stroke) return

  const radius = f.cornerRadius ?? 0
  ctx.save()
  if (fill) {
    traceFrame(ctx, w, h, radius, 0)
    ctx.fillStyle = fill
    ctx.fill()
  }
  if (stroke) {
    // Canvas centre toujours le trait : on décale le tracé d'un demi-trait pour
    // obtenir « à l'intérieur » ou « à l'extérieur ».
    const align = f.strokeAlign ?? 'center'
    const shift = align === 'inside' ? strokeW / 2 : align === 'outside' ? -strokeW / 2 : 0
    traceFrame(ctx, w, h, Math.max(radius - shift, 0), shift)
    ctx.strokeStyle = stroke
    ctx.lineWidth = strokeW
    ctx.setLineDash(f.strokeDashArray ?? [])
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * Active le rendu « bloc de texte » sur une instance de Textbox portant
 * `data.textFrame`. Idempotent — sans effet si déjà patchée ou sans cadre.
 */
export function patchTextFrame(textbox: FabricObject): void {
  const tb = textbox as PatchedTextbox
  if (tb.__textFramePatched) return
  if (!(textbox instanceof Textbox)) return
  if (!getTextFrame(textbox)) return

  // ── Dimensions : la hauteur est celle du CADRE, pas celle du texte ────────
  const origInitDimensions = tb.initDimensions.bind(tb)
  tb.initDimensions = function (this: PatchedTextbox) {
    const f = getTextFrame(this)
    if (!f) { origInitDimensions(); return }
    const mode = f.autoSizing ?? 'off'
    const widthBefore = this.width ?? 0
    const heightBefore = this.height ?? 0
    origInitDimensions()

    // Largeur automatique : le cadre se cale sur le texte NON REPLIÉ.
    // `width` reste la largeur du cadre — c'est elle que Fabric expose aux
    // poignées latérales, on ne la réécrit donc JAMAIS en cadre fixe, sinon un
    // redimensionnement à la souris serait annulé à la recomposition suivante.
    if ((mode === 'width' || mode === 'both') && !this.__textFrameSizing) {
      this.__textFrameSizing = true
      const insH = (f.insetLeft ?? 0) + (f.insetRight ?? 0)
      // Mesurer d'abord sans contrainte : mesurer le texte DÉJÀ REPLIÉ donnerait
      // un point fixe dégénéré — le cadre resterait à jamais à sa largeur étroite,
      // et ne rétrécirait pas non plus quand on efface des caractères.
      this._set('width', UNWRAPPED_WIDTH)
      origInitDimensions()
      let maxLineW = 0
      for (let i = 0; i < (this._textLines?.length ?? 0); i++) {
        const ind = indentsFor(f, paraIndexOf(this, i))
        const lw = this.getLineWidth(i) + (ind.left ?? 0) + (ind.right ?? 0) +
          (isFirstLineOfPara(this, i) ? (ind.firstLine ?? 0) : 0)
        if (lw > maxLineW) maxLineW = lw
      }
      const target = Math.max(maxLineW + insH, MIN_FRAME_WIDTH)
      this._set('width', target)
      origInitDimensions()
      this.__textFrameSizing = false
    }

    const insV = (f.insetTop ?? 0) + (f.insetBottom ?? 0)
    const contentH = this.calcTextHeight() + totalParagraphSpacing(this, f) + insV
    if (mode === 'height' || mode === 'both') {
      // Cadre auto-grandissant : il ne descend jamais sous la hauteur importée.
      this.height = Math.max(contentH, f.frameH)
    } else {
      this.height = f.frameH > 0 ? f.frameH : contentH
    }

    // Le cadre grandit depuis son point d'ancrage InDesign : avec un ancrage à
    // droite, c'est le bord DROIT qui reste en place — pas le centre.
    // Seules les dimensions RÉELLEMENT automatiques sont compensées, et jamais à
    // la première composition : celle-ci ne fait qu'installer le cadre importé,
    // elle ne traduit aucun changement de contenu.
    if (!this.__textFrameSizing) {
      const autoW = mode === 'width' || mode === 'both'
      const autoH = mode === 'height' || mode === 'both'
      if (this.__textFrameMeasured) {
        keepAnchorFixed(
          this, f,
          autoW ? (this.width ?? 0) - widthBefore : 0,
          autoH ? (this.height ?? 0) - heightBefore : 0,
        )
      }
      this.__textFrameMeasured = true
    }
  }

  // ── Origine verticale du texte : marges + justification verticale ────────
  tb._getTopOffset = function (this: PatchedTextbox) {
    const f = getTextFrame(this)
    if (!f) return -(this.height ?? 0) / 2
    const h = this.height ?? 0
    const insT = f.insetTop ?? 0
    const insB = f.insetBottom ?? 0
    const availH = Math.max(h - insT - insB, 0)
    const textH = this.calcTextHeight() + totalParagraphSpacing(this, f)
    const top = -h / 2 + insT
    const vAlign = f.verticalAlign ?? 'top'
    if (vAlign === 'center') return top + (availH - textH) / 2
    if (vAlign === 'bottom') return top + availH - textH
    return top
  }

  // ── Décalage horizontal : marges + retraits (gauche / droite / 1re ligne) ─
  const origLineLeftOffset = tb._getLineLeftOffset.bind(tb)
  tb._getLineLeftOffset = function (this: PatchedTextbox, lineIndex: number) {
    const f = getTextFrame(this)
    if (!f) return origLineLeftOffset(lineIndex)
    const ind = indentsFor(f, paraIndexOf(this, lineIndex))
    const insL = f.insetLeft ?? 0
    const insR = f.insetRight ?? 0
    const extraLeft = (ind.left ?? 0) + (isFirstLineOfPara(this, lineIndex) ? (ind.firstLine ?? 0) : 0)
    const startX = insL + extraLeft
    if (this.textAlign.includes('justify') && !this.isEndOfWrapping(lineIndex)) {
      // Le justify élargit les espaces sur `this.width` : on se contente de décaler.
      return startX
    }
    const usableW = Math.max((this.width ?? 0) - insL - insR - extraLeft - (ind.right ?? 0), 0)
    const lineW = this.getLineWidth(lineIndex)
    if (this.textAlign === 'center' || this.textAlign === 'justify-center') {
      return startX + (usableW - lineW) / 2
    }
    if (this.textAlign === 'right' || this.textAlign === 'justify-right') {
      return startX + usableW - lineW
    }
    return startX
  }

  // ── Espace avant / après paragraphe ──────────────────────────────────────
  const origHeightOfLine = tb.getHeightOfLine.bind(tb)
  tb.getHeightOfLine = function (this: PatchedTextbox, lineIndex: number) {
    const f = getTextFrame(this)
    const base = origHeightOfLine(lineIndex)
    if (!f) return base
    return base + extraSpacingAfterLine(this, f, lineIndex)
  }

  // ── Composition : la largeur utile retire marges et retraits ─────────────
  const wrapHost = tb as unknown as { _wrapLine: WrapLineFn }
  const origWrapLine = wrapHost._wrapLine.bind(tb) as WrapLineFn
  wrapHost._wrapLine = function (lineIndex, desiredWidth, data, reservedSpace = 0) {
    const f = getTextFrame(textbox)
    if (!f) return origWrapLine(lineIndex, desiredWidth, data, reservedSpace)
    const ind = indentsFor(f, lineIndex)
    const reserved =
      reservedSpace +
      (f.insetLeft ?? 0) + (f.insetRight ?? 0) +
      (ind.left ?? 0) + (ind.right ?? 0)
    return origWrapLine(lineIndex, desiredWidth, data, reserved)
  }

  // ── Rendu : le cadre passe SOUS le texte ─────────────────────────────────
  const origRender = (tb as unknown as { _render: (ctx: CanvasRenderingContext2D) => void })._render.bind(tb)
  ;(tb as unknown as { _render: (ctx: CanvasRenderingContext2D) => void })._render = function (
    this: PatchedTextbox,
    ctx: CanvasRenderingContext2D,
  ) {
    const f = getTextFrame(this)
    if (f) renderFrame(ctx, this, f)
    origRender(ctx)
  }

  tb.__textFramePatched = true
  // Le cadre change la hauteur : recomposer immédiatement.
  tb.dirty = true
  tb._clearCache?.()
  tb.initDimensions()
  tb.setCoords()
}
