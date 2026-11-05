import { Minus, Plus } from 'lucide-react'
import * as React from 'react'

import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

import type { PseDocument } from '@/lib/documents'

// Rendu du PDF réel en images (canvas, via pdf.js) plutôt que dans un
// <iframe> : le lecteur PDF intégré de Safari iOS ignore souvent le zoom
// demandé. La page entière est visible au départ ; ensuite on zoome
// librement (pincement autour des doigts, double-tap, boutons + / −) et on se
// déplace dans tous les sens par le défilement natif — fluide, avec l'inertie
// du téléphone.

const MIN_ZOOM = 1
const MAX_ZOOM = 5
const clamp = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

type PdfDoc = Awaited<ReturnType<typeof import('pdfjs-dist').getDocument>['promise']>

export function DocumentPdfViewer({ doc }: { doc: PseDocument }) {
  const load = React.useCallback(async () => (await import('@/lib/pdf')).generateDocumentPdf(doc), [doc])
  return <PdfViewer load={load} />
}

// Le même lecteur pour tout PDF de l'app (devis, facture, rapport) : `load`
// fabrique le PDF (mémorisé par l'appelant, il est rejoué à chaque changement).
export function PdfViewer({ load }: { load: () => Promise<{ output(type: 'arraybuffer'): ArrayBuffer }> }) {
  const scrollerRef = React.useRef<HTMLDivElement>(null)
  const contentRef = React.useRef<HTMLDivElement>(null)
  const pdfRef = React.useRef<PdfDoc | null>(null)
  const zoomRef = React.useRef(1)
  const [zoom, setZoom] = React.useState(1)
  const [status, setStatus] = React.useState<'loading' | 'ready' | 'error'>('loading')

  // Dessine toutes les pages à la résolution du zoom (net même zoomé).
  const draw = React.useCallback(async (z: number) => {
    const pdfDoc = pdfRef.current
    const content = contentRef.current
    const scroller = scrollerRef.current
    if (!pdfDoc || !content || !scroller) return
    const baseWidth = scroller.clientWidth || 320
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5)
    const canvases: HTMLCanvasElement[] = []
    for (let n = 1; n <= pdfDoc.numPages; n++) {
      const page = await pdfDoc.getPage(n)
      const unscaled = page.getViewport({ scale: 1 })
      // Résolution plafonnée : Safari iOS refuse les canvas de plus de ~16
      // millions de pixels (page blanche) — on reste sous 12 millions.
      const wanted = (baseWidth * z * dpr) / unscaled.width
      const maxByArea = Math.sqrt(12_000_000 / (unscaled.width * unscaled.height))
      const scale = Math.min(wanted, maxByArea)
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      canvas.style.display = 'block'
      canvas.style.width = '100%'
      canvas.style.height = 'auto'
      if (n > 1) canvas.style.marginTop = '10px'
      const ctx = canvas.getContext('2d')
      if (ctx) await page.render({ canvasContext: ctx, viewport, canvas }).promise
      canvases.push(canvas)
    }
    content.replaceChildren(...canvases)
  }, [])

  React.useEffect(() => {
    let cancelled = false
    setStatus('loading')
    zoomRef.current = 1
    setZoom(1)
    ;(async () => {
      const pdf = await load()
      const pdfjsLib = await import('pdfjs-dist')
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
      const pdfDoc = await pdfjsLib.getDocument({ data: pdf.output('arraybuffer') as ArrayBuffer }).promise
      if (cancelled) return
      pdfRef.current = pdfDoc
      await draw(1)
      if (!cancelled) setStatus('ready')
    })().catch(() => !cancelled && setStatus('error'))
    return () => {
      cancelled = true
    }
  }, [load, draw])

  // Redessine en haute résolution une fois le geste terminé.
  React.useEffect(() => {
    if (status !== 'ready') return
    const t = setTimeout(() => draw(zoom), 250)
    return () => clearTimeout(t)
  }, [zoom, status, draw])

  // Change le zoom en gardant fixe le point (fx, fy) de l'écran (doigts, tap, centre).
  const zoomAt = React.useCallback((next: number, fx?: number, fy?: number) => {
    const scroller = scrollerRef.current
    const content = contentRef.current
    if (!scroller || !content) return
    const z = clamp(next)
    const prev = zoomRef.current
    const x = fx ?? scroller.clientWidth / 2
    const y = fy ?? scroller.clientHeight / 2
    const ratio = z / prev
    const left = (scroller.scrollLeft + x) * ratio - x
    const top = (scroller.scrollTop + y) * ratio - y
    zoomRef.current = z
    content.style.width = `${z * 100}%`
    scroller.scrollLeft = left
    scroller.scrollTop = top
    setZoom(z)
  }, [])

  // Pincement à deux doigts (le déplacement à un doigt reste le défilement natif).
  React.useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    let startDist = 0
    let startZoom = 1
    let lastTap = 0
    const rel = (t: Touch) => {
      const r = scroller.getBoundingClientRect()
      return { x: t.clientX - r.left, y: t.clientY - r.top }
    }
    const dist = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)

    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        startDist = dist(e.touches[0], e.touches[1])
        startZoom = zoomRef.current
      }
    }
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !startDist) return
      e.preventDefault()
      const a = rel(e.touches[0])
      const b = rel(e.touches[1])
      zoomAt(startZoom * (dist(e.touches[0], e.touches[1]) / startDist), (a.x + b.x) / 2, (a.y + b.y) / 2)
    }
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) startDist = 0
      // Double-tap : zoom avant à l'endroit touché, ou retour à la page entière.
      if (e.touches.length === 0 && e.changedTouches.length === 1) {
        const nowMs = Date.now()
        if (nowMs - lastTap < 300) {
          const p = rel(e.changedTouches[0])
          zoomAt(zoomRef.current > 1.2 ? 1 : 2.5, p.x, p.y)
          lastTap = 0
        } else {
          lastTap = nowMs
        }
      }
    }
    // Ordinateur : Ctrl + molette (ou pincement du pavé tactile).
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const r = scroller.getBoundingClientRect()
      zoomAt(zoomRef.current * Math.exp(-e.deltaY / 200), e.clientX - r.left, e.clientY - r.top)
    }
    scroller.addEventListener('touchstart', onStart, { passive: true })
    scroller.addEventListener('touchmove', onMove, { passive: false })
    scroller.addEventListener('touchend', onEnd, { passive: true })
    scroller.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      scroller.removeEventListener('touchstart', onStart)
      scroller.removeEventListener('touchmove', onMove)
      scroller.removeEventListener('touchend', onEnd)
      scroller.removeEventListener('wheel', onWheel)
    }
  }, [zoomAt])

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-white">
      {status === 'loading' && <p className="py-8 text-center text-sm text-muted-foreground">Génération du PDF…</p>}
      {status === 'error' && <p className="py-8 text-center text-sm text-destructive">Erreur d'affichage.</p>}
      <div
        ref={scrollerRef}
        className="max-h-[78dvh] overflow-auto overscroll-contain"
        style={{ touchAction: 'pan-x pan-y' }}
        // Zoomé : on se déplace dans le PDF, le glissement ne change pas d'onglet.
        data-no-swipe={zoom > 1 ? '' : undefined}
      >
        <div ref={contentRef} style={{ width: '100%' }} />
      </div>
      {status === 'ready' && (
        <div className="absolute right-2 bottom-2 flex items-center gap-1 rounded-full border border-border bg-background/90 p-1 shadow-sm backdrop-blur">
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-full hover:bg-secondary disabled:opacity-40"
            onClick={() => zoomAt(zoomRef.current / 1.5)}
            disabled={zoom <= MIN_ZOOM}
            aria-label="Dézoomer"
          >
            <Minus className="size-4" />
          </button>
          <button type="button" className="min-w-11 text-xs font-medium tabular-nums" onClick={() => zoomAt(1)} aria-label="Page entière">
            {Math.round(zoom * 100)} %
          </button>
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-full hover:bg-secondary disabled:opacity-40"
            onClick={() => zoomAt(zoomRef.current * 1.5)}
            disabled={zoom >= MAX_ZOOM}
            aria-label="Zoomer"
          >
            <Plus className="size-4" />
          </button>
        </div>
      )}
    </div>
  )
}
