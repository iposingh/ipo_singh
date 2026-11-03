import { argon2, randomBytes, timingSafeEqual } from "node:crypto";

export type PasswordHasher = {
  hash(password: string): Promise<string>;
  verify(password: string, encoded: string): Promise<boolean>;
};

/** OWASP Argon2id baseline: 19 MiB, 2 passes, 1 lane. */
const memoryKib = 19_456;
const passes = 2;
const parallelism = 1;
const tagLength = 32;
const saltLength = 16;
const maxMemoryKib = 65_536;
const maxPasses = 4;

type ArgonParameters = {
  message: string;
  nonce: Buffer;
  parallelism: number;
  memory: number;
  passes: number;
  tagLength: number;
};

function runArgon2(parameters: ArgonParameters): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2("argon2id", parameters, (error, tag) => {
      if (error) reject(error);
      else resolve(tag);
    });
  });
}

function encode(nonce: Buffer, tag: Buffer): string {
  return `argon2id$m=${memoryKib},t=${passes},p=${parallelism}$${nonce.toString("base64url")}$${tag.toString("base64url")}`;
}

function decode(encoded: string): { nonce: Buffer; tag: Buffer; memory: number; passes: number; parallelism: number } | null {
  const parts = encoded.split("$");
  if (parts.length !== 4 || parts[0] !== "argon2id") return null;
  const settings = /^m=(\d+),t=(\d+),p=(\d+)$/.exec(parts[1] ?? "");
  if (!settings) return null;
  const memory = Number(settings[1]);
  const time = Number(settings[2]);
  const lanes = Number(settings[3]);
  if (memory < 8 || memory > maxMemoryKib || time < 1 || time > maxPasses || lanes !== 1) return null;
  try {
    const nonce = Buffer.from(parts[2] ?? "", "base64url");
    const tag = Buffer.from(parts[3] ?? "", "base64url");
    if (nonce.length < 8 || nonce.length > 64 || tag.length < 16 || tag.length > 64) return null;
    return { nonce, tag, memory, passes: time, parallelism: lanes };
  } catch {
    return null;
  }
}

export function createArgon2Hasher(): PasswordHasher {
  return {
    async hash(password) {
      const nonce = randomBytes(saltLength);
      const tag = await runArgon2({ message: password, nonce, parallelism, memory: memoryKib, passes, tagLength });
      return encode(nonce, tag);
    },
    async verify(password, encoded) {
      const stored = decode(encoded);
      if (!stored) return false;
      const tag = await runArgon2({
        message: password,
        nonce: stored.nonce,
        parallelism: stored.parallelism,
        memory: stored.memory,
        passes: stored.passes,
        tagLength: stored.tag.length,
      });
      if (tag.length !== stored.tag.length) return false;
      return timingSafeEqual(tag, stored.tag);
    },
  };
}

/** Test double. Production routes use Argon2id. */
export function createFastPasswordHasher(): PasswordHasher {
  return {
    async hash(password) {
      return `fast$${Buffer.from(password).toString("base64url")}`;
    },
    async verify(password, encoded) {
      const expected = `fast$${Buffer.from(password).toString("base64url")}`;
      const left = Buffer.from(expected);
      const right = Buffer.from(encoded);
      if (left.length !== right.length) return false;
      return timingSafeEqual(left, right);
    },
  };
}
