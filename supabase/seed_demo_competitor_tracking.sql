-- DEMO competitor-tracking data for the public sample report (/r/demo + the
-- landing fragments). Companion to seed_demo_company.sql.
--
-- ⚠️  EVERY COMPETITOR HERE IS INVENTED. This is a PUBLIC demo — no real
--     business is named, rated, or quoted. The names match the fictional
--     competitors already seeded into `competitors` by seed_demo_company.sql so
--     the demo reads as one coherent story.
--
-- Dates are RELATIVE (now() - interval), so the sample stays "recent" whenever
-- the demo is viewed — posts inside the 14-day list, reviews inside the 45-day
-- window — without anyone re-running the seed.
--
-- The demo company is is_demo=true, so it is excluded from scans and batch
-- refresh: this data is never overwritten by a real run.
--
-- Idempotent — safe to re-run. Apply manually in the Supabase SQL editor.
-- Requires: add_competitor_tracking.sql

do $$
declare
  demo_id uuid := '00000000-0000-4000-a000-000000000d3a';
  d0 timestamptz := now();
begin
  if not exists (select 1 from companies where id = demo_id) then
    raise notice 'demo company not found — apply seed_demo_company.sql first';
    return;
  end if;

  -- Keep the client's tracked-competitor list in sync with these rows.
  update companies
     set business_profile = coalesce(business_profile, '{}'::jsonb) || jsonb_build_object(
           'directCompetitors',
           jsonb_build_array('משכנתא חכמה בע"מ', 'הבית הפיננסי', 'כספי ייעוץ משכנתאות')
         )
   where id = demo_id;

  delete from competitor_tracking where company_id = demo_id;

  -- ── 1) משכנתא חכמה בע"מ — the busy one (drives the "posts this week" card,
  --       the high-engagement action, and the negative-review opportunity).
  insert into competitor_tracking (company_id, competitor_name, resolved_links, sources, insights, reviews, cost, scanned_at)
  values (
    demo_id, 'משכנתא חכמה בע"מ',
    jsonb_build_object(
      'website', 'https://example.com/mashkanta-hachama',
      'instagram', 'https://www.instagram.com/example_mashkanta',
      'facebook', 'https://www.facebook.com/example.mashkanta',
      'cid', '10000000000000000001',
      'mapsUrl', 'https://www.google.com/maps?cid=10000000000000000001'
    ),
    jsonb_build_array(
      jsonb_build_object('source','instagram','status','ok','url','https://www.instagram.com/example_mashkanta',
        'profile', jsonb_build_object('followers', 9240, 'name','משכנתא חכמה'),
        'postsTotal',12,'postsRecent',6,
        'posts', jsonb_build_array(
          jsonb_build_object('caption','3 טעויות שעולות עשרות אלפי ₪ בתמהיל משכנתא — והדרך להימנע מהן','date',(d0 - interval '2 days'),'likes',412,'comments',37,'views',18600,'postUrl','https://www.instagram.com/p/example-a'),
          jsonb_build_object('caption','לקוחה שלנו סורבה בשני בנקים — וקיבלה אישור תוך 11 יום','date',(d0 - interval '5 days'),'likes',268,'comments',24,'views',11200,'postUrl','https://www.instagram.com/p/example-b'),
          jsonb_build_object('caption','ריבית פריים מול קבועה צמודה: מה עדיף עכשיו?','date',(d0 - interval '9 days'),'likes',153,'comments',12,'postUrl','https://www.instagram.com/p/example-c'),
          jsonb_build_object('caption','מדריך: כמה הון עצמי באמת צריך לדירה ראשונה','date',(d0 - interval '26 days'),'likes',96,'comments',8,'postUrl','https://www.instagram.com/p/example-d')
        )),
      jsonb_build_object('source','facebook','status','ok','url','https://www.facebook.com/example.mashkanta',
        'profile', jsonb_build_object('followers', 4130),
        'postsTotal',7,'postsRecent',3,
        'posts', jsonb_build_array(
          -- Same content cross-posted — shown twice on purpose, with its own numbers.
          jsonb_build_object('caption','3 טעויות שעולות עשרות אלפי ₪ בתמהיל משכנתא — והדרך להימנע מהן','date',(d0 - interval '2 days'),'likes',88,'comments',14,'postUrl','https://www.facebook.com/example/posts/a'),
          jsonb_build_object('caption','וובינר חינם: מיחזור משכנתא בריבית הנוכחית','date',(d0 - interval '6 days'),'likes',61,'comments',19,'postUrl','https://www.facebook.com/example/posts/b')
        )),
      jsonb_build_object('source','website','status','ok','url','https://example.com/mashkanta-hachama')
    ),
    jsonb_build_object(
      'windowDays', 45,
      'cadence', jsonb_build_object('total',9,'level','פעיל מאוד','text','9 פרסומים ב-45 הימים האחרונים (פעיל מאוד) — אינסטגרם: 6 · פייסבוק: 3'),
      'presence', jsonb_build_object('source','instagram','count',6,'text','הכי פעילים באינסטגרם'),
      'themes', jsonb_build_object('text','הכי מדברים על: "תמהיל" (4) · "מיחזור" (3) · "ריבית" (3)',
        'terms', jsonb_build_array(jsonb_build_object('term','תמהיל','count',4), jsonb_build_object('term','מיחזור','count',3), jsonb_build_object('term','ריבית','count',3))),
      'topPosts', jsonb_build_array(
        jsonb_build_object('caption','3 טעויות שעולות עשרות אלפי ₪ בתמהיל משכנתא — והדרך להימנע מהן','source','instagram','engagement',449,'date','','text','449 תגובות+לייקים')),
      'followers', jsonb_build_array(
        jsonb_build_object('source','instagram','followers',9240),
        jsonb_build_object('source','facebook','followers',4130))
    ),
    jsonb_build_object(
      'found', true, 'title','משכנתא חכמה בע"מ', 'address','ראשון לציון',
      'cid','10000000000000000001', 'mapsUrl','https://www.google.com/maps?cid=10000000000000000001',
      'rating', 4.6, 'reviewsCount', 154, 'capturedAt', d0, 'costUSD', 0.006,
      'passes', 'maps("משכנתא חכמה בע\"מ ראשון לציון"):top-result',
      'reviews', jsonb_build_array(
        jsonb_build_object('date',(d0 - interval '4 days'),'rating',2,'text','חיכיתי שבועיים לתשובה מהיועץ ובסוף פניתי למישהו אחר. חבל, ההתחלה הייתה מבטיחה.'),
        jsonb_build_object('date',(d0 - interval '12 days'),'rating',5,'text','ליווי מקצועי ומהיר, חסכו לנו הרבה כסף במיחזור.')),
      'insights', jsonb_build_object(
        'windowDays', 45,
        'standing', jsonb_build_object('rating',4.6,'total',154,'text','דירוג 4.6 מתוך 5 · 154 ביקורות'),
        'recent', jsonb_build_object('count',7,'avgRating',4.1,'text','7 ביקורות חדשות ב-45 יום, ממוצע 4.1'),
        'sentiment', jsonb_build_object('direction','down','delta',-0.5,'text','הביקורות האחרונות חלשות מהממוצע (4.1 מול 4.6)'),
        'themes', jsonb_build_object('text','לקוחות מזכירים: "זמינות" (3) · "ליווי" (3)'),
        'negatives', jsonb_build_array(
          jsonb_build_object('date', to_char(d0 - interval '4 days','DD.MM.YYYY'),'rating',2,'text','חיכיתי שבועיים לתשובה מהיועץ ובסוף פניתי למישהו אחר.')))
    ),
    jsonb_build_object('brightdata', jsonb_build_object('requests',2,'records',19,'costUSD',0.0505,'precision','exact'),
                       'dataforseo', jsonb_build_object('calls',2,'costUSD',0.006,'precision','exact'),
                       'totalUSD', 0.0565),
    d0 - interval '1 day'
  );

  -- ── 2) הבית הפיננסי — steady, strong reviews, modest posting.
  insert into competitor_tracking (company_id, competitor_name, resolved_links, sources, insights, reviews, cost, scanned_at)
  values (
    demo_id, 'הבית הפיננסי',
    jsonb_build_object(
      'website','https://example.com/habait-hafinansi',
      'facebook','https://www.facebook.com/example.habait',
      'linkedin','https://www.linkedin.com/company/example-habait',
      'cid','10000000000000000002',
      'mapsUrl','https://www.google.com/maps?cid=10000000000000000002'),
    jsonb_build_array(
      jsonb_build_object('source','facebook','status','ok','url','https://www.facebook.com/example.habait',
        'profile', jsonb_build_object('followers', 2870),
        'postsTotal',4,'postsRecent',2,
        'posts', jsonb_build_array(
          jsonb_build_object('caption','משכנתא הפוכה — למי זה באמת מתאים ומתי כדאי להימנע','date',(d0 - interval '3 days'),'likes',96,'comments',18,'postUrl','https://www.facebook.com/example/posts/c'),
          jsonb_build_object('caption','סקירה שבועית: מה קורה בריביות הבנקים','date',(d0 - interval '10 days'),'likes',38,'comments',4,'postUrl','https://www.facebook.com/example/posts/d'))),
      jsonb_build_object('source','linkedin','status','ok','url','https://www.linkedin.com/company/example-habait',
        'profile', jsonb_build_object('followers', 1120),
        'postsTotal',2,'postsRecent',1,
        'posts', jsonb_build_array(
          jsonb_build_object('caption','מגייסים יועץ משכנתאות למשרד בראשון לציון','date',(d0 - interval '8 days'),'likes',22,'comments',3,'postUrl','https://www.linkedin.com/feed/update/example')))),
    jsonb_build_object(
      'windowDays', 45,
      'cadence', jsonb_build_object('total',4,'level','פעיל','text','4 פרסומים ב-45 הימים האחרונים (פעיל) — פייסבוק: 3 · לינקדאין: 1'),
      'presence', jsonb_build_object('source','facebook','count',3,'text','הכי פעילים בפייסבוק'),
      'themes', jsonb_build_object('text','הכי מדברים על: "ריבית" (2) · "בנקים" (2)',
        'terms', jsonb_build_array(jsonb_build_object('term','ריבית','count',2), jsonb_build_object('term','בנקים','count',2))),
      'topPosts', jsonb_build_array(
        jsonb_build_object('caption','משכנתא הפוכה — למי זה באמת מתאים ומתי כדאי להימנע','source','facebook','engagement',114,'date','','text','114 תגובות+לייקים')),
      'followers', jsonb_build_array(
        jsonb_build_object('source','facebook','followers',2870),
        jsonb_build_object('source','linkedin','followers',1120))),
    jsonb_build_object(
      'found', true, 'title','הבית הפיננסי', 'address','ראשון לציון',
      'cid','10000000000000000002','mapsUrl','https://www.google.com/maps?cid=10000000000000000002',
      'rating', 4.8, 'reviewsCount', 98, 'capturedAt', d0, 'costUSD', 0.006,
      'passes','maps("הבית הפיננסי ראשון לציון"):top-result',
      'reviews', jsonb_build_array(
        jsonb_build_object('date',(d0 - interval '7 days'),'rating',5,'text','שירות אדיב ומקצועי, הסבירו כל שלב בסבלנות.')),
      'insights', jsonb_build_object(
        'windowDays', 45,
        'standing', jsonb_build_object('rating',4.8,'total',98,'text','דירוג 4.8 מתוך 5 · 98 ביקורות'),
        'recent', jsonb_build_object('count',3,'avgRating',4.9,'text','3 ביקורות חדשות ב-45 יום, ממוצע 4.9'),
        'sentiment', jsonb_build_object('direction','up','delta',0.1,'text','הביקורות האחרונות טובות מהממוצע (4.9 מול 4.8)'))),
    jsonb_build_object('brightdata', jsonb_build_object('requests',1,'records',6,'costUSD',0.0165,'precision','exact'),
                       'dataforseo', jsonb_build_object('calls',2,'costUSD',0.006,'precision','exact'),
                       'totalUSD', 0.0225),
    d0 - interval '1 day'
  );

  -- ── 3) כספי ייעוץ משכנתאות — best-rated, quiet on social. Shows the section
  --       degrading cleanly: reviews block present, no recent-posts block.
  insert into competitor_tracking (company_id, competitor_name, resolved_links, sources, insights, reviews, cost, scanned_at)
  values (
    demo_id, 'כספי ייעוץ משכנתאות',
    jsonb_build_object(
      'website','https://example.com/kaspi-mashkantaot',
      'cid','10000000000000000003',
      'mapsUrl','https://www.google.com/maps?cid=10000000000000000003'),
    jsonb_build_array(
      jsonb_build_object('source','website','status','ok','url','https://example.com/kaspi-mashkantaot')),
    jsonb_build_object(
      'windowDays', 45,
      'noRecentActivity', true,
      'presence', jsonb_build_object('source','website','count',0,'text','לא זוהתה פעילות ברשתות החברתיות')),
    jsonb_build_object(
      'found', true, 'title','כספי ייעוץ משכנתאות', 'address','ראשון לציון',
      'cid','10000000000000000003','mapsUrl','https://www.google.com/maps?cid=10000000000000000003',
      'rating', 4.9, 'reviewsCount', 212, 'capturedAt', d0, 'costUSD', 0.006,
      'passes','cached-cid',
      'reviews', jsonb_build_array(),
      'insights', jsonb_build_object(
        'windowDays', 45,
        'standing', jsonb_build_object('rating',4.9,'total',212,'text','דירוג 4.9 מתוך 5 · 212 ביקורות'),
        'noRecentReviews', true)),
    jsonb_build_object('brightdata', jsonb_build_object('requests',1,'records',0,'costUSD',0.0015,'precision','exact'),
                       'dataforseo', jsonb_build_object('calls',1,'costUSD',0.003,'precision','exact'),
                       'totalUSD', 0.0045),
    d0 - interval '1 day'
  );

  raise notice 'demo competitor_tracking seeded: 3 fictional competitors';
end $$;
