export function friendlyError(e: unknown, fallback: string): string {
  if (e instanceof Error) {
    if (e.message.includes('Failed to fetch') || e.message.includes('fetch')) {
      return 'Supabase n\'est pas encore connecté.'
    }
    return e.message
  }
  return fallback
}
