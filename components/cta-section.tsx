import { Button } from "@/components/ui/button"
import { ArrowLeft, Sparkles } from "lucide-react"

export default function CTASection() {
  return (
    <section className="py-20 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-8 sm:p-16">
          {/* Background decoration */}
          <div className="pointer-events-none absolute top-0 left-0 h-64 w-64 rounded-full bg-primary/10 blur-[100px]" />
          <div className="pointer-events-none absolute bottom-0 right-0 h-48 w-48 rounded-full bg-primary/5 blur-[80px]" />

          <div className="relative mx-auto max-w-2xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm text-primary">
              <Sparkles className="h-4 w-4" />
              <span>14 ימי ניסיון חינם</span>
            </div>

            <h2 className="mb-6 text-3xl font-bold text-foreground sm:text-4xl lg:text-5xl text-balance">
              מוכנים לקבל יתרון תחרותי?
            </h2>

            <p className="mx-auto mb-10 max-w-xl text-lg leading-relaxed text-muted-foreground text-pretty">
              הצטרפו למאות עסקים בישראל שכבר משתמשים ב-Market Radar כדי לזהות הזדמנויות לפני המתחרים.
            </p>

            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button 
                size="lg" 
                className="group w-full bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto"
              >
                התחל ניסיון חינם
                <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" />
              </Button>
              <Button 
                variant="outline" 
                size="lg" 
                className="w-full border-border bg-transparent text-foreground hover:bg-secondary sm:w-auto"
              >
                קבע שיחת הדגמה
              </Button>
            </div>

            <p className="mt-6 text-sm text-muted-foreground">
              ללא צורך בכרטיס אשראי • ביטול בכל עת
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
