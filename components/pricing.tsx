import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Check } from "lucide-react"

const plans = [
  {
    name: "סטארטר",
    price: "חינם",
    period: "",
    description: "לעסקים שרוצים להתחיל",
    features: [
      "עד 3 מתחרים",
      "10 לידים בחודש",
      "סריקת מכרזים בסיסית",
      "דוח שבועי",
    ],
    cta: "התחל בחינם",
    ctaVariant: "outline" as const,
    popular: false,
  },
  {
    name: "מקצועי",
    price: "299",
    period: "/חודש",
    description: "לעסקים שרוצים לגדול",
    features: [
      "עד 15 מתחרים",
      "לידים ללא הגבלה",
      "סריקת מכרזים מתקדמת",
      "ניטור חדשות",
      "התראות בזמן אמת",
      "דוחות PDF",
      "ניתוח AI מתקדם",
    ],
    cta: "התחל ניסיון",
    ctaVariant: "default" as const,
    popular: true,
  },
  {
    name: "ארגוני",
    price: "799",
    period: "/חודש",
    description: "לארגונים גדולים",
    features: [
      "מתחרים ללא הגבלה",
      "לידים ללא הגבלה",
      "סריקה מותאמת אישית",
      "API גישה",
      "מנהל חשבון ייעודי",
      "SLA מובטח",
      "דוחות מותאמים",
    ],
    cta: "צור קשר",
    ctaVariant: "outline" as const,
    popular: false,
  },
]

export default function Pricing() {
  return (
    <section id="pricing" className="bg-[#f1f5f9] py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <h2 className="mb-4 text-3xl font-bold text-[#1e3a5f] sm:text-4xl text-balance">
            תמחור פשוט ושקוף
          </h2>
          <p className="text-lg text-gray-600 text-pretty">
            בחרו את התוכנית המתאימה לעסק שלכם
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid gap-8 lg:grid-cols-3">
          {plans.map((plan, index) => (
            <div
              key={index}
              className={`relative rounded-2xl bg-white p-8 shadow-sm ${
                plan.popular ? "ring-2 ring-primary" : ""
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 right-1/2 translate-x-1/2 rounded-full bg-[#e85a7e] px-4 py-1.5 text-sm font-medium text-white">
                  הכי פופולרי
                </div>
              )}

              <div className="mb-6 text-center">
                <h3 className="mb-2 text-2xl font-bold text-[#1e3a5f]">
                  {plan.name}
                </h3>
                <p className="text-sm text-gray-500">{plan.description}</p>
              </div>

              <div className="mb-6 text-center">
                {plan.price === "חינם" ? (
                  <span className="text-4xl font-bold text-[#1e3a5f]">{plan.price}</span>
                ) : (
                  <>
                    <span className="text-4xl font-bold text-[#1e3a5f]">₪{plan.price}</span>
                    <span className="text-gray-500">{plan.period}</span>
                  </>
                )}
              </div>

              <ul className="mb-8 space-y-3">
                {plan.features.map((feature, featureIndex) => (
                  <li key={featureIndex} className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-primary flex-shrink-0" />
                    <span className="text-sm text-gray-600">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                className={`w-full rounded-lg py-5 ${
                  plan.ctaVariant === "default"
                    ? "bg-primary text-[#0a1929] font-semibold hover:bg-primary/90"
                    : "border-2 border-gray-300 bg-white text-[#1e3a5f] hover:bg-gray-50"
                }`}
                variant={plan.ctaVariant}
                asChild
              >
                <Link href="/signup">{plan.cta}</Link>
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
