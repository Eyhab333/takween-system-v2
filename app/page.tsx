// app/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    console.log("API KEY exists?", !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY);
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.replace("/dashboard");
      } else {
        router.replace("/login");
      }
    });

    return () => unsub();
  }, [router]);

  // UI بسيط أثناء التحويل
  return (
    <main className="min-h-screen grid place-items-center text-sm text-muted-foreground">
      جارٍ التحقق من تسجيل الدخول...
      

    </main>
  );
}
