import { Button } from "@/components/ui/button"
import { Check } from "lucide-react"

const plans = [
  {
    name: "בסיסי",
    price: "₪299",
    period: "לחודש",
    description: "מתאים לעסקים קטנים שרוצים להתחיל",
    features: [
      "עד 50 התראות בחודש",
      "מעקב אחר 3 מתחרים",
      "דוחות שבועיים",
      "תמיכה באימייל",
      "גישה לדשבורד בסיסי",
    ],
    cta: "התחל ניסיון חינם",
    popular: false,
  },
  {
    name: "עסקי",
    price: "₪699",
    period: "לחודש",
    description: "לעסקים שרוצים יתרון תחרותי אמיתי",
    features: [
      "התראות ללא הגבלה",
      "מעקב אחר 10 מתחרים",
      "גילוי לידים אוטומטי",
      "מודיעין מכרזים",
      "API גישה",
      "תמיכה בוואטסאפ",
      "דוחות מותאמים אישית",
    ],
    cta: "התחל ניסיון חינם",
    popular: true,
  },
  {
    name: "ארגוני",
    price: "₪1,499",
    period: "לחודש",
    description: "לארגונים עם צרכים מתקדמים",
    features: [
      "כל התכונות של עסקי",
      "מעקב ללא הגבלה",
      "אינטגרציה עם CRM",
      "מנהל לקוח ייעודי",
      "דוחות מותאמים אישית",
      "SLA מובטח",
      "הדרכה צוותית",
      "גישה מוקדמת לפיצ׳רים",
    ],
    cta: "צור קשר",
    popular: false,
  },
]

export default function Pricing() {
  return (
    <section id="pricing" className="py-20 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <h2 className="mb-4 text-3xl font-bold text-foreground sm:text-4xl text-balance">
            מחירים שקופים, בלי הפתעות
          </h2>
          <p className="text-lg text-muted-foreground text-pretty">
            בחר את התוכנית המתאימה לעסק שלך. כל התוכניות כוללות 14 ימי ניסיון חינם.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid gap-8 lg:grid-cols-3">
          {plans.map((plan, index) => (
            <div
              key={index}
              className={`relative rounded-2xl border p-8 ${
                plan.popular
                  ? "border-primary bg-card shadow-lg shadow-primary/10"
                  : "border-border bg-card"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 right-8 rounded-full bg-primary px-4 py-1 text-sm font-medium text-primary-foreground">
                  הכי פופולרי
                </div>
              )}

              <div className="mb-6">
                <h3 className="mb-2 text-xl font-semibold text-foreground">
                  {plan.name}
                </h3>
                <p className="text-sm text-muted-foreground">{plan.description}</p>
              </div>

              <div className="mb-6">
                <span className="text-4xl font-bold text-foreground">{plan.price}</span>
                <span className="text-muted-foreground">/{plan.period}</span>
              </div>

              <ul className="mb-8 space-y-3">
                {plan.features.map((feature, featureIndex) => (
                  <li key={featureIndex} className="flex items-center gap-3">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10">
                      <Check className="h-3 w-3 text-primary" />
                    </div>
                    <span className="text-sm text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                className={`w-full ${
                  plan.popular
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                {plan.cta}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
