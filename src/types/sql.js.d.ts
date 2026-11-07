declare module 'sql.js' {
  export type SqlValue = string | number | null | Uint8Array;
  export interface QueryResult { columns: string[]; values: SqlValue[][] }
  export interface Statement {
    bind(values?: SqlValue[] | Record<string, SqlValue>): boolean;
    step(): boolean;
    getAsObject(): Record<string, SqlValue>;
    free(): boolean;
  }
  export class Database {
    constructor(data?: Uint8Array);
    run(sql: string, params?: SqlValue[] | Record<string, SqlValue>): Database;
    exec(sql: string, params?: SqlValue[] | Record<string, SqlValue>): QueryResult[];
    prepare(sql: string, params?: SqlValue[] | Record<string, SqlValue>): Statement;
    export(): Uint8Array;
    close(): void;
  }
  export interface SqlJsStatic { Database: typeof Database }
  export interface SqlJsConfig { locateFile?: (file: string) => string }
  export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>;
}
