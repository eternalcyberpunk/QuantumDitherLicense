CREATE TABLE IF NOT EXISTS licenses (
    license_hash CHAR(64) PRIMARY KEY,
    order_id TEXT NOT NULL UNIQUE,
    product TEXT NOT NULL,
    license_profile TEXT NOT NULL DEFAULT 'qds-v1',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    customer_email TEXT,
    device_id CHAR(32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    refunded_at TIMESTAMPTZ
);

ALTER TABLE licenses
    ADD COLUMN IF NOT EXISTS license_profile TEXT NOT NULL DEFAULT 'qds-v1';

CREATE INDEX IF NOT EXISTS licenses_product_active_idx
    ON licenses (product, active);

CREATE TABLE IF NOT EXISTS activation_events (
    id BIGSERIAL PRIMARY KEY,
    attempted_license_hash CHAR(64) NOT NULL,
    license_hash CHAR(64) REFERENCES licenses(license_hash) ON UPDATE CASCADE ON DELETE CASCADE,
    device_id CHAR(32) NOT NULL,
    accepted BOOLEAN NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS activation_events_linked_license_created_idx
    ON activation_events (license_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS activation_events_attempted_created_idx
    ON activation_events (attempted_license_hash, created_at DESC);
