// Remplace le texte "Chargement…" partout dans l'app par le logo animé
// (GIF fourni, optimisé 2,1 Mo -> 206 Ko). `size` suit les mêmes classes
// Tailwind que le reste de l'app (ex: "size-8") plutôt qu'un pixel brut.
export function Loader({ size = 'size-8', className = '' }: { size?: string; className?: string }) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <img src="/marketing/loader.gif" alt="Chargement…" className={size} />
    </div>
  )
}
