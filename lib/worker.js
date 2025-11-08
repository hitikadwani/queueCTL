const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const JobQueue = require('./queue');
const path = require('path');
const fs = require('fs');

class Worker {
  constructor(workerId, dbPath = null, options = {}) {
    this.workerId = workerId;
    const defaultPath = process.env.QUEUE_DB || './queue.db';
    this.queue = new JobQueue(dbPath || defaultPath);
    this.running = false;
    this.currentJob = null;
    this.pollInterval = options.pollInterval || 1000; // 1 second
    this.timeout = null;
  }

  async start() {
    this.running = true;
    console.log(`[Worker ${this.workerId}] Started`);
    await this.processLoop();
  }

  async processLoop() {
    while (this.running) {
      try {
        const job = this.queue.dequeue(this.workerId);
        
        if (job) {
          this.currentJob = job;
          await this.processJob(job);
          this.currentJob = null;
        } else {
          // No jobs available, wait before polling again
          await this.sleep(this.pollInterval);
        }
      } catch (error) {
        console.error(`[Worker ${this.workerId}] Error in process loop:`, error.message);
        await this.sleep(this.pollInterval);
      }
    }
  }

  async processJob(job) {
    console.log(`[Worker ${this.workerId}] Processing job ${job.id}: ${job.command}`);
    
    try {
      // Execute the command
      const { stdout, stderr } = await execAsync(job.command, {
        timeout: 30000, // 30 second timeout
        maxBuffer: 1024 * 1024 // 1MB buffer
      });

      if (stdout) {
        console.log(`[Worker ${this.workerId}] Job ${job.id} stdout:`, stdout);
      }
      if (stderr) {
        console.error(`[Worker ${this.workerId}] Job ${job.id} stderr:`, stderr);
      }

      // Command executed successfully
      this.queue.completeJob(job.id);
      console.log(`[Worker ${this.workerId}] Job ${job.id} completed successfully`);
      
    } catch (error) {
      // Command failed
      const newAttempts = (job.attempts || 0) + 1;
      console.error(`[Worker ${this.workerId}] Job ${job.id} failed (attempt ${newAttempts}):`, error.message);
      
      const updatedJob = this.queue.failJob(job.id, newAttempts);
      
      if (updatedJob && updatedJob.state === 'dead') {
        console.log(`[Worker ${this.workerId}] Job ${job.id} moved to Dead Letter Queue`);
      } else if (updatedJob && updatedJob.next_retry_at) {
        const retryDate = new Date(updatedJob.next_retry_at);
        console.log(`[Worker ${this.workerId}] Job ${job.id} scheduled for retry at ${retryDate.toISOString()}`);
      }
    } finally {
      // Always unlock the job
      this.queue.unlockJob(job.id);
    }
  }

  async stop() {
    console.log(`[Worker ${this.workerId}] Stopping...`);
    this.running = false;
    
    // Wait for current job to finish
    if (this.currentJob) {
      console.log(`[Worker ${this.workerId}] Waiting for current job ${this.currentJob.id} to finish...`);
      while (this.currentJob) {
        await this.sleep(100);
      }
    }
    
    this.queue.close();
    console.log(`[Worker ${this.workerId}] Stopped`);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

class WorkerManager {
  constructor(dbPath = null) {
    this.workers = [];
    this.dbPath = dbPath || process.env.QUEUE_DB || './queue.db';
    this.pidFile = path.join(process.cwd(), '.workers.pid');
  }

  startWorkers(count = 1) {
    for (let i = 0; i < count; i++) {
      const workerId = `worker-${Date.now()}-${i}`;
      const worker = new Worker(workerId, this.dbPath);
      this.workers.push(worker);
      
      // Start worker in background
      worker.start().catch(err => {
        console.error(`[WorkerManager] Error in worker ${workerId}:`, err);
      });
    }
    
    // Save worker PIDs
    this.saveWorkerPids();
    console.log(`Started ${count} worker(s)`);
  }

  async stopWorkers() {
    console.log(`Stopping ${this.workers.length} worker(s)...`);
    const stopPromises = this.workers.map(worker => worker.stop());
    await Promise.all(stopPromises);
    this.workers = [];
    this.clearWorkerPids();
    console.log('All workers stopped');
  }

  saveWorkerPids() {
    const pids = this.workers.map((w, i) => ({
      id: w.workerId,
      pid: process.pid
    }));
    fs.writeFileSync(this.pidFile, JSON.stringify(pids, null, 2));
  }

  clearWorkerPids() {
    if (fs.existsSync(this.pidFile)) {
      fs.unlinkSync(this.pidFile);
    }
  }

  getWorkerCount() {
    return this.workers.length;
  }
}

module.exports = { Worker, WorkerManager };

