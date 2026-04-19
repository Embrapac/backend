-- Criar registro de turno (workshift) para a esteira em IN_PROGRESS, com start na data/hora atual e fim daqui 4 horas

-- INSERT INTO workshift (start_time, end_time) VALUES (NOW(), DATE_ADD(NOW(), INTERVAL 4 HOUR));

INSERT INTO conveyorbelt (state) VALUES ('IN_PROGRESS');

INSERT INTO workshift (start_time, end_time, conveyorbelt_id)
SELECT NOW(), DATE_ADD(NOW(), INTERVAL 4 HOUR), cb.id FROM conveyorbelt cb
WHERE cb.state = 'IN_PROGRESS'
ORDER BY cb.id DESC
LIMIT 1;

