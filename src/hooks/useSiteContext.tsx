import { createContext, useContext, useState } from 'react'

interface SiteContextValue {
  siteId: string | null
  setSiteId: (id: string) => void
}

const SiteContext = createContext<SiteContextValue | null>(null)

export function SiteProvider({ children }: { children: React.ReactNode }) {
  const [siteId, setSiteIdState] = useState<string | null>(() =>
    sessionStorage.getItem('siteId')
  )

  function setSiteId(id: string) {
    sessionStorage.setItem('siteId', id)
    setSiteIdState(id)
  }

  return (
    <SiteContext.Provider value={{ siteId, setSiteId }}>
      {children}
    </SiteContext.Provider>
  )
}

export function useSiteContext() {
  const ctx = useContext(SiteContext)
  if (!ctx) throw new Error('useSiteContext must be used within SiteProvider')
  return ctx
}
