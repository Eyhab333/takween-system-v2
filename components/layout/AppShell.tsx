"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import useClaimsRole from "@/hooks/use-claims-role";
import { hasRoleAtLeast, Role } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/layout/ThemeToggle"
import { NotificationBell } from "@/components/layout/NotificationBell";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import Image from "next/image"
import EnableNotificationsButton from "../EnableNotificationsButton";


type NavItem = { label: string; href: string; minRole: Role };

const NAV_ITEMS: NavItem[] = [
  { label: "ملفي", href: "/me", minRole: "employee" },

  // لوحة التحكم نسيبها HR+ زي ما كانت
  { label: "الرئيسية ", href: "/dashboard", minRole: "employee" },

  // الطلبات متاحة لكل الموظفين
  { label: "إنشاء طلب", href: "/requests/new", minRole: "employee" },
  { label: "الوارد", href: "/requests/inbox", minRole: "employee" },
  { label: "الصادر", href: "/requests/outbox", minRole: "employee" },
  { label: "الأرشيف", href: "/requests/archive", minRole: "employee" },

  // ممكن لاحقًا تشيل دول لو حابب
  // { label: "الشهادات", href: "/certificates", minRole: "hr" },
  // { label: "التعميمات", href: "/announcements", minRole: "hr" },
];


