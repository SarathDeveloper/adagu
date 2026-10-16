-- The Gold & Silver Rates page is gone. Staff no longer get a 'rates' feature.

DELETE FROM staff_permissions WHERE feature_key = 'rates';
