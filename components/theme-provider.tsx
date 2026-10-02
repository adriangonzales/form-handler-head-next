'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'

/** Light and dark mode from the `.dark` class, following the system until the user picks one. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  )
}
