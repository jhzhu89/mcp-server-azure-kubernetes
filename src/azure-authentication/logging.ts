import { pino } from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport:
    process.env.NODE_ENV === "development"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname",
          },
        }
      : undefined,
});

export const jwtLogger = logger.child({ component: "jwt" });
export const clientLogger = logger.child({ component: "client" });
export const credentialLogger = logger.child({ component: "credential" });
export const configLogger = logger.child({ component: "config" });
