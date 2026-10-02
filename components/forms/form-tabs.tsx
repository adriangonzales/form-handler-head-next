'use client'

import { Bell, Code, Inbox, List, Settings } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const tabs = [
  { segment: 'entries', label: 'Entries', icon: Inbox },
  { segment: 'fields', label: 'Fields', icon: List },
  { segment: 'settings', label: 'Settings', icon: Settings },
  { segment: 'notifications', label: 'Notifications', icon: Bell },
  { segment: 'integrate', label: 'Integrate', icon: Code },
] as const

/** Links to a form's tabs. They're pages, so this is navigation rather than an ARIA tab list. */
export function FormTabs({ formId }: { formId: string }) {
  const pathname = usePathname()

  return (
    <nav aria-label="Form" className="-mx-1 overflow-x-auto border-b">
      <ul className="flex gap-1 px-1">
        {tabs.map(({ segment, label, icon: Icon }) => {
          const href = `/forms/${formId}/${segment}`
          const current = pathname === href || pathname.startsWith(`${href}/`)

          return (
            <li key={segment}>
              <Link
                href={href as Route}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-1.5 border-b-2 border-transparent px-2.5 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
                  current && 'border-primary text-foreground',
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
