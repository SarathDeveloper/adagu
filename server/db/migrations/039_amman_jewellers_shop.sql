-- Shop identity is entered on first run. This migration used to seed one shop.
-- It stays as a no-op so a new install starts blank. A database that already
-- applied version 39 keeps the values written at that time.
SELECT 1;
