import Link from 'next/link'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'הצהרת נגישות — North Star Radar',
  description: 'הצהרת נגישות של אתר North Star Radar בהתאם לתקן WCAG 2.1 ברמת AA.',
}

export default function AccessibilityPage() {
  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Link href="/" className="text-sm text-primary hover:underline">← חזרה לדף הבית</Link>
        </div>

        <h1 className="text-3xl font-bold text-foreground mb-2">הצהרת נגישות</h1>
        <p className="text-muted-foreground text-sm mb-10">עודכן לאחרונה: אפריל 2026</p>

        <div className="space-y-8 text-sm leading-relaxed text-foreground">

          <section>
            <h2 className="text-xl font-semibold mb-3">מחויבותנו לנגישות</h2>
            <p>
              North Star Radar מחויבת לספק חוויה נגישה לכלל המשתמשים, לרבות אנשים עם מוגבלויות.
              אנו שואפים לעמוד בתקני הנגישות הבינלאומיים ובדרישות חוק שוויון זכויות לאנשים עם
              מוגבלות (תשנ"ח-1998) ותקנות הנגישות לשירות (התאמות נגישות לשירות), תשע"ג-2013.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">רמת התאימות</h2>
            <p>
              האתר מיועד לעמוד ברמת התאימות <strong>AA</strong> של הנחיות הנגישות לתכני אינטרנט
              (WCAG 2.1). הנחיות אלה מגדירות כיצד להנגיש תכני אינטרנט לאנשים עם מוגבלויות שונות,
              לרבות עיוורון, לקות ראייה, לקות שמיעה, מוגבלות קוגניטיבית ומוגבלות מוטורית.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">מה עשינו לשיפור הנגישות</h2>
            <ul className="list-disc list-inside space-y-2 pr-4">
              <li>האתר תומך בניווט מלא באמצעות מקלדת</li>
              <li>תמיכה בקוראי מסך (Screen Readers)</li>
              <li>שימוש בתגיות HTML סמנטיות לשיפור הבנת המבנה</li>
              <li>ניגודיות צבעים העומדת בדרישות WCAG AA</li>
              <li>טקסטים חלופיים (alt text) לכל התמונות</li>
              <li>האתר מוצג בכיוון RTL מלא לשפה העברית</li>
              <li>פונט Heebo ייעודי לעברית לקריאות מיטבית</li>
              <li>תמיכה בהגדלת טקסט עד 200% ללא אובדן תוכן</li>
              <li>ווידג'ט נגישות המאפשר התאמות אישיות (ניגודיות, גודל טקסט, סמן מוגדל ועוד)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">מגבלות ידועות</h2>
            <p>
              אנו עובדים באופן מתמיד לשיפור הנגישות. ייתכן שחלק מהתכנים שהופקו על-ידי בינה מלאכותית
              אינם עומדים במלוא דרישות הנגישות. אנו מתחייבים לבחון ממצאים אלה ולפעול לתיקונם.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">פנייה בנושא נגישות</h2>
            <p className="mb-3">
              נתקלתם בבעיית נגישות באתר? אנו מזמינים אתכם לפנות אלינו ואנו נשתדל לטפל בפנייה
              בהקדם האפשרי:
            </p>
            <ul className="space-y-2">
              <li>
                <span className="font-medium">דוא"ל: </span>
                <a href="mailto:support@nsradar.co.il" className="text-primary hover:underline">
                  support@nsradar.co.il
                </a>
              </li>
              <li>
                <span className="font-medium">נושא: </span>פנייה בנושא נגישות
              </li>
            </ul>
            <p className="mt-3 text-muted-foreground text-xs">
              אנו מתחייבים לטפל בפניות נגישות תוך 5 ימי עסקים.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">תאריך סקירה אחרון</h2>
            <p>הצהרת נגישות זו עודכנה לאחרונה באפריל 2026.</p>
          </section>

        </div>
      </div>
    </div>
  )
}
