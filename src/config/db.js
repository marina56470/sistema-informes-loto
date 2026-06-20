const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // requerido por Neon
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('❌ Error inesperado en el pool de Postgres:', err);
});

// Prueba de conexión al arrancar
pool.connect()
  .then(client => {
    console.log('✅ Conectado a Neon PostgreSQL');
    client.release();
  })
  .catch(err => {
    console.error('❌ No se pudo conectar a la base de datos:', err.message);
  });

module.exports = pool;