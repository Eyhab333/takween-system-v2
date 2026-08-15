export type JobComplianceResource = {
  key: string;
  title: string;
  category: string;
  version: string;
  storagePath: string;
  requiresAcknowledgement: boolean;
  sortOrder: number;
  active: boolean;
};

export const JOB_COMPLIANCE_RESOURCES: JobComplianceResource[] = [
  {
    key: "prohibited-professional-behaviors-v1",
    title: "السلوكيات المهنية تجاه الطلاب",
    category: "السلوك المهني",
    version: "v1",
    storagePath: "job-compliance/prohibited-professional-behaviors-v1.pdf",
    requiresAcknowledgement: true,
    sortOrder: 1,
    active: true,
  },
  {
    key: "employee-obligations-and-duties-v1",
    title: "الالتزامات والواجبات",
    category: "الالتزامات الوظيفية",
    version: "v1",
    storagePath: "job-compliance/employee-obligations-and-duties-v1.pdf",
    requiresAcknowledgement: true,
    sortOrder: 2,
    active: true,
  },
];

export const ACTIVE_JOB_COMPLIANCE_RESOURCES = JOB_COMPLIANCE_RESOURCES.filter(
  (resource) => resource.active,
).sort((a, b) => a.sortOrder - b.sortOrder);
