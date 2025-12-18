// app/internal-requests/page.tsx
"use client"

import { useState } from "react"
import Link from "next/link"
import { useAuth } from "@/context/AuthContext"
import useClaimsRole from "@/hooks/use-claims-role"
import { useMyInternalRequests } from "@/hooks/use-my-internal-requests"
import { useAssignedInternalRequests } from "@/hooks/use-assigned-internal-requests"
import { createInternalRequest } from "@/lib/internal-requests/firestore"
import type { RequestType } from "@/lib/internal-requests/types"
import type { Role } from "@/lib/roles"

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"

import { toast } from "sonner"

export default function InternalRequestsPage() {
  const { user } = useAuth()
  const { role } = useClaimsRole()
  const { loading: loadingMine, requests: myRequests } = useMyInternalRequests()
  const {
    loading: loadingAssigned,
    requests: assignedRequests,
  } = useAssignedInternalRequests()

  const [title, setTitle] = useState("")
  const [type, setType] = useState<RequestType>("general")
  const [description, setDescription] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const statusLabel: Record<string, string> = {
    open: "مفتوح",
    in_progress: "قيد الإجراء",
    approved: "معتمد",
    rejected: "مرفوض",
    closed: "مغلق",
    cancelled: "ملغى",
  }

  if (!user) {
    return (
      <div className="min-h-[40vh] grid place-items-center text-sm text-muted-foreground">
        يرجى تسجيل الدخول للوصول إلى الطلبات الداخلية.
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !description.trim()) {
      toast.error("من فضلك املأ العنوان والوصف")
      return
    }

    try {
      setSubmitting(true)

      // مبدئيًا: كل الطلبات تُوجَّه للمدير التنفيذي (ceo)
      const initialAssigneeRole: Role | null = "ceo"
      const initialAssigneeUid: string | null = null // ممكن نربط UID المدير التنفيذي لاحقًا

      await createInternalRequest({
        title: title.trim(),
        type,
        description: description.trim(),
        createdByUid: user.uid,
        createdByEmail: user.email ?? null,
        createdByRole: (role as Role | null) ?? null,
        createdByDept: null, // نقدر نجيبها لاحقًا من doc المستخدم في users
        initialAssigneeUid,
        initialAssigneeRole,
      })

      setTitle("")
      setDescription("")
      setType("general")
      toast.success("تم إرسال الطلب بنجاح")
    } catch (err) {
      console.error(err)
      toast.error("حدث خطأ أثناء إنشاء الطلب")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">الطلبات الداخلية</h1>

      {/* نموذج إنشاء طلب جديد */}
      <Card>
        <CardHeader>
          <CardTitle>إنشاء طلب جديد</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium mb-1 block">
                  عنوان الطلب
                </label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثال: طلب موافقة على شراء أجهزة"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">
                  نوع الطلب
                </label>
                <Select
                  value={type}
                  onValueChange={(v) => setType(v as RequestType)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر نوع الطلب" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">عام</SelectItem>
                    <SelectItem value="finance">مالية</SelectItem>
                    <SelectItem value="hr">موارد بشرية</SelectItem>
                    <SelectItem value="projects">مشاريع</SelectItem>
                    <SelectItem value="it">دعم تقني</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">
                وصف الطلب
              </label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="اشرح تفاصيل الطلب، المبررات، وأي معلومات إضافية..."
                rows={4}
              />
            </div>

            <Button type="submit" disabled={submitting}>
              {submitting ? "جارٍ الإرسال..." : "إرسال الطلب"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* طلباتي */}
      <Card>
        <CardHeader>
          <CardTitle>طلباتي</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingMine ? (
            <p className="text-sm text-muted-foreground">جاري التحميل...</p>
          ) : myRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              لا توجد طلبات حتى الآن.
            </p>
          ) : (
            <div className="space-y-2">
              {myRequests.map((r) => (
                <div
                  key={r.id}
                  className="border rounded-md px-3 py-2 text-sm flex flex-col md:flex-row md:items-center md:justify-between gap-1"
                >
                  <div>
                    <div className="font-medium">{r.title}</div>
                    <div className="text-xs text-muted-foreground">
                      النوع: {r.type} • الحالة:{" "}
                      {statusLabel[r.status] ?? r.status}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {r.createdAt && (
                      <span>
                        أنشئ في{" "}
                        {r.createdAt.toLocaleDateString("ar-SA", {
                          year: "numeric",
                          month: "short",
                          day: "2-digit",
                        })}
                      </span>
                    )}
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/internal-requests/${r.id}`}>
                        عرض التفاصيل
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* الطلبات الواردة لي (Inbox حسب الدور) */}
      {role && (
        <Card>
          <CardHeader>
            <CardTitle>الطلبات الواردة لي ({role})</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingAssigned ? (
              <p className="text-sm text-muted-foreground">جاري التحميل...</p>
            ) : assignedRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                لا توجد طلبات موجّهة لك حاليًا.
              </p>
            ) : (
              <div className="space-y-2">
                {assignedRequests.map((r) => (
                  <div
                    key={r.id}
                    className="border rounded-md px-3 py-2 text-sm flex flex-col md:flex-row md:items-center md:justify-between gap-1"
                  >
                    <div>
                      <div className="font-medium">{r.title}</div>
                      <div className="text-xs text-muted-foreground">
                        من: {r.createdByEmail || r.createdByUid} • النوع:{" "}
                        {r.type} • الحالة: {statusLabel[r.status] ?? r.status}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {r.createdAt && (
                        <span>
                          أنشئ في{" "}
                          {r.createdAt.toLocaleDateString("ar-SA", {
                            year: "numeric",
                            month: "short",
                            day: "2-digit",
                          })}
                        </span>
                      )}
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/internal-requests/${r.id}`}>
                          عرض التفاصيل
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
