'use client'

import { useQuery } from '@tanstack/react-query'
import { CircleUser, Download, FileText, Inbox, LogOut, Moon, Sun, User } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { isInProgress } from '@/lib/exports/exports'
import { exportsListQuery, recentExportsQuery } from '@/lib/exports/queries'
import { loginUrl } from '@/lib/redirect'
import type { User as SessionUser } from '@/types/models'

const navigation = [
  { label: 'Forms', href: '/forms', icon: FileText },
  { label: 'Exports', href: '/exports', icon: Download },
  { label: 'Account', href: '/account', icon: User },
] as const

async function logOut() {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
  window.location.assign(loginUrl({ reason: 'signed-out' }))
}

export function AppSidebar({ user }: { user: Pick<SessionUser, 'name' | 'email'> }) {
  const pathname = usePathname()
  const { resolvedTheme, setTheme } = useTheme()
  const dark = resolvedTheme === 'dark'
  // The dashboard's exports watcher loads and polls these.
  const { data: recentExports } = useQuery(exportsListQuery(recentExportsQuery))
  const exportsInProgress = recentExports?.data.filter(isInProgress).length ?? 0

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Form Handler">
              <Link href="/forms" className="font-semibold">
                <Inbox className="text-primary" aria-hidden />
                <span>Form Handler</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map(({ label, href, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(`${href}/`)
                const badge = href === '/exports' ? exportsInProgress : 0

                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton asChild isActive={active} tooltip={label}>
                      <Link href={href} aria-current={active ? 'page' : undefined}>
                        <Icon aria-hidden />
                        <span>{label}</span>
                        {badge > 0 && <span className="sr-only">, {badge} in progress</span>}
                      </Link>
                    </SidebarMenuButton>
                    {badge > 0 && (
                      <SidebarMenuBadge aria-hidden>
                        <span className="rounded-md bg-primary px-1.5 text-primary-foreground">
                          {badge}
                        </span>
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton aria-label={`Account menu for ${user.name}`} tooltip={user.name}>
                  <CircleUser aria-hidden />
                  <span className="truncate">{user.name}</span>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="min-w-56">
                <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
                  {user.email}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onSelect={() => setTheme(dark ? 'light' : 'dark')}>
                    {dark ? <Sun aria-hidden /> : <Moon aria-hidden />}
                    {dark ? 'Light mode' : 'Dark mode'}
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/account">
                      <User aria-hidden />
                      Account
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void logOut()}>
                  <LogOut aria-hidden />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
