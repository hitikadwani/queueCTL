const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const path = require('path');
const fs = require('fs');

const QUEUECTL = path.join(__dirname, '..', 'bin', 'queuectl.js');
const DB_PATH = path.join(__dirname, 'test-queue.db');

// Clean up test database with retry logic for Windows file locking
async function cleanup() {
  if (!fs.existsSync(DB_PATH)) {
    return;
  }

  // Try to delete with retries (Windows file locking issue)
  for (let i = 0; i < 10; i++) {
    try {
      // Wait a bit for connections to close
      if (i > 0) {
        await sleep(100 * i); // Exponential backoff
      }
      fs.unlinkSync(DB_PATH);
      return; // Success
    } catch (error) {
      if (error.code === 'EBUSY' || error.code === 'ENOENT') {
        // File is locked or doesn't exist, try again
        if (i === 9) {
          // Last attempt failed, log warning but continue
          console.warn(`Warning: Could not delete test database: ${error.message}`);
          return;
        }
      } else {
        // Other error, rethrow
        throw error;
      }
    }
  }
}

// Helper to run queuectl commands
async function runCommand(cmd) {
  try {
    const { stdout, stderr } = await execAsync(`node ${QUEUECTL} ${cmd}`, {
      env: { ...process.env, QUEUE_DB: DB_PATH }
    });
    return { stdout, stderr, success: true };
  } catch (error) {
    return { stdout: error.stdout, stderr: error.stderr, success: false, error: error.message };
  }
}

// Test helper
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('🧪 Starting Queue System Tests\n');
  
  await cleanup();
  
  let passed = 0;
  let failed = 0;

  // Test 1: Enqueue a job
  console.log('Test 1: Enqueue a job');
  try {
    const result = await runCommand(`enqueue '{"id":"test1","command":"echo hello"}'`);
    assert(result.success, 'Enqueue should succeed');
    assert(result.stdout.includes('Job enqueued'), 'Should show success message');
    passed++;
    console.log('  ✓ PASSED\n');
    await sleep(100); // Allow connection to close
  } catch (error) {
    failed++;
    console.log(`  ✗ FAILED: ${error.message}\n`);
  }

  // Test 2: Check status
  console.log('Test 2: Check queue status');
  try {
    const result = await runCommand('status');
    assert(result.success, 'Status should succeed');
    assert(result.stdout.includes('pending'), 'Should show pending jobs');
    passed++;
    console.log('  ✓ PASSED\n');
    await sleep(100); // Allow connection to close
  } catch (error) {
    failed++;
    console.log(`  ✗ FAILED: ${error.message}\n`);
  }

  // Test 3: List jobs
  console.log('Test 3: List jobs');
  try {
    const result = await runCommand('list --state pending');
    assert(result.success, 'List should succeed');
    assert(result.stdout.includes('test1'), 'Should show test1 job');
    passed++;
    console.log('  ✓ PASSED\n');
    await sleep(100); // Allow connection to close
  } catch (error) {
    failed++;
    console.log(`  ✗ FAILED: ${error.message}\n`);
  }

  // Test 4: Enqueue a failing job
  console.log('Test 4: Enqueue a failing job');
  try {
    const result = await runCommand(`enqueue '{"id":"test-fail","command":"exit 1","max_retries":2}'`);
    assert(result.success, 'Enqueue should succeed');
    passed++;
    console.log('  ✓ PASSED\n');
    await sleep(100); // Allow connection to close
  } catch (error) {
    failed++;
    console.log(`  ✗ FAILED: ${error.message}\n`);
  }

  // Test 5: Start worker and process jobs
  console.log('Test 5: Start worker and process jobs');
  try {
    // Start worker in background
    const workerProcess = exec(`node ${QUEUECTL} worker start --count 1`, {
      env: { ...process.env, QUEUE_DB: DB_PATH }
    });
    
    // Wait for jobs to be processed
    await sleep(3000);
    
    // Check status
    const statusResult = await runCommand('status');
    assert(statusResult.success, 'Status should succeed');
    await sleep(100);
    
    // Stop worker (use SIGTERM on Unix, or just kill on Windows)
    if (process.platform === 'win32') {
      workerProcess.kill();
    } else {
      workerProcess.kill('SIGTERM');
    }
    await sleep(2000); // Give worker time to close connections
    
    passed++;
    console.log('  ✓ PASSED\n');
  } catch (error) {
    failed++;
    console.log(`  ✗ FAILED: ${error.message}\n`);
  }

  // Test 6: Config management
  console.log('Test 6: Config management');
  try {
    const setResult = await runCommand('config set max-retries 5');
    assert(setResult.success, 'Config set should succeed');
    await sleep(100);
    
    const getResult = await runCommand('config get max-retries');
    assert(getResult.success, 'Config get should succeed');
    assert(getResult.stdout.includes('5'), 'Should return set value');
    await sleep(100);
    
    passed++;
    console.log('  ✓ PASSED\n');
  } catch (error) {
    failed++;
    console.log(`  ✗ FAILED: ${error.message}\n`);
  }

  // Test 7: DLQ operations
  console.log('Test 7: DLQ operations');
  try {
    const dlqListResult = await runCommand('dlq list');
    assert(dlqListResult.success, 'DLQ list should succeed');
    await sleep(100);
    
    passed++;
    console.log('  ✓ PASSED\n');
  } catch (error) {
    failed++;
    console.log(`  ✗ FAILED: ${error.message}\n`);
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`Tests Passed: ${passed}`);
  console.log(`Tests Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);
  console.log('='.repeat(50) + '\n');

  // Wait a bit for any remaining connections to close (longer on Windows)
  const cleanupDelay = process.platform === 'win32' ? 1000 : 500;
  await sleep(cleanupDelay);
  await cleanup();
  
  if (failed > 0) {
    process.exit(1);
  }
}

// Run tests
runTests().catch(async error => {
  console.error('Test runner error:', error);
  const cleanupDelay = process.platform === 'win32' ? 1000 : 500;
  await sleep(cleanupDelay);
  await cleanup();
  process.exit(1);
});

