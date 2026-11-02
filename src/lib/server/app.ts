import { config } from './config.ts';
import { openDb, type Db } from './db.ts';

let db: Db | null = null;

/** The one database for the running server, opened on first use. */
export function getDb(): Db {
	db ??= openDb(config.dataDir);
	return db;
}