export default function AppShell({ children }: { children: React.ReactNode }) {
  // ✅ كل الـ hooks في الأول
  const { role, uid, loading } = useClaimsRole();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isHrOrAbove = hasRoleAtLeast(role, "employee");
  //const isAnnouncementsPath = pathname?.startsWith("/announcements");
  // ❗ تعريف المسارات الممنوعة على الموظف العادي فقط
  const isForbiddenHrPathForNonHr = (() => {
    if (!pathname) return false;

    // لو هو HR أصلاً يبقى مفيش منع
    if (isHrOrAbove) return false;

    // لوحة التحكم
    //if (pathname.startsWith("/dashboard")) return true;

    // صفحة قائمة الموظفين العامة
    if (pathname === "/certificates") return true;

    // التعميمات
    if (
      pathname === "/announcements" ||
      pathname.startsWith("/announcements/")
    ) {
      return true;
    }

    // مسارات /employees/[id]
    if (pathname.startsWith("/employees/")) {
      // لو لسه مش عارفين uid، خليك حذر واعتبره ممنوع مؤقتاً
      if (!uid) return true;

      const ownPath = `/employees/${uid}`;

      // دي صفحة الموظف نفسه → مسموحة
      if (pathname === ownPath) return false;

      // أي موظف تاني → ممنوع
      return true;
    }

    return false;
  })();

  // 🔁 الريديركت في useEffect (بعد اكتمال الـ loading)
  useEffect(() => {
    if (loading) return;

    if (isForbiddenHrPathForNonHr) {
      if (uid) {
        router.replace(`/employees/${uid}`);
      } else {
        router.replace("/login");
      }
    }
  }, [loading, isForbiddenHrPathForNonHr, uid, router]);

  // ⏳ لو لسه بنحمّل بيانات الدور/uid
  if (loading) {
    return null;
  }

  // 🛑 لو المسار ممنوع على الموظف العادي، ما نرندرش حاجة لحد ما الريديركت يحصل
  if (isForbiddenHrPathForNonHr) {
    return null;
  }

  const items = NAV_ITEMS.filter((item) => hasRoleAtLeast(role, item.minRole));

  return (
    <div className="min-h-screen grid md:grid-cols-[240px_1fr]">
      {/* Sidebar */}
      <aside className="hidden md:block border-l">
        <div className="p-4 space-y-2">
          {items.map((it) => {
            const active =
              pathname === it.href || pathname?.startsWith(it.href + "/");

            const targetHref =
              it.href === "/me" && uid ? `/employees/${uid}` : it.href;

            return (
              <Link
                key={it.href}
                href={targetHref}
                className={`block rounded px-3 py-2 text-sm ${active ? "bg-muted font-semibold" : "hover:bg-muted"
                  }`}
              >
                {it.label}
              </Link>
            );
          })}

          <form
            action={async () => {
              const { signOut } = await import("firebase/auth");
              const { auth } = await import("@/lib/firebase");
              await signOut(auth);
              router.replace("/login");
            }}
          >
            <EnableNotificationsButton />
            <Button type="submit" variant="outline" className="w-full mt-4">
              تسجيل الخروج
            </Button>
          </form>
        </div>
      </aside>

      {/* Header للموبايل + المحتوى */}
      <div>
        <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
          <div className="container mx-auto px-4 h-14 flex items-center justify-between">
            {/* Left: Hamburger + Logo */}
            <div className="flex items-center gap-2">
              {/* Hamburger (mobile only) */}
              <div className="md:hidden">
                <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="icon" aria-label="فتح القائمة">
                      <Menu className="h-5 w-5" />
                    </Button>
                  </SheetTrigger>

                  <SheetContent side="right" className="w-[280px] p-0">
                    <SheetHeader className="sr-only">
                      <SheetTitle>القائمة</SheetTitle>
                    </SheetHeader>

                    {/* Header داخل الـ Drawer */}
                    <div className="flex items-center justify-between border-b px-4 h-14">
                      <button
                        type="button"
                        onClick={() => {
                          setMobileOpen(false);
                          router.push("/dashboard");
                        }}
                        className="inline-flex items-center"
                        aria-label="الذهاب للوحة الرئيسية"
                      >
                        <Image
                          src="/logo.png"
                          alt="Takween"
                          width={110}
                          height={30}
                          priority
                          className="h-15 w-auto object-contain"
                        />
                      </button>

                      {/* <Button
                        variant="ghost"
                        size="icon"
                        aria-label="إغلاق"
                        onClick={() => setMobileOpen(false)}
                      >
                        <X className="h-5 w-5" />
                      </Button> */}
                    </div>


                    <div className="p-4 space-y-2">
                      {items.map((it) => {
                        const targetHref =
                          it.href === "/me" && uid ? `/employees/${uid}` : it.href;

                        const active =
                          pathname === it.href || pathname?.startsWith(it.href + "/");

                        return (
                          <Link
                            key={it.href}
                            href={targetHref}
                            onClick={() => setMobileOpen(false)}
                            className={`block rounded px-3 py-2 text-sm ${active ? "bg-muted font-semibold" : "hover:bg-muted"
                              }`}
                          >
                            {it.label}
                          </Link>
                        );
                      })}

                      <form
                        action={async () => {
                          const { signOut } = await import("firebase/auth");
                          const { auth } = await import("@/lib/firebase");
                          await signOut(auth);
                          setMobileOpen(false);
                          router.replace("/login");
                        }}
                      >
                        <EnableNotificationsButton />
                        <Button type="submit" variant="outline" className="w-full mt-4">
                          تسجيل الخروج
                        </Button>
                      </form>
                    </div>
                  </SheetContent>
                </Sheet>
              </div>

              {/* Logo */}
              <div className="flex items-center">
                {/* Desktop */}
                <Link href="/dashboard" className="hidden md:flex items-center">
                  <Image
                    src="/logo.png"
                    alt="Takween"
                    width={110}
                    height={30}
                    priority
                    className="h-15 w-auto object-contain"
                  />
                </Link>

                {/* Mobile */}
                <button
                  type="button"
                  className="md:hidden inline-flex items-center"
                  onClick={() => router.push("/dashboard")}
                  aria-label="الذهاب للوحة الرئيسية"
                >
                  <Image
                    src="/logo.png"
                    alt="Takween"
                    width={110}
                    height={30}
                    priority
                    className="h-14 w-auto object-contain"
                  />
                </button>
              </div>

            </div>

            {/* Right: actions */}
            <div className="flex items-center gap-2">
              <NotificationBell />
              <ThemeToggle />
            </div>
          </div>
        </header>


        <main className="container mx-auto px-4 py-6">{children}</main>
      </div>
    </div>
  );
}
