// components/layout/AppShell.tsx
import SiteHeader from "./SiteHeader"
import { SidebarDesktop } from "./Sidebar"

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid grid-rows-[auto_1fr]">
      <SiteHeader />

      {/* موبايل: عمود واحد، ديسكتوب: flex مع row-reverse ⇒ السايدبار يمين */}
      <div className="container py-6 md:flex md:flex-row-reverse md:gap-6">
        
        <main className="flex-1 min-w-0">{children}</main>
        <SidebarDesktop />
      </div>
    </div>
  )
}
