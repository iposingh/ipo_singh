const sensitiveKey =
  /(?:^|_)(?:authorization|proxy_authorization|cookie|set_cookie|password|passwd|secret|token|access_token|refresh_token|api_key|apikey|x_api_key|mongodb_uri|mongo_uri|connection_string|redis_url|sync_token|ops_token|pan|application_number|application_no|applicant|demat|client_id|dp_id)(?:$|_)/i;

const maxDepth = 8;

export function redactString(value: string): string {
  return value
    .replace(/mongodb(?:\+srv)?:\/\/\S+/gi, "mongodb://[redacted]")
    .replace(/rediss?:\/\/\S+/gi, "redis://[redacted]")
    .replace(/Expo(?:nent)?PushToken\[[^\]]+\]/g, "ExponentPushToken[redacted]")
    .replace(/\b(bearer|basic)\s+[a-z0-9\-._~+/]+=*/gi, "$1 [redacted]")
    .replace(/\b(api[_-]?key|token|password|secret)\b\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/g, "[redacted]");
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/-/g, "_");
  return sensitiveKey.test(normalized) || /secret|token|password|authorization|api[_-]?key|\bpan\b|application(?:number|no)|applicant|demat|clientid|dpid/i.test(key);
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > maxDepth) return "[truncated]";
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (typeof value === "object" && value !== null) {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = isSensitiveKey(key) ? "[redacted]" : redact(item, depth + 1);
    }
    return output;
  }
  return value;
}
