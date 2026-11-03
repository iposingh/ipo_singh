import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import type { TLSSocket } from "node:tls";

const maxBodyBytes = 2_000_000;
const allowedQuery = new Set(["type", "status", "search", "months", "limit", "days"]);

/** Documented GET parameters only. An API key in the query string is refused. */
export function vendorRequestPath(url: URL): string | null {
  if (url.searchParams.has("api_key")) return null;
  for (const key of url.searchParams.keys()) {
    if (!allowedQuery.has(key)) return null;
  }
  return `${url.pathname}${url.search}`;
}

export class IpoGuruTransportError extends Error {
  readonly reason: "connect_timeout" | "response_timeout" | "network" | "redirect" | "too_large";

  constructor(reason: IpoGuruTransportError["reason"]) {
    super("IPO Guru request failed");
    this.name = "IpoGuruTransportError";
    this.reason = reason;
  }
}

export type IpoGuruTransportRequest = {
  url: string;
  hostname: string;
  headers: Readonly<Record<string, string>>;
  connectTimeoutMs: number;
  responseTimeoutMs: number;
};

export type IpoGuruTransportResponse = {
  status: number;
  headers: Readonly<Record<string, string>>;
  body: string;
};

export type IpoGuruTransport = (request: IpoGuruTransportRequest) => Promise<IpoGuruTransportResponse>;

export function createHttpsTransport(options?: { rejectUnauthorized?: boolean }): IpoGuruTransport {
  const rejectUnauthorized = options?.rejectUnauthorized !== false;
  return (input) =>
    new Promise((resolve, reject) => {
      let url: URL;
      try {
        url = new URL(input.url);
      } catch {
        reject(new IpoGuruTransportError("network"));
        return;
      }
      const requestPath = vendorRequestPath(url);
      if (
        url.protocol !== "https:" ||
        url.hostname !== input.hostname ||
        url.username !== "" ||
        url.password !== "" ||
        url.hash !== "" ||
        !requestPath
      ) {
        reject(new IpoGuruTransportError("network"));
        return;
      }

      let settled = false;
      let phase: "connect" | "response" = "connect";
      let timer: NodeJS.Timeout | undefined;
      const req = httpsRequest(
        {
          protocol: "https:",
          hostname: url.hostname,
          port: url.port === "" ? 443 : Number(url.port),
          path: requestPath,
          method: "GET",
          headers: input.headers,
          rejectUnauthorized,
          ...(isIP(url.hostname) === 0 ? { servername: url.hostname } : {}),
        },
        (response) => {
          if (settled) {
            response.resume();
            return;
          }
          const status = response.statusCode ?? 0;
          if (status >= 300 && status < 400) {
            response.resume();
            fail(new IpoGuruTransportError("redirect"));
            return;
          }
          phase = "response";
          arm(input.responseTimeoutMs);
          const chunks: Buffer[] = [];
          let size = 0;
          response.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > maxBodyBytes) {
              fail(new IpoGuruTransportError("too_large"));
              return;
            }
            chunks.push(chunk);
          });
          response.on("aborted", () => fail(new IpoGuruTransportError("network")));
          response.on("error", () => fail(new IpoGuruTransportError("network")));
          response.on("end", () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            const headers: Record<string, string> = {};
            for (const [name, value] of Object.entries(response.headers)) {
              if (typeof value === "string") headers[name.toLowerCase()] = value;
              else if (Array.isArray(value) && typeof value[0] === "string") headers[name.toLowerCase()] = value[0];
            }
            resolve({ status, headers, body: Buffer.concat(chunks).toString("utf8") });
          });
        },
      );

      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        req.destroy();
        reject(error);
      };

      const arm = (ms: number) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          fail(new IpoGuruTransportError(phase === "connect" ? "connect_timeout" : "response_timeout"));
        }, ms);
      };

      arm(input.connectTimeoutMs);
      req.on("socket", (socket) => {
        const connected = () => {
          if (settled || phase !== "connect") return;
          phase = "response";
          arm(input.responseTimeoutMs);
        };
        const tls = socket as TLSSocket;
        if (typeof tls.encrypted === "boolean" && tls.authorized) connected();
        else socket.once("secureConnect", connected);
      });
      req.on("error", () => fail(new IpoGuruTransportError("network")));
      req.end();
    });
}
