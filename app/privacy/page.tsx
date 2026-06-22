import Link from 'next/link'
import Image from 'next/image'

export const metadata = {
  title: 'מדיניות פרטיות | North Star Radar',
  alternates: { canonical: '/privacy' },
}

export default function PrivacyPage() {
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
        <h1 className="text-3xl font-bold text-foreground mb-2">מדיניות פרטיות</h1>
        <p className="text-sm text-muted-foreground mb-10">עדכון אחרון: אפריל 2026</p>

        <div className="prose prose-invert max-w-none space-y-8 text-foreground">

          <section>
            <h2 className="text-xl font-semibold mb-3">1. מבוא</h2>
            <p className="text-muted-foreground leading-relaxed">
              North Star Radar Ltd (להלן: &quot;אנחנו&quot; או &quot;החברה&quot;) מחויבת להגן על פרטיותך. מדיניות זו מסבירה אילו מידע אנו אוספים, כיצד אנו משתמשים בו ומה הזכויות שלך בנוגע למידע זה. מדיניות זו עומדת בדרישות חוק הגנת הפרטיות הישראלי (1981) ובעיקרון ה-GDPR של האיחוד האירופי.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. מידע שאנו אוספים</h2>
            <p className="text-muted-foreground leading-relaxed mb-2">אנו אוספים את סוגי המידע הבאים:</p>
            <ul className="text-muted-foreground leading-relaxed space-y-2 list-disc pr-5">
              <li><strong className="text-foreground">פרטי חשבון:</strong> שם, כתובת אימייל, שם החברה, תחום עיסוק.</li>
              <li><strong className="text-foreground">מידע עסקי:</strong> פרופיל העסק, מתחרים, מילות מפתח, קהל יעד שתזינו במערכת.</li>
              <li><strong className="text-foreground">נתוני שימוש:</strong> עמודים שביקרת, פעולות שביצעת, תאריכי כניסה.</li>
              <li><strong className="text-foreground">מידע טכני:</strong> כתובת IP, סוג דפדפן, מערכת הפעלה.</li>
              <li><strong className="text-foreground">נתוני תשלום:</strong> מעובדים ישירות על ידי ספק התשלומים (Stripe) — אנחנו לא מאחסנים פרטי כרטיס אשראי.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. כיצד אנו משתמשים במידע</h2>
            <ul className="text-muted-foreground leading-relaxed space-y-2 list-disc pr-5">
              <li>מתן השירות ושיפורו המתמיד.</li>
              <li>יצירת ניתוחים מותאמים אישית באמצעות בינה מלאכותית.</li>
              <li>שליחת עדכונים ומידע שירותי (לא ספאם שיווקי ללא הסכמה).</li>
              <li>עמידה בדרישות חוקיות.</li>
              <li>מניעת הונאה ושמירה על אבטחת המערכת.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. שיתוף מידע עם צדדים שלישיים</h2>
            <p className="text-muted-foreground leading-relaxed mb-2">אנחנו לא מוכרים את המידע שלך. אנחנו עשויים לשתף מידע עם:</p>
            <ul className="text-muted-foreground leading-relaxed space-y-2 list-disc pr-5">
              <li><strong className="text-foreground">ספקי תשתית:</strong> Supabase (מסד נתונים, אימות), Vercel (אחסון אתר) — בכפוף להסכמי עיבוד נתונים.</li>
              <li><strong className="text-foreground">ספקי AI:</strong> Groq, Google Gemini, xAI — הפרומפטים כוללים מידע עסקי שסיפקת. אין שיתוף פרטים מזהים.</li>
              <li><strong className="text-foreground">ספקי חיפוש:</strong> Tavily, Serper — לצורך שליפת מידע מהאינטרנט.</li>
              <li><strong className="text-foreground">גורמי אכיפה:</strong> רק על פי דרישה חוקית.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. עוגיות (Cookies)</h2>
            <p className="text-muted-foreground leading-relaxed">
              אנו משתמשים בעוגיות לצורך ניהול הפעלה (session) ואימות זהות. עוגיות אלה הכרחיות לתפקוד השירות. אנו משתמשים גם ב-Vercel Analytics לניתוח תנועת גולשים אנונימי ללא מעקב אישי. תוכל לבטל עוגיות בהגדרות הדפדפן, אם כי הדבר עשוי לפגוע בתפקוד השירות.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. אבטחת מידע</h2>
            <p className="text-muted-foreground leading-relaxed">
              אנו נוקטים אמצעי אבטחה מקובלים בתעשייה: הצפנת HTTPS, אימות רב-שלבי, בקרות גישה מבוססות תפקיד (RLS) במסד הנתונים. עם זאת, אין מערכת מחשוב בטוחה לחלוטין ואנו ממליצים לשמור על סודיות הסיסמה שלך.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. שמירת מידע</h2>
            <p className="text-muted-foreground leading-relaxed">
              נתוני חשבון נשמרים כל עוד החשבון פעיל. לאחר מחיקת חשבון, המידע נמחק תוך 30 יום, למעט מידע שנדרש לשמירה לצרכים חוקיים. נתוני שימוש אנונימיים עשויים להישמר לצרכי שיפור המוצר.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. הזכויות שלך</h2>
            <p className="text-muted-foreground leading-relaxed mb-2">בכפוף לחוק, יש לך את הזכויות הבאות:</p>
            <ul className="text-muted-foreground leading-relaxed space-y-2 list-disc pr-5">
              <li><strong className="text-foreground">גישה:</strong> לקבל עותק של המידע שיש לנו עליך.</li>
              <li><strong className="text-foreground">תיקון:</strong> לתקן מידע שגוי.</li>
              <li><strong className="text-foreground">מחיקה:</strong> לבקש מחיקת מידעך (&quot;הזכות להישכח&quot;).</li>
              <li><strong className="text-foreground">התנגדות:</strong> להתנגד לעיבוד מסוים של מידעך.</li>
              <li><strong className="text-foreground">ניידות:</strong> לקבל את מידעך בפורמט קריא למכונה.</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-3">
              לממש זכויות אלה, פנה אלינו בדוא&quot;ל: <a href="mailto:privacy@nsradar.co.il" className="text-primary hover:underline">privacy@nsradar.co.il</a>
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. העברת מידע לחו&quot;ל</h2>
            <p className="text-muted-foreground leading-relaxed">
              חלק מספקי השירות שלנו פועלים מחוץ לישראל (ארה&quot;ב, אירופה). אנו מוודאים שהעברות אלה מבוצעות בהתאם להסכמי הגנת נתונים מתאימים.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. פרטיות ילדים</h2>
            <p className="text-muted-foreground leading-relaxed">
              השירות אינו מיועד לבני פחות מ-18 שנה. אנו לא אוספים ביודעין מידע מקטינים. אם גילית שקטין שיתף מידע איתנו, אנא פנה אלינו למחיקה מיידית.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">11. שינויים במדיניות</h2>
            <p className="text-muted-foreground leading-relaxed">
              אנו עשויים לעדכן מדיניות זו. שינויים מהותיים יפורסמו באתר ובדוא&quot;ל 14 יום מראש. המשך השימוש בשירות לאחר העדכון מהווה הסכמה למדיניות המעודכנת.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">12. יצירת קשר</h2>
            <p className="text-muted-foreground leading-relaxed">
              לכל שאלה בנוגע למדיניות פרטיות זו: <a href="mailto:privacy@nsradar.co.il" className="text-primary hover:underline">privacy@nsradar.co.il</a>
            </p>
          </section>

        </div>
      </main>

      <footer className="border-t border-border mt-16 py-8 text-center text-sm text-muted-foreground">
        <Link href="/terms" className="text-primary hover:underline">תנאי שימוש</Link>
        {' '}·{' '}
        <Link href="/" className="hover:underline">חזור לעמוד הבית</Link>
      </footer>
    </div>
  )
}
