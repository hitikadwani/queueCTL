# Quick Start Commands

## Installation
```bash
npm install
```

## Basic Commands

### 1. Enqueue a Job

**Windows CMD:**
```cmd
node bin/queuectl.js enqueue "{\"id\":\"job1\",\"command\":\"echo hello\"}"
```

**Windows PowerShell:**
```powershell
node bin/queuectl.js enqueue '{"id":"job1","command":"echo hello"}'
```

**Alternative (if quotes get stripped):**
```cmd
node bin/queuectl.js enqueue {id:job1,command:echo hello}
```

### 2. Check Queue Status
```cmd
node bin/queuectl.js status
```

### 3. List Jobs
```cmd
node bin/queuectl.js list
node bin/queuectl.js list --state pending
node bin/queuectl.js list --state completed
```

### 4. Start Workers
```cmd
node bin/queuectl.js worker start --count 1
```

Press `Ctrl+C` to stop workers.

### 5. View Dead Letter Queue
```cmd
node bin/queuectl.js dlq list
```

### 6. Configuration
```cmd
node bin/queuectl.js config set max-retries 5
node bin/queuectl.js config get max-retries
node bin/queuectl.js config list
```

## Example Workflow

```cmd
REM 1. Enqueue some jobs
node bin/queuectl.js enqueue "{\"id\":\"job1\",\"command\":\"echo Hello World\"}"
node bin/queuectl.js enqueue "{\"id\":\"job2\",\"command\":\"echo Test\"}"
node bin/queuectl.js enqueue "{\"id\":\"job3\",\"command\":\"sleep 1\"}"

REM 2. Check status
node bin/queuectl.js status

REM 3. Start a worker (in a new terminal)
node bin/queuectl.js worker start --count 1

REM 4. Check status again (in original terminal)
node bin/queuectl.js status

REM 5. List completed jobs
node bin/queuectl.js list --state completed
```

## Test the System
```cmd
npm test
```

## Run Demo
```cmd
node examples/demo.js
```

