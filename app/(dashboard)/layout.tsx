import { cookies } from 'next/headers'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { Separator } from '@/components/ui/separator'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { requireSession } from '@/lib/session/server'

/** The signed-in shell: sidebar navigation, user menu, and the page. */
export default async function DashboardLayout({ children }: LayoutProps<'/'>) {
  const { user } = await requireSession()
  const sidebarOpen = (await cookies()).get('sidebar_state')?.value !== 'false'

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <AppSidebar user={{ name: user.name, email: user.email }} />
      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-4">
          <SidebarTrigger aria-label="Toggle navigation" />
          <Separator orientation="vertical" className="h-4" />
          <span className="text-sm text-muted-foreground">{user.name}</span>
        </header>
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4 md:p-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
