// components/layout/Sidebar.tsx (نسخة العنوان المخفي)
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { mainNav } from "@/lib/nav"
import { Button } from "@/components/ui/button"
import {
  Sheet, SheetContent, SheetTrigger,
  SheetHeader, SheetTitle
} from "@/components/ui/sheet"
import { Menu } from "lucide-react"
import { Root as VisuallyHidden } from "@radix-ui/react-visually-hidden"

export function SidebarMobile() {
  const pathname = usePathname()
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="md:hidden" aria-label="فتح القائمة">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="w-72">
        <SheetHeader className="text-start">
          <VisuallyHidden>
            <SheetTitle>القائمة</SheetTitle>
          </VisuallyHidden>
        </SheetHeader>

        <nav className="mt-2 grid gap-2">
          {mainNav.map((item) => {
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-2 rounded-md text-sm ${
                  active ? "bg-secondary text-foreground" : "hover:bg-muted"
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </SheetContent>
    </Sheet>
  )
}



export function SidebarDesktop() {
  const pathname = usePathname()
  return (
    // السايدبار ثابت يمين، وعامل فاصل (border-left) بينه وبين المحتوى
    <aside className="hidden md:block w-64 shrink-0 md:pl-4 md:border-l md:sticky md:top-20 self-start">
      <nav className="mt-6 grid gap-2">
        {mainNav.map((item) => {
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-2 rounded-md text-sm inline-block w-full ${
                active ? "bg-secondary text-foreground" : "hover:bg-muted"
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}

