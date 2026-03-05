import { 
  Target, 
  UserPlus, 
  Eye, 
  FileText, 
  TrendingUp, 
  Newspaper, 
  FileBarChart, 
  Bell 
} from "lucide-react"

const features = [
  {
    icon: Target,
    title: "הזדמנויות עסקיות",
    description: "זיהוי אוטומטי של הזדמנויות עסקיות חדשות בשוק הישראלי בזמן אמת.",
  },
  {
    icon: UserPlus,
    title: "גילוי לידים",
    description: "איתור לקוחות פוטנציאליים על בסיס התנהגות ואינדיקטורים דיגיטליים.",
  },
  {
    icon: Eye,
    title: "מודיעין מתחרים",
    description: "מעקב אחר פעילות המתחרים, שינויי מחירים והשקות מוצרים חדשים.",
  },
  {
    icon: FileText,
    title: "מכרזים",
    description: "התראות על מכרזים ממשלתיים ופרטיים רלוונטיים לתחום העיסוק שלך.",
  },
  {
    icon: TrendingUp,
    title: "טרנדים",
    description: "ניתוח מגמות שוק ותחזיות לזיהוי הזדמנויות עתידיות.",
  },
  {
    icon: Newspaper,
    title: "חדשות",
    description: "ריכוז חדשות ועדכונים רלוונטיים מכל המקורות במקום אחד.",
  },
  {
    icon: FileBarChart,
    title: "דוחות שבועיים",
    description: "דוחות אוטומטיים עם תובנות ומגמות מותאמות לעסק שלך.",
  },
  {
    icon: Bell,
    title: "התראות",
    description: "התראות מיידיות באימייל או בוואטסאפ על אירועים חשובים.",
  },
]

export default function Features() {
  return (
    <section id="features" className="bg-muted/30 py-20 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <h2 className="mb-4 text-3xl font-bold text-foreground sm:text-4xl text-balance">
            כל מה שצריך במקום אחד
          </h2>
          <p className="text-lg text-muted-foreground text-pretty">
            כלי מודיעין מתקדמים שעובדים 24/7 כדי למצוא עבורך את ההזדמנויות הבאות
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature, index) => (
            <div
              key={index}
              className="group rounded-xl border border-border bg-card p-6 transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/20">
                <feature.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="mb-2 font-semibold text-foreground">
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
