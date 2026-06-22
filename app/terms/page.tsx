import Link from 'next/link'
import Image from 'next/image'

export const metadata = {
  title: 'תנאי שימוש | North Star Radar',
  alternates: { canonical: '/terms' },
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="mx-auto max-w-4xl px-4 py-4">
          <Link href="/">
            <Image src="/whitelogo.png" alt="North Star Radar" width={160} height={44} className="h-10 w-auto object-contain" unoptimized />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-12">
        <h1 className="text-3xl font-bold text-foreground mb-2">תנאי שימוש</h1>
        <p className="text-sm text-muted-foreground mb-10">עדכון אחרון: אפריל 2026</p>

        <div className="prose prose-invert max-w-none space-y-8 text-foreground">

          <section>
            <h2 className="text-xl font-semibold mb-3">1. קבלת התנאים</h2>
            <p className="text-muted-foreground leading-relaxed">
              בשימוש בשירות North Star Radar (להלן: &quot;השירות&quot;) המופעל על ידי North Star Radar Ltd (להלן: &quot;החברה&quot;), אתה מסכים לתנאי שימוש אלה. אם אינך מסכים לתנאים, אנא הפסק את השימוש בשירות.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. תיאור השירות</h2>
            <p className="text-muted-foreground leading-relaxed">
              North Star Radar הוא כלי מודיעין עסקי המבוסס על בינה מלאכותית, המסייע לעסקים קטנים ובינוניים לעקוב אחר מתחרים, טרנדים בשוק, הזדמנויות עסקיות, חדשות רלוונטיות ועוד. השירות מתבסס על מידע ציבורי הזמין ברשת ועל ניתוח בינה מלאכותית.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. רישום וחשבון משתמש</h2>
            <ul className="text-muted-foreground leading-relaxed space-y-2 list-disc pr-5">
              <li>עליך לספק פרטים מדויקים ועדכניים בעת ההרשמה.</li>
              <li>אתה אחראי לשמירת סודיות הסיסמה שלך.</li>
              <li>אין להעביר את החשבון לצד שלישי כלשהו.</li>
              <li>יש להודיע לנו מיד על כל שימוש בלתי מורשה בחשבונך.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. מנויים ותשלומים</h2>
            <p className="text-muted-foreground leading-relaxed">
              השירות מוצע בתקופת ניסיון חינם של 7 ימים. לאחריה, המשך השימוש מחייב רכישת מנוי בתשלום. עלויות המנוי מפורטות בדף התמחור. התשלומים מבוצעים מראש ואינם ניתנים להחזר, אלא במקרים המצוינים במדיניות הביטולים.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. שימוש מותר</h2>
            <p className="text-muted-foreground leading-relaxed mb-2">מותר לך:</p>
            <ul className="text-muted-foreground leading-relaxed space-y-2 list-disc pr-5">
              <li>להשתמש בשירות לצרכים עסקיים חוקיים.</li>
              <li>לייצא ולשמור מידע שנוצר על ידי השירות לשימושך הפנימי.</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-3 mb-2">אסור לך:</p>
            <ul className="text-muted-foreground leading-relaxed space-y-2 list-disc pr-5">
              <li>להשתמש בשירות לכל מטרה בלתי חוקית.</li>
              <li>לשכפל, למכור או להפיץ את התוכן המסחרי של השירות.</li>
              <li>לבצע הנדסה לאחור או לנסות לפרוץ את המערכת.</li>
              <li>לשלוח ספאם, וירוסים או כל קוד זדוני.</li>
              <li>להתחזות לאדם אחר או לגוף אחר.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. קניין רוחני</h2>
            <p className="text-muted-foreground leading-relaxed">
              כל זכויות הקניין הרוחני בשירות, לרבות עיצוב, קוד, אלגוריתמים וסמלי מסחר, שייכים לחברה. השימוש בשירות אינו מעניק לך זכות קניין כלשהי.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. תוכן שנוצר על ידי בינה מלאכותית</h2>
            <p className="text-muted-foreground leading-relaxed">
              הניתוחים, ההמלצות והתוכן המסופקים על ידי השירות נוצרים על ידי מערכות בינה מלאכותית ומבוססים על מידע ציבורי. אין לראות בהם ייעוץ מקצועי (משפטי, פיננסי, עסקי וכו'). החברה אינה אחראית להחלטות עסקיות שתתקבלנה על בסיס המידע מהשירות.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. הגבלת אחריות</h2>
            <p className="text-muted-foreground leading-relaxed">
              השירות מסופק &quot;כפי שהוא&quot; (AS IS) ללא אחריות מכל סוג. החברה לא תהא אחראית לנזקים ישירים, עקיפים, מקריים, מיוחדים או תוצאתיים הנובעים מהשימוש בשירות, לרבות אובדן הכנסה, אובדן נתונים או הפסקת פעילות עסקית.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. ביטול והפסקת שירות</h2>
            <p className="text-muted-foreground leading-relaxed">
              תוכל לבטל את מנויך בכל עת מתוך הגדרות החשבון. ביטול ייכנס לתוקף בתום תקופת החיוב הנוכחית. החברה שומרת לעצמה את הזכות לסיים את חשבונך אם הפרת תנאים אלה.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. שינויים בתנאים</h2>
            <p className="text-muted-foreground leading-relaxed">
              החברה רשאית לעדכן תנאים אלה מעת לעת. שינויים מהותיים יפורסמו באתר ויישלח עליהם דיוור ב-14 יום מראש. המשך השימוש בשירות לאחר העדכון מהווה הסכמה לתנאים החדשים.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">11. דין וסמכות שיפוט</h2>
            <p className="text-muted-foreground leading-relaxed">
              תנאים אלה כפופים לדיני מדינת ישראל. לבתי המשפט המוסמכים במחוז תל אביב תהא סמכות שיפוט בלעדית לדון בכל מחלוקת הנובעת מתנאים אלה.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">12. יצירת קשר</h2>
            <p className="text-muted-foreground leading-relaxed">
              לכל שאלה בנוגע לתנאי שימוש אלה, ניתן לפנות אלינו בדוא&quot;ל: <a href="mailto:support@nsradar.co.il" className="text-primary hover:underline">support@nsradar.co.il</a>
            </p>
          </section>

        </div>
      </main>

      <footer className="border-t border-border mt-16 py-8 text-center text-sm text-muted-foreground">
        <Link href="/privacy" className="text-primary hover:underline">מדיניות פרטיות</Link>
        {' '}·{' '}
        <Link href="/" className="hover:underline">חזור לעמוד הבית</Link>
      </footer>
    </div>
  )
}
