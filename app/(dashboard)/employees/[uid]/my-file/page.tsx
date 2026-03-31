"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

import { EMPLOYEE_FILE_SECTIONS } from "@/lib/employee-file-sections";

export default function MyFileHomePage() {
  const params = useParams<{ uid: string }>();
  const uid = params?.uid;

  return (
    <div className="max-w-5xl mx-auto grid gap-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">ملفي</h1>
        <p className="text-sm text-muted-foreground">
          اختر البطاقة التي تريد فتحها.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {EMPLOYEE_FILE_SECTIONS.map((section) => (
          <Link
            key={section.key}
            href={`/employees/${uid}/my-file/${section.key}`}
            className="block"
          >
            <Card className="h-full transition hover:shadow-md hover:border-primary/40 cursor-pointer">
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span>{section.title}</span>
                  <ChevronLeft className="h-4 w-4" />
                </CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>

              <CardContent>
                <div className="text-xs text-muted-foreground">
                  اضغط لفتح هذا القسم
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}