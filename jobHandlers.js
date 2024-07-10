const jobQueue = require('./queue');

const addJob = async (jobData) => {
  await jobQueue.add('job', jobData);
  console.log('Job added to the queue:', jobData);
};

const addJobrecomment = async (jobData) => {
  console.log('Job added Recomment:', jobData);
  await jobQueue.add('Recomment', jobData);
};

const addJobTop = async (jobData) => {
  console.log('Job added Top Book:', jobData);
  await jobQueue.add('TopBook', jobData);
};

module.exports = { addJob, addJobrecomment, addJobTop };