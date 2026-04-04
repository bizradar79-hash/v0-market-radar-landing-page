-- Clear cached SEO and GEO rankings for organicbed so they are regenerated with new query logic
UPDATE companies
SET geo_ranking = NULL, seo_ranking = NULL
WHERE website ILIKE '%organicbed%';
