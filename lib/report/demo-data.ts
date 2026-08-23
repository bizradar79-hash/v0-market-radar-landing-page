// Frozen, crafted sample report for the public "דוח לדוגמה". A fictional mortgage
// consultant in ראשון לציון. Rendered through the REAL ReportView component/CSS so
// the sample can never drift from the product. Used by /r/demo and by the landing
// page's report-fragment showcase. Clearly labeled as a fictional example.
import type { ReportData } from './assemble'
import { TENDERS_ENABLED } from '@/lib/flags'

export const DEMO_COMPANY_NAME = 'משכנתא פלוס'

export const DEMO_REPORT: ReportData = {
  companyName: DEMO_COMPANY_NAME,
  scanDate: '3 ביולי 2026',
  period: '27 ביוני–3 ביולי',
  area: 'ראשון לציון',
  nextScan: '10 ביולי 2026',

  achievement: {
    title: 'הישג השבוע: אתה בטופ 3 בגוגל',
    sub: '"יועץ משכנתאות ראשון לציון" — מקום #2 בתוצאות',
  },

  thesis: {
    big: 'הביקוש ל<em>"מיחזור משכנתא"</em> עלה ב־23% מהרבעון הקודם.',
    sub: `אתה מופיע במקום #2 בהמלצות מנועי ה־AI, ${TENDERS_ENABLED ? 8 : 5} הזדמנויות חדשות זוהו השבוע.`,
  },

  metrics: [
    { num: '2', label: 'מיקום ממוצע בגוגל<br>(4 מילות מפתח)', hot: true },
    { num: '#2', label: 'מיקום בהמלצות AI<br>(ChatGPT, Gemini)', hot: true },
    ...(TENDERS_ENABLED ? [{ num: '3', label: 'מכרזים רלוונטיים<br>פתוחים כרגע' }] : []),
    { num: '5', label: 'שותפים פוטנציאליים<br>שזוהו' },
    { num: '2', label: 'כנסים רלוונטיים<br>קרובים' },
    { num: '3', label: 'מתחרים במעקב<br><b>41</b> פוסטים השבוע', hot: true },
  ],

  actions: [
    ...(TENDERS_ENABLED
      ? [{ title: 'הגש הצעה למכרז ליווי פיננסי — עיריית ראשון לציון', why: 'דדליין בעוד 6 ימים, התאמה 88% לתחום הייעוץ שלך.', src: 'מקור: מכרז', chip: { kind: 'urgent' as const, text: 'דדליין' }, kind: 'urgent' as const }]
      : [{ title: 'הירשם לכנס הנדל"ן והמשכנתאות — ההרשמה נסגרת בקרוב', why: 'כנס בהתאמה גבוהה לתחום שלך — הזדמנות נטוורקינג מרכזית.', src: 'מקור: כנס', chip: { kind: 'urgent' as const, text: 'מועד קרוב' }, kind: 'urgent' as const }]),
    { title: 'צור קשר עם 2 מתווכים חדשים שזוהו באזור', why: 'ערוץ הפניות ישיר ללקוחות משכנתא — התאמה גבוהה.', src: 'מקור: ליד', chip: { kind: 'watch', text: 'הזדמנות' }, kind: 'watch' },
    { title: 'פרסם תוכן על "מיחזור משכנתא" — הביקוש בעלייה', why: 'החיפושים עלו 23% ואתה כבר מדורג — הזדמנות לתפוס עוד תנועה.', src: 'מקור: טרנד', chip: { kind: 'watch', text: 'נקודה למחשבה' }, kind: 'watch' },
  ],

  // No competitor CHANGES this week → evergreen fallback (intro + trends + amber opps).
  competitors: [],
  competitorsNote: 'לא זוהו שינויים מהותיים השבוע — אבל הנה מה שקורה אצל המתחרים:',
  // The demo report shows the NEW "מעקב מתחרים" section.
  competitorTracking: [
    {
      name: 'לימון ייעוץ משכנתאות',
      links: [
        { label: 'אתר', url: 'https://example.co.il' },
        { label: 'אינסטגרם', url: 'https://instagram.com/example' },
      ],
      reviews: {
        rating: 4.9,
        total: 143,
        headline: '4.9★ · 143 ביקורות',
        recent: '7 ביקורות חדשות ב-45 יום, ממוצע 4.8',
        sentiment: { dir: 'down' as const, text: 'הביקורות האחרונות חלשות מהממוצע (4.8 מול 4.9)' },
      },
      googleUrl: 'https://www.google.com/maps?cid=13294732576479516349',
      followers: [
        { label: 'אינסטגרם', count: 8420 },
        { label: 'פייסבוק', count: 3110 },
      ],
      posts: [
        // Same content cross-posted to two platforms — kept as two posts on
        // purpose; the badge is what makes that clear.
        { date: '18 באוגוסט', platform: 'instagram', platformLabel: 'אינסטגרם', caption: 'מדריך: איך לבחור תמהיל משכנתא נכון בריבית הנוכחית', engagement: '👍 287 · 💬 25 · 12,400 צפיות', url: 'https://instagram.com/p/example1', notable: true },
        { date: '18 באוגוסט', platform: 'facebook', platformLabel: 'פייסבוק', caption: 'מדריך: איך לבחור תמהיל משכנתא נכון בריבית הנוכחית', engagement: '👍 64 · 💬 9', url: 'https://facebook.com/example1' },
        { date: '14 באוגוסט', platform: 'facebook', platformLabel: 'פייסבוק', caption: 'סיפור לקוח: חסכנו 180 אלף ש"ח במחזור משכנתא', engagement: '👍 81 · 💬 15', url: 'https://facebook.com/example2' },
      ],
      insights: [
        '9 פרסומים ב-45 הימים האחרונים (פעיל מאוד) — אינסטגרם: 6 · פייסבוק: 3',
        'הכי מדברים על: "מחזור" (5) · "ריבית" (4) · "תמהיל" (3)',
        'לקוחות מזכירים: "שירות" (4) · "מקצועי" (3)',
      ],
    },
  ],
  competitorTrends: [
    { name: 'משכנתא חכמה בע"מ', topic: 'השיקו מחשבון מיחזור אונליין חדש באתר', opportunity: 'הוסף כלי דומה או מדריך מיחזור לאתר שלך כדי לא לפגר אחרי' },
    { name: 'הבית הפיננסי', topic: 'מקדמים קמפיין תוכן על "משכנתא לזוגות צעירים"', opportunity: 'נישה עם ביקוש עולה — שווה עמוד נחיתה ייעודי' },
    { name: 'כספי ייעוץ משכנתאות', topic: 'דירוג גוגל יציב, 4.8★ (212 ביקורות)' },
  ],

  // Tenders feature-flagged with the module — empty when off (section hides).
  tenders: TENDERS_ENABLED ? [
    { title: 'ליווי פיננסי לפרויקט התחדשות עירונית', sub: 'עיריית ראשון לציון · עד ₪180,000', side: '⏳ נסגר בעוד 6 ימים', pill: { kind: 'teal', text: 'התאמה 88%' }, hot: true, deadline: true },
    { title: 'שירותי ייעוץ משכנתאות לעובדי הרשות', sub: 'עיריית נס ציונה', side: 'נסגר בעוד 21 ימים', pill: { kind: 'teal', text: 'התאמה 81%' } },
    { title: 'ייעוץ כלכלי למשקי בית — תוכנית סיוע', sub: 'משרד הבינוי והשיכון', side: 'נסגר בעוד 34 ימים', pill: { kind: 'amber', text: 'התאמה 72%' } },
  ] : [],

  leadGroups: [
    { channel: 'מתווכים', leads: [
      { title: 'רי/מקס נדל"ן ראשון', sub: 'משרד תיווך פעיל — מפנה לקוחות משכנתא', matchTag: { kind: 'high', text: 'התאמה גבוהה' }, website: 'https://example.com' },
      { title: 'אנגלו סכסון המרכז', sub: 'תיווך נדל"ן — שכונות חדשות', matchTag: { kind: 'good', text: 'התאמה טובה' }, website: 'https://example.com' },
    ] },
    { channel: 'קבלנים', leads: [
      { title: 'אזורים בנייה למגורים', sub: 'פרויקט מגורים חדש בראשון — קונים צריכים משכנתא', matchTag: { kind: 'high', text: 'התאמה גבוהה' }, website: 'https://example.com' },
      { title: 'י.ח. דמרי', sub: 'קבלן מבצע — לקוחות רוכשי דירות', matchTag: { kind: 'good', text: 'התאמה טובה' } },
    ] },
    { channel: 'עו"ד נדל"ן', leads: [
      { title: 'משרד עו"ד כהן ושות\'', sub: 'ליווי עסקאות נדל"ן — הפניות הדדיות', matchTag: { kind: 'good', text: 'התאמה טובה' }, website: 'https://example.com' },
    ] },
  ],

  seo: [],
  seoPrimary: { query: '"יועץ משכנתאות ראשון לציון"', rank: '2', sub: 'גוגל · 1,900 חיפושים בחודש', warn: false },
  seoExtras: [
    { query: '"מיחזור משכנתא"', rank: '4', sub: 'גוגל · 6,600 חיפושים בחודש', warn: false },
    { query: '"משכנתא לדירה ראשונה"', rank: '—', sub: 'גוגל · 3,300 חיפושים בחודש', unranked: true },
  ],
  seoAi: {
    question: 'מי יועץ המשכנתאות הכי טוב בראשון לציון?',
    engines: [
      { name: 'ChatGPT', rank: '#2', appeared: true },
      { name: 'Gemini', rank: '#3', appeared: true },
      { name: 'Grok', rank: 'לא מופיע', appeared: false },
    ],
  },
  seoAiQuestions: [
    { question: 'מי יועץ המשכנתאות הכי טוב בראשון לציון?', engines: [
      { name: 'ChatGPT', rank: '#2', appeared: true },
      { name: 'Gemini', rank: '#3', appeared: true },
      { name: 'Grok', rank: 'לא מופיע', appeared: false },
    ] },
    { question: 'איך בוחרים יועץ משכנתאות?', engines: [
      { name: 'ChatGPT', rank: '#4', appeared: true },
      { name: 'Gemini', rank: 'לא מופיע', appeared: false },
      { name: 'Grok', rank: '#5', appeared: true },
    ] },
    { question: 'כדאי למחזר משכנתא עכשיו?', engines: [
      { name: 'ChatGPT', rank: 'לא מופיע', appeared: false },
      { name: 'Gemini', rank: '#6', appeared: true },
      { name: 'Grok', rank: 'לא מופיע', appeared: false },
    ] },
  ],
  seoAiFirst: false,
  demand: {
    keyword: 'מיחזור משכנתא',
    series: [3600, 3900, 4100, 4000, 4400, 4800, 5200, 5100, 5600, 6000, 6300, 6600],
    label: 'ביקוש ב־12 החודשים האחרונים (Google)',
  },

  industryTrends: [
    { title: 'עלייה בביקוש לייעוץ מיחזור אונליין', badge: { kind: 'up', text: '▲ במגמת עלייה' } },
    { title: 'משכנתאות ירוקות לבנייה חדשה', badge: { kind: 'up', text: '▲ במגמת עלייה' } },
  ],

  trends: [
    { title: 'מיחזור משכנתא', sub: '6,600 חיפושים בחודש', badge: { kind: 'up', text: '▲ +23% מהרבעון הקודם' }, hot: true },
    { title: 'משכנתא הפוכה', sub: '2,400 חיפושים בחודש', badge: { kind: 'up', text: '▲ +11% מהרבעון הקודם' } },
    { title: 'ריבית פריים', sub: '9,900 חיפושים בחודש', badge: { kind: 'flat', text: 'יציב' } },
  ],

  conferences: [
    { title: 'כנס הנדל"ן והמשכנתאות 2026', sub: '18 באוגוסט · תל אביב', side: 'הרשמה פתוחה', pill: 'התאמה גבוהה' },
    { title: 'מפגש יועצי משכנתאות — מחוז מרכז', sub: '2 בספטמבר · ראשון לציון', side: 'פרטים בקרוב' },
  ],

  news: [
    { title: 'בנק ישראל הותיר את הריבית ללא שינוי', sub: 'צפי לגל מיחזורי משכנתאות ברבעון הקרוב.', pill: 'ישראל' },
    { title: 'עלייה בביקוש לדירות יד שנייה במרכז', sub: 'יותר עסקאות = יותר לקוחות פוטנציאליים למשכנתא.', pill: 'נדל"ן' },
  ],
}
