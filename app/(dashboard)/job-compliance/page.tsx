"use client";

import HRGate from "@/components/auth/HRGate";
import JobComplianceAdminPanel from "@/components/admin/JobComplianceAdminPanel";

export default function JobComplianceAdminPage() {
  return (
    <HRGate>
      <div className="mx-auto grid max-w-6xl gap-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">إدارة الالتزام الوظيفي</h1>
          <p className="text-sm text-muted-foreground">رفع ملفات الالتزام الوظيفي ومتابعة إقرارات الموظفين.</p>
        </div>
        <JobComplianceAdminPanel />
      </div>
    </HRGate>
  );
}
