# Projeto Backend

O projeto backend será responsável pela interligação do módulo IHM (formado por um frontend¹ e backend) ao banco de dados e interconexão com sistemas externos através de API REST (HTTP/HTTPS) ou mensageria via Pub/Sub (MQTT).

Além do mais será responsável por orquestrar a infraestrutura de monitoramento dos KPIs do sistema, gerados pelo módulo Microcontrolador e pelo módulo EDGE, utilizando ferramentas como InfluxDB, Telegraf e Grafana.

# Funcionalidades disponíveis

* Banco de dados: MariaDB
  * Flyway: serviço de versionamento do banco de dados
* Pub/Sub: Mosquitto

# Utilização

O sistema de backend monta suas integrações externas através do Docker Compose.
* para inicializar toda infraestrutura: `docker compose up -d`
* para desligar toda infraestrutura: `docker compose down`

Exemplo dos sistemas criados:

![services running](img/all-services.png)


# Monitoramento

Criado estrutura no Docker Compose para rodar o **Mosquitto**, **InfluxDB**, **Telegraf** e **Grafana**, para monitoramento dos KPIs do sistema.

Teste inicial do ambiente realizado no mesmo Raspberry Pi 5: publicação de dados no mosquitto para exibição no _dashboard_ do Grafana:

![Grafana](img/grafana-poc.png)

Teste realizado local no RPi:

`mosquitto_pub -h localhost -t "sensor/precision" -m "95"`

Teste realizado a partir de outro dispositivo na mesma rede:

`mosquitto_pub -h 192.168.51.10 -t "sensor/precision" -m "95"`


---

_1 frontend representa as telas que os operadores terão na linha de montagem_