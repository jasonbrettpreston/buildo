-- 010_notifications.sql
-- Notification queue for in-app and push notifications.

CREATE TABLE IF NOT EXISTS notifications (
    id          SERIAL          PRIMARY KEY,
    user_id     VARCHAR(100)    NOT NULL,
    type        VARCHAR(50)     NOT NULL,
    title       VARCHAR(200),
    body        TEXT,
    permit_num  VARCHAR(30),
    trade_slug  VARCHAR(50),
    channel     VARCHAR(20)     NOT NULL DEFAULT 'in_app',
    is_read     BOOLEAN         NOT NULL DEFAULT false,
    is_sent     BOOLEAN         NOT NULL DEFAULT false,
    sent_at     TIMESTAMP,
    created_at  TIMESTAMP       NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read
    ON notifications (user_id, is_read);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
    ON notifications (user_id, created_at DESC);
