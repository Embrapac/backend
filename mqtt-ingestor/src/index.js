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
  MQTT_SUB_METRICS = "embrapac/edge/aggregated-metrics",
  DB_TIME_ZONE = "-03:00",
  DB_HOST,
  DB_PORT,
  DB_USER = "",
  DB_PASSWORD = "",
  DB_NAME = "embrapac",
} = process.env;

let dbPool;

const MQTT_TOPICS = [MQTT_PUB_CBELT_STATUS, MQTT_SUB_COUNT, MQTT_SUB_CBELT, MQTT_SUB_METRICS].filter(Boolean);

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

async function writeMqttIngestLog(topic, payload) {
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
  console.log("Persisted MQTT ingest log record", {
    topic,
    mcuTimestamp,
  });
}

async function writeCountRecord(payload) {
  const rawMcuClass = payload.mcu_class ?? payload.detected_class;
  const rawMcuTimestamp = payload.mcu_timestamp ?? payload.timestamp;

  if (!rawMcuClass) {
    throw new Error("Missing required field: mcu_class (or detected_class)");
  }

  if (rawMcuTimestamp === null || rawMcuTimestamp === undefined) {
    throw new Error("Missing required field: mcu_timestamp (or timestamp)");
  }

  const mcuTimestamp = toMysqlDatetime(rawMcuTimestamp);
  const normalizedClass = String(rawMcuClass).trim().toLowerCase();

  let countColumn = null;
  if (normalizedClass === "pequena") {
    countColumn = "small_count";
  } else if (normalizedClass === "media" || normalizedClass === "média") {
    countColumn = "medium_count";
  } else if (normalizedClass === "grande") {
    countColumn = "large_count";
  }

  const [workshiftRows] = await dbPool.execute(
    `
      SELECT id, start_time, end_time
      FROM workshift
      WHERE ? BETWEEN start_time AND end_time
      ORDER BY start_time DESC
      LIMIT 1
    `,
    [mcuTimestamp],
  );

  if (workshiftRows.length === 0) {
    console.error("Count record not persisted because no workshift exists for MCU timestamp", {
      mcuClass: rawMcuClass,
      mcuTimestamp,
    });
    return;
  }

  const workshift = workshiftRows[0];
  const updateClauses = ["total_count = total_count + 1"];
  if (countColumn) {
    updateClauses.push(`${countColumn} = ${countColumn} + 1`);
  } else {
    console.warn("Received count record with unknown class. Only total_count will be incremented.", {
      mcuClass: rawMcuClass,
      mcuTimestamp,
      workshiftId: workshift.id,
    });
  }

  await dbPool.execute(
    `
      UPDATE workshift
      SET ${updateClauses.join(", ")}
      WHERE id = ?
    `,
    [workshift.id],
  );

  console.log("Persisted count record in workshift", {
    workshiftId: workshift.id,
    mcuClass: rawMcuClass,
    mcuTimestamp,
    updatedColumns: ["total_count", countColumn].filter(Boolean),
  });
}

async function writeConveyorBeltStatus(payload) {
  const rawMcuTimestamp = payload.timestamp;
  // Considera somente 1 registro de esteira. Com escala do sistema isso precisa ser refatorado
  const singletonConveyorBeltId = 1;
  const commandMapping = {
    START: "IN_PROGRESS",
    STOP: "ON_HOLD",
    EMERGENCY: "ON_FAILURE",
  }
  if (rawMcuTimestamp === null || rawMcuTimestamp === undefined) {
    throw new Error("Missing required field: timestamp");
  }
  //const mcuTimestamp = toMysqlDatetime(rawMcuTimestamp);
  const command = String(payload.command ?? "").trim().toUpperCase();
  const mappedCommand = commandMapping[command];

  if (!mappedCommand) {
    throw new Error(`Unsupported conveyor belt status: ${payload.command}`);
  }

  await dbPool.execute(
    `
      INSERT INTO conveyorbelt (
        id,
        state
      )
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE
        state = VALUES(state)
    `,
    [
      singletonConveyorBeltId,
      mappedCommand,
    ],
  );
  console.log("Persisted conveyor belt status record", {
    singletonConveyorBeltId,
    command,
    persistedState: mappedCommand,
    rawMcuTimestamp,
  });
}

async function writeConveyorBeltPhysicalStatus(payload) {
  const rawMcuTimestamp = payload.timestamp;
  const singletonConveyorBeltId = 1;
  if (rawMcuTimestamp === null || rawMcuTimestamp === undefined) {
    throw new Error("Missing required field: timestamp");
  }
  const physicalStatus = String(payload.status ?? "").trim().toUpperCase();
  const physicalState = String(payload.state ?? "").trim().toUpperCase();
  const mcuTimestamp = toMysqlDatetime(rawMcuTimestamp);

  if (physicalState === "NORMAL") {
    await dbPool.execute(
      `
        UPDATE conveyorbelt
        SET physical_status = ?
        WHERE id = ?
      `,
      [
        physicalStatus,
        singletonConveyorBeltId,
      ],
    );
    console.log("Persisted conveyor belt physical status update", {
      singletonConveyorBeltId,
      physicalStatus,
      rawMcuTimestamp,
    });
  } else if (physicalState === "EMERGENCY") {

    // get active workshift to associate the event with
    const [workshiftRows] = await dbPool.execute(
      `
        SELECT id, start_time, end_time
        FROM workshift
        WHERE ? BETWEEN start_time AND end_time
        ORDER BY start_time DESC
        LIMIT 1
      `,
      [mcuTimestamp],
    );    
    const workshiftId = workshiftRows.length > 0 ? workshiftRows[0].id : null;
    if (!workshiftId) {
      console.warn("No active workshift found for conveyor belt emergency event", {
        mcuTimestamp,
      });
      return;
    }

    await dbPool.execute(
      `
        INSERT INTO event (
          occurrence_time, 
          description, 
          code, 
          message, 
          severity, 
          status
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        mcuTimestamp,
        "Conveyor belt emergency button activated",
        1,
        "Emergency button pressed on conveyor belt",
        "HIGH",
        "ACTIVE"
      ]
    );
    console.log("Persisted Emergency event at ", {
      mcuTimestamp,
    }); 
  
    // insert into workshift/event association table
    await dbPool.execute(
      `
        INSERT INTO workshift_event (event_id, workshift_id)
        SELECT LAST_INSERT_ID(), ?
      `,
      [workshiftId],
    );
    console.log("Associated conveyor belt emergency event with active workshift", {
      singletonConveyorBeltId,
      mcuTimestamp,
      workshiftId,
    });
  }
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
  await dbPool.execute("SET time_zone = ?", [DB_TIME_ZONE]);
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
      console.log(`Received message from topic ${topic}`);
      if (topic === MQTT_SUB_CBELT) {
        console.log("Received CBELT status message from IHM", payload);
        await writeConveyorBeltStatus(payload);
      } else if (topic === MQTT_SUB_COUNT) {
        console.log("Received count message from EDGE", payload);
        await writeCountRecord(payload);
      } else if (topic === MQTT_PUB_CBELT_STATUS) {
        console.log("Received CBELT status update from EDGE", payload);
        await writeConveyorBeltPhysicalStatus(payload);
      } else {
        console.log(`Received message from topic ${topic}, storing in database...`);
        await writeMqttIngestLog(topic, payload);
      }
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
