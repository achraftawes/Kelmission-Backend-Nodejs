const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'MyKelMission',
  password: '97955187',
  port: 5432
});

module.exports = pool;