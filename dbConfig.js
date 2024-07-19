// dbConfig.js

require('dotenv').config();

const config = {
  user: process.env.DB_USER1,
  password: process.env.DB_PASSWORD1,
  server: process.env.DB_SERVER1,
  database: process.env.DB_DATABASE1,
  port: parseInt(process.env.DB_PORT1, 10),
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',  // Convert string to boolean
  },
  connectionTimeout: 30000 // 30 seconds
};
  
  module.exports = config;