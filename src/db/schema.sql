-- CRETA schema for TiDB / MySQL
-- Run this once against your TiDB Serverless database before starting the server.

CREATE TABLE IF NOT EXISTS districts (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  code          VARCHAR(5) UNIQUE NOT NULL,
  name          VARCHAR(100) NOT NULL,
  state         VARCHAR(100) DEFAULT 'Tamil Nadu',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  username        VARCHAR(100) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  role            ENUM('admin','district') NOT NULL,
  district_id     INT NULL,
  full_name       VARCHAR(150),
  email           VARCHAR(150),
  is_active       BOOLEAN DEFAULT TRUE,
  last_login_at   TIMESTAMP NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (district_id) REFERENCES districts(id)
);

CREATE TABLE IF NOT EXISTS password_resets (
  id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id     BIGINT NOT NULL,
  token_hash  VARCHAR(255) NOT NULL,
  expires_at  TIMESTAMP NOT NULL,
  used        BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS form_templates (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  form_type_code  VARCHAR(10) UNIQUE NOT NULL,
  form_type_name  VARCHAR(150) NOT NULL,
  schema_json     JSON NOT NULL,
  is_active       BOOLEAN DEFAULT TRUE,
  created_by      BIGINT NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS id_sequences (
  seq_key     VARCHAR(50) PRIMARY KEY,
  seq_value   INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS submissions (
  id                BIGINT PRIMARY KEY AUTO_INCREMENT,
  customer_id       VARCHAR(50) UNIQUE,
  district_id       INT NOT NULL,
  form_type_code    VARCHAR(10) NOT NULL,
  created_by        BIGINT NOT NULL,
  status            ENUM('draft','pending','approved','rejected','processed') DEFAULT 'draft',
  data_json         JSON NOT NULL,
  name              VARCHAR(150),
  phone             VARCHAR(15),
  email             VARCHAR(150),
  taluk             VARCHAR(100),
  submitted_at      TIMESTAMP NULL,
  reviewed_by       BIGINT NULL,
  reviewed_at       TIMESTAMP NULL,
  rejection_reason  TEXT NULL,
  processed_at      TIMESTAMP NULL,
  deleted_at        TIMESTAMP NULL,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (district_id) REFERENCES districts(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (reviewed_by) REFERENCES users(id),
  INDEX idx_district_status (district_id, status),
  INDEX idx_form_type (form_type_code),
  INDEX idx_customer_id (customer_id)
);

CREATE TABLE IF NOT EXISTS submission_history (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  submission_id   BIGINT NOT NULL,
  action          VARCHAR(50) NOT NULL,
  actor_id        BIGINT NOT NULL,
  note            TEXT,
  data_snapshot   JSON,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (submission_id) REFERENCES submissions(id),
  FOREIGN KEY (actor_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  actor_id    BIGINT,
  action      VARCHAR(100) NOT NULL,
  target_type VARCHAR(50),
  target_id   BIGINT,
  ip_address  VARCHAR(45),
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
