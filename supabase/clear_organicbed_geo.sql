-- Clear cached GEO ranking for organicbed so it regenerates with the new 5-query logic
UPDATE companies SET geo_ranking = NULL WHERE website ILIKE '%organicbed%';
