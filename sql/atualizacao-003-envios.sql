-- =====================================================
-- VANLOC - Atualização 003: Área de Envios e compatibilidade
-- =====================================================
-- Necessária para bancos criados antes desta versão
-- (importe depois da atualizacao-002-entregas.sql).
-- Não apaga nem altera dados existentes:
--  - clientes atuais ficam como "pessoa física"
--  - motoristas atuais ficam com veículo "van" e atendendo
--    qualquer cidade (podem ajustar em "Meus serviços")
--  - entregas antigas ficam sem dimensões/horário e podem
--    ser atendidas por qualquer veículo
-- =====================================================

SET NAMES utf8mb4;

ALTER TABLE passageiros
    ADD COLUMN tipo_conta ENUM('pessoa','empresa') NOT NULL DEFAULT 'pessoa' AFTER foto,
    ADD COLUMN empresa_nome VARCHAR(120) NOT NULL DEFAULT '' AFTER tipo_conta,
    ADD COLUMN documento VARCHAR(18) NOT NULL DEFAULT '' AFTER empresa_nome;

ALTER TABLE motoristas
    ADD COLUMN tipo_veiculo ENUM('moto','carro','utilitario','van','caminhao') NOT NULL DEFAULT 'van' AFTER capacidade_carga_kg;

ALTER TABLE entregas
    ADD COLUMN comprimento_cm SMALLINT UNSIGNED NULL AFTER volumes,
    ADD COLUMN largura_cm SMALLINT UNSIGNED NULL AFTER comprimento_cm,
    ADD COLUMN altura_cm SMALLINT UNSIGNED NULL AFTER largura_cm,
    ADD COLUMN veiculo_necessario ENUM('moto','carro','utilitario','van','caminhao') NOT NULL DEFAULT 'moto' AFTER altura_cm,
    ADD COLUMN horario_retirada TIME NULL AFTER data_retirada;

-- Cidades atendidas pelo motorista nas entregas (vazio = atende qualquer cidade)
CREATE TABLE IF NOT EXISTS motorista_regioes (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    motorista_id INT UNSIGNED NOT NULL,
    cidade VARCHAR(80) NOT NULL,
    UNIQUE KEY uk_motorista_regiao (motorista_id, cidade),
    CONSTRAINT fk_regioes_motorista FOREIGN KEY (motorista_id)
        REFERENCES motoristas (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

