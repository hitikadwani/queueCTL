const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class JobDatabase {
  constructor(dbPath = './queue.db') {
    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (dir && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    this.db = new Database(dbPath);
    this.initSchema();
  }

  initSchema() {
    // Jobs table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        command TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        max_retries INTEGER NOT NULL DEFAULT 3,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        next_retry_at TEXT,
        locked_by TEXT,
        locked_at TEXT
      )
    `);

    // Configuration table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    // Initialize default config if not exists
    const configExists = this.db.prepare('SELECT COUNT(*) as count FROM config').get();
    if (configExists.count === 0) {
      this.db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run('max-retries', '3');
      this.db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run('backoff-base', '2');
    }
  }

  // Job operations
  createJob(job) {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO jobs (id, command, state, attempts, max_retries, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      job.id,
      job.command,
      job.state || 'pending',
      job.attempts || 0,
      job.max_retries || 3,
      now,
      now
    );
    return this.getJob(job.id);
  }

  getJob(id) {
    return this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
  }

  updateJobState(id, state, attempts = null) {
    const now = new Date().toISOString();
    if (attempts !== null) {
      this.db.prepare(`
        UPDATE jobs 
        SET state = ?, attempts = ?, updated_at = ?, next_retry_at = NULL, locked_by = NULL, locked_at = NULL
        WHERE id = ?
      `).run(state, attempts, now, id);
    } else {
      this.db.prepare(`
        UPDATE jobs 
        SET state = ?, updated_at = ?, next_retry_at = NULL, locked_by = NULL, locked_at = NULL
        WHERE id = ?
      `).run(state, now, id);
    }
    return this.getJob(id);
  }

  lockJob(id, workerId) {
    const now = new Date().toISOString();
    const result = this.db.prepare(`
      UPDATE jobs 
      SET state = 'processing', locked_by = ?, locked_at = ?
      WHERE id = ? AND state = 'pending' AND (locked_by IS NULL OR locked_by = '')
    `).run(workerId, now, id);
    return result.changes > 0;
  }

  unlockJob(id) {
    this.db.prepare(`
      UPDATE jobs 
      SET locked_by = NULL, locked_at = NULL
      WHERE id = ?
    `).run(id);
  }

  getPendingJobs(limit = 1) {
    const now = new Date().toISOString();
    // First, move failed jobs that are ready for retry back to pending
    this.db.prepare(`
      UPDATE jobs 
      SET state = 'pending', next_retry_at = NULL
      WHERE state = 'failed' AND next_retry_at <= ?
    `).run(now);
    
    // Then get pending jobs
    return this.db.prepare(`
      SELECT * FROM jobs 
      WHERE state = 'pending' 
        AND (locked_by IS NULL OR locked_by = '')
      ORDER BY created_at ASC
      LIMIT ?
    `).all(limit);
  }

  getJobsByState(state) {
    return this.db.prepare('SELECT * FROM jobs WHERE state = ? ORDER BY created_at DESC').all(state);
  }

  getAllJobs() {
    return this.db.prepare('SELECT * FROM jobs ORDER BY created_at DESC').all();
  }

  scheduleRetry(id, delaySeconds, attempts) {
    const nextRetry = new Date(Date.now() + delaySeconds * 1000).toISOString();
    this.db.prepare(`
      UPDATE jobs 
      SET state = 'failed', attempts = ?, next_retry_at = ?, updated_at = ?
      WHERE id = ?
    `).run(attempts, nextRetry, new Date().toISOString(), id);
  }

  moveToDLQ(id, attempts) {
    this.updateJobState(id, 'dead', attempts);
  }

  retryFromDLQ(id) {
    const job = this.getJob(id);
    if (job && job.state === 'dead') {
      this.db.prepare(`
        UPDATE jobs 
        SET state = 'pending', attempts = 0, updated_at = ?, next_retry_at = NULL
        WHERE id = ?
      `).run(new Date().toISOString(), id);
      return this.getJob(id);
    }
    return null;
  }

  getStats() {
    const stats = this.db.prepare(`
      SELECT 
        state,
        COUNT(*) as count
      FROM jobs
      GROUP BY state
    `).all();
    
    const result = {};
    stats.forEach(stat => {
      result[stat.state] = stat.count;
    });
    
    return result;
  }

  // Configuration operations
  getConfig(key) {
    const result = this.db.prepare('SELECT value FROM config WHERE key = ?').get(key);
    return result ? result.value : null;
  }

  setConfig(key, value) {
    this.db.prepare(`
      INSERT INTO config (key, value) 
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = ?
    `).run(key, value, value);
  }

  getAllConfig() {
    const results = this.db.prepare('SELECT key, value FROM config').all();
    const config = {};
    results.forEach(row => {
      config[row.key] = row.value;
    });
    return config;
  }

  close() {
    this.db.close();
  }
}

module.exports = JobDatabase;

