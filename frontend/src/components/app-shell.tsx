import { Briefcase, CalendarDays, Check, ChevronsUpDown, FileBarChart, LayoutDashboard, LogOut, Package, Search, Settings, SlidersHorizontal, Tags, Users } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'

import { Logo, LogoMark } from '@/components/logo'
import { CommandPalette, CommandPaletteTrigger } from '@/components/command-palette'
import { LanguageSwitcher, ThemeSwitcher } from '@/components/preference-switchers'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
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
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AiAssistant } from '@/features/ai/ai-assistant'
import { useCurrentUser, useLogout } from '@/features/auth/use-auth'
import { NotificationBell } from '@/features/notifications/notification-bell'
import { PreferencesSync } from '@/features/settings/use-preferences'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { API_URL } from '@/lib/api'
import { initials } from '@/lib/format'

const NAV_ITEMS = [
  { to: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard, managersOnly: false },
  { to: '/orders', labelKey: 'nav.orders', icon: Package, managersOnly: false },
  { to: '/calendar', labelKey: 'nav.calendar', icon: CalendarDays, managersOnly: false },
  { to: '/clients', labelKey: 'nav.clients', icon: Users, managersOnly: false },
  { to: '/services', labelKey: 'nav.services', icon: Tags, managersOnly: false },
  { to: '/reports', labelKey: 'nav.reports', icon: FileBarChart, managersOnly: true },
  { to: '/team', labelKey: 'nav.team', icon: Briefcase, managersOnly: false },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings, managersOnly: false },
] as const

function WorkspaceSwitcher() {
  const { t } = useTranslation()
  const { workspaceId, workspaceName, role, workspaces, switchWorkspace } = useWorkspace()
  const navigate = useNavigate()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton size="lg" aria-label={t('nav.switchWorkspace')} className="data-[state=open]:bg-sidebar-accent">
          <LogoMark className="size-8" />
          <div className="grid min-w-0 flex-1 text-left leading-tight">
            <span className="truncate font-semibold">{workspaceName}</span>
            <span className="truncate text-xs text-muted-foreground">{t(`roles.${role}`)}</span>
          </div>
          <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{t('nav.switchWorkspace')}</DropdownMenuLabel>
        {workspaces.map((w) => (
          <DropdownMenuItem
            key={w.id}
            onSelect={() => {
              switchWorkspace(w.id)
              navigate('/dashboard')
            }}
          >
            <span className="min-w-0 flex-1 truncate">{w.name}</span>
            <span className="text-xs text-muted-foreground">{t(`roles.${w.role}`)}</span>
            {w.id === workspaceId ? <Check className="size-4" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function UserMenu() {
  const { t } = useTranslation()
  const { data: user } = useCurrentUser()
  const logout = useLogout()
  const navigate = useNavigate()
  if (!user) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton size="lg" aria-label={t('nav.account')} className="data-[state=open]:bg-sidebar-accent">
          <Avatar className="size-8 ring-1 ring-foreground/10">
            {user.avatarUpdatedAt ? (
              <AvatarImage src={`${API_URL}/users/me/avatar?v=${encodeURIComponent(user.avatarUpdatedAt)}`} alt="" />
            ) : null}
            <AvatarFallback className="bg-accent text-accent-foreground">{initials(user.fullName)}</AvatarFallback>
          </Avatar>
          <div className="grid min-w-0 flex-1 text-left leading-tight">
            <span className="truncate font-medium">{user.fullName}</span>
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
          </div>
          <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-60">
        <DropdownMenuItem onSelect={() => navigate('/settings')}>
          <Settings />
          {t('nav.settings')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await logout.mutateAsync().catch(() => undefined)
            navigate('/login', { replace: true })
          }}
        >
          <LogOut />
          {t('auth.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NavItems() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const { setOpenMobile } = useSidebar()
  const { canManageRecords } = useWorkspace()
  return (
    <SidebarMenu className="gap-0.5">
      {NAV_ITEMS.filter((item) => canManageRecords || !item.managersOnly).map(({ to, labelKey, icon: Icon }) => (
        <SidebarMenuItem key={to}>
          <SidebarMenuButton
            asChild
            isActive={pathname.startsWith(to)}
            tooltip={t(labelKey)}
            className="h-9 transition-[background-color,color,transform] duration-150 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground"
          >
            <Link to={to} onClick={() => setOpenMobile(false)}>
              <Icon className="size-4" />
              <span>{t(labelKey)}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}

/** On narrow screens the two switchers fold into one button. */
function CompactPreferences() {
  const { t } = useTranslation()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`${t('language.label')} / ${t('theme.label')}`} className="lg:hidden">
          <SlidersHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="grid w-auto gap-3 p-3">
        <DropdownMenuLabel className="p-0 cf-eyebrow">{t('language.label')}</DropdownMenuLabel>
        <LanguageSwitcher />
        <DropdownMenuLabel className="p-0 cf-eyebrow">{t('theme.label')}</DropdownMenuLabel>
        <ThemeSwitcher />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Layout of the signed-in application: sidebar navigation + page content. */
export function AppShell() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const { canManageRecords } = useWorkspace()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const navItems = NAV_ITEMS.filter((item) => canManageRecords || !item.managersOnly)
  return (
    <TooltipProvider>
      <PreferencesSync />
      <SidebarProvider>
        <Sidebar collapsible="icon" className="border-r-0">
          <SidebarHeader className="pb-1">
            <SidebarMenu>
              <SidebarMenuItem>
                <WorkspaceSwitcher />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <NavItems />
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <UserMenu />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
        {/* min-w-0: wide content (Kanban board, tables) scrolls inside instead of stretching the page */}
        <SidebarInset className="min-w-0 bg-background">
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-1.5 focus:text-primary-foreground"
          >
            {t('nav.skipToContent')}
          </a>
          <header
            className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border/60 bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70"
            style={{ top: 'env(safe-area-inset-top, 0px)' }}
          >
            <SidebarTrigger aria-label={t('nav.menu')} className="-ml-1" />
            <Logo className="sm:hidden" />
            <div className="flex min-w-0 flex-1 justify-end sm:justify-start">
              <div className="hidden w-full max-w-md sm:block">
                <CommandPaletteTrigger onOpen={() => setPaletteOpen(true)} />
              </div>
            </div>
            <div className="hidden items-center gap-2 lg:flex">
              <LanguageSwitcher />
              <ThemeSwitcher />
            </div>
            <Button variant="ghost" size="icon" className="sm:hidden" aria-label={t('palette.title')} onClick={() => setPaletteOpen(true)}>
              <Search className="size-4" />
            </Button>
            <CompactPreferences />
            <NotificationBell />
          </header>
          <main id="main" key={pathname} className="min-w-0 flex-1 px-4 pt-5 pb-24 sm:px-6 sm:pt-6 lg:px-8">
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
      <AiAssistant />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} navItems={navItems} />
      <Toaster richColors position="top-right" />
    </TooltipProvider>
  )
}
