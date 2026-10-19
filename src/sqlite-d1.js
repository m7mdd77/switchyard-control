import { DatabaseSync } from "node:sqlite";
export class SqliteD1 {
  constructor(path) {
    this.db = new DatabaseSync(path);
  }
  prepare(sql) {
    const db = this.db;
    return {
      bind(...args) {
        return {
          async first() {
            return db.prepare(sql).get(...args) || null;
          },
          async run() {
            const r = db.prepare(sql).run(...args);
            return { success: true, meta: { changes: Number(r.changes) } };
          },
          async all() {
            return { results: db.prepare(sql).all(...args) };
          },
        };
      },
      async first() {
        return db.prepare(sql).get() || null;
      },
      async all() {
        return { results: db.prepare(sql).all() };
      },
      async run() {
        const r = db.prepare(sql).run();
        return { success: true, meta: { changes: Number(r.changes) } };
      },
    };
  }
  exec(sql) {
    this.db.exec(sql);
  }
  close() {
    this.db.close();
  }
}
