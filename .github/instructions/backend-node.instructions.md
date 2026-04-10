---
description: "Use when editing Node.js backend code in this repository, including MQTT ingestion and MariaDB persistence flows."
applyTo: "mqtt-ingestor/**/*.js"
---
Follow these backend standards:

- Keep modules focused and composable.
- Validate all external input before persistence.
- Prefer explicit errors with context for logs.
- Keep environment variables centralized at startup.
- Use parameterized SQL queries only.
- Do not hardcode hostnames or credentials outside fallback defaults.
- Preserve Docker-first execution (service must run in compose).
