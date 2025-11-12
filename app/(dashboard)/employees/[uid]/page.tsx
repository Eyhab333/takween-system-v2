"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { auth, db } from "@/lib/firebase"
import {
  doc, getDoc, collection, getDocs,
  addDoc, deleteDoc, serverTimestamp, query, orderBy
} from "firebase/firestore"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"

// (اختياري) Tabs/Table/Dialog لو مضافة عندك
// import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
// import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

type UserDoc = {
  uid: string
  nationalId?: string
  name: string
  email: string
  department?: string
  position?: string
  role?: "employee" | "hr" | "admin" | "superadmin"
  personalInfo?: { phone?: string; nationalId?: string }
}

type Certificate = { id: string; title: string; fileUrl?: string; date?: any }
type Evaluation = { id: string; year: number; score?: number; notes?: string }

export default function EmployeeProfilePage() {
  const { uid } = useParams<{ uid: string }>()
  const router = useRouter()

  const [employee, setEmployee] = useState<UserDoc | null>(null)
  const [certs, setCerts] = useState<Certificate[]>([])
  const [evals, setEvals] = useState<Evaluation[]>([])
  const [loading, setLoading] = useState(true)

  // صلاحيات التحرير تعتمد على دور "المستخدم الحالي"
  const [meRole, setMeRole] = useState<UserDoc["role"] | undefined>()
  const canEdit = useMemo(
    () => meRole === "admin" || meRole === "superadmin" || meRole === "hr",
    [meRole]
  )

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        // وثيقة الموظف المعروض
        const userSnap = await getDoc(doc(db, "users", uid))
        if (!userSnap.exists()) {
          toast.error("الموظف غير موجود")
          router.replace("/employees")
          return
        }
        const userData = { uid, ...(userSnap.data() as any) } as UserDoc
        if (!cancelled) setEmployee(userData)

        // الدور الخاص بي أنا (المستخدم الحالي)
        const curUid = auth.currentUser?.uid
        if (curUid) {
          const meSnap = await getDoc(doc(db, "users", curUid))
          if (meSnap.exists()) {
            const role = (meSnap.data() as any).role as UserDoc["role"]
            if (!cancelled) setMeRole(role)
          }
        }

        // الشهادات
        const certQ = query(collection(db, "users", uid, "certificates"), orderBy("date", "desc"))
        const certSnaps = await getDocs(certQ)
        if (!cancelled) {
          setCerts(
            certSnaps.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Certificate[]
          )
        }

        // التقييمات
        const evalQ = query(collection(db, "users", uid, "evaluations"), orderBy("year", "desc"))
        const evalSnaps = await getDocs(evalQ)
        if (!cancelled) {
          setEvals(
            evalSnaps.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Evaluation[]
          )
        }
      } catch (e) {
        console.error(e)
        toast.error("تعذر تحميل البيانات")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [uid, router])

  // ——— إضافة شهادة ———
  async function addCertificate(form: FormData) {
    const title = (form.get("title") as string)?.trim()
    const fileUrl = (form.get("fileUrl") as string)?.trim()
    const date = form.get("date") as string
    if (!title) return toast.error("العنوان مطلوب")

    try {
      const ref = await addDoc(collection(db, "users", uid, "certificates"), {
        title,
        fileUrl: fileUrl || null,
        date: date ? new Date(date) : serverTimestamp(),
        createdAt: serverTimestamp(),
      })
      setCerts((prev) => [{ id: ref.id, title, fileUrl, date }, ...prev])
      (document.getElementById("cert-form") as HTMLFormElement)?.reset()
      toast.success("تمت إضافة الشهادة")
    } catch (e) {
      console.error(e)
      toast.error("تعذر إضافة الشهادة")
    }
  }

  // ——— حذف شهادة ———
  async function removeCertificate(id: string) {
    try {
      await deleteDoc(doc(db, "users", uid, "certificates", id))
      setCerts((prev) => prev.filter((c) => c.id !== id))
      toast.success("تم حذف الشهادة")
    } catch (e) {
      console.error(e)
      toast.error("تعذر حذف الشهادة")
    }
  }

  // ——— إضافة تقييم ———
  async function addEvaluation(form: FormData) {
    const year = Number(form.get("year"))
    const score = Number(form.get("score"))
    const notes = (form.get("notes") as string)?.trim()
    if (!year) return toast.error("أدخل سنة صحيحة")

    try {
      const ref = await addDoc(collection(db, "users", uid, "evaluations"), {
        year,
        score: isFinite(score) ? score : null,
        notes: notes || null,
        createdAt: serverTimestamp(),
      })
      setEvals((prev) => [{ id: ref.id, year, score, notes }, ...prev])
      (document.getElementById("eval-form") as HTMLFormElement)?.reset()
      toast.success("تمت إضافة التقييم")
    } catch (e) {
      console.error(e)
      toast.error("تعذر إضافة التقييم")
    }
  }

  // ——— حذف تقييم ———
  async function removeEvaluation(id: string) {
    try {
      await deleteDoc(doc(db, "users", uid, "evaluations", id))
      setEvals((prev) => prev.filter((c) => c.id !== id))
      toast.success("تم حذف التقييم")
    } catch (e) {
      console.error(e)
      toast.error("تعذر حذف التقييم")
    }
  }

  if (loading) {
    return (
      <div className="grid gap-6">
        <Card><CardHeader><CardTitle>تحميل البيانات…</CardTitle></CardHeader></Card>
      </div>
    )
  }

  if (!employee) return null

  return (
    <div className="grid gap-6">
      {/* — معلومات أساسية — */}
      <Card>
        <CardHeader>
          <CardTitle>ملف الموظف</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Info label="الاسم" value={employee.name} />
            <Info label="القسم" value={employee.department || "—"} />
            <Info label="المسمى" value={employee.position || "—"} />
            <Info label="الدور" value={employee.role || "employee"} />
            <Info label="البريد" value={employee.email} mono />
            <Info label="رقم الهوية" value={employee.personalInfo?.nationalId || "—"} mono />
            <Info label="الجوال" value={employee.personalInfo?.phone || "—"} mono />
            <Info label="UID" value={employee.uid} mono />
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* — الشهادات — */}
      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">الشهادات</h2>
          {canEdit && (
            <form
              id="cert-form"
              className="flex flex-wrap items-end gap-2"
              action={(formData) => addCertificate(formData)}
            >
              <div>
                <Label className="text-xs">العنوان</Label>
                <Input name="title" placeholder="عنوان الشهادة" />
              </div>
              <div>
                <Label className="text-xs">رابط الملف (اختياري)</Label>
                <Input name="fileUrl" dir="ltr" placeholder="https://..." />
              </div>
              <div>
                <Label className="text-xs">التاريخ</Label>
                <Input name="date" type="date" />
              </div>
              <Button type="submit">إضافة</Button>
            </form>
          )}
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {certs.length === 0 && <div className="p-4 text-sm text-muted-foreground">لا توجد شهادات</div>}
              {certs.map((c) => (
                <div key={c.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{c.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {fmtDate(c.date)} {c.fileUrl ? "•" : ""}{" "}
                      {c.fileUrl ? <a className="underline" href={c.fileUrl} target="_blank">فتح الملف</a> : null}
                    </div>
                  </div>
                  {canEdit && (
                    <Button variant="outline" size="sm" onClick={() => removeCertificate(c.id)}>
                      حذف
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* — التقييمات — */}
      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">التقييمات</h2>
          {canEdit && (
            <form
              id="eval-form"
              className="flex flex-wrap items-end gap-2"
              action={(formData) => addEvaluation(formData)}
            >
              <div>
                <Label className="text-xs">السنة</Label>
                <Input name="year" type="number" placeholder="2025" />
              </div>
              <div>
                <Label className="text-xs">الدرجة (اختياري)</Label>
                <Input name="score" type="number" step="0.1" placeholder="90" />
              </div>
              <div>
                <Label className="text-xs">ملاحظات (اختياري)</Label>
                <Input name="notes" placeholder="..." />
              </div>
              <Button type="submit">إضافة</Button>
            </form>
          )}
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {evals.length === 0 && <div className="p-4 text-sm text-muted-foreground">لا توجد تقييمات</div>}
              {evals.map((e) => (
                <div key={e.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">سنة {e.year}</div>
                    <div className="text-xs text-muted-foreground">
                      {typeof e.score === "number" ? `الدرجة: ${e.score}` : "—"} {e.notes ? `• ${e.notes}` : ""}
                    </div>
                  </div>
                  {canEdit && (
                    <Button variant="outline" size="sm" onClick={() => removeEvaluation(e.id)}>
                      حذف
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Info({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`truncate ${mono ? "font-mono text-sm" : "font-medium"}`}>{value || "—"}</div>
    </div>
  )
}

function fmtDate(d: any) {
  try {
    if (!d) return "—"
    // Firestore Timestamp or Date string
    const date = typeof d?.toDate === "function" ? d.toDate() : new Date(d)
    if (isNaN(date as any)) return "—"
    return date.toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "2-digit" })
  } catch {
    return "—"
  }
}
