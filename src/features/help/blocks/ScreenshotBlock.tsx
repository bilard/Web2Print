interface ScreenshotBlockProps {
  src: string
  alt: string
  caption?: string
}

export function ScreenshotBlock({ src, alt, caption }: ScreenshotBlockProps) {
  return (
    <figure className="my-3">
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="w-full rounded-lg border border-white/10 bg-[#0f0f0f]"
      />
      {caption && (
        <figcaption className="mt-1.5 text-[11px] text-white/40 text-center italic">
          {caption}
        </figcaption>
      )}
    </figure>
  )
}
