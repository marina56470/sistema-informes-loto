-- ═══════════════════════════════════════════════════════════════════
-- SCHEMA COMPLETO — LOTO PRO / ASSA ABLOY Colombia
-- Compatible con Neon (PostgreSQL 15+)
-- Ejecutar en orden: schema.sql → seed.sql
-- ═══════════════════════════════════════════════════════════════════

-- 1. USUARIOS
CREATE TABLE IF NOT EXISTS usuarios (
  id                   SERIAL PRIMARY KEY,
  nombre               VARCHAR(120) NOT NULL,
  email                VARCHAR(120) UNIQUE NOT NULL,
  password_hash        VARCHAR(255),
  google_id            VARCHAR(100) UNIQUE,
  avatar_url           TEXT,
  cargo                VARCHAR(100),
  zona                 VARCHAR(100),
  email_verificado     BOOLEAN DEFAULT FALSE,
  token_verificacion   VARCHAR(64),
  token_expira         TIMESTAMP,
  activo               BOOLEAN DEFAULT TRUE,
  creado_en            TIMESTAMP DEFAULT NOW()
);

-- 2. SESIONES (express-session + connect-pg-simple)
CREATE TABLE IF NOT EXISTS session (
  sid     VARCHAR NOT NULL PRIMARY KEY,
  sess    JSON    NOT NULL,
  expire  TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS session_expire_idx ON session (expire);

-- 3. CLIENTES
CREATE TABLE IF NOT EXISTS clientes (
  id             SERIAL PRIMARY KEY,
  empresa        VARCHAR(200) NOT NULL,
  contacto       VARCHAR(150),
  cargo_contacto VARCHAR(100),
  ciudad         VARCHAR(100),
  nit            VARCHAR(30),
  telefono       VARCHAR(50),
  email          VARCHAR(120),
  creado_por     INT REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en      TIMESTAMP DEFAULT NOW()
);

-- 4. INFORMES
CREATE TABLE IF NOT EXISTS informes (
  id               SERIAL PRIMARY KEY,
  usuario_id       INT REFERENCES usuarios(id) ON DELETE CASCADE,
  cliente_id       INT REFERENCES clientes(id) ON DELETE SET NULL,
  fecha_informe    DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_visita     DATE,
  estado           VARCHAR(20) DEFAULT 'borrador'
                   CHECK (estado IN ('borrador','finalizado','enviado')),
  notas_comerciales TEXT,
  creado_en        TIMESTAMP DEFAULT NOW(),
  actualizado_en   TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS informes_usuario_idx ON informes(usuario_id);
CREATE INDEX IF NOT EXISTS informes_estado_idx  ON informes(estado);

-- 5. HALLAZGOS
CREATE TABLE IF NOT EXISTS hallazgos (
  id              SERIAL PRIMARY KEY,
  informe_id      INT REFERENCES informes(id) ON DELETE CASCADE,
  orden           INT DEFAULT 1,
  proceso         VARCHAR(200),
  area            VARCHAR(200) NOT NULL,
  descripcion     TEXT NOT NULL,
  recomendaciones TEXT,
  foto_path       VARCHAR(255),
  creado_en       TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS hallazgos_informe_idx ON hallazgos(informe_id);

-- 6. ENERGÍAS POR HALLAZGO
CREATE TABLE IF NOT EXISTS hallazgo_energias (
  id           SERIAL PRIMARY KEY,
  hallazgo_id  INT REFERENCES hallazgos(id) ON DELETE CASCADE,
  tipo_energia VARCHAR(80) NOT NULL
    CHECK (tipo_energia IN ('Eléctrica','Mecánica','Neumática',
                            'Hidráulica','Térmica','Química'))
);

-- 7. CATÁLOGO DE PRODUCTOS YALE
CREATE TABLE IF NOT EXISTS productos (
  id          SERIAL PRIMARY KEY,
  sku         VARCHAR(30) UNIQUE NOT NULL,
  nombre      VARCHAR(200) NOT NULL,
  descripcion TEXT,
  categoria   VARCHAR(80),
  energia     VARCHAR(80),
  activo      BOOLEAN DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS productos_sku_idx      ON productos(sku);
CREATE INDEX IF NOT EXISTS productos_cat_idx      ON productos(categoria);

-- 8. PRODUCTOS POR HALLAZGO
CREATE TABLE IF NOT EXISTS hallazgo_productos (
  id          SERIAL PRIMARY KEY,
  hallazgo_id INT REFERENCES hallazgos(id) ON DELETE CASCADE,
  producto_id INT REFERENCES productos(id) ON DELETE RESTRICT,
  cantidad    INT DEFAULT 1
);
CREATE INDEX IF NOT EXISTS hp_hallazgo_idx ON hallazgo_productos(hallazgo_id);

-- Agregar columna foto_url a productos (si no existe)
ALTER TABLE productos ADD COLUMN IF NOT EXISTS foto_url VARCHAR(500);

-- Distinguir el propósito del token (verificación de email vs recuperación de contraseña)
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS tipo_token VARCHAR(20);