-- =====================================================
-- VANLOC - Estrutura do banco de dados (MySQL / MariaDB)
-- =====================================================
-- Importe este arquivo pelo phpMyAdmin da Hostinger
-- (hPanel > Bancos de dados > phpMyAdmin > Importar).
-- Depois, se quiser dados de exemplo, importe demo.sql.
-- =====================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS motoristas (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    email VARCHAR(190) NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    telefone VARCHAR(20) NOT NULL DEFAULT '',
    cpf VARCHAR(14) NOT NULL DEFAULT '',
    modelo_van VARCHAR(80) NOT NULL DEFAULT '',
    placa_van VARCHAR(10) NOT NULL DEFAULT '',
    lugares_van SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_motoristas_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS passageiros (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    email VARCHAR(190) NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    telefone VARCHAR(20) NOT NULL DEFAULT '',
    cidade VARCHAR(80) NOT NULL DEFAULT '',
    estado CHAR(2) NOT NULL DEFAULT '',
    bio VARCHAR(500) NOT NULL DEFAULT '',
    foto VARCHAR(255) NOT NULL DEFAULT '',
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_passageiros_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS viagens (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    motorista_id INT UNSIGNED NOT NULL,
    origem VARCHAR(80) NOT NULL,
    destino VARCHAR(80) NOT NULL,
    data DATE NOT NULL,
    horario TIME NOT NULL,
    valor DECIMAL(10,2) NOT NULL,
    vagas SMALLINT UNSIGNED NOT NULL,
    foto VARCHAR(255) NOT NULL DEFAULT '',
    status ENUM('ativa','cancelada') NOT NULL DEFAULT 'ativa',
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_viagens_data (status, data),
    CONSTRAINT fk_viagens_motorista FOREIGN KEY (motorista_id)
        REFERENCES motoristas (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS planos (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    motorista_id INT UNSIGNED NOT NULL,
    nome VARCHAR(80) NOT NULL,
    valor DECIMAL(10,2) NOT NULL,
    quantidade SMALLINT UNSIGNED NULL,
    vantagens TEXT NOT NULL,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_planos_motorista FOREIGN KEY (motorista_id)
        REFERENCES motoristas (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reservas (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(20) NOT NULL,
    viagem_id INT UNSIGNED NOT NULL,
    passageiro_id INT UNSIGNED NOT NULL,
    nome VARCHAR(120) NOT NULL,
    telefone VARCHAR(20) NOT NULL,
    quantidade SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    valor_unitario DECIMAL(10,2) NOT NULL,
    status ENUM('solicitada','confirmada','recusada','cancelada') NOT NULL DEFAULT 'solicitada',
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_reservas_codigo (codigo),
    KEY idx_reservas_viagem (viagem_id, status),
    CONSTRAINT fk_reservas_viagem FOREIGN KEY (viagem_id)
        REFERENCES viagens (id) ON DELETE CASCADE,
    CONSTRAINT fk_reservas_passageiro FOREIGN KEY (passageiro_id)
        REFERENCES passageiros (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Usada para limitar tentativas de login (proteção contra força bruta)
CREATE TABLE IF NOT EXISTS tentativas_login (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    chave VARCHAR(255) NOT NULL,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_tentativas_chave (chave, criado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
