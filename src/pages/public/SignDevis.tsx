import { Printer, Signature } from 'lucide-react'
import * as React from 'react'
import { useParams } from 'react-router-dom'

import { PublicSignatureDialog } from '@/components/PublicSignatureDialog'
import { Button } from '@/components/ui/button'
import { getDocumentByToken, type PseDocument } from '@/lib/documents'
import { friendlyError } from '@/lib/errors'

// Le lien "Consulter et signer" reçu par email affiche directement le vrai
// PDF du devis (même rendu que le téléchargement, dans un <iframe> qui
// occupe toute la page) plutôt qu'un résumé stylisé différent du document
// réel — le client doit voir exactement ce qu'il signe. Un bouton flottant
// en haut à droite porte l'action possible : "Signer" tant que le devis ne
// l'est pas, puis "Imprimer" une fois signé (le devis ne peut plus être
// signé une seconde fois — cette action "expire" dès la signature).
export default function SignDevis() {
  const { token } = useParams()
  const [doc, setDoc] = React.useState<PseDocument | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = React.useState<string | null>(null)
  const [signOpen, setSignOpen] = React.useState(false)
  const iframeRef = React.useRef<HTMLIFrameElement>(null)

  React.useEffect(() => {
    if (!token) return
    getDocumentByToken(token)
      .then(setDoc)
      .catch((e) => setError(friendlyError(e, 'Devis introuvable.')))
  }, [token])

  // Régénère le PDF affiché à chaque changement du document (chargement
  // initial, puis après signature — le PDF regénéré inclut alors la
  // signature). Révoque l'ancienne URL blob pour ne pas fuiter de mémoire.
  React.useEffect(() => {
    if (!doc) return
    let cancelled = false
    let objectUrl: string | null = null
    import('@/lib/pdf').then(({ getDocumentPdfBlobUrl }) =>
      getDocumentPdfBlobUrl(doc).then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url)
          return
        }
        objectUrl = url
        setPdfUrl(url)
      }),
    )
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [doc])

  if (error && !doc) {
    return (
      <div className="mx-auto flex min-h-svh w-full max-w-lg items-center justify-center px-4 text-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    )
  }
  if (!doc) {
    return (
      <div className="mx-auto flex min-h-svh w-full max-w-lg items-center justify-center px-4 text-center">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </div>
    )
  }

  const isSigned = doc.status === 'signe'

  return (
    <div className="fixed inset-0 flex flex-col bg-secondary">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-background px-4 py-2.5">
        <p className="truncate text-sm font-medium">Devis {doc.number}</p>
        {isSigned ? (
          <Button size="sm" variant="outline" onClick={() => iframeRef.current?.contentWindow?.print()}>
            <Printer className="size-4" />
            Imprimer
          </Button>
        ) : (
          <Button size="sm" onClick={() => setSignOpen(true)}>
            <Signature className="size-4" />
            Signer
          </Button>
        )}
      </div>

      {pdfUrl ? (
        <iframe ref={iframeRef} src={pdfUrl} title={`Devis ${doc.number}`} className="h-full w-full border-0" />
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">Génération du PDF…</p>
        </div>
      )}

      <PublicSignatureDialog document={doc} open={signOpen} onOpenChange={setSignOpen} onSigned={setDoc} />
    </div>
  )
}
