-- 006_permit_trades.sql
-- Junction table linking permits to trades with classification metadata.

CREATE TABLE IF NOT EXISTS permit_trades (
    id              SERIAL          PRIMARY KEY,
    permit_num      VARCHAR(30)     NOT NULL,
    revision_num    VARCHAR(10)     NOT NULL,
    trade_id        INTEGER         NOT NULL REFERENCES trades(id),
    tier            INTEGER,
    confidence      DECIMAL(3,2),
    is_active       BOOLEAN         NOT NULL DEFAULT true,
    phase           VARCHAR(20),
    lead_score      INTEGER         NOT NULL DEFAULT 0,
    classified_at   TIMESTAMP       NOT NULL DEFAULT NOW(),

    UNIQUE (permit_num, revision_num, trade_id)
);

CREATE INDEX IF NOT EXISTS idx_permit_trades_trade
    ON permit_trades (trade_id);

CREATE INDEX IF NOT EXISTS idx_permit_trades_active
    ON permit_trades (is_active);

CREATE INDEX IF NOT EXISTS idx_permit_trades_lead_score
    ON permit_trades (lead_score DESC);

CREATE INDEX IF NOT EXISTS idx_permit_trades_permit
    ON permit_trades (permit_num, revision_num);
