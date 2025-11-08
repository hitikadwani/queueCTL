#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const JobQueue = require('../lib/queue');
const { WorkerManager } = require('../lib/worker');
const ConfigManager = require('../lib/config');
const path = require('path');
const fs = require('fs');

const program = new Command();

program
  .name('queuectl')
  .description('A minimal, production-grade job queue system')
  .version('1.0.0');

// Helper function to parse JSON with Windows-friendly handling
function parseJobJson(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('Job JSON is required');
  }
  
  let jsonStr = input.trim();
  
  // Remove outer quotes if present (Windows CMD might add them)
  if ((jsonStr.startsWith('"') && jsonStr.endsWith('"')) || 
      (jsonStr.startsWith("'") && jsonStr.endsWith("'"))) {
    jsonStr = jsonStr.slice(1, -1);
  }
  
  // Try direct parse
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    // If parsing fails, try to fix common Windows CMD issues
    // Windows CMD might strip quotes, so we need to reconstruct them
    
    // Pattern: {id:value,key:value} -> {"id":"value","key":"value"}
    // This handles Windows CMD stripping all quotes
    if (jsonStr.includes(':') && !jsonStr.match(/"[^"]*":/)) {
      try {
        // Match pattern: key:value or key:"value" or key:'value'
        const fixed = jsonStr
          .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*([^,}]+?)(\s*[,}])/g, (match, prefix, key, value, suffix) => {
            value = value.trim();
            // If value doesn't already have quotes, add them
            if (!value.startsWith('"') && !value.startsWith("'")) {
              value = `"${value}"`;
            } else if (value.startsWith("'") && value.endsWith("'")) {
              // Convert single quotes to double quotes
              value = `"${value.slice(1, -1)}"`;
            }
            return `${prefix}"${key}":${value}${suffix}`;
          });
        return JSON.parse(fixed);
      } catch (e2) {
        // If that didn't work, try a simpler approach
        try {
          // Very simple: {id:job1,command:echo hello} -> {"id":"job1","command":"echo hello"}
          let content = jsonStr;
          if (content.startsWith('{') && content.endsWith('}')) {
            content = content.slice(1, -1); // Remove outer braces
          }
          const simple = '{' + content
            .split(',')
            .map(pair => {
              const [key, ...valueParts] = pair.split(':');
              const value = valueParts.join(':').trim();
              return `"${key.trim()}":"${value}"`;
            })
            .join(',') + '}';
          return JSON.parse(simple);
        } catch (e3) {}
      }
    }
    
    // If still failing, show the original error
    throw new Error(`Invalid JSON: ${e.message}. Input: ${jsonStr.substring(0, 50)}...`);
  }
}

// Enqueue command - simplified
program
  .command('enqueue')
  .description('Add a new job to the queue')
  .argument('<job-json>', 'Job JSON string')
  .action((jobJson) => {
    try {
      const jobData = parseJobJson(jobJson);
      const queue = new JobQueue();
      const job = queue.enqueue(jobData);
      console.log(chalk.green('✓ Job enqueued:'), job.id, '-', job.command);
      queue.close();
    } catch (error) {
      console.error(chalk.red('✗ Error:'), error.message);
      if (process.platform === 'win32') {
        console.error(chalk.yellow('  Windows CMD: Use double quotes: node bin/queuectl.js enqueue "{\\"id\\":\\"job1\\",\\"command\\":\\"echo hello\\"}"'));
        console.error(chalk.yellow('  PowerShell: Use single quotes: node bin/queuectl.js enqueue \'{"id":"job1","command":"echo hello"}\''));
      }
      process.exit(1);
    }
  });

// Worker commands
const workerCmd = program
  .command('worker')
  .description('Manage worker processes');

workerCmd
  .command('start')
  .description('Start one or more workers')
  .option('-c, --count <number>', 'Number of workers to start', '1')
  .action((options) => {
    const count = parseInt(options.count);
    if (isNaN(count) || count < 1) {
      console.error(chalk.red('✗ Error: Count must be a positive integer'));
      process.exit(1);
    }

    const manager = new WorkerManager();
    manager.startWorkers(count);

    // Keep process alive
    process.on('SIGINT', async () => {
      await manager.stopWorkers();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await manager.stopWorkers();
      process.exit(0);
    });
  });

workerCmd
  .command('stop')
  .description('Stop running workers gracefully')
  .action(() => {
    const pidFile = path.join(process.cwd(), '.workers.pid');
    if (!fs.existsSync(pidFile)) {
      console.log(chalk.yellow('No running workers found'));
      return;
    }

    try {
      const pids = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
      console.log(chalk.yellow('Note: Workers should be stopped using Ctrl+C in the terminal where they were started'));
      console.log('Worker IDs:', pids.map(p => p.id).join(', '));
    } catch (error) {
      console.error(chalk.red('✗ Error reading worker info:'), error.message);
    }
  });

