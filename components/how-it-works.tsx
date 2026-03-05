const steps = [
  {
    number: "01",
    title: "הגדירו את העסק",
    description: "הזינו פרטי חברה, תעשייה, מתחרים ומילות מפתח.",
  },
  {
    number: "02",
    title: "AI סורק את השוק",
    description: "המערכת סורקת מקורות ישראליים ומנתחת נתונים בזמן אמת.",
  },
  {
    number: "03",
    title: "קבלו תובנות",
    description: "הזדמנויות, לידים, מכרזים והמלצות ישירות לדשבורד שלכם.",
  },
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-[#f1f5f9] py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-[#1e3a5f] sm:text-4xl text-balance">
            איך זה עובד?
          </h2>
        </div>

        {/* Steps */}
        <div className="grid gap-8 md:grid-cols-3">
          {steps.map((step, index) => (
            <div
              key={index}
              className="text-center"
            >
              {/* Step number */}
              <div className="mb-4">
                <span className="text-5xl font-bold text-primary/40">{step.number}</span>
              </div>

              <h3 className="mb-3 text-xl font-bold text-[#1e3a5f]">
                {step.title}
              </h3>
              <p className="text-gray-600 leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
