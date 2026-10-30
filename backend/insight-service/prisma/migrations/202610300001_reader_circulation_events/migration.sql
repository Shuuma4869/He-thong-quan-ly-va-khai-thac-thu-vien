ALTER TABLE reader_notifications
    DROP CONSTRAINT reader_notifications_aggregate_type_check,
    DROP CONSTRAINT reader_notifications_event_type_check;

ALTER TABLE reader_notifications
    ADD CONSTRAINT reader_notifications_aggregate_type_check CHECK (aggregate_type IN ('HOLD', 'LOAN')),
    ADD CONSTRAINT reader_notifications_event_type_check CHECK (event_type IN (
        'HOLD_CREATED', 'HOLD_READY', 'HOLD_EXPIRED',
        'COPY_BORROWED', 'COPY_RETURNED', 'LOAN_RENEWED', 'LOAN_DUE_REMINDER'
    ));
