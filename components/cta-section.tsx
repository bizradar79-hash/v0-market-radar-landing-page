import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"

export default function CTASection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-r from-[#1e3a5f] via-[#2d5a7b] to-[#3d9d94] py-20 sm:py-28">
      <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="mb-6 text-3xl font-bold text-primary sm:text-4xl lg:text-5xl text-balance">
          מוכנים לגלות הזדמנויות חדשות?
        </h2>

        <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-gray-300 text-pretty">
          הצטרפו לעסקים שכבר משתמשים במודיעין עסקי אוטומטי
        </p>

        <Button 
          size="lg" 
          className="group bg-primary text-[#0a1929] font-semibold hover:bg-primary/90 px-10 py-6 text-base rounded-lg"
          asChild
        >
          <Link href="/signup">
            התחל ניסיון חינם
            <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" />
          </Link>
        </Button>
      </div>
    </section>
  )
}
