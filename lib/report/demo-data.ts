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
    big: 'הביקוש ל<em>"מיחזור משכנתא"</em> עלה ב־23% מהרבעון הקודם',
    // Pipe-separated, bidi-isolated segments — same shape assembleReport builds.
    sub: [
      'אתה מופיע במקום #2 בהמלצות מנועי ה־AI',
      `${TENDERS_ENABLED ? 8 : 5} הזדמנויות חדשות זוהו השבוע`,
      '3 המתחרים שלך פרסמו <em>5</em> פוסטים השבוע',
    ].map(t => `<span class="seg">${t}</span>`).join('<span class="sep">|</span>'),
  },

  metrics: [
    { num: '2', label: 'מיקום ממוצע בגוגל<br>(4 מילות מפתח)', hot: true },
    { num: '#2', label: 'מיקום בהמלצות AI<br>(ChatGPT, Gemini)', hot: true },
    ...(TENDERS_ENABLED ? [{ num: '3', label: 'מכרזים רלוונטיים<br>פתוחים כרגע' }] : []),
    { num: '5', label: 'שותפים פוטנציאליים<br>שזוהו' },
    { num: '2', label: 'כנסים רלוונטיים<br>קרובים' },
    { num: '3', label: 'מתחרים במעקב<br><b>5</b> פוסטים השבוע' },
  ],

  actions: [
    ...(TENDERS_ENABLED
      ? [{ title: 'הגש הצעה למכרז ליווי פיננסי — עיריית ראשון לציון', why: 'דדליין בעוד 6 ימים, התאמה 88% לתחום הייעוץ שלך.', src: 'מקור: מכרז', chip: { kind: 'urgent' as const, text: 'דדליין' }, kind: 'urgent' as const }]
      : [{ title: 'הירשם לכנס הנדל"ן והמשכנתאות — ההרשמה נסגרת בקרוב', why: 'כנס בהתאמה גבוהה לתחום שלך — הזדמנות נטוורקינג מרכזית.', src: 'מקור: כנס', chip: { kind: 'urgent' as const, text: 'מועד קרוב' }, kind: 'urgent' as const }]),
    // Competitor actions rank high (after real deadlines) — same order the
    // assembler produces from competitor_tracking.
    { title: 'משכנתא חכמה בע"מ שינה מחיר', why: 'מחיר הליווי המלא עודכן מ-4,500 ₪ ל-5,200 ₪ — נפתח לך מרווח תמחור, שווה לבדוק איך אתה ממוצב מולם', src: 'מקור: מעקב מתחרים', chip: { kind: 'watch' as const, text: 'שינוי אצל מתחרה' }, kind: 'watch' as const },
    { title: 'משכנתא חכמה בע"מ קיבל ביקורת שלילית', why: '2★ — "חיכיתי שבועיים לתשובה מהיועץ ובסוף פניתי למישהו אחר." — הזדמנות לפנות ללקוחות שלא קיבלו מענה טוב', src: 'מקור: מעקב מתחרים', chip: { kind: 'watch' as const, text: 'הזדמנות' }, kind: 'watch' as const },
    { title: 'פוסט של משכנתא חכמה בע"מ קיבל תגובות רבות', why: '449 לייקים ותגובות — "3 טעויות שעולות עשרות אלפי ₪ בתמהיל משכנתא". שווה לראות מה עבד שם.', src: 'מקור: מעקב מתחרים', chip: { kind: 'watch' as const, text: 'נקודה למחשבה' }, kind: 'watch' as const },
    { title: 'צור קשר עם 2 מתווכים חדשים שזוהו באזור', why: 'ערוץ הפניות ישיר ללקוחות משכנתא — התאמה גבוהה.', src: 'מקור: ליד', chip: { kind: 'watch', text: 'הזדמנות' }, kind: 'watch' },
    { title: 'פרסם תוכן על "מיחזור משכנתא" — הביקוש בעלייה', why: 'החיפושים עלו 23% ואתה כבר מדורג — הזדמנות לתפוס עוד תנועה.', src: 'מקור: טרנד', chip: { kind: 'watch', text: 'נקודה למחשבה' }, kind: 'watch' },
  ],

  // The old change-detection list is gone; "מעקב מתחרים" below is the section.
  competitors: [],
  competitorsNote: null,
  // "מעקב מתחרים" — the in-code fallback for /r/demo when the DB seed isn't
  // applied. Mirrors supabase/seed_demo_competitor_tracking.sql.
  // ⚠️  EVERY COMPETITOR HERE IS INVENTED. This is public demo content: no real
  //     business may be named, rated or quoted.
  competitorTracking: [
    {
      name: 'משכנתא חכמה בע"מ',
      links: [
        { label: 'אתר', url: 'https://example.com/mashkanta-hachama' },
        { label: 'אינסטגרם', url: 'https://www.instagram.com/example_mashkanta' },
        { label: 'פייסבוק', url: 'https://www.facebook.com/example.mashkanta' },
      ],
      reviews: {
        rating: 4.6,
        total: 154,
        headline: '4.6★ · 154 ביקורות',
        recent: '7 ביקורות חדשות ב-45 יום, ממוצע 4.1',
        sentiment: { dir: 'down' as const, text: 'הביקורות האחרונות חלשות מהממוצע (4.1 מול 4.6)' },
      },
      googleUrl: 'https://www.google.com/maps?cid=10000000000000000001',
      followers: [
        { label: 'אינסטגרם', count: 9240 },
        { label: 'פייסבוק', count: 4130 },
      ],
      posts: [
        // Same content cross-posted to two platforms — kept as two posts on
        // purpose; the badge is what makes that clear.
        { date: 'לפני יומיים', platform: 'instagram', platformLabel: 'אינסטגרם', caption: '3 טעויות שעולות עשרות אלפי ₪ בתמהיל משכנתא — והדרך להימנע מהן', engagement: '👍 412 · 💬 37 · 18,600 צפיות', url: 'https://www.instagram.com/p/example-a', notable: true },
        { date: 'לפני יומיים', platform: 'facebook', platformLabel: 'פייסבוק', caption: '3 טעויות שעולות עשרות אלפי ₪ בתמהיל משכנתא — והדרך להימנע מהן', engagement: '👍 88 · 💬 14', url: 'https://www.facebook.com/example/posts/a' },
        { date: 'לפני 5 ימים', platform: 'instagram', platformLabel: 'אינסטגרם', caption: 'לקוחה שלנו סורבה בשני בנקים — וקיבלה אישור תוך 11 יום', engagement: '👍 268 · 💬 24 · 11,200 צפיות', url: 'https://www.instagram.com/p/example-b' },
      ],
      websiteChanges: [
        { icon: '💰', text: 'מחיר הליווי המלא עודכן מ-4,500 ₪ ל-5,200 ₪', soWhat: 'נפתח לך מרווח תמחור — שווה לבדוק איך אתה ממוצב מולם' },
        { icon: '🆕', text: 'נוסף שירות חדש: ליווי משכנתא לתושבי חוץ' },
      ],
      insights: [
        '9 פרסומים ב-45 הימים האחרונים (פעיל מאוד) — אינסטגרם: 6 · פייסבוק: 3',
        'הכי פעילים באינסטגרם',
        'הכי מדברים על: "תמהיל" (4) · "מיחזור" (3) · "ריבית" (3)',
        'לקוחות מזכירים: "זמינות" (3) · "ליווי" (3)',
      ],
    },
    {
      name: 'הבית הפיננסי',
      links: [
        { label: 'אתר', url: 'https://example.com/habait-hafinansi' },
        { label: 'פייסבוק', url: 'https://www.facebook.com/example.habait' },
        { label: 'לינקדאין', url: 'https://www.linkedin.com/company/example-habait' },
      ],
      reviews: {
        rating: 4.8,
        total: 98,
        headline: '4.8★ · 98 ביקורות',
        recent: '3 ביקורות חדשות ב-45 יום, ממוצע 4.9',
        sentiment: { dir: 'up' as const, text: 'הביקורות האחרונות טובות מהממוצע (4.9 מול 4.8)' },
      },
      googleUrl: 'https://www.google.com/maps?cid=10000000000000000002',
      followers: [
        { label: 'פייסבוק', count: 2870 },
        { label: 'לינקדאין', count: 1120 },
      ],
      posts: [
        { date: 'לפני 3 ימים', platform: 'facebook', platformLabel: 'פייסבוק', caption: 'משכנתא הפוכה — למי זה באמת מתאים ומתי כדאי להימנע', engagement: '👍 96 · 💬 18', url: 'https://www.facebook.com/example/posts/c', notable: true },
        { date: 'לפני 8 ימים', platform: 'linkedin', platformLabel: 'לינקדאין', caption: 'מגייסים יועץ משכנתאות למשרד בראשון לציון', engagement: '👍 22 · 💬 3', url: 'https://www.linkedin.com/feed/update/example' },
      ],
      insights: [
        '4 פרסומים ב-45 הימים האחרונים (פעיל) — פייסבוק: 3 · לינקדאין: 1',
        'הכי מדברים על: "ריבית" (2) · "בנקים" (2)',
      ],
    },
    {
      // No social activity — shows the section degrading cleanly: reviews only.
      name: 'כספי ייעוץ משכנתאות',
      links: [{ label: 'אתר', url: 'https://example.com/kaspi-mashkantaot' }],
      reviews: {
        rating: 4.9,
        total: 212,
        headline: '4.9★ · 212 ביקורות',
      },
      googleUrl: 'https://www.google.com/maps?cid=10000000000000000003',
      followers: [],
      posts: [],
      insights: ['לא זוהתה פעילות ברשתות החברתיות'],
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
