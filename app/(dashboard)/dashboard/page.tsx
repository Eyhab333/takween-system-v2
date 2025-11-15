/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import HRGate from "@/components/auth/HRGate";
import { useEffect, useState } from "react";
import Link from "next/link";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
  DocumentData,
  QueryConstraint,
} from "firebase/firestore";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Role = "employee" | "hr" | "chairman" | "ceo" | "admin" | "superadmin";
type Emp = {
  uid: string;
  name: string;
  email: string;
  department?: string;
  position?: string;
  role?: Role;
  unit?: string;
  schoolKey?: string;
  schoolType?: string;
};
type GroupSpec = { id: string; title: string; schoolKey: string };

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [council, setCouncil] = useState<Emp[]>([]);
  const [executive, setExecutive] = useState<Emp[]>([]);
  const [supervision, setSupervision] = useState<Emp[]>([]);
  const [manarBoys, setManarBoys] = useState<Emp[]>([]);
  const [manarGirls, setManarGirls] = useState<Emp[]>([]);
  const [kgGroups, setKgGroups] = useState<Record<string, Emp[]>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const col = collection(db, "users");

        const councilQ = [where("unit", "==", "council"), orderBy("name")];
        const execQ = [where("unit", "==", "executive"), orderBy("name")];
        const supQ = [where("unit", "==", "supervision"), orderBy("name")];
        const boysQ = [where("schoolKey", "==", "manar_boys"), orderBy("name")];
        const girlsQ = [
          where("schoolKey", "==", "manar_girls"),
          orderBy("name"),
        ];
        // unit+schoolType+orderBy يحتاج Composite؛ fallback يزيل orderBy
        const kgSpecs: GroupSpec[] = [
          {
            id: "kg1",
            title: "روضة واحة الرياحين الأولى",
            schoolKey: "rawdat_1",
          },
          {
            id: "kg2",
            title: "روضة واحة الرياحين الثانية",
            schoolKey: "rawdat_2",
          },
          {
            id: "kg3",
            title: "روضة واحة الرياحين الثالثة",
            schoolKey: "rawdat_3",
          },
          {
            id: "kg4",
            title: "روضة واحة الرياحين الرابعة",
            schoolKey: "rawdat_4",
          },
        ];

        const [councilRows, execRows, supRows, boysRows, girlsRows] =
          await Promise.all([
            fetchWithIndexFallback(col, councilQ, [
              where("unit", "==", "council"),
            ]),
            fetchWithIndexFallback(col, execQ, [
              where("unit", "==", "executive"),
            ]),
            fetchWithIndexFallback(col, supQ, [
              where("unit", "==", "supervision"),
            ]),
            fetchWithIndexFallback(col, boysQ, [
              where("schoolKey", "==", "manar_boys"),
            ]),
            fetchWithIndexFallback(col, girlsQ, [
              where("schoolKey", "==", "manar_girls"),
            ]),
          ]);

        const kgResults: Record<string, Emp[]> = {};
        for (const g of kgSpecs) {
          kgResults[g.id] = await fetchWithIndexFallback(
            col,
            [where("schoolKey", "==", g.schoolKey), orderBy("name")],
            [where("schoolKey", "==", g.schoolKey)]
          );
        }

        if (cancelled) return;
        setCouncil(councilRows);
        setExecutive(execRows);
        setSupervision(supRows);
        setManarBoys(boysRows);
        setManarGirls(girlsRows);
        setKgGroups(kgResults);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <HRGate>
      <div className="grid gap-6">
        {/* كروت إحصائية سريعة */}
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard
            title="عدد الموظفين الإجمالي "
            value={loading ? "…" : council.length}
          />
          <StatCard
            title="عدد التعميمات "
            value={loading ? "…" : executive.length}
          />
          <StatCard
            title="عدد الشهادات "
            value={loading ? "…" : supervision.length}
          />
        </div>

        {/* أقسام قابلة للطي */}
        <Accordion
          type="multiple"
          defaultValue={[
            "council",
            "executive",
            "supervision",
            "boys",
            "girls",
            "kg",
          ]}
        >
          <Section id="council" title="مجلس الإدارة" rows={council} />
          <Section id="executive" title="الإدارة التنفيذية" rows={executive} />
          <Section
            id="supervision"
            title="الإشراف التعليمي"
            rows={supervision}
          />
          <Section id="boys" title="منار الريادة — بنين" rows={manarBoys} />
          <Section id="girls" title="منار الريادة — بنات" rows={manarGirls} />
          <Section
            id="kg1"
            title="روضة واحة الرياحين الأولى"
            rows={kgGroups["kg1"] ?? []}
          />
          <Section
            id="kg2"
            title="روضة واحة الرياحين الثانية"
            rows={kgGroups["kg2"] ?? []}
          />
          <Section
            id="kg3"
            title="روضة واحة الرياحين الثالثة"
            rows={kgGroups["kg3"] ?? []}
          />
          <Section
            id="kg4"
            title="روضة واحة الرياحين الرابعة"
            rows={kgGroups["kg4"] ?? []}
          />
        </Accordion>
      </div>
    </HRGate>
  );
}

