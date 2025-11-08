/**
 * Demo script showing basic usage of the queue system
 * Run with: node examples/demo.js
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const path = require('path');

const QUEUECTL = path.join(__dirname, '..', 'bin', 'queuectl.js');

async function runDemo() {
  console.log('🚀 Queue System Demo\n');
  console.log('This demo will:\n');
  console.log('1. Enqueue some jobs');
  console.log('2. Show queue status');
  console.log('3. Start a worker to process jobs');
  console.log('4. Show final status\n');
  console.log('Note: The worker will run for 5 seconds, then stop.\n');
  console.log('='.repeat(50) + '\n');

  try {
    // 1. Enqueue jobs
    console.log('📝 Step 1: Enqueueing jobs...\n');
    
    await execAsync(`node ${QUEUECTL} enqueue '{"id":"demo1","command":"echo Hello from job 1"}'`);
    console.log('✓ Enqueued job: demo1');
    
    await execAsync(`node ${QUEUECTL} enqueue '{"id":"demo2","command":"echo Hello from job 2"}'`);
    console.log('✓ Enqueued job: demo2');
    
    await execAsync(`node ${QUEUECTL} enqueue '{"id":"demo3","command":"sleep 1"}'`);
    console.log('✓ Enqueued job: demo3');
    
    // 2. Show status
    console.log('\n📊 Step 2: Queue status...\n');
    const { stdout: statusOut } = await execAsync(`node ${QUEUECTL} status`);
    console.log(statusOut);
    
    // 3. List pending jobs
    console.log('\n📋 Step 3: Listing pending jobs...\n');
    const { stdout: listOut } = await execAsync(`node ${QUEUECTL} list --state pending`);
    console.log(listOut);
    
    // 4. Start worker (in background, will run for 5 seconds)
    console.log('\n⚙️  Step 4: Starting worker (will process for 5 seconds)...\n');
    const workerProcess = exec(`node ${QUEUECTL} worker start --count 1`);
    
    // Wait 5 seconds
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Stop worker
    console.log('\n🛑 Stopping worker...\n');
    workerProcess.kill('SIGINT');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 5. Show final status
    console.log('\n📊 Step 5: Final queue status...\n');
    const { stdout: finalStatus } = await execAsync(`node ${QUEUECTL} status`);
    console.log(finalStatus);
    
    // 6. List completed jobs
    console.log('\n✅ Completed jobs:\n');
    const { stdout: completedOut } = await execAsync(`node ${QUEUECTL} list --state completed`);
    console.log(completedOut);
    
    console.log('\n✨ Demo complete!\n');
    
  } catch (error) {
    console.error('Demo error:', error.message);
    process.exit(1);
  }
}

// Run demo
runDemo();

