<?php
/* =====================================================
VANLOC - Atualização automática do banco de dados
=====================================================
Chamado pelo bootstrap.php na primeira conexão de cada
requisição. Se o banco estiver em uma versão anterior,
cria as tabelas e colunas que faltam (as mesmas dos
arquivos sql/schema.sql e sql/atualizacao-*.sql).

- Nunca apaga nem altera dados existentes.
- Cada passo confere se a tabela/coluna já existe, então
  funciona com bancos novos, antigos ou já atualizados
  manualmente pelo phpMyAdmin.
- Um bloqueio (GET_LOCK) impede que duas requisições
  atualizem ao mesmo tempo.
Não é acessível diretamente pela web.
===================================================== */

const VL_VERSAO_BANCO = 3;


function vlTabelaExiste(PDO $pdo, string $tabela): bool
{
    $consulta = $pdo->prepare(
        'SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?'
    );
    $consulta->execute([$tabela]);

    return (bool) $consulta->fetchColumn();
}

function vlColunaExiste(PDO $pdo, string $tabela, string $coluna): bool
{
    $consulta = $pdo->prepare(
        'SELECT 1 FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
    );
    $consulta->execute([$tabela, $coluna]);

    return (bool) $consulta->fetchColumn();
}

/** Comandos CREATE TABLE do schema.sql, indexados pelo nome da tabela */
function vlTabelasDoSchema(): array
{
    $arquivo = dirname(__DIR__) . '/sql/schema.sql';
    $sql = is_file($arquivo) ? (string) file_get_contents($arquivo) : '';
    $sql = preg_replace('/^\s*--.*$/m', '', $sql) ?? '';
    $tabelas = [];

    foreach (explode(';', $sql) as $comando) {
        if (preg_match('/CREATE TABLE IF NOT EXISTS\s+`?(\w+)`?/i', $comando, $m)) {
            $tabelas[$m[1]] = trim($comando);
        }
    }

    return $tabelas;
}

/** Cria as tabelas e colunas que ainda não existem */
function vlAplicarMigracoes(PDO $pdo): void
{
    /* 1) tabelas que faltam, já na versão mais recente (ordem do schema.sql) */
    foreach (vlTabelasDoSchema() as $tabela => $criar) {
        if (!vlTabelaExiste($pdo, $tabela)) {
            $pdo->exec($criar);
        }
    }

    /* 2) colunas acrescentadas em cada versão, para tabelas antigas */
    $colunas = [
        /* versão 1: painel administrativo */
        ['motoristas', 'bloqueado', "TINYINT(1) NOT NULL DEFAULT 0 AFTER lugares_van"],
        ['passageiros', 'bloqueado', "TINYINT(1) NOT NULL DEFAULT 0 AFTER foto"],

        /* versão 2: entregas */
        ['motoristas', 'faz_passageiros', "TINYINT(1) NOT NULL DEFAULT 1 AFTER lugares_van"],
        ['motoristas', 'faz_entregas', "TINYINT(1) NOT NULL DEFAULT 0 AFTER faz_passageiros"],
        ['motoristas', 'capacidade_carga_kg', "SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER faz_entregas"],

        /* versão 3: Área de Envios e compatibilidade */
        ['passageiros', 'tipo_conta', "ENUM('pessoa','empresa') NOT NULL DEFAULT 'pessoa' AFTER foto"],
        ['passageiros', 'empresa_nome', "VARCHAR(120) NOT NULL DEFAULT '' AFTER tipo_conta"],
        ['passageiros', 'documento', "VARCHAR(18) NOT NULL DEFAULT '' AFTER empresa_nome"],
        ['motoristas', 'tipo_veiculo', "ENUM('moto','carro','utilitario','van','caminhao') NOT NULL DEFAULT 'van' AFTER capacidade_carga_kg"],
        ['entregas', 'comprimento_cm', "SMALLINT UNSIGNED NULL AFTER volumes"],
        ['entregas', 'largura_cm', "SMALLINT UNSIGNED NULL AFTER comprimento_cm"],
        ['entregas', 'altura_cm', "SMALLINT UNSIGNED NULL AFTER largura_cm"],
        ['entregas', 'veiculo_necessario', "ENUM('moto','carro','utilitario','van','caminhao') NOT NULL DEFAULT 'moto' AFTER altura_cm"],
        ['entregas', 'horario_retirada', "TIME NULL AFTER data_retirada"],
    ];

    foreach ($colunas as [$tabela, $coluna, $definicao]) {
        if (!vlTabelaExiste($pdo, $tabela)) {
            throw new RuntimeException(
                "Tabela {$tabela} não encontrada. Envie a pasta sql/ para o servidor ou importe sql/schema.sql."
            );
        }
        if (!vlColunaExiste($pdo, $tabela, $coluna)) {
            $pdo->exec("ALTER TABLE `{$tabela}` ADD COLUMN `{$coluna}` {$definicao}");
        }
    }

    /* 3) registra a versão */
    $pdo->exec('CREATE TABLE IF NOT EXISTS vanloc_versao (versao INT UNSIGNED NOT NULL) ENGINE=InnoDB');
    $pdo->exec('DELETE FROM vanloc_versao');
    $pdo->prepare('INSERT INTO vanloc_versao (versao) VALUES (?)')->execute([VL_VERSAO_BANCO]);
}

/** Confere a versão do banco e atualiza se necessário (consulta rápida quando já está em dia) */
function vlVerificarBanco(PDO $pdo): void
{
    try {
        $versao = (int) $pdo->query('SELECT MAX(versao) FROM vanloc_versao')->fetchColumn();
    } catch (PDOException $e) {
        $versao = 0;
    }

    if ($versao >= VL_VERSAO_BANCO) {
        return;
    }

    if ((int) $pdo->query("SELECT GET_LOCK('vanloc_migracao', 15)")->fetchColumn() !== 1) {
        throw new RuntimeException('Não foi possível obter o bloqueio para atualizar o banco.');
    }

    try {
        error_log('[VANLOC] Atualizando o banco de dados da versão ' . $versao . ' para ' . VL_VERSAO_BANCO);
        vlAplicarMigracoes($pdo);
    } finally {
        $pdo->query("SELECT RELEASE_LOCK('vanloc_migracao')");
    }
}
