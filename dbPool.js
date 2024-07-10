// dbPool.js
const sql = require('mssql');
const config = require('./dbConfig');

const poolPromise = new sql.ConnectionPool(config)
  .connect()
  .then(pool => {
    console.log('Connected to SQL Server');
    return pool;
  })
  .catch(err => {
    console.error('Database connection failed', err);
    throw err;
  });

module.exports = {
  sql, poolPromise
};