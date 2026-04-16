-- Script de inicialização para criar usuários adicionais
-- Este script é executado automaticamente na primeira inicialização do MariaDB

-- Criar usuário agenor@localhost (para conexões locais via CLI)
CREATE USER IF NOT EXISTS 'agenor'@'localhost' IDENTIFIED BY 'admin123';
GRANT ALL PRIVILEGES ON embrapac.* TO 'agenor'@'localhost';
FLUSH PRIVILEGES;