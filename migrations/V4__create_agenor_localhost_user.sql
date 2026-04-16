-- Criar usuário agenor@localhost com acesso local ao banco
-- Necessário para conexões via CLI (mariadb -u agenor) dentro do container
CREATE USER IF NOT EXISTS 'agenor'@'localhost' IDENTIFIED BY 'admin123';
GRANT ALL PRIVILEGES ON embrapac.* TO 'agenor'@'localhost';
FLUSH PRIVILEGES;
