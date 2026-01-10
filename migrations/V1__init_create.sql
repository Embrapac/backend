-- tabela profissionais
CREATE TABLE IF NOT EXISTS worker (
    id INT AUTO_INCREMENT PRIMARY KEY,
    login VARCHAR(20) NOT NULL UNIQUE,
    passwd VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    role ENUM('ADMIN', 'USER') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- tabela esteiras
CREATE TABLE IF NOT EXISTS conveyor (
    id INT AUTO_INCREMENT PRIMARY KEY,
    state ENUM('IN_PROGRESS', 'ON_HOLD', 'ON_FAILURE') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- tabela turnos
CREATE TABLE IF NOT EXISTS work_shift (
    id INT AUTO_INCREMENT PRIMARY KEY,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    total_count INT NOT NULL DEFAULT 0,
    small_count INT NOT NULL DEFAULT 0,
    medium_count INT NOT NULL DEFAULT 0,
    large_count INT NOT NULL DEFAULT 0,
    stoppage_count INT NOT NULL DEFAULT 0,
    conveyor_id INT NOT NULL,
    FOREIGN KEY (conveyor_id) REFERENCES conveyor(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE INDEX idx_start_time ON work_shift(start_time);
CREATE INDEX idx_end_time ON work_shift(end_time);
CREATE INDEX idx_conveyor_id ON work_shift(conveyor_id);

-- tabela eventos
CREATE TABLE event (
    id INT AUTO_INCREMENT PRIMARY KEY,
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
CREATE TABLE work_shift_worker (
    id INT NOT NULL,
    worker_id INT NOT NULL,
    work_shift_id INT NOT NULL,
    PRIMARY KEY (work_shift_id, worker_id),
    CONSTRAINT fk_work_shift_worker_work_shift FOREIGN KEY (work_shift_id)
        REFERENCES work_shift(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_work_shift_worker_worker FOREIGN KEY (worker_id)
        REFERENCES worker(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX idx_work_shift_worker_worker_id ON work_shift_worker(worker_id);
CREATE INDEX idx_work_shift_worker_work_shift_id ON work_shift_worker(work_shift_id);

-- tabela assoc turno-eventos
CREATE TABLE work_shift_event (
    id INT NOT NULL,
    event_id INT NOT NULL,
    work_shift_id INT NOT NULL,
    PRIMARY KEY (work_shift_id, event_id),
    CONSTRAINT fk_work_shift_event_work_shift FOREIGN KEY (work_shift_id)
        REFERENCES work_shift(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_work_shift_event_event FOREIGN KEY (event_id)
        REFERENCES event(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX idx_work_shift_event_event_id ON work_shift_event(event_id);
CREATE INDEX idx_work_shift_event_work_shift_id ON work_shift_event(work_shift_id);