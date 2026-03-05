"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

const faqs = [
  {
    question: "אילו מקורות נתונים המערכת סורקת?",
    answer: "המערכת סורקת מגוון רחב של מקורות ישראליים כולל אתרי חדשות, פורטלים עסקיים, מאגרי מכרזים, רשתות חברתיות, ומקורות ממשלתיים. אנו מעדכנים ומרחיבים את המקורות באופן שוטף.",
  },
  {
    question: "האם הנתונים מעודכנים בזמן אמת?",
    answer: "כן, המערכת סורקת ומעדכנת נתונים באופן רציף לאורך כל היום. התראות על הזדמנויות חדשות, לידים ושינויים אצל מתחרים נשלחות בזמן אמת.",
  },
  {
    question: "האם ניתן לבטל בכל זמן?",
    answer: "בהחלט. אין התחייבות לטווח ארוך וניתן לבטל את המנוי בכל עת. הגישה תישאר פעילה עד סוף תקופת החיוב הנוכחית.",
  },
]

export default function FAQ() {
  return (
    <section id="faq" className="bg-[#f1f5f9] py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mb-12 text-center">
          <h2 className="mb-4 text-3xl font-bold text-[#1e3a5f] sm:text-4xl text-balance">
            שאלות נפוצות
          </h2>
        </div>

        {/* FAQ Accordion */}
        <Accordion type="single" collapsible className="w-full space-y-4">
          {faqs.map((faq, index) => (
            <AccordionItem
              key={index}
              value={`item-${index}`}
              className="rounded-xl border-0 bg-white px-6 shadow-sm"
            >
              <AccordionTrigger className="py-5 text-right text-[#1e3a5f] font-medium hover:text-primary hover:no-underline [&>svg]:text-gray-400">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="pb-5 text-gray-600 leading-relaxed">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  )
}
