-- Script de inicialização para criar usuários adicionais
-- Este script é executado automaticamente na primeira inicialização do MariaDB

-- Criar usuário agenor@localhost (para conexões locais via CLI)
CREATE USER IF NOT EXISTS 'agenor'@'localhost' IDENTIFIED BY 'admin123';
GRANT ALL PRIVILEGES ON embrapac.* TO 'agenor'@'localhost';
FLUSH PRIVILEGES;

-- Criar usuário grafana_reader para acesso de leitura ao banco de dados (para Grafana)
CREATE USER IF NOT EXISTS 'grafana_reader'@'%' IDENTIFIED BY 'senha_segura';
GRANT SELECT ON embrapac.* TO 'grafana_reader'@'%';
FLUSH PRIVILEGES;