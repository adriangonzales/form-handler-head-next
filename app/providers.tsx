'use client'

import { QueryClientProvider } from '@tanstack/react-query'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { useEffect } from 'react'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { getQueryClient } from '@/lib/query-client'

/** Client-side context for every page: data cache, URL state, theme, tooltips and toasts. */
export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient()

  // Lets end-to-end tests wait until the page responds to clicks.
  useEffect(() => {
    document.documentElement.dataset.hydrated = 'true'
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <NuqsAdapter>
        <ThemeProvider>
          <TooltipProvider>
            {children}
            <Toaster closeButton />
          </TooltipProvider>
        </ThemeProvider>
      </NuqsAdapter>
    </QueryClientProvider>
  )
}
