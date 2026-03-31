export type EmployeeSectionConfig = {
  key: string;
  title: string;
  description: string;
  sheetName: string;
  range?: string;
  nationalIdHeader?: string;
  visibleFields?: string[];
  fieldLabels?: Record<string, string>;
};

export const EMPLOYEE_FILE_SECTIONS: EmployeeSectionConfig[] = [
  {
    key: "info",
    title: "معلوماتي",
    description: "البيانات الوظيفية الأساسية من Google Sheets",
    sheetName: "رحلة الموظف",
    range: "A1:AZ1000",
    nationalIdHeader: "nationalId",
    fieldLabels: {
      nationalId: "رقم الهوية",
      name: "الاسم",
      employeeName: "الاسم",
      jobTitle: "المسمى الوظيفي",
      department: "القسم",
      mobile: "الجوال",
      email: "البريد الإلكتروني",
    },
  },

  // أمثلة مستقبلية:
  // {
  //   key: "financial",
  //   title: "معلوماتي المالية",
  //   description: "البيانات المالية من Google Sheets",
  //   sheetName: "البيانات المالية",
  //   range: "A1:AZ1000",
  //   nationalIdHeader: "nationalId",
  // },
  // {
  //   key: "documents",
  //   title: "مستنداتي",
  //   description: "العهد أو المستندات أو الملاحظات",
  //   sheetName: "المستندات",
  //   range: "A1:AZ1000",
  //   nationalIdHeader: "nationalId",
  // },
];

export function getEmployeeSectionConfig(section: string) {
  return EMPLOYEE_FILE_SECTIONS.find((item) => item.key === section) ?? null;
}