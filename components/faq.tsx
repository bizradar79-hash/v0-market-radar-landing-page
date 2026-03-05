"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

const faqs = [
  {
    question: "כמה זמן לוקח עד שמתחילים לקבל תובנות?",
    answer: "לאחר הגדרת החשבון, המערכת מתחילה לסרוק ולנתח מידע מיד. בדרך כלל תתחילו לקבל את ההתראות הראשונות תוך 24-48 שעות. ככל שהמערכת לומדת יותר על העסק שלכם, התובנות הופכות למדויקות יותר.",
  },
  {
    question: "האם אפשר לשלב את המערכת עם כלים אחרים?",
    answer: "בהחלט! אנחנו מציעים אינטגרציות עם מערכות CRM פופולריות כמו Salesforce, HubSpot ו-Monday.com. בנוסף, יש לנו API פתוח שמאפשר לכם לבנות אינטגרציות מותאמות אישית לצרכים שלכם.",
  },
  {
    question: "מה קורה אם אני רוצה לבטל?",
    answer: "אתם יכולים לבטל את המנוי בכל עת, ללא התחייבות. הגישה תישאר פעילה עד סוף תקופת החיוב הנוכחית. אנחנו גם מציעים אפשרות להקפיא את החשבון למשך עד 3 חודשים אם אתם צריכים הפסקה.",
  },
  {
    question: "איך המערכת שומרת על פרטיות המידע שלי?",
    answer: "אבטחת המידע שלכם היא בראש סדר העדיפויות שלנו. כל המידע מוצפן בתקן AES-256, השרתים שלנו ממוקמים בישראל ועומדים בתקני SOC 2 ו-ISO 27001. אנחנו לעולם לא משתפים את המידע שלכם עם צד שלישי.",
  },
  {
    question: "האם יש תמיכה בעברית?",
    answer: "כן! כל הממשק, התמיכה והתיעוד שלנו זמינים בעברית מלאה. צוות התמיכה שלנו זמין בימים א׳-ה׳ בין 9:00-18:00, ולקוחות בתוכנית ארגונית מקבלים תמיכה 24/7.",
  },
]

export default function FAQ() {
  return (
    <section id="faq" className="bg-muted/30 py-20 sm:py-32">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mb-12 text-center">
          <h2 className="mb-4 text-3xl font-bold text-foreground sm:text-4xl text-balance">
            שאלות נפוצות
          </h2>
          <p className="text-lg text-muted-foreground text-pretty">
            לא מצאתם תשובה? צרו איתנו קשר ונשמח לעזור.
          </p>
        </div>

        {/* FAQ Accordion */}
        <Accordion type="single" collapsible className="w-full space-y-4">
          {faqs.map((faq, index) => (
            <AccordionItem
              key={index}
              value={`item-${index}`}
              className="rounded-xl border border-border bg-card px-6"
            >
              <AccordionTrigger className="py-6 text-right text-foreground hover:text-primary hover:no-underline [&>svg]:text-muted-foreground">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="pb-6 text-muted-foreground leading-relaxed">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  )
}
