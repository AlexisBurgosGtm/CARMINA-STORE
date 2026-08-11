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
    return true;
  }
  return false;
}

async function indexExists(table, indexName) {
  const rows = await query(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND INDEX_NAME = ?`,
    [table, indexName]
  );
  return Number(rows[0].cnt) > 0;
}

async function fkExists(table, constraintName) {
  const rows = await query(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND CONSTRAINT_NAME = ?
       AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    [table, constraintName]
  );
  return Number(rows[0].cnt) > 0;
}

async function migratePublicacionesAlbumes() {
  const hasIdAlbum = await query(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'PUBLICACIONES'
       AND COLUMN_NAME = 'IDALBUM'`
  );

  if (!Number(hasIdAlbum[0].cnt)) {
    await query('ALTER TABLE PUBLICACIONES ADD COLUMN IDALBUM INT NULL AFTER ID');
    console.log('Columna IDALBUM agregada a PUBLICACIONES.');
  }

  // Asignar álbum por defecto a filas existentes sin álbum
  const orphans = await query(
    'SELECT COUNT(*) AS cnt FROM PUBLICACIONES WHERE IDALBUM IS NULL'
  );
  if (Number(orphans[0].cnt) > 0) {
    let albums = await query('SELECT ID FROM ALBUMES ORDER BY ID ASC LIMIT 1');
    if (!albums.length) {
      const created = await query(
        'INSERT INTO ALBUMES (NOMBRE, FECHA) VALUES (?, NOW())',
        ['General']
      );
      albums = [{ ID: created.insertId }];
      console.log('Álbum General creado para migrar publicaciones.');
    }
    await query('UPDATE PUBLICACIONES SET IDALBUM = ? WHERE IDALBUM IS NULL', [albums[0].ID]);
  }

  if (await indexExists('PUBLICACIONES', 'uk_pub_codprod')) {
    await query('ALTER TABLE PUBLICACIONES DROP INDEX uk_pub_codprod');
    console.log('Índice uk_pub_codprod eliminado.');
  }

  if (!(await indexExists('PUBLICACIONES', 'uk_pub_album_prod'))) {
    await query(
      'ALTER TABLE PUBLICACIONES ADD UNIQUE KEY uk_pub_album_prod (IDALBUM, CODPROD)'
    );
    console.log('Índice uk_pub_album_prod creado.');
  }

  // Si aún hay NULLs no debería; forzar NOT NULL
  try {
    await query('ALTER TABLE PUBLICACIONES MODIFY IDALBUM INT NOT NULL');
  } catch (err) {
    console.warn('No se pudo marcar IDALBUM NOT NULL:', err.message);
  }

  if (!(await fkExists('PUBLICACIONES', 'fk_pub_album'))) {
    try {
      await query(`
        ALTER TABLE PUBLICACIONES
          ADD CONSTRAINT fk_pub_album FOREIGN KEY (IDALBUM)
          REFERENCES ALBUMES(ID)
          ON UPDATE CASCADE
          ON DELETE CASCADE
      `);
      console.log('FK fk_pub_album creada.');
    } catch (err) {
      console.warn('No se pudo crear fk_pub_album:', err.message);
    }
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
      FACTOR DECIMAL(12,4) NULL,
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

  await ensureColumn(
    'PRODUCTOS',
    'FACTOR',
    'FACTOR DECIMAL(12,4) NULL AFTER PRECIO'
  );

  await query(`
    CREATE TABLE IF NOT EXISTS USUARIOS (
      \`USER\` VARCHAR(50) NOT NULL PRIMARY KEY,
      PASS VARCHAR(255) NOT NULL,
      TIPO ENUM('ADMINISTRADOR','OPERADOR') NOT NULL DEFAULT 'OPERADOR',
      WEBAUTHN LONGTEXT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await ensureColumn('USUARIOS', 'WEBAUTHN', 'WEBAUTHN LONGTEXT NULL');

  await query(`
    CREATE TABLE IF NOT EXISTS ALBUMES (
      ID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      NOMBRE VARCHAR(150) NOT NULL,
      FECHA DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS PUBLICACIONES (
      ID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      IDALBUM INT NOT NULL,
      CODPROD VARCHAR(30) NOT NULL,
      FECHA DATETIME NOT NULL,
      UNIQUE KEY uk_pub_album_prod (IDALBUM, CODPROD),
      CONSTRAINT fk_pub_album FOREIGN KEY (IDALBUM)
        REFERENCES ALBUMES(ID)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
      CONSTRAINT fk_pub_prod FOREIGN KEY (CODPROD)
        REFERENCES PRODUCTOS(CODPROD)
        ON UPDATE CASCADE
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Migración: tablas antiguas de PUBLICACIONES sin álbum
  await migratePublicacionesAlbumes();


  await query(`
    CREATE TABLE IF NOT EXISTS SETTINGS (
      OPCION VARCHAR(100) NOT NULL PRIMARY KEY,
      VALOR LONGTEXT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Migración: VALOR debe soportar logo en base64 (antes VARCHAR(255))
  try {
    await query('ALTER TABLE SETTINGS MODIFY VALOR LONGTEXT NOT NULL');
  } catch (err) {
    console.warn('No se pudo ampliar SETTINGS.VALOR:', err.message);
  }

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

  const modelo = await query('SELECT OPCION FROM SETTINGS WHERE OPCION = ?', [
    'MODELO GEMINI',
  ]);
  if (!modelo.length) {
    const defaultModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
    await query('INSERT INTO SETTINGS (OPCION, VALOR) VALUES (?, ?)', [
      'MODELO GEMINI',
      defaultModel,
    ]);
    console.log('Setting MODELO GEMINI creado.');
  }

  const logo = await query('SELECT OPCION FROM SETTINGS WHERE OPCION = ?', [
    'LOGO EMPRESA',
  ]);
  if (!logo.length) {
    await query('INSERT INTO SETTINGS (OPCION, VALOR) VALUES (?, ?)', [
      'LOGO EMPRESA',
      '',
    ]);
    console.log('Setting LOGO EMPRESA creado.');
  }

  const colorBadge = await query('SELECT OPCION FROM SETTINGS WHERE OPCION = ?', [
    'COLOR BADGE PRECIO',
  ]);
  if (!colorBadge.length) {
    await query('INSERT INTO SETTINGS (OPCION, VALOR) VALUES (?, ?)', [
      'COLOR BADGE PRECIO',
      'VERDE',
    ]);
    console.log('Setting COLOR BADGE PRECIO creado.');
  }

  const formaBadge = await query('SELECT OPCION FROM SETTINGS WHERE OPCION = ?', [
    'FORMA BADGE PRECIO',
  ]);
  if (!formaBadge.length) {
    await query('INSERT INTO SETTINGS (OPCION, VALOR) VALUES (?, ?)', [
      'FORMA BADGE PRECIO',
      'OVALO',
    ]);
    console.log('Setting FORMA BADGE PRECIO creado.');
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

  // Usuario OPERADOR (solo se crea si no existe; no se sobrescribe la contraseña)
  const operadorUser = 'OPERADOR';
  const operadorPass = process.env.OPERADOR_PASS || 'operador123';
  const operadorExisting = await query('SELECT `USER` FROM USUARIOS WHERE `USER` = ?', [operadorUser]);
  if (!operadorExisting.length) {
    const hash = await bcrypt.hash(operadorPass, 10);
    await query('INSERT INTO USUARIOS (`USER`, PASS, TIPO) VALUES (?, ?, ?)', [
      operadorUser,
      hash,
      'OPERADOR',
    ]);
    console.log('Usuario OPERADOR creado.');
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
