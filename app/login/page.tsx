"use client"

import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  signInWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from "firebase/auth"
import { auth } from "@/lib/firebase"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { Eye, EyeOff } from "lucide-react"
import { useState } from "react"

const schema = z.object({
  email: z.string().email("بريد غير صالح"),
  password: z.string().min(6, "٦ أحرف على الأقل"),
  remember: z.boolean().optional(),
})
type FormData = z.infer<typeof schema>

export default function LoginPage() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<FormData>({ resolver: zodResolver(schema), defaultValues: { remember: true } })
  const router = useRouter()
  const [show, setShow] = useState(false)

  const onSubmit = async ({ email, password, remember }: FormData) => {
    try {
      // التذكّر: لو مؤشَّر → local (يبقى بعد إغلاق المتصفح)، غير كده → session
      await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence)
      await signInWithEmailAndPassword(auth, email, password)
      toast.success("تم تسجيل الدخول")
      router.replace("/dashboard")
    } catch (e: any) {
      const msg = e?.code?.replace("auth/", "") ?? "فشل تسجيل الدخول"
      toast.error(msg)
    }
  }

  return (
    <main className="min-h-[70vh] grid place-items-center">
      <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-sm space-y-4 border rounded-lg p-6">
        <h1 className="text-xl font-bold text-center">تسجيل الدخول</h1>

        <div className="space-y-1">
          <label className="text-sm">البريد الإلكتروني</label>
          <Input type="email" dir="ltr" {...register("email")} />
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>

        <div className="space-y-1">
          <label className="text-sm">كلمة المرور</label>
          <div className="relative">
            <Input
              type={show ? "text" : "password"}
              dir="ltr"
              className="pe-10"
              {...register("password")}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute inset-y-0 end-2 grid place-items-center text-muted-foreground hover:text-foreground"
              aria-label={show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
              tabIndex={-1}
            >
              {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
          {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
        </div>

        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" {...register("remember")} />
          تذكّرني
        </label>

        <Button disabled={isSubmitting} className="w-full">
          {isSubmitting ? "جارٍ الدخول..." : "دخول"}
        </Button>
      </form>
    </main>
  )
}
