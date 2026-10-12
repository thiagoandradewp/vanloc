-- =====================================================
-- VANLOC - Atualização 001: painel administrativo
-- =====================================================
-- Só é necessária se o banco foi criado ANTES do painel
-- administrativo existir. Em instalações novas, o
-- schema.sql já contém tudo isto.
-- =====================================================

SET NAMES utf8mb4;

ALTER TABLE motoristas
    ADD COLUMN bloqueado TINYINT(1) NOT NULL DEFAULT 0 AFTER lugares_van;

ALTER TABLE passageiros
    ADD COLUMN bloqueado TINYINT(1) NOT NULL DEFAULT 0 AFTER foto;

CREATE TABLE IF NOT EXISTS administradores (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    email VARCHAR(190) NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    ultimo_acesso DATETIME NULL,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_administradores_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
