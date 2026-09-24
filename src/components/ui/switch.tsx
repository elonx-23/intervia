import { cn } from '@/lib/utils'

// Interrupteur façon iOS — pas de dépendance Radix supplémentaire pour un
// simple bouton à deux états, un <button role="switch"> stylé suffit et
// reste entièrement accessible (aria-checked, activable au clavier).
export function Switch({
  checked,
  onCheckedChange,
  disabled,
  className,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-secondary',
        className,
      )}
    >
      <span
        className={cn(
          'inline-block size-5.5 translate-x-0.5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition-transform duration-200',
          checked && 'translate-x-[22px]',
        )}
      />
    </button>
  )
}
