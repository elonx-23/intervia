import * as React from 'react'

import type { PseDocument } from '@/lib/documents'

// « Partager » un devis / une facture = partager le FICHIER PDF lui-même
// (WhatsApp, Mail, AirDrop…), pas un lien. Safari iOS n'autorise le partage
// que juste après l'appui : le PDF est donc préparé à l'avance, en
// arrière-plan, dès que le document est ouvert ou modifié.
export function usePreparedPdf(doc: PseDocument | null) {
  const ref = React.useRef<File | null>(null)
  React.useEffect(() => {
    if (!doc) return
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const { generateDocumentPdf } = await import('@/lib/pdf')
        const pdf = await generateDocumentPdf(doc)
        const blob = pdf.output('blob') as Blob
        if (!cancelled) ref.current = new File([blob], `${doc.number}.pdf`, { type: 'application/pdf' })
      } catch {
        // le partage retombera sur une génération à la demande
      }
    }, 800)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [doc])
  return ref
}

export async function sharePdf(prepared: React.RefObject<File | null>, doc: PseDocument) {
  const title = `${doc.kind === 'devis' ? 'Devis' : 'Facture'} ${doc.number}`
  let file = prepared.current
  if (!file) {
    const { generateDocumentPdf } = await import('@/lib/pdf')
    const pdf = await generateDocumentPdf(doc)
    file = new File([pdf.output('blob') as Blob], `${doc.number}.pdf`, { type: 'application/pdf' })
  }
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title })
      return
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return // partage annulé
    }
  }
  // Pas de partage de fichier possible (ordinateur, ancien navigateur) : téléchargement.
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
