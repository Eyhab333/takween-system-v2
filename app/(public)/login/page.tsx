/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Image from "next/image";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  signInWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

const schema = z.object({
  email: z.string().email("بريد غير صالح"),
  password: z.string().min(6, "٦ أحرف على الأقل"),
  remember: z.boolean().optional(),
});
type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { remember: true },
  });

  const router = useRouter();
  const [show, setShow] = useState(false);

  const onSubmit = async ({ email, password, remember }: FormData) => {
    try {
      await setPersistence(
        auth,
        remember ? browserLocalPersistence : browserSessionPersistence
      );
      await signInWithEmailAndPassword(auth, email, password);

      // 👇 بعد النجاح: اقرأ الـ claims وحدّد الوجهة حسب الدور
      const token = await auth.currentUser!.getIdTokenResult(true);
      const role = token.claims?.role as string | undefined;
      const uid = auth.currentUser!.uid;

      const isHrOrAbove = ["hr", "chairman", "ceo", "admin", "superadmin"].includes(
        role || ""
      );

      if (isHrOrAbove) {
        router.replace("/dashboard");
      } else {
        router.replace(`/employees/${uid}`); // 👈 الموظف العادي → بروفايله
      }
    } catch (e: any) {
      console.error("Login error:", e);
      const code = String(e?.code || "").replace("auth/", "");
      const map: Record<string, string> = {
        "invalid-credential": "بيانات الدخول غير صحيحة",
        "user-not-found": "المستخدم غير موجود",
        "wrong-password": "كلمة المرور غير صحيحة",
        "too-many-requests": "محاولات كثيرة، جرّب لاحقًا",
        "network-request-failed": "مشكلة شبكة",
      };
      toast.error(`${map[code] || "فشل تسجيل الدخول"} (${code || "unknown"})`);
    }
  };

  return (
    <main className="min-h-[70vh] grid place-items-center">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-sm space-y-4 border rounded-lg p-6"
      >
        {/* Logo */}
        <div className="flex justify-center">
          <Image
            src="/logo.png"
            alt="Takween"
            width={180}
            height={90}
            priority
            className="h-15 w-auto object-contain"
          />
        </div>

        <h1 className="text-xl font-bold text-center">تسجيل الدخول</h1>

        <div className="space-y-1">
          <label className="text-sm">البريد الإلكتروني</label>
          <Input type="email" dir="ltr" {...register("email")} />
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-sm">كلمة المرور</label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute inset-y-0 start-2 grid place-items-center text-muted-foreground hover:text-foreground"
              aria-label={show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
              tabIndex={-1}
            >
              {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>

            <Input
              type={show ? "text" : "password"}
              dir="ltr"
              className="pe-10"
              {...register("password")}
            />
          </div>

          {errors.password && (
            <p className="text-sm text-destructive">
              {errors.password.message}
            </p>
          )}
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
  );
}
