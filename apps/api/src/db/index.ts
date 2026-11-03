/** Importing this module does not open a database connection. */

export { connectDatabase } from "./connection.ts";
export type { ConnectedDatabase } from "./connection.ts";
export { unconfiguredDatabase } from "./handle.ts";
export type { DatabaseCheck, DatabaseHandle } from "./handle.ts";
export type { PersistenceStore } from "./repositories.ts";
