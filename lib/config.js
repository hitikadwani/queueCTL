const JobDatabase = require('./database');

class ConfigManager {
  constructor(dbPath = null) {
    const defaultPath = process.env.QUEUE_DB || './queue.db';
    this.db = new JobDatabase(dbPath || defaultPath);
  }

  get(key) {
    return this.db.getConfig(key);
  }

  set(key, value) {
    // Validate key
    const validKeys = ['max-retries', 'backoff-base'];
    if (!validKeys.includes(key)) {
      throw new Error(`Invalid config key. Valid keys: ${validKeys.join(', ')}`);
    }

    // Validate value
    if (key === 'max-retries') {
      const num = parseInt(value);
      if (isNaN(num) || num < 0) {
        throw new Error('max-retries must be a non-negative integer');
      }
      value = num.toString();
    } else if (key === 'backoff-base') {
      const num = parseFloat(value);
      if (isNaN(num) || num <= 0) {
        throw new Error('backoff-base must be a positive number');
      }
      value = num.toString();
    }

    this.db.setConfig(key, value);
    return this.get(key);
  }

  getAll() {
    return this.db.getAllConfig();
  }

  close() {
    this.db.close();
  }
}

module.exports = ConfigManager;

