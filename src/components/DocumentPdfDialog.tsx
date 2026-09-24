import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { DocumentPreview } from '@/components/DocumentPreview'
import { legalFooterLines } from '@/lib/company'
import type { PseDocument } from '@/lib/documents'

export function DocumentPdfDialog({
  document: doc,
  open,
  onOpenChange,
}: {
  document: PseDocument | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!doc) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <DialogTitle>{doc.kind === 'devis' ? 'Devis' : 'Facture'} {doc.number}</DialogTitle>
              <Button
                variant="link"
                className="h-auto p-0 text-sm"
                onClick={async () => {
                  const { downloadDocumentPdf } = await import('@/lib/pdf')
                  downloadDocumentPdf(doc)
                }}
              >
                Télécharger PDF
              </Button>
            </div>
          </div>
        </DialogHeader>

        <DocumentPreview doc={doc} />

        <div className="border-t border-border pt-2 text-[10px] text-muted-foreground">
          {legalFooterLines().map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
