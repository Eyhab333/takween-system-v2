"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import useClaimsRole from "@/hooks/use-claims-role";
import { hasRoleAtLeast, Role } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/layout/ThemeToggle"
import { NotificationBell } from "@/components/layout/NotificationBell";


type NavItem = { label: string; href: string; minRole: Role };

const NAV_ITEMS: NavItem[] = [
  { label: "ملفي", href: "/me", minRole: "employee" },
  { label: "لوحة التحكم", href: "/dashboard", minRole: "hr" },
  { label: "الشهادات", href: "/certificates", minRole: "hr" },
  { label: "التعميمات", href: "/announcements", minRole: "hr" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  // ✅ كل الـ hooks في الأول
  const { role, uid, loading } = useClaimsRole();
  const pathname = usePathname();
  const router = useRouter();

  const isHrOrAbove = hasRoleAtLeast(role, "hr");
  const isAnnouncementsPath = pathname?.startsWith("/announcements");
  // ❗ تعريف المسارات الممنوعة على الموظف العادي فقط
  const isForbiddenHrPathForNonHr = (() => {
    if (!pathname) return false;

    // لو هو HR أصلاً يبقى مفيش منع
    if (isHrOrAbove) return false;

    // لوحة التحكم
    if (pathname.startsWith("/dashboard")) return true;

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
            {/* الشعار */}
            <div className="font-bold">
              {/* نسخة الديسكتوب: نص ثابت */}
              <span className="hidden md:inline">Takween</span>

              {/* نسخة الجوال: زر يودّي للوحة التحكم لو انا في صفحة التعميمات */}
              <button
                type="button"
                className="md:hidden"
                onClick={() => {
                  if (isHrOrAbove && isAnnouncementsPath) {
                    router.push("/dashboard");
                  }
                }}
              >
                Takween
              </button>
            </div>

            {/* روابط + خروج للموبايل فقط */}
            <div className="md:hidden flex items-center gap-2">
              <Link
                href={uid ? `/employees/${uid}` : "/me"}
                className="text-sm underline"
              >
                ملفي
              </Link>

              {isHrOrAbove && (
                <Link href="/announcements" className="text-sm underline">
                  التعميمات
                </Link>
              )}

              {/* زر تسجيل الخروج على الموبايل */}
              <form
                action={async () => {
                  const { signOut } = await import("firebase/auth");
                  const { auth } = await import("@/lib/firebase");
                  await signOut(auth);
                  router.replace("/login");
                }}
              >
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  className="text-xs px-2 py-1"
                >
                  تسجيل الخروج
                </Button>
              </form>

            </div>
            <NotificationBell />
            <ThemeToggle />
          </div>
        </header>

        <main className="container mx-auto px-4 py-6">{children}</main>
      </div>
    </div>
  );
}
