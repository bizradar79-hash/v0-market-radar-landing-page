-- Demo company powering the public sample report (/r/demo). Fictional mortgage
-- consultant "משכנתא פלוס" in ראשון לציון (local scope), flagged is_demo=true so it's
-- excluded from scans / batch refresh / counts and its data stays FROZEN.
--
-- Idempotent — safe to re-run. Apply manually in the Supabase SQL editor.
-- NOTE: /r/demo falls back to frozen in-code data if this seed isn't applied, so
-- the landing always works; apply this only if you want a real DB-backed demo.

create extension if not exists pgcrypto;

-- 1) The flag (also used by scan/refresh exclusions).
alter table companies add column if not exists is_demo boolean not null default false;

-- 2) Fixed demo identity.
do $$
declare
  demo_id uuid := '00000000-0000-4000-a000-000000000d3a';
begin
  -- Auth user (only needed if companies.id FKs auth.users). Harmless otherwise.
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', demo_id, 'authenticated', 'authenticated',
          'demo@nsradar.co.il', crypt('demo-not-loginable-'||demo_id, gen_salt('bf')),
          now(), now(), now(),
          '{"provider":"email","providers":["email"]}', '{"is_demo":true}')
  on conflict (id) do nothing;

  -- Company row.
  insert into companies (id, name, city, geographic_scope, is_demo,
                         onboarding_completed, sync_status,
                         last_sync_at, next_sync_at,
                         keywords, business_profile,
                         weekly_actions, seo_ranking, geo_ranking, keyword_trends, competitor_trends)
  values (
    demo_id, 'משכנתא פלוס', 'ראשון לציון', array['local'], true,
    true, 'idle',
    (now() - interval '2 days'), (now() + interval '5 days'),
    array['יועץ משכנתאות','מיחזור משכנתא','משכנתא לדירה ראשונה'],
    '{"coreActivity":"ייעוץ משכנתאות ומימון לרוכשי דירות","geographicMarkets":["ראשון לציון"],"primaryKeywords":["יועץ משכנתאות","מיחזור משכנתא"],"distributionChannels":["מתווכים","קבלנים","עו\"ד נדל\"ן"]}'::jsonb,
    '{"fetchedAt":"2026-07-03T08:00:00Z","actions":[
      {"title":"הגש הצעה למכרז ליווי פיננסי — עיריית ראשון לציון","summary":"דדליין בעוד 6 ימים, התאמה 88% לתחום הייעוץ שלך.","category":"מכרז","priority":"גבוהה","signals":[{"label":"מכרז"}]},
      {"title":"צור קשר עם 2 מתווכים חדשים שזוהו באזור","summary":"ערוץ הפניות ישיר ללקוחות משכנתא — התאמה גבוהה.","category":"ליד","priority":"רגילה","signals":[{"label":"ליד"}]},
      {"title":"פרסם תוכן על מיחזור משכנתא — הביקוש בעלייה","summary":"החיפושים עלו 23% ואתה כבר מדורג — הזדמנות לתפוס עוד תנועה.","category":"טרנד","priority":"רגילה","signals":[{"label":"טרנד"}]}
    ]}'::jsonb,
    '{"queryVariants":[
      {"query":"יועץ משכנתאות ראשון לציון","appeared":true,"position":2,"searchVolume":1900},
      {"query":"מיחזור משכנתא","appeared":true,"position":4,"searchVolume":6600},
      {"query":"משכנתא לדירה ראשונה","appeared":false,"position":null,"searchVolume":3300}
    ]}'::jsonb,
    '{"query":"מי יועץ המשכנתאות הכי טוב בראשון לציון?","userPosition":2,"engines":{
      "chatgpt":{"appeared":true,"position":2},
      "gemini":{"appeared":true,"position":3},
      "grok":{"appeared":false,"position":null}
    }}'::jsonb,
    '{"מיחזור משכנתא":{"keyword":"מיחזור משכנתא","searchVolume":6600,"changePct":23,"direction":"rising","lowData":false,"monthlySeries":[3600,3900,4100,4000,4400,4800,5200,5100,5600,6000,6300,6600]},
      "משכנתא הפוכה":{"keyword":"משכנתא הפוכה","searchVolume":2400,"changePct":11,"direction":"rising","lowData":false,"monthlySeries":[1900,2000,2050,2100,2150,2200,2250,2250,2300,2350,2380,2400]},
      "ריבית פריים":{"keyword":"ריבית פריים","searchVolume":9900,"changePct":2,"direction":"stable","lowData":false,"monthlySeries":[9700,9800,9850,9900,9850,9900,9950,9900,9900,9850,9900,9900]}}'::jsonb,
    '{"fetchedAt":"2026-07-03T08:00:00Z","competitor_data":[
      {"competitor_name":"משכנתא חכמה בע\"מ","trending_topics":["מחשבון מיחזור"],"new_activity":"השיקו מחשבון מיחזור אונליין חדש באתר","opportunity":"הוסף כלי דומה או מדריך מיחזור לאתר שלך כדי לא לפגר אחרי","has_opportunity":true},
      {"competitor_name":"הבית הפיננסי","trending_topics":["משכנתא לזוגות צעירים"],"new_activity":"מקדמים קמפיין תוכן על משכנתא לזוגות צעירים","opportunity":"נישה עם ביקוש עולה — שווה עמוד נחיתה ייעודי","has_opportunity":true},
      {"competitor_name":"כספי ייעוץ משכנתאות","trending_topics":["דירוג גבוה"],"new_activity":"דירוג גוגל יציב, 4.8 כוכבים (212 ביקורות)","opportunity":"","has_opportunity":false}
    ]}'::jsonb
  )
  on conflict (id) do update set
    name = excluded.name, city = excluded.city, geographic_scope = excluded.geographic_scope,
    is_demo = true, last_sync_at = excluded.last_sync_at, next_sync_at = excluded.next_sync_at,
    keywords = excluded.keywords, business_profile = excluded.business_profile,
    weekly_actions = excluded.weekly_actions, seo_ranking = excluded.seo_ranking,
    geo_ranking = excluded.geo_ranking, keyword_trends = excluded.keyword_trends,
    competitor_trends = excluded.competitor_trends;

  -- Child rows — replace to stay idempotent.
  delete from tenders     where company_id = demo_id;
  delete from leads       where company_id = demo_id;
  delete from competitors where company_id = demo_id;
  delete from conferences where company_id = demo_id;
  delete from news        where company_id = demo_id;

  insert into tenders (company_id, title, organization, deadline, budget, relevance_score, link, description) values
    (demo_id, 'ליווי פיננסי לפרויקט התחדשות עירונית', 'עיריית ראשון לציון', (now() + interval '6 days')::date, 'עד ₪180,000', 88, 'https://www.rishonlezion.muni.il/Tenders', 'ליווי פיננסי לתושבים בפרויקט פינוי-בינוי.'),
    (demo_id, 'שירותי ייעוץ משכנתאות לעובדי הרשות', 'עיריית נס ציונה', (now() + interval '21 days')::date, 'לא צוין', 81, 'https://www.nzc.org.il/tenders', 'ייעוץ משכנתאות לעובדי העירייה.'),
    (demo_id, 'ייעוץ כלכלי למשקי בית — תוכנית סיוע', 'משרד הבינוי והשיכון', (now() + interval '34 days')::date, 'לא צוין', 72, 'https://www.gov.il/he/departments/moch', 'ייעוץ כלכלי למשקי בית זכאים.');

  insert into leads (company_id, name, website, industry, reason, score, source, location) values
    (demo_id, 'רי/מקס נדל"ן ראשון', 'https://www.remax-israel.com', 'תיווך נדל"ן', 'משרד תיווך פעיל — מפנה לקוחות משכנתא', 88, 'מתווכים', 'ראשון לציון'),
    (demo_id, 'אנגלו סכסון המרכז', 'https://www.anglo-saxon.co.il', 'תיווך נדל"ן', 'תיווך נדל"ן — שכונות חדשות', 74, 'מתווכים', 'ראשון לציון'),
    (demo_id, 'אזורים בנייה למגורים', 'https://www.azorim.co.il', 'קבלן', 'פרויקט מגורים חדש — קונים צריכים משכנתא', 90, 'קבלנים', 'ראשון לציון'),
    (demo_id, 'י.ח. דמרי', 'https://www.dimri.co.il', 'קבלן', 'קבלן מבצע — לקוחות רוכשי דירות', 71, 'קבלנים', 'ראשון לציון'),
    (demo_id, 'משרד עו"ד כהן ושות''', 'https://example.com', 'עורכי דין', 'ליווי עסקאות נדל"ן — הפניות הדדיות', 76, 'עו"ד נדל"ן', 'ראשון לציון');

  -- trend='stable' on all → no "changes" this week → report shows the competitor-trends fallback.
  insert into competitors (company_id, name, threat_score, trend, positioning, google_rating, google_review_count) values
    (demo_id, 'משכנתא חכמה בע"מ', 78, 'stable', 'ייעוץ משכנתאות דיגיטלי', 4.6, 154),
    (demo_id, 'הבית הפיננסי', 71, 'stable', 'ייעוץ משכנתאות ומשכנתא הפוכה', 4.7, 98),
    (demo_id, 'כספי ייעוץ משכנתאות', 65, 'stable', 'ייעוץ משכנתאות ותיק', 4.8, 212);

  insert into conferences (company_id, name, date, location, description, url, category) values
    (demo_id, 'כנס הנדל"ן והמשכנתאות 2026', (now() + interval '46 days')::date, 'תל אביב', '[rel:82]␟כנס מוביל לענף המשכנתאות והנדל"ן.', 'https://example.com/kenes', 'נדל"ן'),
    (demo_id, 'מפגש יועצי משכנתאות — מחוז מרכז', (now() + interval '61 days')::date, 'ראשון לציון', '[rel:64]␟מפגש מקצועי ליועצי משכנתאות.', '', 'ייעוץ');

  insert into news (company_id, title, source, url, summary, category, published_at) values
    (demo_id, 'בנק ישראל הותיר את הריבית ללא שינוי', 'גלובס', 'https://www.globes.co.il', 'צפי לגל מיחזורי משכנתאות ברבעון הקרוב.', 'ישראל', now() - interval '1 day'),
    (demo_id, 'עלייה בביקוש לדירות יד שנייה במרכז', 'כלכליסט', 'https://www.calcalist.co.il', 'יותר עסקאות = יותר לקוחות פוטנציאליים למשכנתא.', 'נדל"ן', now() - interval '3 days');
end $$;
