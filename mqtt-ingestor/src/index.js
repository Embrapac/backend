require("dotenv").config();
const mqtt = require("mqtt");
const mysql = require("mysql2/promise");

const {
  MQTT_BROKER_URL = "mqtt://mosquitto:1883",
  MQTT_CLIENT_ID = "grp1-mqtt-backend-server",
  MQTT_SUB_COUNT = "embrapac/edge/count",
  MQTT_SUB_CBELT = "embrapac/edge/cbelt",
  DB_HOST = "mariadb",
  DB_PORT = "3306",
  DB_USER,
  DB_PASSWORD,
  DB_NAME = "embrapac",
} = process.env;

let dbPool;

const MQTT_TOPICS = [MQTT_TOPIC, MQTT_SUB_COUNT, MQTT_SUB_CBELT].filter(Boolean);

function parsePayload(buffer) {
  const payload = JSON.parse(buffer.toString("utf8"));
  // for (const key of REQUIRED_FIELDS) {
  //   if (!(key in payload)) {
  //     throw new Error(`Missing required field: ${key}`);
  //   }
  // }
  return payload;
}

function toMysqlDatetime(rawTimestamp) {
  if (typeof rawTimestamp !== "string") {
    throw new Error("Field timestamp must be string");
  }

  const normalized = rawTimestamp.trim().replace("T", " ");
  const datetimeWithoutMicros = normalized.split(".")[0];
  const date = new Date(datetimeWithoutMicros.replace(" ", "T") + "Z");

  if (Number.isNaN(date.getTime())) {
    throw new Error("Field is not a valid datetime");
  }

  return datetimeWithoutMicros;
}

async function writeMessage(topic, payload) {
  const timestamp = toMysqlDatetime(payload.timestamp);

  await dbPool.execute(
    `
      INSERT INTO mqtt_ingest_log (
        topic,
        payload_json,
        timestamp
      )
      VALUES (?, ?, ?)
    `,
    [
      topic,
      JSON.stringify(payload),
      timestamp,
    ],
  );
}

async function start() {
  const missingDbCredentials = [];
  if (!DB_USER) missingDbCredentials.push("DB_USER");
  if (!DB_PASSWORD) missingDbCredentials.push("DB_PASSWORD");

  if (missingDbCredentials.length > 0) {
    throw new Error(
      `Missing required environment variables for database credentials: ${missingDbCredentials.join(", ")}`,
    );
  }

  dbPool = mysql.createPool({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  await dbPool.query("SELECT 1");
  console.log("Connected to MariaDB");

  const client = mqtt.connect(MQTT_BROKER_URL, {
    clientId: MQTT_CLIENT_ID,
    reconnectPeriod: 2000,
  });

  client.on("connect", () => {
    console.log(`Connected to MQTT broker at ${MQTT_BROKER_URL}`);
    if (MQTT_TOPICS.length === 0) {
      console.error("No MQTT topic configured. Set MQTT_TOPIC or MQTT_SUB_* env vars.");
      return;
    }

    client.subscribe(MQTT_TOPICS, { qos: 1 }, (err) => {
      if (err) {
        console.error("Failed to subscribe to topic", err);
        return;
      }
      console.log(`Subscribed to topics: ${MQTT_TOPICS.join(", ")}`);
    });
  });

  client.on("message", async (topic, message) => {
    try {
      const payload = parsePayload(message);
      await writeMessage(topic, payload);
      console.log(`Persisted message from topic ${topic}`);
    } catch (error) {
      console.error("Failed to process MQTT message", {
        topic,
        error: error.message,
        raw: message.toString("utf8"),
      });
    }
  });

  client.on("error", (error) => {
    console.error("MQTT client error", error.message);
  });

  let isShuttingDown = false;

  const gracefulShutdown = async (signal) => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    console.log(`Graceful shutdown requested (${signal})`);
    try {
      await new Promise((resolve, reject) => {
        client.end(true, (error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    } catch (error) {
      console.error("Failed to close MQTT client during shutdown", {
        signal,
        error: error.message,
      });
    }

    if (dbPool) {
      await dbPool.end();
    }

    process.exit(0);
  };

  process.on("SIGINT", () => {
    gracefulShutdown("SIGINT").catch((error) => {
      console.error("Graceful shutdown failed", {
        signal: "SIGINT",
        error: error.message,
      });
      process.exit(1);
    });
  });

  process.on("SIGTERM", () => {
    gracefulShutdown("SIGTERM").catch((error) => {
      console.error("Graceful shutdown failed", {
        signal: "SIGTERM",
        error: error.message,
      });
      process.exit(1);
    });
  });
}

start().catch((error) => {
  console.error("Fatal startup error", error);
  process.exit(1);
});
