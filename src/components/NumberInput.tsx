import * as React from 'react'

import { Input } from '@/components/ui/input'

// Champ montant / quantité :
// - sur iPhone, ouvre directement le pavé numérique avec la virgule
//   (inputMode="decimal") ;
// - accepte « 12,50 » comme « 12.50 » ;
// - peut être vidé pendant la saisie : plus de « 0 » impossible à effacer —
//   un champ vide vaut 0 pour le calcul, mais reste affiché vide.
export function NumberInput({
  value,
  onValueChange,
  placeholder = '0',
  ...props
}: Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> & {
  value: number
  onValueChange: (value: number) => void
}) {
  const format = (n: number) => (n === 0 || !Number.isFinite(n) ? '' : String(n).replace('.', ','))
  const [text, setText] = React.useState(() => format(value))

  // Valeur changée de l'extérieur (choix d'un article enregistré, rechargement) :
  // on l'affiche, sauf si elle correspond déjà à ce qui est en cours de saisie.
  React.useEffect(() => {
    setText((current) => (parse(current) === value ? current : format(value)))
  }, [value])

  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        // Chiffres et un seul séparateur décimal (virgule ou point), signe moins en tête.
        const cleaned = e.target.value.replace(/[^\d.,-]/g, '').replace(/(?!^)-/g, '')
        const [intPart, ...rest] = cleaned.split(/[.,]/)
        const next = rest.length > 0 ? `${intPart},${rest.join('').slice(0, 2)}` : intPart
        setText(next)
        onValueChange(parse(next))
      }}
    />
  )
}

function parse(text: string) {
  const n = Number(text.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
