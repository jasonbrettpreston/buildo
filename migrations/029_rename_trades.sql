-- 029: Rename 4 trade display names (slugs unchanged, WF3)

UPDATE trades SET name = 'Masonry & Brickwork'      WHERE slug = 'masonry';
UPDATE trades SET name = 'Drywall & Taping'          WHERE slug = 'drywall';
UPDATE trades SET name = 'Landscaping & Hardscaping'  WHERE slug = 'landscaping';
UPDATE trades SET name = 'HVAC & Sheet Metal'         WHERE slug = 'hvac';
