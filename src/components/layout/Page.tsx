import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

import { Header } from './Header'
import { useAuth } from '@/lib/auth'
import { isTabRootPath } from '@/lib/navRoots'

export function Page({
  title,
  children,
  toolbar,
}: {
  title: string
  children: ReactNode
  toolbar?: ReactNode
}) {
  const { session } = useAuth()
  const { pathname } = useLocation()
  const isRoot = isTabRootPath(pathname, session?.role === 'admin')

  return (
    <>
      <Header title={title} toolbar={toolbar} />
      <main
        className={isRoot ? 'flex-1 px-4 pb-28' : 'flex-1 px-4 pb-8'}
        style={{
          paddingTop: toolbar
            ? 'calc(env(safe-area-inset-top, 0px) + 4.5rem)'
            : 'calc(env(safe-area-inset-top, 0px) + 5rem)',
        }}
      >
        {children}
      </main>
    </>
  )
}
