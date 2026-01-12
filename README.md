# Projeto Backend do módulo IHM

O projeto backend será responsável pela interligação da parte visual (frontend¹), banco de dados e interconexão com sistemas externos através de API REST (HTTP/HTTPS) ou mensageria via Pub/Sub (MQTT).

# Funcionalidades disponíveis

* Banco de dados: MariaDB

# Utilização

O sistema de backend monta suas integrações externas através do Docker Compose: `docker compose up -d`

Atualmente temos:

* Servidor de banco de dados criado
* Mecanismo de geração de versionamento para os scripts de banco de dados.

---

1 frontend representa as telas que os operadores terão na linha de montagem