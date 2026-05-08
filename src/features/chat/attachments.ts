/**
 * Helpers pour les pièces jointes du chat : conversion fichier → data URI,
 * capture d'écran via getDisplayMedia.
 */

export interface ChatAttachment {
  id: string
  /** Nom à afficher (filename ou "Capture-N"). */
  name: string
  /** "image" → envoyé au LLM multimodal. "text" → contenu inliné dans le prompt. */
  kind: 'image' | 'text'
  /** Pour les images : data URI complet. Pour le texte : null. */
  dataUri?: string
  /** Pour les fichiers texte : le contenu lu. */
  text?: string
  /** Pour affichage UI uniquement. */
  size: number
  mimeType: string
}

const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const ACCEPTED_TEXT_TYPES = [
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/html',
  'application/json',
  'application/xml',
  'text/xml',
]
const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10 MB
const MAX_TEXT_SIZE = 200 * 1024 // 200 KB
const MAX_TEXT_CHARS = 50_000 // tronqué à l'affichage

let counter = 0
function uid(): string {
  counter += 1
  return `att-${Date.now().toString(36)}-${counter}`
}

function readAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsText(file)
  })
}

export async function fileToAttachment(file: File): Promise<ChatAttachment> {
  if (ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    if (file.size > MAX_IMAGE_SIZE) {
      throw new Error(`Image trop lourde (max ${MAX_IMAGE_SIZE / 1024 / 1024} MB) : ${file.name}`)
    }
    const dataUri = await readAsDataUri(file)
    return {
      id: uid(),
      name: file.name,
      kind: 'image',
      dataUri,
      size: file.size,
      mimeType: file.type,
    }
  }
  // Tente comme texte si MIME compatible OU extension connue
  const isTextish =
    ACCEPTED_TEXT_TYPES.includes(file.type) ||
    /\.(txt|md|csv|json|xml|html?|tsx?|jsx?|css|yaml|yml|log)$/i.test(file.name)
  if (isTextish) {
    if (file.size > MAX_TEXT_SIZE) {
      throw new Error(`Fichier texte trop lourd (max ${MAX_TEXT_SIZE / 1024} KB) : ${file.name}`)
    }
    let text = await readAsText(file)
    if (text.length > MAX_TEXT_CHARS) text = text.slice(0, MAX_TEXT_CHARS) + '\n…[tronqué]'
    return {
      id: uid(),
      name: file.name,
      kind: 'text',
      text,
      size: file.size,
      mimeType: file.type || 'text/plain',
    }
  }
  throw new Error(`Type non supporté : ${file.type || file.name}`)
}

/** Capture d'un écran/fenêtre via getDisplayMedia → frame canvas → PNG data URI. */
export async function captureScreenshot(): Promise<ChatAttachment> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('getDisplayMedia non supporté par ce navigateur.')
  }
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: 'browser' } as MediaTrackConstraints,
    audio: false,
  })
  try {
    // Attache au DOM hors-écran pour s'assurer que la frame est dispo, puis lit.
    const video = document.createElement('video')
    video.srcObject = stream
    video.muted = true
    await video.play()
    // Une frame disponible
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context indisponible.')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const dataUri = canvas.toDataURL('image/png')
    const sizeApprox = Math.round((dataUri.length * 3) / 4)
    return {
      id: uid(),
      name: `Capture-${new Date().toLocaleTimeString('fr-FR').replace(/:/g, '-')}.png`,
      kind: 'image',
      dataUri,
      size: sizeApprox,
      mimeType: 'image/png',
    }
  } finally {
    // Stop tous les tracks pour fermer le sélecteur de partage proprement
    for (const track of stream.getTracks()) track.stop()
  }
}

/** Compose le prompt user à partir du texte saisi + attachements texte inlinés. */
export function composePromptWithTextAttachments(
  userText: string,
  attachments: ChatAttachment[],
): string {
  const textAtts = attachments.filter((a) => a.kind === 'text')
  if (textAtts.length === 0) return userText
  const parts: string[] = []
  if (userText.trim()) parts.push(userText)
  for (const a of textAtts) {
    parts.push(`\n\n--- Fichier joint : ${a.name} ---\n${a.text ?? ''}`)
  }
  return parts.join('\n')
}

export function imageDataUrisFrom(attachments: ChatAttachment[]): string[] {
  return attachments
    .filter((a) => a.kind === 'image' && a.dataUri)
    .map((a) => a.dataUri as string)
}
