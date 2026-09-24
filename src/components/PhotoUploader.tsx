import { Loader2, Plus, X } from 'lucide-react'
import * as React from 'react'

import { useAuth } from '@/lib/auth'
import { uploadDocumentPhoto } from '@/lib/documents'

export function PhotoUploader({
  folder,
  photos,
  onChange,
}: {
  folder: string
  photos: string[]
  onChange: (photos: string[]) => void
}) {
  const { session } = useAuth()
  const [uploading, setUploading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !session) return
    setUploading(true)
    setError(null)
    try {
      const urls = await Promise.all(
        Array.from(files).map((f) => uploadDocumentPhoto(f, folder, session.sessionId)),
      )
      onChange([...photos, ...urls])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'envoi.")
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {photos.map((url) => (
          <div key={url} className="relative size-20 overflow-hidden rounded-md border border-border">
            <img src={url} alt="" className="size-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(photos.filter((p) => p !== url))}
              className="absolute top-0.5 right-0.5 rounded-full bg-background/80 p-0.5"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex size-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-muted-foreground"
        >
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          <span className="text-[10px]">Photo</span>
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        hidden
        onChange={(e) => onFiles(e.target.files)}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
