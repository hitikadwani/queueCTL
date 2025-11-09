# 🚀 QueueCtl - Job Queue System

A minimal, production-grade job queue system built with Node.js that supports background job processing, automatic retries with exponential backoff, and a Dead Letter Queue (DLQ).

## ✨ Features

- ✅ **Job Management**: Enqueue, process, and track jobs through their lifecycle
- ✅ **Multiple Workers**: Run multiple worker processes in parallel
- ✅ **Automatic Retries**: Failed jobs retry automatically with exponential backoff
- ✅ **Dead Letter Queue**: Jobs that exhaust retries are moved to DLQ
- ✅ **Persistent Storage**: SQLite database ensures jobs survive restarts
- ✅ **CLI Interface**: Full-featured command-line interface
- ✅ **Configuration Management**: Customize retry count and backoff behavior
- ✅ **Job Locking**: Prevents duplicate processing across workers

## 📦 Installation

```bash
npm install
```

**Note for Unix/Linux/Mac users:** To make `queuectl` directly executable, you can create a symlink or add it to your PATH:

```bash
# Option 1: Create a symlink
ln -s $(pwd)/bin/queuectl.js /usr/local/bin/queuectl
chmod +x bin/queuectl.js

# Option 2: Use npm link (if package.json bin is configured)
npm link
```

For Windows or if you prefer, you can always run commands with:
```bash
node bin/queuectl.js <command>
```

## 🚀 Quick Start

### 1. Enqueue a Job

**On Windows CMD:**
```cmd
node bin/queuectl.js enqueue "{\"id\":\"job1\",\"command\":\"echo Hello World\"}"
```

**On Windows PowerShell:**
```powershell
node bin/queuectl.js enqueue '{"id":"job1","command":"echo Hello World"}'
```

**On Unix/Linux/Mac:**
```bash
node bin/queuectl.js enqueue '{"id":"job1","command":"echo Hello World"}'
```

### 2. Start Workers

```bash
node bin/queuectl.js worker start --count 3
```

### 3. Check Status

```bash
node bin/queuectl.js status
```

### 4. List Jobs

```bash
node bin/queuectl.js list --state pending
```

## 📋 CLI Commands

### Enqueue Jobs

**Windows CMD:**
```cmd
node bin/queuectl.js enqueue "{\"id\":\"job1\",\"command\":\"sleep 2\"}"
node bin/queuectl.js enqueue "{\"id\":\"job2\",\"command\":\"echo hello\",\"max_retries\":5}"
```

**Windows PowerShell / Unix/Linux/Mac:**
```bash
node bin/queuectl.js enqueue '{"id":"job1","command":"sleep 2"}'
node bin/queuectl.js enqueue '{"id":"job2","command":"echo hello","max_retries":5}'
```

**Job JSON Format:**
```json
{
  "id": "unique-job-id",
  "command": "command to execute",
  "max_retries": 3  // optional, defaults to config value
}
```

### Worker Management

```bash
# Start 3 workers
queuectl worker start --count 3

# Stop workers (use Ctrl+C in the terminal where workers are running)
queuectl worker stop
```

### Status & Listing

```bash
# Show queue status summary
queuectl status

# List all jobs
queuectl list

# List jobs by state
queuectl list --state pending
queuectl list --state completed
queuectl list --state failed
queuectl list --state dead
```

### Dead Letter Queue (DLQ)

```bash
# List all jobs in DLQ
queuectl dlq list

# Retry a job from DLQ
queuectl dlq retry job-id
```

### Configuration

```bash
# Set max retries
queuectl config set max-retries 5

# Set backoff base (for exponential backoff: delay = base^attempts)
queuectl config set backoff-base 2

# Get a config value
queuectl config get max-retries

# List all config
queuectl config list
```

## 🔄 Job Lifecycle

Jobs progress through the following states:

1. **`pending`** - Waiting to be picked up by a worker
2. **`processing`** - Currently being executed by a worker
3. **`completed`** - Successfully executed
4. **`failed`** - Failed, but retryable (will retry with backoff)
5. **`dead`** - Permanently failed (moved to DLQ after exhausting retries)

