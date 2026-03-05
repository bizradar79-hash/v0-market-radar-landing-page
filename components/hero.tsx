import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Sparkles, Users, TrendingUp } from "lucide-react"

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-[#0a1929] to-[#0d2137] pt-28 pb-20 sm:pt-36 sm:pb-28">
      {/* Background gradient effects */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-20 right-1/4 h-[400px] w-[400px] rounded-full bg-primary/8 blur-[100px]" />
        <div className="absolute bottom-20 left-1/4 h-[300px] w-[300px] rounded-full bg-primary/5 blur-[80px]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          {/* Badge */}
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-5 py-2.5 text-sm text-primary">
            <Sparkles className="h-4 w-4" />
            <span>מופעל על ידי בינה מלאכותית</span>
          </div>

          {/* Headline */}
          <h1 className="mb-6 text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl text-balance">
            מודיעין עסקי אוטומטי
            <br />
            <span className="text-primary">לעסקים בישראל</span>
          </h1>

          {/* Subtext */}
          <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-gray-400 sm:text-xl text-pretty">
            מערכת AI שמזהה הזדמנויות עסקיות, לידים ומתחרים בזמן אמת. קבלו תובנות פעולה מבוססות נתונים ישראליים.
          </p>

          {/* CTAs */}
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button 
              size="lg" 
              className="group w-full bg-primary text-[#0a1929] font-semibold hover:bg-primary/90 sm:w-auto px-8 py-6 text-base rounded-lg"
              asChild
            >
              <Link href="/signup">
                התחל ניסיון
                <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" />
              </Link>
            </Button>
            <Button 
              variant="outline" 
              size="lg" 
              className="w-full border-gray-600 bg-white text-[#0a1929] hover:bg-gray-100 sm:w-auto px-8 py-6 text-base rounded-lg"
              asChild
            >
              <Link href="/login">התחבר</Link>
            </Button>
          </div>

          {/* Social Proof Stats */}
          <div className="mt-20 flex flex-col items-center justify-center gap-12 sm:flex-row sm:gap-20">
            <div className="text-center">
              <div className="mb-2 flex justify-center">
                <TrendingUp className="h-6 w-6 text-primary" />
              </div>
              <p className="text-3xl font-bold text-white">+500</p>
              <p className="text-sm text-gray-400">הזדמנויות שזוהו</p>
            </div>
            <div className="text-center">
              <div className="mb-2 flex justify-center">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <p className="text-3xl font-bold text-white">+1,200</p>
              <p className="text-sm text-gray-400">לידים חדשים</p>
            </div>
            <div className="text-center">
              <div className="mb-2 flex justify-center">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <p className="text-3xl font-bold text-white">98%</p>
              <p className="text-sm text-gray-400">דיוק AI</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
