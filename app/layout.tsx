// app/layout.tsx
import "./globals.css"
import { ThemeProvider } from "@/lib/theme-provider"
import { AuthProvider } from "@/context/AuthContext"
import { Toaster } from "sonner"
export const metadata = {
  title: "App",
  description: "shadcn/ui default theme",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <AuthProvider>
            {children}
            <Toaster richColors position="top-center" />
            </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
