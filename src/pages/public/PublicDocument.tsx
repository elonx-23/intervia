import { Download, Loader2, Signature } from 'lucide-react'
import * as React from 'react'
import { useParams } from 'react-router-dom'

import { DocumentPdfViewer } from '@/components/DocumentPdfViewer'
import { Loader } from '@/components/Loader'
import { PublicSignatureDialog } from '@/components/PublicSignatureDialog'
import { Button } from '@/components/ui/button'
import { applyCompanySettings } from '@/lib/company'
import { getDocumentByToken, type PublicDocument as PublicDoc, type PseDocument } from '@/lib/documents'
import { friendlyError } from '@/lib/errors'

// Page ouverte par le client depuis le lien de l'email (« Consulter le devis /
// la facture ») : uniquement l'aperçu du vrai PDF — exactement celui joint à
// l'email — avec Télécharger, et Signer tant que le document ne l'est pas.
// Aucune mention du logiciel : seules les coordonnées de l'entreprise
// émettrice (renvoyées avec le document) apparaissent.
export default function PublicDocument({ kind }: { kind: 'devis' | 'facture' }) {
  const { token } = useParams()
  const [doc, setDoc] = React.useState<PseDocument | null>(null)
  const [companyName, setCompanyName] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [signOpen, setSignOpen] = React.useState(false)
  const [downloading, setDownloading] = React.useState(false)

  const label = kind === 'devis' ? 'Devis' : 'Facture'

  React.useEffect(() => {
    if (!token) return
    getDocumentByToken(token)
      .then((d: PublicDoc) => {
        // Avant de rendre le PDF : il lit ces coordonnées au moment du rendu.
        if (d.company) applyCompanySettings(d.company)
        setCompanyName(d.company?.name ?? '')
        setDoc(d)
      })
      .catch((e) => setError(friendlyError(e, `${label} introuvable.`)))
  }, [token, label])

  React.useEffect(() => {
    if (!doc) return
    const previous = document.title
    document.title = [`${label} ${doc.number}`, companyName].filter(Boolean).join(' — ')
    return () => {
      document.title = previous
    }
  }, [doc, companyName, label])

  const download = async () => {
    if (!doc) return
    setDownloading(true)
    try {
      const { downloadDocumentPdf } = await import('@/lib/pdf')
      await downloadDocumentPdf(doc)
    } finally {
      setDownloading(false)
    }
  }

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
        <Loader />
      </div>
    )
  }

  const signed = Boolean(doc.signature_data) || doc.status === 'signe'

  return (
    <div className="min-h-svh bg-secondary">
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-2 px-4 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {label} {doc.number}
            </p>
            {companyName && <p className="truncate text-xs text-muted-foreground">{companyName}</p>}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="outline" onClick={download} disabled={downloading}>
              {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              Télécharger
            </Button>
            {!signed && (
              <Button size="sm" onClick={() => setSignOpen(true)}>
                <Signature className="size-4" />
                Signer
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-3 py-4">
        {signed && doc.signed_at && (
          <p className="mb-3 text-center text-xs text-muted-foreground">
            Signé le {new Date(doc.signed_at).toLocaleDateString('fr-FR')}
          </p>
        )}
        <DocumentPdfViewer doc={doc} />
      </div>

      <PublicSignatureDialog document={doc} open={signOpen} onOpenChange={setSignOpen} onSigned={setDoc} />
    </div>
  )
}
