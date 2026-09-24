import { Inbox } from 'lucide-react'

export function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/70 py-14 text-center text-sm text-muted-foreground">
      <Inbox className="size-6 opacity-50" />
      <p>{label}</p>
    </div>
  )
}
