import { redact } from "./redact.ts";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

export type LogSink = (line: string) => void;

export type Logger = {
  debug: (message: string, fields?: LogFields) => void;
  info: (message: string, fields?: LogFields) => void;
  warn: (message: string, fields?: LogFields) => void;
  error: (message: string, fields?: LogFields) => void;
};

const rank: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function writeLine(level: LogLevel, line: string, sink: LogSink | undefined): void {
  if (sink) {
    sink(line);
    return;
  }
  const stream = level === "warn" || level === "error" ? process.stderr : process.stdout;
  stream.write(`${line}\n`);
}

export function createLogger(options: { level: LogLevel; service: string; sink?: LogSink }): Logger {
  const log = (level: LogLevel, message: string, fields?: LogFields): void => {
    if (rank[level] < rank[options.level]) return;
    const entry = redact({
      time: new Date().toISOString(),
      level,
      service: options.service,
      message,
      ...fields,
    });
    let line: string;
    try {
      line = JSON.stringify(entry);
    } catch {
      line = JSON.stringify({
        level: "error",
        service: options.service,
        message: "Log entry could not be serialized",
      });
    }
    writeLine(level, line, options.sink);
  };

  return {
    debug: (message, fields) => log("debug", message, fields),
    info: (message, fields) => log("info", message, fields),
    warn: (message, fields) => log("warn", message, fields),
    error: (message, fields) => log("error", message, fields),
  };
}
