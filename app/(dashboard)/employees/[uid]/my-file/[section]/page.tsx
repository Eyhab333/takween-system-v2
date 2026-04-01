/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";

import { db } from "@/lib/firebase";
import { getEmployeeSectionConfig } from "@/lib/employee-file-sections";
import EmployeeSectionDataCard from "@/components/employee/EmployeeSectionDataCard";
import { Button } from "@/components/ui/button";

export default function MyFileSectionPage() {
  const params = useParams<{ uid: string; section: string }>();
  const uid = params?.uid;
  const section = params?.section;

  const sectionConfig = getEmployeeSectionConfig(section || "");

  const [nationalId, setNationalId] = useState<string | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [userError, setUserError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;

    let cancelled = false;

    (async () => {
      try {
        setLoadingUser(true);
        setUserError(null);

        const snap = await getDoc(doc(db, "users", uid));

        if (!snap.exists()) {
          if (!cancelled) setUserError("لم يتم العثور على ملف المستخدم");
          return;
        }

        const data = snap.data() as any;
        const nid = String(
          data?.personalInfo?.nationalId || data?.nationalId || ""
        ).trim();

        if (!cancelled) {
          setNationalId(nid || null);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setUserError("حدث خطأ أثناء تحميل بيانات المستخدم");
        }
      } finally {
        if (!cancelled) setLoadingUser(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uid]);

  if (!sectionConfig) {
    return (
      <div className="max-w-4xl mx-auto grid gap-4">
        <div className="text-sm text-red-600">هذا القسم غير موجود.</div>
        <div>
          <Link href={`/employees/${uid}/my-file`}>
            <Button variant="outline">رجوع إلى ملفي</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (loadingUser) {
    return (
      <div className="max-w-4xl mx-auto text-sm text-muted-foreground">
        جاري تحميل بيانات المستخدم...
      </div>
    );
  }

  if (userError) {
    return (
      <div className="max-w-4xl mx-auto grid gap-4">
        <div className="text-sm text-red-600">{userError}</div>
        <div>
          <Link href={`/employees/${uid}/my-file`}>
            <Button variant="outline">رجوع إلى ملفي</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">{sectionConfig.title}</h1>
          <p className="text-sm text-muted-foreground">
            {sectionConfig.description}
          </p>
        </div>

        <Link href={`/employees/${uid}`}>
          <Button variant="outline" className="gap-2">
            <ArrowRight className="h-4 w-4" />
            رجوع
          </Button>
        </Link>
      </div>

      <EmployeeSectionDataCard
        nationalId={nationalId}
        section={sectionConfig.key}
      />
    </div>
  );
}