## ⚙️ How It Works

### Job Execution

- Workers poll the database for pending jobs
- Jobs are locked when picked up by a worker to prevent duplicate processing
- Commands are executed using Node.js `child_process.exec()`
- Exit codes determine success (0) or failure (non-zero)

### Retry Mechanism

- Failed jobs automatically retry with exponential backoff
- Delay formula: `delay = backoff-base ^ attempts` seconds
- Example with `backoff-base=2`:
  - Attempt 1: 2 seconds
  - Attempt 2: 4 seconds
  - Attempt 3: 8 seconds

### Dead Letter Queue

- Jobs that fail after `max_retries` attempts are moved to DLQ
- DLQ jobs can be manually retried using `queuectl dlq retry <job-id>`
- Retrying from DLQ resets the attempt counter

### Persistence

- All job data is stored in SQLite database (`queue.db` by default)
- Jobs persist across restarts
- Configuration is also stored in the database

## 🧪 Testing

Run the test suite:

```bash
npm test
```

The test script validates:
- Job enqueueing
- Status checking
- Job listing
- Worker processing
- Configuration management
- DLQ operations

## 📁 Project Structure

```
.
├── bin/
│   └── queuectl.js      # CLI entry point
├── lib/
│   ├── database.js      # SQLite database operations
│   ├── queue.js         # Queue management logic
│   ├── worker.js         # Worker process implementation
│   └── config.js        # Configuration management
├── test/
│   └── test.js          # Test suite
├── package.json
└── README.md
```

## 🔧 Configuration

Default configuration values:
- `max-retries`: 3
- `backoff-base`: 2

These can be changed using the `config` commands and apply to all new jobs (unless explicitly set in job JSON).

## 💡 Example Usage

### Basic Workflow

**Windows CMD:**
```cmd
REM 1. Enqueue some jobs
node bin/queuectl.js enqueue "{\"id\":\"job1\",\"command\":\"echo hello\"}"
node bin/queuectl.js enqueue "{\"id\":\"job2\",\"command\":\"sleep 1\"}"
node bin/queuectl.js enqueue "{\"id\":\"job3\",\"command\":\"exit 1\",\"max_retries\":2}"
```

**Windows PowerShell / Unix/Linux/Mac:**
```bash
# 1. Enqueue some jobs
node bin/queuectl.js enqueue '{"id":"job1","command":"echo hello"}'
node bin/queuectl.js enqueue '{"id":"job2","command":"sleep 1"}'
node bin/queuectl.js enqueue '{"id":"job3","command":"exit 1","max_retries":2}'

# 2. Start workers
node bin/queuectl.js worker start --count 2

# 3. Monitor status (in another terminal)
node bin/queuectl.js status

# 4. Check completed jobs
node bin/queuectl.js list --state completed

# 5. Check failed jobs
node bin/queuectl.js list --state failed

# 6. Check DLQ
node bin/queuectl.js dlq list
```

### Handling Failures

**Windows CMD:**
```cmd
REM Enqueue a job that will fail
node bin/queuectl.js enqueue "{\"id\":\"fail-job\",\"command\":\"nonexistent-command\",\"max_retries\":3}"
```

**Windows PowerShell / Unix/Linux/Mac:**
```bash
# Enqueue a job that will fail
node bin/queuectl.js enqueue '{"id":"fail-job","command":"nonexistent-command","max_retries":3}'

# Start a worker to process it
node bin/queuectl.js worker start --count 1

# After retries are exhausted, check DLQ
node bin/queuectl.js dlq list

# Retry from DLQ
node bin/queuectl.js dlq retry fail-job
```

## 🛠️ Technical Details

- **Database**: SQLite (better-sqlite3) for persistence
- **Concurrency**: Multiple workers can process jobs in parallel
- **Locking**: Database-level locking prevents duplicate job processing
- **Graceful Shutdown**: Workers finish current jobs before stopping
- **Command Execution**: Uses Node.js child_process with 30s timeout

