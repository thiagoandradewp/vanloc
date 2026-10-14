-- =====================================================
-- VANLOC - Atualização 002: entregas de mercadorias
-- =====================================================
-- Só é necessária se o banco foi criado ANTES da função
-- de entregas existir. Em instalações novas, o
-- schema.sql já contém tudo isto.
--
-- Não apaga nem altera dados: os motoristas atuais
-- continuam oferecendo transporte de passageiros e podem
-- ativar as entregas no próprio painel ("Meus serviços").
-- Se o banco ainda não tem o painel administrativo,
-- importe antes o atualizacao-001-admin.sql.
-- =====================================================

SET NAMES utf8mb4;

ALTER TABLE motoristas
    ADD COLUMN faz_passageiros TINYINT(1) NOT NULL DEFAULT 1 AFTER lugares_van,
    ADD COLUMN faz_entregas TINYINT(1) NOT NULL DEFAULT 0 AFTER faz_passageiros,
    ADD COLUMN capacidade_carga_kg SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER faz_entregas;

-- Solicitações de entrega de mercadorias (feitas por passageiros/clientes
-- ou cadastradas pelo administrador) e aceitas por motoristas
CREATE TABLE IF NOT EXISTS entregas (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(20) NOT NULL,
    passageiro_id INT UNSIGNED NULL,
    motorista_id INT UNSIGNED NULL,
    plataforma ENUM('mercado_livre','shopee','amazon','loja','particular','outro') NOT NULL DEFAULT 'particular',
    descricao VARCHAR(500) NOT NULL,
    tamanho ENUM('pequeno','medio','grande') NOT NULL DEFAULT 'pequeno',
    peso_kg DECIMAL(7,2) NOT NULL,
    volumes SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    retirada_endereco VARCHAR(200) NOT NULL,
    retirada_cidade VARCHAR(80) NOT NULL,
    retirada_contato VARCHAR(120) NOT NULL,
    retirada_telefone VARCHAR(20) NOT NULL,
    destino_endereco VARCHAR(200) NOT NULL,
    destino_cidade VARCHAR(80) NOT NULL,
    destinatario_nome VARCHAR(120) NOT NULL,
    destinatario_telefone VARCHAR(20) NOT NULL,
    data_retirada DATE NOT NULL,
    valor DECIMAL(10,2) NOT NULL,
    observacoes VARCHAR(500) NOT NULL DEFAULT '',
    status ENUM('disponivel','aguardando_retirada','coletada','em_transito','entregue','cancelada') NOT NULL DEFAULT 'disponivel',
    aceita_em DATETIME NULL,
    coletada_em DATETIME NULL,
    em_transito_em DATETIME NULL,
    entregue_em DATETIME NULL,
    cancelada_em DATETIME NULL,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_entregas_codigo (codigo),
    KEY idx_entregas_status (status, data_retirada),
    KEY idx_entregas_motorista (motorista_id, status),
    CONSTRAINT fk_entregas_passageiro FOREIGN KEY (passageiro_id)
        REFERENCES passageiros (id) ON DELETE SET NULL,
    CONSTRAINT fk_entregas_motorista FOREIGN KEY (motorista_id)
        REFERENCES motoristas (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
