import * as React from 'react'

export interface SignaturePadHandle {
  clear: () => void
  toDataURL: () => string
  isEmpty: () => boolean
}

// Zone de signature au doigt (ou à la souris). Le dessin suit exactement le
// doigt même si la zone change de taille (rotation, barre de Safari) : la
// toile est redimensionnée en gardant ce qui a déjà été signé.
export const SignaturePad = React.forwardRef<SignaturePadHandle, { className?: string; onChange?: (hasDrawn: boolean) => void }>(
  function SignaturePad({ className, onChange }, ref) {
    const canvasRef = React.useRef<HTMLCanvasElement>(null)
    const drawing = React.useRef(false)
    const hasDrawn = React.useRef(false)
    const onChangeRef = React.useRef(onChange)
    React.useEffect(() => {
      onChangeRef.current = onChange
    }, [onChange])

    const setupContext = (canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const ratio = window.devicePixelRatio || 1
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx.lineWidth = 2.2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#111827'
    }

    React.useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const fit = () => {
        const w = canvas.clientWidth
        const h = canvas.clientHeight
        if (!w || !h) return // masquée (ex. lecture des CGV) : on garde la toile telle quelle
        const ratio = window.devicePixelRatio || 1
        const W = Math.round(w * ratio)
        const H = Math.round(h * ratio)
        if (canvas.width === W && canvas.height === H) return
        // Garde la signature déjà tracée en la remettant à la nouvelle taille.
        let previous: HTMLCanvasElement | null = null
        if (hasDrawn.current && canvas.width && canvas.height) {
          previous = document.createElement('canvas')
          previous.width = canvas.width
          previous.height = canvas.height
          previous.getContext('2d')?.drawImage(canvas, 0, 0)
        }
        canvas.width = W
        canvas.height = H
        if (previous) canvas.getContext('2d')?.drawImage(previous, 0, 0, W, H)
        setupContext(canvas)
      }
      fit()
      const observer = new ResizeObserver(fit)
      observer.observe(canvas)
      return () => observer.disconnect()
    }, [])

    const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current!.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }

    const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault()
      canvasRef.current?.setPointerCapture?.(e.pointerId)
      drawing.current = true
      const ctx = canvasRef.current!.getContext('2d')!
      const { x, y } = pos(e)
      ctx.beginPath()
      ctx.moveTo(x, y)
      // Un simple point compte aussi (initiales, paraphe).
      ctx.lineTo(x + 0.01, y + 0.01)
      ctx.stroke()
      if (!hasDrawn.current) {
        hasDrawn.current = true
        onChangeRef.current?.(true)
      }
    }

    const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawing.current) return
      const ctx = canvasRef.current!.getContext('2d')!
      const { x, y } = pos(e)
      ctx.lineTo(x, y)
      ctx.stroke()
    }

    const end = () => {
      drawing.current = false
    }

    React.useImperativeHandle(ref, () => ({
      clear: () => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')!
        ctx.save()
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.restore()
        if (hasDrawn.current) {
          hasDrawn.current = false
          onChangeRef.current?.(false)
        }
      },
      toDataURL: () => canvasRef.current!.toDataURL('image/png'),
      isEmpty: () => !hasDrawn.current,
    }))

    return (
      <canvas
        data-no-swipe
        ref={canvasRef}
        className={className}
        style={{ touchAction: 'none' }}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={end}
      />
    )
  },
)
