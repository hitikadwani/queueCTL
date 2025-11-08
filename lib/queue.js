const JobDatabase = require('./database');

class JobQueue {
  constructor(dbPath = null) {
    const defaultPath = process.env.QUEUE_DB || './queue.db';
    this.db = new JobDatabase(dbPath || defaultPath);
  }

  enqueue(jobData) {
    // Validate required fields
    if (!jobData.id || !jobData.command) {
      throw new Error('Job must have id and command fields');
    }

    // Check if job already exists
    const existing = this.db.getJob(jobData.id);
    if (existing) {
      throw new Error(`Job with id ${jobData.id} already exists`);
    }

    // Get default max_retries from config if not provided
    const maxRetries = jobData.max_retries || parseInt(this.db.getConfig('max-retries') || '3');

    const job = {
      id: jobData.id,
      command: jobData.command,
      state: 'pending',
      attempts: 0,
      max_retries: maxRetries
    };

    return this.db.createJob(job);
  }

  dequeue(workerId) {
    const jobs = this.db.getPendingJobs(1);
    if (jobs.length === 0) {
      return null;
    }

    const job = jobs[0];
    const locked = this.db.lockJob(job.id, workerId);
    
    if (locked) {
      return this.db.getJob(job.id);
    }
    
    return null;
  }

  completeJob(jobId) {
    return this.db.updateJobState(jobId, 'completed');
  }

  failJob(jobId, attempts) {
    const job = this.db.getJob(jobId);
    if (!job) {
      return null;
    }

    const maxRetries = job.max_retries || parseInt(this.db.getConfig('max-retries') || '3');
    
    if (attempts >= maxRetries) {
      // Move to DLQ
      this.db.moveToDLQ(jobId, attempts);
      return this.db.getJob(jobId);
    } else {
      // Schedule retry with exponential backoff
      const backoffBase = parseFloat(this.db.getConfig('backoff-base') || '2');
      const delay = Math.pow(backoffBase, attempts);
      this.db.scheduleRetry(jobId, delay, attempts);
      return this.db.getJob(jobId);
    }
  }

  unlockJob(jobId) {
    this.db.unlockJob(jobId);
  }

  getJobsByState(state) {
    return this.db.getJobsByState(state);
  }

  getAllJobs() {
    return this.db.getAllJobs();
  }

  getStats() {
    return this.db.getStats();
  }

  retryFromDLQ(jobId) {
    return this.db.retryFromDLQ(jobId);
  }

  getDLQJobs() {
    return this.db.getJobsByState('dead');
  }

  close() {
    this.db.close();
  }
}

module.exports = JobQueue;

