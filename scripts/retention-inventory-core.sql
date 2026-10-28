BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

SELECT 'review_reports' AS data_group, count(*) AS rows,
       min(created_at) AS oldest_at, max(created_at) AS newest_at FROM review_reports
UNION ALL
SELECT 'review_moderation_audit', count(*), min(created_at), max(created_at) FROM review_moderation_audit
UNION ALL
SELECT 'hold_no_show_decisions', count(*), min(decided_at), max(decided_at) FROM hold_no_show_decisions
UNION ALL
SELECT 'outbox_events', count(*), min(occurred_at), max(occurred_at) FROM outbox_events;

COMMIT;
