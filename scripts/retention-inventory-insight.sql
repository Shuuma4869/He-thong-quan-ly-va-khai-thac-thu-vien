BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

SELECT 'reader_notifications' AS data_group, count(*) AS rows,
       min(received_at) AS oldest_at, max(received_at) AS newest_at FROM reader_notifications
UNION ALL
SELECT 'circulation_notices', count(*), min(received_at), max(received_at) FROM circulation_notices
UNION ALL
SELECT 'consumed_circulation_events', count(*), min(received_at), max(received_at) FROM consumed_circulation_events;

COMMIT;
