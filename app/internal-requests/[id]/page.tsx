// app/internal-requests/[id]/page.tsx
"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useInternalRequest } from "@/hooks/use-internal-request"
import { useAuth } from "@/context/AuthContext"
import useClaimsRole from "@/hooks/use-claims-role"
import { performRequestAction } from "@/lib/internal-requests/firestore"
import type { RequestActionType } from "@/lib/internal-requests/types"
import type { Role } from "@/lib/roles"

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import { toast } from "sonner"

export default function InternalRequestDetailsPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params.id

  const { user } = useAuth()
  const { role } = useClaimsRole()
  const { loading, request } = useInternalRequest(id)

  const [actionComment, setActionComment] = useState("")
  const [forwardTargetRole, setForwardTargetRole] = useState<Role | "">("")
  const [actionLoading, setActionLoading] = useState(false)

  const statusLabel: Record<string, string> = {
    open: "مفتوح",
    in_progress: "قيد الإجراء",
    approved: "معتمد",
    rejected: "مرفوض",
    closed: "مغلق",
    cancelled: "ملغى",
  }

  const mapActionLabel = (actionType: string): string => {
    switch (actionType) {
      case "submitted":
        return "تم تقديم الطلب"
      case "forwarded":
        return "إحالة / توجيه"
      case "approved":
        return "موافقة"
      case "rejected":
        return "رفض"
      case "comment":
        return "تعليق"
      case "closed":
        return "إغلاق الطلب"
      case "generated_pdf":
        return "توليد ملف PDF"
      default:
        return actionType
    }
  }

  if (loading) {
    return (
      <div className="min-h-[40vh] grid place-items-center text-sm text-muted-foreground">
        جارٍ تحميل تفاصيل الطلب…
      </div>
    )
  }

  if (!request) {
    return (
      <div className="min-h-[40vh] grid place-items-center text-sm text-muted-foreground">
        لم يتم العثور على الطلب
        <Button
          className="mt-4"
          variant="outline"
          onClick={() => router.push("/internal-requests")}
        >
          العودة إلى قائمة الطلبات
        </Button>
      </div>
    )
  }

  const isActorCreator = user && request.createdByUid === user.uid
  const isActorCurrentAssignee =
    user &&
    (request.currentAssignee?.uid === user.uid ||
      (role && request.currentAssignee?.role === role))

  const canComment = !!(user && (isActorCreator || isActorCurrentAssignee))
  const canDecide =
    !!user &&
    !!isActorCurrentAssignee &&
    ["open", "in_progress"].includes(request.status)

  const handleAction = async (actionType: RequestActionType) => {
    if (!user) {
      toast.error("يجب تسجيل الدخول لتنفيذ الإجراء")
      return
    }

    // صلاحيات أساسية
    if (
      ["forwarded", "approved", "rejected", "closed"].includes(actionType) &&
      !isActorCurrentAssignee
    ) {
      toast.error("لا تملك صلاحية تنفيذ هذه العملية على الطلب")
      return
    }

    if (actionType === "comment" && !canComment) {
      toast.error("لا يمكنك التعليق على هذا الطلب")
      return
    }

    if (actionType === "forwarded" && !forwardTargetRole) {
      toast.error("اختر الجهة التي سيتم إحالة الطلب إليها")
      return
    }

    try {
      setActionLoading(true)

      await performRequestAction({
        requestId: request.id,
        actionType,
        actorUid: user.uid,
        actorRole: (role as Role | null) ?? null,
        comment: actionComment.trim() || undefined,
        targetRole: actionType === "forwarded"
          ? (forwardTargetRole as Role)
          : null,
        targetUid: null,
      })

      setActionComment("")
      if (actionType === "forwarded") {
        setForwardTargetRole("")
      }

      toast.success("تم تنفيذ الإجراء بنجاح")
    } catch (err) {
      console.error(err)
      toast.error("حدث خطأ أثناء تنفيذ الإجراء")
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">تفاصيل الطلب</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/internal-requests")}
        >
          ← العودة للطلبات
        </Button>
      </div>

      {/* معلومات أساسية عن الطلب */}
      <Card>
        <CardHeader>
          <CardTitle>{request.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <span className="font-medium">نوع الطلب: </span>
            <span>{request.type}</span>
          </div>
          <div>
            <span className="font-medium">الحالة الحالية: </span>
            <span>{statusLabel[request.status] ?? request.status}</span>
          </div>
          <div>
            <span className="font-medium">صاحب الطلب: </span>
            <span>{request.createdByEmail || request.createdByUid}</span>
          </div>
          <div>
            <span className="font-medium">المسؤول الحالي: </span>
            <span>
              {request.currentAssignee?.role || "—"}{" "}
              {request.currentAssignee?.uid
                ? `(${request.currentAssignee.uid})`
                : ""}
            </span>
          </div>
          <div>
            <span className="font-medium">تاريخ الإنشاء: </span>
            <span>
              {request.createdAt
                ? request.createdAt.toLocaleString("ar-SA")
                : "—"}
            </span>
          </div>
          <div>
            <span className="font-medium">آخر تحديث: </span>
            <span>
              {request.updatedAt
                ? request.updatedAt.toLocaleString("ar-SA")
                : "—"}
            </span>
          </div>
          <div>
            <span className="font-medium block mb-1">وصف الطلب:</span>
            <p className="whitespace-pre-wrap text-muted-foreground">
              {request.description || "—"}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 🟢 منطقة الإجراءات على الطلب */}
      <Card>
        <CardHeader>
          <CardTitle>إجراءات على الطلب</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <label className="text-sm font-medium mb-1 block">
              ملاحظة / تعليق (اختياري)
            </label>
            <Textarea
              value={actionComment}
              onChange={(e) => setActionComment(e.target.value)}
              placeholder="اكتب ملخص الإجراء أو الملاحظة..."
              rows={3}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              يتم حفظ هذه الملاحظة مع الإجراء في سجل الطلب.
            </p>
          </div>

          {/* إحالة الطلب */}
          <div className="grid gap-3 md:grid-cols-[1.5fr_auto] md:items-end">
            <div>
              <label className="text-sm font-medium mb-1 block">
                إحالة الطلب إلى (اختياري)
              </label>
              <Select
                value={forwardTargetRole || ""}
                onValueChange={(v) => setForwardTargetRole(v as Role)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر الجهة للإحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ceo">المدير التنفيذي</SelectItem>
                  <SelectItem value="chairman">رئيس المجلس</SelectItem>
                  <SelectItem value="hr">الموارد البشرية</SelectItem>
                  <SelectItem value="finance">الشؤون المالية</SelectItem>
                  <SelectItem value="projects">إدارة المشاريع</SelectItem>
                  <SelectItem value="admin">مشرف إداري</SelectItem>
                  <SelectItem value="employee">موظف / مسؤول آخر</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={actionLoading || !canDecide}
              onClick={() => handleAction("forwarded")}
            >
              إحالة الطلب
            </Button>
          </div>

          {/* موافقة / رفض / إغلاق */}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={actionLoading || !canDecide}
              onClick={() => handleAction("approved")}
            >
              موافقة
            </Button>
            <Button
              variant="destructive"
              disabled={actionLoading || !canDecide}
              onClick={() => handleAction("rejected")}
            >
              رفض
            </Button>
            <Button
              variant="outline"
              disabled={actionLoading || !canDecide}
              onClick={() => handleAction("closed")}
            >
              إغلاق الطلب
            </Button>
            {/* تعليق فقط بدون تغيير حالة */}
            <Button
              variant="outline"
              disabled={actionLoading || !canComment}
              onClick={() => handleAction("comment")}
            >
              إضافة تعليق فقط
            </Button>
          </div>

          {!canDecide && (
            <p className="text-xs text-muted-foreground">
              لا يمكنك الموافقة / الرفض / الإحالة إلا إذا كنت المسؤول الحالي عن
              الطلب والحالة مفتوحة أو قيد الإجراء.
            </p>
          )}
        </CardContent>
      </Card>

      {/* التتبع / سجل الإحالات */}
      <Card>
        <CardHeader>
          <CardTitle>سجل الإحالات والإجراءات</CardTitle>
        </CardHeader>
        <CardContent>
          {request.actions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              لا توجد إجراءات مسجّلة على هذا الطلب بعد.
            </p>
          ) : (
            <div className="space-y-3">
              {request.actions
                .slice()
                .sort((a, b) => {
                  const ta = a.at?.getTime?.() ?? 0
                  const tb = b.at?.getTime?.() ?? 0
                  return ta - tb
                })
                .map((action, idx) => (
                  <div
                    key={idx}
                    className="border rounded-md px-3 py-2 text-sm flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">
                        {mapActionLabel(action.actionType)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {action.at
                          ? action.at.toLocaleString("ar-SA")
                          : "—"}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <span>من: </span>
                      <span>
                        {action.fromRole || "—"}{" "}
                        {action.fromUid ? `(${action.fromUid})` : ""}
                      </span>
                    </div>
                    {action.toRole || action.toUid ? (
                      <div className="text-xs text-muted-foreground">
                        <span>إلى: </span>
                        <span>
                          {action.toRole || "—"}{" "}
                          {action.toUid ? `(${action.toUid})` : ""}
                        </span>
                      </div>
                    ) : null}
                    {action.comment && (
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium">ملاحظة: </span>
                        <span>{action.comment}</span>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
