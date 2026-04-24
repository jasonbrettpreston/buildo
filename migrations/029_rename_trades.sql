-- 029: Rename 4 trade display names (slugs unchanged, WF3)

-- UP
UPDATE trades SET name = 'Masonry & Brickwork'      WHERE slug = 'masonry';
UPDATE trades SET name = 'Drywall & Taping'          WHERE slug = 'drywall';
UPDATE trades SET name = 'Landscaping & Hardscaping'  WHERE slug = 'landscaping';
UPDATE trades SET name = 'HVAC & Sheet Metal'         WHERE slug = 'hvac';

-- DOWN
-- Data migration — forward-only.
-- To reverse: restore previous trade display names manually:
--   UPDATE trades SET name = 'Masonry'           WHERE slug = 'masonry';
--   UPDATE trades SET name = 'Drywall'           WHERE slug = 'drywall';
--   UPDATE trades SET name = 'Landscaping'       WHERE slug = 'landscaping';
--   UPDATE trades SET name = 'HVAC'              WHERE slug = 'hvac';
