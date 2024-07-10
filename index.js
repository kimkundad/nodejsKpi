const express = require('express');
const Arena = require('bull-arena');
const { Queue } = require('bullmq');
const { createClient } = require('redis');
require('dotenv').config();

const jobQueue = require('./queue');
const { sql, poolPromise } = require('./dbPool');
const mysql = require('./mysqlConfig');
const routes = require('./routes');

const app = express();
const port = 3000;

app.use(express.json());

const redisClient = createClient({ url: 'redis://127.0.0.1:6379' });

redisClient.on('error', (err) => console.error('Redis Client Error', err));
redisClient.on('connect', () => console.log('Connected to Redis'));

redisClient.connect();

const arenaConfig = Arena(
  {
    BullMQ: Queue,
    queues: [
      {
        type: 'bullmq',
        name: 'jobQueue',
        hostId: 'Worker',
        connection: {
          host: '127.0.0.1',
          port: 6379,
        },
      },
    ],
  },
  {
    basePath: '/',
    disableListen: true,
  }
);

app.use('/arena', arenaConfig);

app.use(routes);

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});