/** يحاول تنفيذ الاستعلام مع orderBy، ولو احتاج إندكس أو كان يبني → يعيد التنفيذ بدون orderBy ثم يرتّب محليًا */
async function fetchWithIndexFallback(
  colRef: ReturnType<typeof collection>,
  constraints: QueryConstraint[],
  fallbackConstraints: QueryConstraint[]
): Promise<Emp[]> {
  try {
    const q1 = query(colRef, ...constraints);
    const snap = await getDocs(q1);
    return sortByName(mapDocs(snap.docs));
  } catch (e: any) {
    // Firestore: required index / building → code = "failed-precondition"
    const needsIndex = e?.code === "failed-precondition";
    if (!needsIndex) throw e;
    const q2 = query(colRef, ...fallbackConstraints);
    const snap2 = await getDocs(q2);
    // ترتيب محلي بدل orderBy("name")
    return sortByName(mapDocs(snap2.docs));
  }
}

function sortByName(rows: Emp[]) {
  return [...rows].sort((a, b) =>
    (a.name || "").localeCompare(b.name || "", "ar")
  );
}

function mapDocs(docs: Array<{ id: string; data: () => DocumentData }>): Emp[] {
  return docs.map((d) => ({ uid: d.id, ...(d.data() as any) })) as Emp[];
}

function Section({
  id,
  title,
  rows,
}: {
  id: string;
  title: string;
  rows: Emp[];
}) {
  return (
    <AccordionItem value={id}>
      <AccordionTrigger className="text-base">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{title}</span>
          <span className="text-xs text-muted-foreground">({rows.length})</span>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        {rows.length === 0 ? (
          <div className="p-3 text-sm text-muted-foreground">لا يوجد عناصر</div>
        ) : (
          <div className="divide-y rounded-md border">
            {rows.map((e) => (
              <div
                key={e.uid}
                className="p-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">{e.name || "—"}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {e.department || "—"} • {e.position || "—"} •{" "}
                    <span dir="ltr">{e.email || "—"}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <RoleChip role={e.role} />
                  <Button asChild size="sm">
                    <Link href={`/employees/${e.uid}`}>فتح الملف</Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

function RoleChip({ role }: { role?: Role }) {
  const label =
    role === "hr"
      ? "الموارد البشرية"
      : role === "chairman"
      ? "رئيس المجلس"
      : role === "ceo"
      ? "المدير التنفيذي"
      : role === "admin"
      ? "مشرف"
      : role === "superadmin"
      ? "superadmin"
      : "موظف";
  return <span className="text-xs rounded-md border px-2 py-1">{label}</span>;
}

function StatCard({ title, value }: { title: string; value: string | number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-end justify-between">
        <div>
          <div className="text-3xl font-bold">{value}</div>
          <p className="text-sm text-muted-foreground">—</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/employees">قائمة الموظفين</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
