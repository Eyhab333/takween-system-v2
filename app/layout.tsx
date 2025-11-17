// app/layout.tsx
import "./globals.css";
import { ThemeProvider } from "@/lib/theme-provider";
import { AuthProvider } from "@/context/AuthContext";
import { Toaster } from "sonner";
export const metadata = {
  title: "App",
  description: "Takween System Application",
};
import { Tajawal } from "next/font/google";
const tajawal = Tajawal({
  subsets: ["arabic"],
  weight: ["400", "500", "700"], // اختار الأوزان اللي تحتاجها
  variable: "--font-tajawal",
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className={tajawal.className}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <AuthProvider>
            {children}
            <Toaster richColors position="top-center" />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
