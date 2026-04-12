CREATE TABLE IF NOT EXISTS mqtt_ingest_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    topic VARCHAR(255) NOT NULL,
    payload_json JSON NOT NULL,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_mqtt_ingest_log_topic ON mqtt_ingest_log(topic);
CREATE INDEX idx_mqtt_ingest_log_mcu_timestamp ON mqtt_ingest_log(mcu_timestamp);
CREATE INDEX idx_mqtt_ingest_log_received_at ON mqtt_ingest_log(received_at);
