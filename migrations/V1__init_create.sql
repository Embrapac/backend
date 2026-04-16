-- tabela profissionais
CREATE TABLE IF NOT EXISTS worker (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    login VARCHAR(20) NOT NULL UNIQUE,
    passwd VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- tabela esteiras
CREATE TABLE IF NOT EXISTS conveyorbelt (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    state ENUM('IN_PROGRESS', 'ON_HOLD', 'ON_FAILURE') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- tabela turnos
CREATE TABLE IF NOT EXISTS workshift (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    total_count INT NOT NULL DEFAULT 0,
    small_count INT NOT NULL DEFAULT 0,
    medium_count INT NOT NULL DEFAULT 0,
    large_count INT NOT NULL DEFAULT 0,
    stoppage_count INT NOT NULL DEFAULT 0,
    conveyorbelt_id BIGINT NOT NULL,
    FOREIGN KEY (conveyorbelt_id) REFERENCES conveyorbelt(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE INDEX idx_start_time ON workshift(start_time);
CREATE INDEX idx_end_time ON workshift(end_time);
CREATE INDEX idx_conveyorbelt_id ON workshift(conveyorbelt_id);

-- tabela eventos
CREATE TABLE event (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    occurrence_time DATETIME NOT NULL,
    description VARCHAR(255) NOT NULL,
    code INT NOT NULL,
    message VARCHAR(255) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('ACTIVE', 'ACKNOLEDGED', 'RESOLVED')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE INDEX idx_occurrence_time ON event(occurrence_time);
CREATE INDEX idx_status ON event(status);
CREATE INDEX idx_severity ON event(severity);

-- tabela assoc turno-profissionais
CREATE TABLE workshift_worker (
    id BIGINT NOT NULL,
    worker_id BIGINT NOT NULL,
    workshift_id BIGINT NOT NULL,
    PRIMARY KEY (workshift_id, worker_id),
    CONSTRAINT fk_workshift_worker_workshift FOREIGN KEY (workshift_id)
        REFERENCES workshift(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_workshift_worker_worker FOREIGN KEY (worker_id)
        REFERENCES worker(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX idx_workshift_worker_worker_id ON workshift_worker(worker_id);
CREATE INDEX idx_workshift_worker_workshift_id ON workshift_worker(workshift_id);

-- tabela assoc turno-eventos
CREATE TABLE workshift_event (
    id BIGINT NOT NULL,
    event_id BIGINT NOT NULL,
    workshift_id BIGINT NOT NULL,
    PRIMARY KEY (workshift_id, event_id),
    CONSTRAINT fk_workshift_event_workshift FOREIGN KEY (workshift_id)
        REFERENCES workshift(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_workshift_event_event FOREIGN KEY (event_id)
        REFERENCES event(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX idx_workshift_event_event_id ON workshift_event(event_id);
CREATE INDEX idx_workshift_event_workshift_id ON workshift_event(workshift_id);