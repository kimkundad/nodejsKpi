const { Queue } = require('bullmq');

// Create a queue instance
const jobQueue = new Queue('my-job-queue', {
  connection: {
    host: '127.0.0.1',
    port: 6379,
  },
});

// Function to clear all jobs
async function clearAllJobs() {
  try {
    await jobQueue.drain();
    await jobQueue.clean(0, 0, 'completed');
    await jobQueue.clean(0, 0, 'failed');
    await jobQueue.clean(0, 0, 'wait');
    await jobQueue.clean(0, 0, 'active');
    await jobQueue.clean(0, 0, 'delayed');
    await jobQueue.obliterate({ force: true });
    console.log('All jobs have been cleared.');
  } catch (error) {
    console.error('Error clearing all jobs:', error);
  }
}

clearAllJobs();