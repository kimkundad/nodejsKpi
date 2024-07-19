const jobQueue = require('./queue');

const addJob = async (jobData) => {
  await jobQueue.add('job', jobData);
 // console.log('Job added to the queue:', jobData);
};

const addJob2 = async (jobData) => {
  await jobQueue.add('job2', jobData);
//  console.log('Job2 added to the queue:', jobData);
};

const addJobrecomment = async (jobData) => {
//  console.log('Job added Recomment:', jobData);
  await jobQueue.add('Recomment', jobData);
};

const addJobTop = async (jobData) => {
//  console.log('Job added Top Book:', jobData);
  await jobQueue.add('TopBook', jobData);
};

const addJobTopW = async (jobData) => {
  //  console.log('Job added Top Book:', jobData);
    await jobQueue.add('TopBookW', jobData);
  };


  const addJobTopWM= async (jobData) => {
    //  console.log('Job added Top Book:', jobData);
      await jobQueue.add('TopBookM', jobData);
    };
  


module.exports = { addJob, addJob2, addJobrecomment, addJobTop, addJobTopW, addJobTopWM };