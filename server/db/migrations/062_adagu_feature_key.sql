-- The Adagu + Gold Savings edition has no billing, products, stock or inward
-- modules. Staff permissions that referenced them must move to the surviving
-- 'adagu' key (which now gates /api/pledges) or be dropped, otherwise those
-- users would be left with permissions that match nothing.

UPDATE OR IGNORE staff_permissions SET feature_key = 'adagu' WHERE feature_key = 'billing';

DELETE FROM staff_permissions
WHERE feature_key IN ('billing', 'products', 'stock', 'inward');
