-- Seed data for Market Radar Israel AI Dashboard

-- KPI Stats
INSERT INTO kpi_stats (stat_name, stat_value, stat_max, change_percent, change_direction) VALUES
('opportunity_score', 87, 100, 5.2, 'up'),
('new_opportunities', 12, NULL, 15.0, 'up'),
('competitor_changes', 3, NULL, -2.0, 'down'),
('tender_alerts', 3, NULL, 10.0, 'up'),
('new_leads', 8, NULL, 25.0, 'up'),
('identified_trends', 4, NULL, 8.0, 'up')
ON CONFLICT (stat_name) DO UPDATE SET
  stat_value = EXCLUDED.stat_value,
  stat_max = EXCLUDED.stat_max,
  change_percent = EXCLUDED.change_percent,
  change_direction = EXCLUDED.change_direction,
  updated_at = NOW();

-- Opportunities
INSERT INTO opportunities (title, description, source, impact_score, priority, recommended_actions, category) VALUES
('הרחבת שוק B2B בתחום הפינטק', 'זוהתה עלייה של 40% בביקוש לפתרונות פיננסיים דיגיטליים בקרב עסקים קטנים ובינוניים', 'ניתוח שוק', 92, 'גבוהה', ARRAY['יצירת קמפיין ממוקד', 'פיתוח שותפויות אסטרטגיות', 'הרחבת צוות מכירות'], 'פינטק'),
('כניסה לשוק הקמעונאות החכמה', 'מגמה חיובית בתחום הקמעונאות הדיגיטלית עם פוטנציאל צמיחה משמעותי', 'מודיעין תחרותי', 85, 'גבוהה', ARRAY['מחקר שוק מעמיק', 'זיהוי שותפים פוטנציאליים'], 'קמעונאות'),
('שיתוף פעולה עם סטארטאפים', 'הזדמנות לשיתופי פעולה עם סטארטאפים מבטיחים בתחום ה-AI', 'רשת קשרים', 78, 'בינונית', ARRAY['מיפוי סטארטאפים רלוונטיים', 'יצירת תוכנית שותפויות'], 'חדשנות'),
('מכרז ממשלתי חדש בתחום הסייבר', 'מכרז בהיקף של 50 מיליון שקל לפתרונות אבטחת מידע למוסדות ציבוריים', 'מערכת מכרזים', 88, 'גבוהה', ARRAY['הכנת הצעה', 'גיוס שותפים למכרז', 'בדיקת דרישות טכניות'], 'סייבר');

-- Competitors
INSERT INTO competitors (name, activity_type, change_description, impact, detected_at) VALUES
('טכנולוגיות אלפא', 'השקת מוצר חדש', 'השיקו פלטפורמת AI חדשה לניתוח נתונים עסקיים', 'גבוה', NOW() - INTERVAL '2 hours'),
('דטה ישראל', 'שינוי מחירים', 'הורדת מחירים של 20% בחבילת הפרימיום', 'בינוני', NOW() - INTERVAL '1 day'),
('ביזנס אנליטיקס', 'גיוס עובדים', 'גייסו 15 מהנדסי תוכנה חדשים', 'נמוך', NOW() - INTERVAL '3 days');

-- Leads
INSERT INTO leads (company_name, contact_name, email, source, score, status) VALUES
('חברת הייטק בע"מ', 'דני כהן', 'dani@hitech.co.il', 'אתר', 85, 'חדש'),
('סטארטאפ חדשני', 'מיכל לוי', 'michal@startup.io', 'לינקדאין', 72, 'בטיפול'),
('קבוצת השקעות', 'יוסי אברהם', 'yossi@invest.co.il', 'המלצה', 90, 'חדש'),
('פתרונות דיגיטליים', 'רונית שמש', 'ronit@digital.co.il', 'כנס', 68, 'ממתין');

-- Tenders
INSERT INTO tenders (title, organization, deadline, estimated_value, category, status) VALUES
('מערכת ניהול מידע ארגונית', 'משרד האוצר', NOW() + INTERVAL '14 days', '₪5,000,000', 'טכנולוגיה', 'פעיל'),
('פתרון אבטחת סייבר', 'צה"ל', NOW() + INTERVAL '30 days', '₪15,000,000', 'סייבר', 'פעיל'),
('פלטפורמת למידה דיגיטלית', 'משרד החינוך', NOW() + INTERVAL '21 days', '₪8,000,000', 'חינוך', 'פעיל');

-- Trends
INSERT INTO trends (name, category, score, direction, description) VALUES
('בינה מלאכותית', 'טכנולוגיה', 95, 'עולה', 'עלייה חדה באימוץ פתרונות AI בעסקים'),
('עבודה היברידית', 'תעסוקה', 78, 'יציב', 'המשך מגמת העבודה ההיברידית'),
('קיימות', 'סביבה', 82, 'עולה', 'גידול בביקוש לפתרונות ירוקים'),
('פינטק', 'פיננסים', 88, 'עולה', 'צמיחה בשירותים פיננסיים דיגיטליים');

-- News
INSERT INTO news (title, summary, source, category, published_at) VALUES
('חברת AI ישראלית גייסה 50 מיליון דולר', 'סבב גיוס משמעותי לחברה המתמחה בבינה מלאכותית לעסקים', 'גלובס', 'טכנולוגיה', NOW() - INTERVAL '2 hours'),
('משרד האוצר מפרסם מכרז טכנולוגי חדש', 'מכרז בהיקף של מיליוני שקלים לפיתוח מערכות מידע', 'כלכליסט', 'מכרזים', NOW() - INTERVAL '5 hours'),
('עלייה של 30% בהשקעות בסטארטאפים ישראליים', 'דוח חדש מצביע על צמיחה משמעותית בהשקעות הון סיכון', 'TheMarker', 'השקעות', NOW() - INTERVAL '1 day'),
('שינויים רגולטוריים בתחום הפינטק', 'בנק ישראל מפרסם תקנות חדשות לחברות פינטק', 'גלובס', 'רגולציה', NOW() - INTERVAL '2 days');

-- Alerts
INSERT INTO alerts (title, message, type, is_read) VALUES
('הזדמנות חדשה זוהתה', 'מכרז ממשלתי חדש בתחום הסייבר תואם לפרופיל העסק שלך', 'success', FALSE),
('שינוי אצל מתחרה', 'טכנולוגיות אלפא השיקו מוצר מתחרה חדש', 'warning', FALSE),
('ליד חדש בעדיפות גבוהה', 'קבוצת השקעות הביעה עניין במוצר שלך', 'info', FALSE),
('מועד אחרון מתקרב', 'מכרז משרד האוצר נסגר בעוד 14 יום', 'warning', FALSE),
('טרנד עולה', 'עלייה משמעותית בחיפושים בתחום AI', 'info', TRUE);
