"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu } from "lucide-react";

import useClaimsRole, { Role } from "@/hooks/use-claims-role";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/layout/ThemeToggle";
import { NotificationBell } from "@/components/layout/NotificationBell";
import EnableNotificationsButton from "../EnableNotificationsButton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  FileText,
  Megaphone,
  PlusSquare,
  ShieldCheck,
  User,
} from "lucide-react";

type NavItem = {
  label: string;
  href: string;
  minRole: Role;
};

const rolePriority: Record<Role, number> = {
  employee: 1,
  hr: 2,
  chairman: 3,
  ceo: 4,
  admin: 5,
  superadmin: 6,
};

function hasRoleAtLeast(userRole: Role | null, min: Role) {
  if (!userRole) return false;
  return rolePriority[userRole] >= rolePriority[min];
}

const NAV_ITEMS: NavItem[] = [
  { label: "الملف الوظيفي", href: "/me", minRole: "employee" },
  { label: "المراسلات", href: "/dashboard", minRole: "employee" },
  { label: "التعاميم", href: "/announcements", minRole: "employee" },
  { label: "الالتزام الوظيفي", href: "/job-compliance", minRole: "hr" },
  // { label: "إنشاء طلب", href: "/requests/new", minRole: "employee" },
  // { label: "الوارد", href: "/requests/inbox", minRole: "employee" },
  // { label: "الصادر", href: "/requests/outbox", minRole: "employee" },
  // { label: "الأرشيف", href: "/requests/archive", minRole: "employee" },

  { label: "إنشاء تعميم", href: "/announcements/new", minRole: "superadmin" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { role, uid, loading } = useClaimsRole();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isHrOrAbove = hasRoleAtLeast(role, "hr");
  const isSuperadmin = hasRoleAtLeast(role, "superadmin");
  const ownEmployeeRoot = uid ? `/employees/${uid}` : null;

  const isForbiddenPath = useMemo(() => {
    if (!pathname) return false;

    // superadmin only
    if (
      (pathname === "/announcements/new" ||
        pathname.startsWith("/announcements/new/")) &&
      !isSuperadmin
    ) {
      return true;
    }

    // certificates for HR+
    if (pathname === "/job-compliance" && !isHrOrAbove) {
      return true;
    }

    if (pathname === "/certificates" && !isHrOrAbove) {
      return true;
    }

    // صفحات الموظفين
    if (pathname.startsWith("/employees/")) {
      // HR+ مسموح لهم
      if (isHrOrAbove) return false;

      // غير مسجل أو لا نملك uid
      if (!uid || !ownEmployeeRoot) return true;

      // منع الموظف من الدخول إلى صفحات موظف آخر فقط
      if (!pathname.startsWith(ownEmployeeRoot)) {
        return true;
      }
    }

    return false;
  }, [pathname, isSuperadmin, isHrOrAbove, uid, ownEmployeeRoot]);

  useEffect(() => {
    if (loading) return;

    if (isForbiddenPath) {
      if (uid) {
        router.replace(`/employees/${uid}`);
      } else {
        router.replace("/login");
      }
    }
  }, [loading, isForbiddenPath, uid, router]);

  if (loading) return null;
  if (isForbiddenPath) return null;

  const items = NAV_ITEMS.filter((item) => hasRoleAtLeast(role, item.minRole));

  const bottomNavItems = items.slice(0, 3); // Show only the top 3 items in the bottom nav

  function getBottomNavIcon(href: string) {
    if (href === "/me") return User;
    if (href === "/dashboard") return FileText;
    if (href === "/announcements") return Megaphone;
    if (href === "/job-compliance") return ShieldCheck;
    if (href === "/announcements/new") return PlusSquare;
    return FileText;
  }

  return (
    <div className="min-h-screen grid md:grid-cols-[240px_1fr]">
      <aside className="hidden md:block border-l">
        <div className="space-y-2 p-4">
          {items.map((it) => {
            const targetHref =
              it.href === "/me" && uid ? `/employees/${uid}` : it.href;

            const active =
              pathname === targetHref || pathname?.startsWith(`${targetHref}/`);

            return (
              <Link
                key={it.href}
                href={targetHref}
                className={`block rounded px-3 py-2 text-sm ${
                  active ? "bg-muted font-semibold" : "hover:bg-muted"
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
            <Button type="submit" variant="outline" className="mt-4 w-full">
              تسجيل الخروج
            </Button>
          </form>
        </div>
      </aside>

      <div>
        <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
          <div className="container mx-auto flex h-14 items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <div className="md:hidden">
                <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                  <SheetTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="فتح القائمة"
                    >
                      <Menu className="h-5 w-5" />
                    </Button>
                  </SheetTrigger>

                  <SheetContent side="right" className="w-[280px] p-0">
                    <SheetHeader className="sr-only">
                      <SheetTitle>القائمة</SheetTitle>
                    </SheetHeader>

                    <div className="flex h-14 items-center justify-between border-b px-4">
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
                    </div>

                    <div className="space-y-2 p-4">
                      {items.map((it) => {
                        const targetHref =
                          it.href === "/me" && uid
                            ? `/employees/${uid}`
                            : it.href;

                        const active =
                          pathname === targetHref ||
                          pathname?.startsWith(`${targetHref}/`);

                        return (
                          <Link
                            key={it.href}
                            href={targetHref}
                            onClick={() => setMobileOpen(false)}
                            className={`block rounded px-3 py-2 text-sm ${
                              active
                                ? "bg-muted font-semibold"
                                : "hover:bg-muted"
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
                        <Button
                          type="submit"
                          variant="outline"
                          className="mt-4 w-full"
                        >
                          تسجيل الخروج
                        </Button>
                      </form>
                    </div>
                  </SheetContent>
                </Sheet>
              </div>

              <div className="flex items-center">
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

                <button
                  type="button"
                  className="inline-flex items-center md:hidden"
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

            <div className="flex items-center gap-2">
              <NotificationBell />
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-6 pb-24 md:pb-6">
          {children}
        </main>
        <nav className="fixed bottom-0 inset-x-0 z-40 border-t bg-background/95 backdrop-blur md:hidden">
          <div className="grid grid-cols-3">
            {bottomNavItems.map((it) => {
              const targetHref =
                it.href === "/me" && uid ? `/employees/${uid}` : it.href;

              const active =
                pathname === targetHref ||
                pathname?.startsWith(`${targetHref}/`);

              const Icon = getBottomNavIcon(it.href);

              return (
                <Link
                  key={it.href}
                  href={targetHref}
                  className={`flex min-h-16 flex-col items-center justify-center gap-1 px-2 text-[11px] ${
                    active
                      ? "text-primary font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="truncate">{it.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
