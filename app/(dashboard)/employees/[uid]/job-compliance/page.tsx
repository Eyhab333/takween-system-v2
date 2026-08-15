"use client";

import { useParams } from "next/navigation";
import EmployeeJobCompliancePanel from "@/components/employee/EmployeeJobCompliancePanel";

export default function EmployeeJobCompliancePage() {
  const params = useParams<{ uid: string }>();
  const uid = params?.uid;

  if (!uid) return null;

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">الالتزام الوظيفي</h1>
        <p className="text-sm text-muted-foreground">
          السياسات والتعهدات المطلوب الاطلاع عليها والإقرار بها.
        </p>
      </div>

      <EmployeeJobCompliancePanel uid={uid} />
    </div>
  );
}
