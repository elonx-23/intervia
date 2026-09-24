import * as React from 'react'

export interface SignaturePadHandle {
  clear: () => void
  toDataURL: () => string
  isEmpty: () => boolean
}

export const SignaturePad = React.forwardRef<SignaturePadHandle, { className?: string }>(
  function SignaturePad({ className }, ref) {
    const canvasRef = React.useRef<HTMLCanvasElement>(null)
    const drawing = React.useRef(false)
    const hasDrawn = React.useRef(false)

    React.useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ratio = window.devicePixelRatio || 1
      canvas.width = canvas.clientWidth * ratio
      canvas.height = canvas.clientHeight * ratio
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.scale(ratio, ratio)
        ctx.lineWidth = 2
        ctx.lineCap = 'round'
        ctx.strokeStyle = '#111827'
      }
    }, [])

    const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current!.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }

    const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
      drawing.current = true
      hasDrawn.current = true
      const ctx = canvasRef.current!.getContext('2d')!
      const { x, y } = pos(e)
      ctx.beginPath()
      ctx.moveTo(x, y)
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
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        hasDrawn.current = false
      },
      toDataURL: () => canvasRef.current!.toDataURL('image/png'),
      isEmpty: () => !hasDrawn.current,
    }))

    return (
      <canvas
        ref={canvasRef}
        className={className}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
    )
  },
)