// Status command
program
  .command('status')
  .description('Show summary of all job states & active workers')
  .action(() => {
    try {
      const queue = new JobQueue();
      const stats = queue.getStats();
      const allJobs = queue.getAllJobs();
      
      console.log(chalk.bold('\n📊 Queue Status\n'));
      console.log('Job States:');
      const states = ['pending', 'processing', 'completed', 'failed', 'dead'];
      states.forEach(state => {
        const count = stats[state] || 0;
        const color = state === 'completed' ? chalk.green : 
                     state === 'dead' ? chalk.red :
                     state === 'processing' ? chalk.yellow : chalk.blue;
        console.log(`  ${color(state.padEnd(12))}: ${count}`);
      });
      
      console.log(`\nTotal Jobs: ${allJobs.length}`);
      
      // Check for active workers
      const pidFile = path.join(process.cwd(), '.workers.pid');
      if (fs.existsSync(pidFile)) {
        try {
          const pids = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
          console.log(`\nActive Workers: ${pids.length}`);
          pids.forEach(p => {
            console.log(`  - ${p.id}`);
          });
        } catch (e) {
          // Ignore
        }
      } else {
        console.log('\nActive Workers: 0');
      }
      
      queue.close();
    } catch (error) {
      console.error(chalk.red('✗ Error:'), error.message);
      process.exit(1);
    }
  });

// List command
program
  .command('list')
  .description('List jobs by state')
  .option('-s, --state <state>', 'Filter by state (pending, processing, completed, failed, dead)', 'all')
  .action((options) => {
    try {
      const queue = new JobQueue();
      let jobs;
      
      if (options.state === 'all') {
        jobs = queue.getAllJobs();
      } else {
        jobs = queue.getJobsByState(options.state);
      }
      
      if (jobs.length === 0) {
        console.log(chalk.yellow(`No jobs found${options.state !== 'all' ? ` with state '${options.state}'` : ''}`));
      } else {
        console.log(chalk.bold(`\n📋 Jobs${options.state !== 'all' ? ` (${options.state})` : ''}\n`));
        jobs.forEach(job => {
          const stateColor = job.state === 'completed' ? chalk.green : 
                           job.state === 'dead' ? chalk.red :
                           job.state === 'processing' ? chalk.yellow : chalk.blue;
          console.log(`${stateColor(job.state.padEnd(12))} | ${job.id} | ${job.command}`);
          console.log(`  Attempts: ${job.attempts}/${job.max_retries} | Created: ${job.created_at}`);
          if (job.next_retry_at) {
            console.log(`  Next retry: ${job.next_retry_at}`);
          }
        });
      }
      
      queue.close();
    } catch (error) {
      console.error(chalk.red('✗ Error:'), error.message);
      process.exit(1);
    }
  });

// DLQ commands
const dlqCmd = program
  .command('dlq')
  .description('Dead Letter Queue operations');

dlqCmd
  .command('list')
  .description('View jobs in Dead Letter Queue')
  .action(() => {
    try {
      const queue = new JobQueue();
      const dlqJobs = queue.getDLQJobs();
      
      if (dlqJobs.length === 0) {
        console.log(chalk.yellow('No jobs in Dead Letter Queue'));
      } else {
        console.log(chalk.bold('\n💀 Dead Letter Queue\n'));
        dlqJobs.forEach(job => {
          console.log(chalk.red(`  ${job.id} | ${job.command}`));
          console.log(`    Attempts: ${job.attempts}/${job.max_retries} | Created: ${job.created_at}`);
        });
      }
      
      queue.close();
    } catch (error) {
      console.error(chalk.red('✗ Error:'), error.message);
      process.exit(1);
    }
  });

dlqCmd
  .command('retry')
  .description('Retry a job from Dead Letter Queue')
  .argument('<job-id>', 'Job ID to retry')
  .action((jobId) => {
    try {
      const queue = new JobQueue();
      const job = queue.retryFromDLQ(jobId);
      
      if (job) {
        console.log(chalk.green(`✓ Job ${jobId} moved back to pending queue`));
        console.log(JSON.stringify(job, null, 2));
      } else {
        console.error(chalk.red(`✗ Job ${jobId} not found in Dead Letter Queue`));
        process.exit(1);
      }
      
      queue.close();
    } catch (error) {
      console.error(chalk.red('✗ Error:'), error.message);
      process.exit(1);
    }
  });

// Config commands
const configCmd = program
  .command('config')
  .description('Manage configuration');

configCmd
  .command('set')
  .description('Set a configuration value')
  .argument('<key>', 'Config key (max-retries, backoff-base)')
  .argument('<value>', 'Config value')
  .action((key, value) => {
    try {
      const config = new ConfigManager();
      const oldValue = config.get(key);
      const newValue = config.set(key, value);
      console.log(chalk.green(`✓ Config updated: ${key} = ${newValue} (was: ${oldValue || 'not set'})`));
      config.close();
    } catch (error) {
      console.error(chalk.red('✗ Error:'), error.message);
      process.exit(1);
    }
  });

configCmd
  .command('get')
  .description('Get a configuration value')
  .argument('<key>', 'Config key')
  .action((key) => {
    try {
      const config = new ConfigManager();
      const value = config.get(key);
      if (value) {
        console.log(`${key} = ${value}`);
      } else {
        console.log(chalk.yellow(`Config key '${key}' not found`));
      }
      config.close();
    } catch (error) {
      console.error(chalk.red('✗ Error:'), error.message);
      process.exit(1);
    }
  });

configCmd
  .command('list')
  .description('List all configuration values')
  .action(() => {
    try {
      const config = new ConfigManager();
      const allConfig = config.getAll();
      console.log(chalk.bold('\n⚙️  Configuration\n'));
      Object.entries(allConfig).forEach(([key, value]) => {
        console.log(`  ${key} = ${value}`);
      });
      config.close();
    } catch (error) {
      console.error(chalk.red('✗ Error:'), error.message);
      process.exit(1);
    }
  });

program.parse();

