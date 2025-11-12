"use client"

import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth"
import { auth } from "@/lib/firebase"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import Link from "next/link"

const schema = z.object({
  name: z.string().min(2, "أدخل اسمًا صحيحًا"),
  email: z.string().email(),
  password: z.string().min(6),
})
type FormData = z.infer<typeof schema>

export default function RegisterPage() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<FormData>({ resolver: zodResolver(schema) })
  const router = useRouter()

  const onSubmit = async ({ name, email, password }: FormData) => {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password)
      await updateProfile(cred.user, { displayName: name })
      toast.success("تم إنشاء الحساب")
      router.replace("/dashboard")
    } catch (e: any) {
      toast.error(e?.code?.replace("auth/", "") ?? "فشل التسجيل")
    }
  }

  return (
    <main className="min-h-[70vh] grid place-items-center">
      <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-sm space-y-4 border rounded-lg p-6">
        <h1 className="text-xl font-bold text-center">تسجيل حساب</h1>

        <div className="space-y-1">
          <label className="text-sm">الاسم</label>
          <Input {...register("name")} />
          {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
        </div>

        <div className="space-y-1">
          <label className="text-sm">البريد الإلكتروني</label>
          <Input type="email" dir="ltr" {...register("email")} />
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>

        <div className="space-y-1">
          <label className="text-sm">كلمة المرور</label>
          <Input type="password" dir="ltr" {...register("password")} />
          {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
        </div>

        <Button disabled={isSubmitting} className="w-full">
          {isSubmitting ? "جارٍ الإنشاء..." : "إنشاء حساب"}
        </Button>

        <p className="text-center text-sm">
          لديك حساب؟ <Link className="underline" href="/login">تسجيل الدخول</Link>
        </p>
      </form>
    </main>
  )
}
