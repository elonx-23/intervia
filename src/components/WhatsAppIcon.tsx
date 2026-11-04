import { cn } from '@/lib/utils'

// Logo WhatsApp (bulle verte et combiné blanc), pour signaler la liaison
// WhatsApp dans Réglages et la fenêtre d'envoi. Garde sa couleur verte quel
// que soit le texte autour (la couleur passée par className est ignorée).
export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('shrink-0', className?.replace(/\btext-\S+/g, ''))} aria-hidden="true">
      <path
        fill="#25D366"
        d="M16 2.7C8.7 2.7 2.8 8.6 2.8 15.9c0 2.5.7 4.9 2 7L3 29.3l6.6-1.7c2 1.1 4.2 1.7 6.4 1.7 7.3 0 13.2-5.9 13.2-13.2S23.3 2.7 16 2.7Z"
      />
      <path
        fill="#fff"
        d="M12.1 9.4c-.3-.6-.6-.6-.9-.6h-.8c-.3 0-.7.1-1.1.5-.4.4-1.4 1.4-1.4 3.4s1.5 3.9 1.7 4.2c.2.3 2.8 4.5 7 6.1 3.5 1.4 4.2 1.1 4.9 1 .8-.1 2.4-1 2.8-1.9.3-.9.3-1.7.2-1.9-.1-.2-.4-.3-.8-.5s-2.4-1.2-2.8-1.3c-.4-.1-.6-.2-.9.2-.3.4-1.1 1.3-1.3 1.6-.2.3-.5.3-.9.1-.4-.2-1.7-.6-3.2-2-1.2-1-2-2.3-2.2-2.7-.2-.4 0-.6.2-.8l.6-.7c.2-.2.3-.4.4-.7.1-.3.1-.5 0-.7-.1-.2-.9-2.2-1.2-3.1Z"
      />
    </svg>
  )
}
