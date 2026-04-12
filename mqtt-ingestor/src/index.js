require("dotenv").config();
const mqtt = require("mqtt");
const mysql = require("mysql2/promise");

const EXECUTION_MODES = {
  COMPOSE: "compose",
  STANDALONE: "standalone",
};

const {
  EXECUTION_MODE = EXECUTION_MODES.COMPOSE,
  MQTT_BROKER_URL,
  MQTT_CLIENT_ID = "grp1-mqtt-backend-server",
  MQTT_PUB_CBELT_STATUS = "embrapac/edge/cbelt/status",
  MQTT_SUB_COUNT = "embrapac/edge/count",
  MQTT_SUB_CBELT = "embrapac/edge/cbelt",
  DB_HOST,
  DB_PORT,
  DB_USER = "",
  DB_PASSWORD = "",
  DB_NAME = "embrapac",
} = process.env;

let dbPool;

const MQTT_TOPICS = [MQTT_PUB_CBELT_STATUS, MQTT_SUB_COUNT, MQTT_SUB_CBELT].filter(Boolean);

function resolveRuntimeConfig(mode) {
  if (!Object.values(EXECUTION_MODES).includes(mode)) {
    throw new Error(
      `Invalid EXECUTION_MODE: ${mode}. Expected one of: ${Object.values(EXECUTION_MODES).join(", ")}`,
    );
  }

  if (mode === EXECUTION_MODES.STANDALONE) {
    return {
      dbHost: DB_HOST || "host.docker.internal",
      dbPort: Number(DB_PORT || "13306"),
      mqttBrokerUrl: MQTT_BROKER_URL || "mqtt://host.docker.internal:11883",
    };
  }

  return {
    dbHost: DB_HOST || "mariadb",
    dbPort: Number(DB_PORT || "3306"),
    mqttBrokerUrl: MQTT_BROKER_URL || "mqtt://mosquitto:1883",
  };
}

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
    throw new Error("Field mcu_timestamp (or timestamp) must be string");
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
  const rawMcuTimestamp = payload.mcu_timestamp ?? payload.timestamp;
  if (rawMcuTimestamp === null || rawMcuTimestamp === undefined) {
    throw new Error("Missing required field: mcu_timestamp (or timestamp)");
  }

  const mcuTimestamp = toMysqlDatetime(rawMcuTimestamp);

  await dbPool.execute(
    `
      INSERT INTO mqtt_ingest_log (
        topic,
        payload_json,
        mcu_timestamp
      )
      VALUES (?, ?, ?)
    `,
    [
      topic,
      JSON.stringify(payload),
      mcuTimestamp,
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

  const runtimeConfig = resolveRuntimeConfig(EXECUTION_MODE);

  if (!Number.isInteger(runtimeConfig.dbPort) || runtimeConfig.dbPort <= 0) {
    throw new Error(`Invalid DB_PORT: ${DB_PORT || "(empty)"}`);
  }

  console.log("Runtime configuration", {
    executionMode: EXECUTION_MODE,
    dbHost: runtimeConfig.dbHost,
    dbPort: runtimeConfig.dbPort,
    mqttBrokerUrl: runtimeConfig.mqttBrokerUrl,
  });

  dbPool = mysql.createPool({
    host: runtimeConfig.dbHost,
    port: runtimeConfig.dbPort,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  await dbPool.query("SELECT 1");
  console.log("Connected to MariaDB");

  const client = mqtt.connect(runtimeConfig.mqttBrokerUrl, {
    clientId: MQTT_CLIENT_ID,
    reconnectPeriod: 2000,
  });

  client.on("connect", () => {
    console.log(`Connected to MQTT broker at ${runtimeConfig.mqttBrokerUrl}`);
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
