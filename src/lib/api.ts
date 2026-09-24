interface ApiOptions {
  method?: string
  body?: unknown
  sessionId?: string | null
}

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const res = await fetch(path, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.sessionId ? { 'x-session-id': options.sessionId } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  const data = await res.json().catch(() => null)

  if (!res.ok) {
    throw new Error(data?.error ?? `Erreur ${res.status}`)
  }

  return data as T
}

export async function apiUpload(file: File, folder: string, sessionId: string) {
  const form = new FormData()
  // L'ordre compte : Multer doit lire "folder" avant de traiter le flux du
  // fichier "file" pour choisir le bon dossier de destination — sinon il
  // retombe sur "misc" alors que l'URL renvoyée pointe vers le bon dossier,
  // créant un fichier introuvable (décalage silencieux entre stockage et URL).
  form.append('folder', folder)
  form.append('file', file)

  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'x-session-id': sessionId },
    body: form,
  })

  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error ?? `Erreur ${res.status}`)
  return data.url as string
}
