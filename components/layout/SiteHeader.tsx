// components/layout/SiteHeader.tsx
"use client"

import dynamic from "next/dynamic"
//import ThemeToggle from "./ThemeToggle"
import { SidebarMobile } from "./Sidebar"
import { Separator } from "@/components/ui/separator"
import Image from "next/image"; import Link from "next/link";
import { useAuth } from "@/context/AuthContext"
import { Button } from "@/components/ui/button"

const ThemeToggle = dynamic(() => import("./ThemeToggle"), { ssr: false })


export default function SiteHeader() {
    const { user, logout } = useAuth()
    return (
        <header className="sticky top-0 z-30 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container flex items-center justify-between h-14">
                <div className="flex items-center gap-2">
                    <SidebarMobile />
                    <Link href="/" className="flex items-center">
                        <Image src="/logo.png" alt="شركة تكوين المعرفة للتعليم" width={140} height={38} priority />
                    </Link>
                </div>
                <div className="flex items-center gap-2">
                    <ThemeToggle />
                    {user ? (
                        <Button variant="outline" onClick={logout}>خروج</Button>
                    ) : null}
                </div>
            </div>
            <Separator />
        </header>
    )
}
