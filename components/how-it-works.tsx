import { Settings, Cpu, Zap } from "lucide-react"

const steps = [
  {
    number: "01",
    icon: Settings,
    title: "הגדר את העסק שלך",
    description: "ספר לנו על התחום שלך, המתחרים והמטרות העסקיות. ההגדרה לוקחת פחות מ-5 דקות.",
  },
  {
    number: "02",
    icon: Cpu,
    title: "ה-AI סורק את השוק",
    description: "המערכת סורקת אלפי מקורות מידע, מזהה דפוסים ומנתחת מגמות רלוונטיות לעסק שלך.",
  },
  {
    number: "03",
    icon: Zap,
    title: "קבל תובנות בזמן אמת",
    description: "התראות מיידיות על הזדמנויות, לידים חדשים ושינויים אצל המתחרים - ישירות לאימייל שלך.",
  },
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <h2 className="mb-4 text-3xl font-bold text-foreground sm:text-4xl text-balance">
            איך זה עובד?
          </h2>
          <p className="text-lg text-muted-foreground text-pretty">
            שלושה צעדים פשוטים להתחיל לקבל מודיעין עסקי אוטומטי
          </p>
        </div>

        {/* Steps */}
        <div className="relative">
          {/* Connection line */}
          <div className="absolute top-24 right-0 left-0 hidden h-px bg-gradient-to-l from-transparent via-border to-transparent lg:block" />
          
          <div className="grid gap-8 lg:grid-cols-3">
            {steps.map((step, index) => (
              <div
                key={index}
                className="group relative rounded-2xl border border-border bg-card p-8 transition-all hover:border-primary/50 hover:bg-card/80"
              >
                {/* Step number */}
                <div className="mb-6 flex items-center gap-4">
                  <span className="text-4xl font-bold text-primary/30">{step.number}</span>
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/20">
                    <step.icon className="h-7 w-7 text-primary" />
                  </div>
                </div>

                <h3 className="mb-3 text-xl font-semibold text-foreground">
                  {step.title}
                </h3>
                <p className="leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
