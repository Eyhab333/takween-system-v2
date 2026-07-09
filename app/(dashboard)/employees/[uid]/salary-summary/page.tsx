"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import EmployeeSalarySummaryPanel from "@/components/employee/EmployeeSalarySummaryPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function EmployeeSalarySummaryPage() {
  const params = useParams<{ uid: string }>();
  const uid = params?.uid;

  const [nationalId, setNationalId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;

    let cancelled = false;

    const unsub = onAuthStateChanged(auth, async () => {
      try {
        setLoading(true);
        setError(null);

        const snap = await getDoc(doc(db, "users", uid));

        if (!snap.exists()) {
          if (!cancelled) {
            setError("لم يتم العثور على بيانات الموظف");
            setNationalId(null);
          }
          return;
        }

        const data = snap.data() as {
          nationalId?: string;
          personalInfo?: {
            nationalId?: string;
          };
        };

        const foundNationalId =
          data.personalInfo?.nationalId || data.nationalId || "";

        if (!foundNationalId) {
          if (!cancelled) {
            setError("لا يوجد سجل مدني محفوظ لهذا الموظف");
            setNationalId(null);
          }
          return;
        }

        if (!cancelled) {
          setNationalId(foundNationalId);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError("حدث خطأ أثناء تحميل بيانات الموظف");
          setNationalId(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [uid]);

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">كشف الراتب</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          تفاصيل صافي الراتب والبدلات والخصومات حسب بيانات المسير.
        </p>
      </div>

      {loading && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            جاري تحميل بيانات الموظف...
          </CardContent>
        </Card>
      )}

      {!loading && error && (
        <Card>
          <CardHeader>
            <CardTitle>تعذر عرض كشف الراتب</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-red-600">{error}</CardContent>
        </Card>
      )}

      {!loading && !error && (
        <EmployeeSalarySummaryPanel nationalId={nationalId} />
      )}
    </div>
  );
}