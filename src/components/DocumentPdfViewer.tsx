import * as React from 'react'

import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

import type { PseDocument } from '@/lib/documents'
import { usePinchZoom } from '@/hooks/usePinchZoom'

// Rendu du PDF réel en images (canvas), pas dans un <iframe> — le lecteur
// PDF natif intégré (Safari iOS en particulier) ignore souvent les
// paramètres de zoom demandés et affiche la page recadrée/agrandie plutôt
// que la page entière. En dessinant nous-mêmes chaque page à la largeur
// exacte du conteneur (via pdf.js), la page entière est toujours visible
// sans aucun zoom par défaut — le pincement à deux doigts reste possible
// pour qui veut zoomer sur un détail.
export function DocumentPdfViewer({ doc }: { doc: PseDocument }) {
  const wrapperRef = React.useRef<HTMLDivElement>(null)
  const containerRef = usePinchZoom<HTMLDivElement>()
  const [status, setStatus] = React.useState<'loading' | 'ready' | 'error'>('loading')

  React.useEffect(() => {
    let cancelled = false
    setStatus('loading')
    const container = containerRef.current
    if (container) container.innerHTML = ''

    async function render() {
      const { generateDocumentPdf } = await import('@/lib/pdf')
      const pdf = await generateDocumentPdf(doc)
      const arrayBuffer = pdf.output('arraybuffer') as ArrayBuffer

      const pdfjsLib = await import('pdfjs-dist')
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

      const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      if (cancelled || !container) return

      // Mesuré sur le wrapper (toujours visible), pas sur le conteneur des
      // canvas lui-même — celui-ci est encore vide/replié pendant le
      // chargement, donc sa largeur mesurée vaudrait 0.
      const containerWidth = wrapperRef.current?.clientWidth || container.clientWidth || 320
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5)

      for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        if (cancelled) return
        const page = await pdfDoc.getPage(pageNum)
        const unscaled = page.getViewport({ scale: 1 })
        const scale = containerWidth / unscaled.width
        const viewport = page.getViewport({ scale: scale * dpr })

        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        canvas.style.display = 'block'
        canvas.style.width = '100%'
        canvas.style.height = 'auto'
        if (pageNum > 1) canvas.style.marginTop = '10px'
        container.appendChild(canvas)

        const ctx = canvas.getContext('2d')
        if (!ctx) continue
        await page.render({ canvasContext: ctx, viewport, canvas }).promise
      }

      if (!cancelled) setStatus('ready')
    }

    render().catch(() => {
      if (!cancelled) setStatus('error')
    })

    return () => {
      cancelled = true
    }
  }, [doc])

  return (
    <div ref={wrapperRef} className="overflow-hidden rounded-xl border border-border bg-white">
      {status === 'loading' && <p className="py-8 text-center text-sm text-muted-foreground">Génération du PDF…</p>}
      {status === 'error' && <p className="py-8 text-center text-sm text-destructive">Erreur d'affichage.</p>}
      <div ref={containerRef} />
    </div>
  )
}
