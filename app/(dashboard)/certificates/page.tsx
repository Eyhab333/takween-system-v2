/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collectionGroup,
  getDocs,
  limit,
  orderBy,
  query,
} from "firebase/firestore";

import useClaimsRole, { Role } from "@/hooks/use-claims-role";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { doc, deleteDoc } from "firebase/firestore";

const HR_ROLES: Role[] = ["hr", "chairman", "ceo", "admin", "superadmin"];

type CertificateRow = {
  id: string;
  path: string; // المسار الكامل: users/<uid>/certificates/<docId>
  employeeId?: string;
  employeeName?: string | null;
  employeeDepartment?: string | null;
  employeePosition?: string | null;
  employeeEmail?: string | null;
  title?: string;
  fileUrl?: string | null;
  date?: any;
  createdAt?: any;
};

export default function CertificatesDashboardPage() {
  const { role, loading } = useClaimsRole();
  const [certs, setCerts] = useState<CertificateRow[]>([]);
  const [search, setSearch] = useState("");

  const isHrOrAbove = role ? HR_ROLES.includes(role) : false;

  useEffect(() => {
    if (!isHrOrAbove) return;

    (async () => {
      try {
        const qy = query(
          collectionGroup(db, "certificates"),
          orderBy("createdAt", "desc"),
          limit(100)
        );
        const snap = await getDocs(qy);
        const list: CertificateRow[] = snap.docs.map((d) => {
          const data = d.data() as any;
          const path = d.ref.path; // users/<uid>/certificates/<docId>
          const segments = path.split("/"); // ["users", "<uid>", "certificates", "<docId>"]
          const employeeId =
            data.employeeId || (segments.length >= 2 ? segments[1] : "");

          return {
            id: d.id,
            path,
            employeeId,
            ...data,
          };
        });
        setCerts(list);
      } catch (e) {
        console.error(e);
        toast.error("تعذر تحميل الشهادات");
      }
    })();
  }, [isHrOrAbove]);

  if (loading) {
    return (
      <div className="min-h-[40vh] grid place-items-center text-sm text-muted-foreground">
        جارٍ التحميل…
      </div>
    );
  }

  if (!isHrOrAbove) {
    return (
      <div className="min-h-[40vh] grid place-items-center text-sm text-muted-foreground">
        هذه الصفحة متاحة لإدارة الموارد البشرية فقط.
      </div>
    );
  }

  const term = search.trim().toLowerCase();
  const filtered = term
    ? certs.filter((c) => {
        const haystack = [
          c.employeeName || "",
          c.employeeEmail || "",
          c.employeeDepartment || "",
          c.employeePosition || "",
          c.title || "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(term);
      })
    : certs;

  async function handleDeleteCert(row: CertificateRow) {
    try {
      await deleteDoc(doc(db, row.path));
      setCerts((prev) => prev.filter((c) => c.id !== row.id));
      toast.success("تم حذف الشهادة");
    } catch (e: any) {
      console.error(e);
      toast.error("فشل حذف الشهادة");
    }
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>سجل الشهادات للموظفين</CardTitle>
        </CardHeader>

        <CardContent className="grid gap-4">
          {/* شريط البحث + ملخص بسيط */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                عرض لأحدث الشهادات الصادرة لجميع الموظفين في منظومة تكوين.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                البيانات تأتي من subcollection
                <span className="font-mono mx-1">
                  users/&lt;uid&gt;/certificates
                </span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="بحث باسم الموظف، البريد، القسم، البرنامج…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full md:w-72"
              />
            </div>
          </div>

          {/* ملخص أرقام فوق الجدول */}
          <div className="grid gap-3 md:grid-cols-3">
            <SummaryBox label="إجمالي الشهادات" value={certs.length} />
            <SummaryBox label="الظاهرة بعد التصفية" value={filtered.length} />
            {/* ممكن لاحقًا تضيف كارت مثل: شهادات هذا الشهر */}
          </div>

          {/* الجدول */}
          <div className="rounded-md border overflow-hidden bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">الموظف</TableHead>
                  <TableHead className="text-right">القسم / المسمى</TableHead>
                  <TableHead className="text-right">عنوان الشهادة</TableHead>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead className="text-right">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center py-6 text-sm text-muted-foreground"
                    >
                      لا توجد شهادات مطابقة لبحثك.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((c) => (
                    <TableRow key={c.id}>
                      {/* الموظف */}
                      <TableCell>
                        <div className="font-medium">
                          {c.employeeName || "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {c.employeeEmail || c.employeeId || "—"}
                        </div>
                      </TableCell>

                      {/* القسم / المسمى */}
                      <TableCell>
                        <div className="text-sm">
                          {c.employeeDepartment || "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {c.employeePosition || ""}
                        </div>
                      </TableCell>

                      {/* عنوان الشهادة */}
                      <TableCell>
                        <div className="text-sm">{c.title || "—"}</div>
                      </TableCell>

                      {/* التاريخ */}
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(c.date || c.createdAt)}
                      </TableCell>

                      {/* الإجراءات */}
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          {c.fileUrl && (
                            <Button asChild size="sm" variant="outline">
                              <a
                                href={c.fileUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                فتح الملف
                              </a>
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeleteCert(c)}
                          >
                            حذف
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-3 text-sm">
      <div className="text-muted-foreground mb-1">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function formatDate(d: any) {
  try {
    if (!d) return "—";
    const dt = typeof d?.toDate === "function" ? d.toDate() : new Date(d);
    if (isNaN(dt as any)) return "—";
    return dt.toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return "—";
  }
}
