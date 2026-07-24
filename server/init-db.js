require('dotenv').config();
const { query } = require('./db');
const bcrypt = require('bcryptjs');
const { SUPER_USER } = require('./middleware/auth');

async function ensureColumn(table, column, definition) {
  const rows = await query(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [table, column]
  );
  if (!Number(rows[0].cnt)) {
    await query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
    console.log(`Columna ${column} agregada a ${table}.`);
  }
}

async function initDatabase() {
  console.log('Inicializando tablas...');

  await query(`
    CREATE TABLE IF NOT EXISTS PROVEEDORES (
      CODPROV VARCHAR(20) NOT NULL PRIMARY KEY,
      NOMPROV VARCHAR(150) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS PRODUCTOS (
      CODPROD VARCHAR(30) NOT NULL PRIMARY KEY,
      DESPROD VARCHAR(255) NOT NULL,
      CODPROV VARCHAR(20) NOT NULL,
      LASTUPDATE DATETIME NOT NULL,
      COSTO DECIMAL(12,2) NOT NULL DEFAULT 0,
      PRECIO DECIMAL(12,2) NOT NULL DEFAULT 0,
      FOTO VARCHAR(255) NULL,
      CONSTRAINT fk_prod_prov FOREIGN KEY (CODPROV)
        REFERENCES PROVEEDORES(CODPROV)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Migración si la tabla ya existía sin COSTO
  await ensureColumn(
    'PRODUCTOS',
    'COSTO',
    'COSTO DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER LASTUPDATE'
  );

  await query(`
    CREATE TABLE IF NOT EXISTS USUARIOS (
      \`USER\` VARCHAR(50) NOT NULL PRIMARY KEY,
      PASS VARCHAR(255) NOT NULL,
      TIPO ENUM('ADMINISTRADOR','OPERADOR') NOT NULL DEFAULT 'OPERADOR'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS SETTINGS (
      OPCION VARCHAR(100) NOT NULL PRIMARY KEY,
      VALOR VARCHAR(255) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const factor = await query('SELECT OPCION FROM SETTINGS WHERE OPCION = ?', [
    'FACTOR CAMBIO MONEDA',
  ]);
  if (!factor.length) {
    await query('INSERT INTO SETTINGS (OPCION, VALOR) VALUES (?, ?)', [
      'FACTOR CAMBIO MONEDA',
      '2.2',
    ]);
    console.log('Setting FACTOR CAMBIO MONEDA creado.');
  }

  const clave = await query('SELECT OPCION FROM SETTINGS WHERE OPCION = ?', [
    'CLAVE VERIFICACIONES',
  ]);
  if (!clave.length) {
    await query('INSERT INTO SETTINGS (OPCION, VALOR) VALUES (?, ?)', [
      'CLAVE VERIFICACIONES',
      '1234',
    ]);
    console.log('Setting CLAVE VERIFICACIONES creado.');
  }

  // Super usuario
  const existing = await query('SELECT `USER` FROM USUARIOS WHERE `USER` = ?', [SUPER_USER.USER]);
  if (!existing.length) {
    const hash = await bcrypt.hash(SUPER_USER.PASS, 10);
    await query('INSERT INTO USUARIOS (`USER`, PASS, TIPO) VALUES (?, ?, ?)', [
      SUPER_USER.USER,
      hash,
      SUPER_USER.TIPO,
    ]);
    console.log('Super usuario ALEXIS creado.');
  } else {
    const hash = await bcrypt.hash(SUPER_USER.PASS, 10);
    await query('UPDATE USUARIOS SET PASS = ?, TIPO = ? WHERE `USER` = ?', [
      hash,
      SUPER_USER.TIPO,
      SUPER_USER.USER,
    ]);
    console.log('Super usuario ALEXIS actualizado.');
  }

  console.log('Base de datos lista.');
}

if (require.main === module) {
  initDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Error inicializando DB:', err.message);
      process.exit(1);
    });
}

module.exports = { initDatabase };
