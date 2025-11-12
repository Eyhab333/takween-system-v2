// app/page.tsx
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>shadcn/ui — الألوان الافتراضية</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <Badge>Badge</Badge>
          <div className="flex flex-wrap gap-3 justify-center">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
          </div>
        </CardContent>
        <CardFooter className="justify-center">
          <Button>CTA</Button>
        </CardFooter>
      </Card>
    </main>
  )
}
