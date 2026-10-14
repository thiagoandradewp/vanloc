<?php
/* =====================================================
VANLOC - Painel administrativo
=====================================================
Acesso / contas de administrador
GET  admin.php?acao=sessao            administrador logado e se já existe algum
POST admin.php?acao=instalar          {chave, nome, email, senha}  cria o 1º administrador
POST admin.php?acao=login             {email, senha}
POST admin.php?acao=logout
GET  admin.php?acao=admins
POST admin.php?acao=criar_admin       {nome, email, senha}
POST admin.php?acao=excluir_admin     {id}
POST admin.php?acao=senha             {senha_atual, senha_nova}

Gestão da plataforma
GET  admin.php?acao=resumo
GET  admin.php?acao=motoristas        ?q=
GET  admin.php?acao=passageiros       ?q=
GET  admin.php?acao=viagens           ?q= &status=ativa|cancelada|encerrada
GET  admin.php?acao=reservas          ?q= &status=
POST admin.php?acao=bloquear          {tipo: motorista|passageiro, id, bloqueado}
POST admin.php?acao=excluir           {tipo: motorista|passageiro, id}
POST admin.php?acao=cancelar_viagem   {id}
POST admin.php?acao=status_reserva    {id, status: confirmada|recusada|cancelada}
GET  admin.php?acao=entregas          ?q= &status=
POST admin.php?acao=criar_entrega     dados da entrega (ex: pedido de loja parceira)
POST admin.php?acao=cancelar_entrega  {id}
===================================================== */

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/entregas-comum.php';

const VL_LIMITE_LISTA = 500;

function totalAdmins(): int
{
    return (int) db()->query('SELECT COUNT(*) FROM administradores')->fetchColumn();
}

function dadosAdmin(int $id): ?array
{
    $consulta = db()->prepare('SELECT id, nome, email FROM administradores WHERE id = ?');
    $consulta->execute([$id]);

    return $consulta->fetch() ?: null;
}

function entrarComoAdmin(int $id): never
{
    db()->prepare('UPDATE administradores SET ultimo_acesso = NOW() WHERE id = ?')->execute([$id]);
    iniciarSessao('admin', $id);
    responder(['admin' => dadosAdmin($id), 'instalado' => true]);
}

/** Filtro de busca (LIKE) com os curingas escapados */
function termoBusca(): ?string
{
    $q = trim((string) ($_GET['q'] ?? ''));

    if ($q === '') {
        return null;
    }

    return '%' . addcslashes(mb_substr($q, 0, 100), '%_\\') . '%';
}

function senhaLivre(string $campo): string
{
    $senha = (string) (entrada()[$campo] ?? '');

    if (strlen($senha) < 8) {
        erro('A senha do administrador precisa ter pelo menos 8 caracteres.');
    }
    if (strlen($senha) > 72) {
        erro('A senha pode ter no máximo 72 caracteres.');
    }

    return password_hash($senha, PASSWORD_DEFAULT);
}

function tipoConta(): array
{
    $tipo = (string) (entrada()['tipo'] ?? '');
    $tabelas = ['motorista' => 'motoristas', 'passageiro' => 'passageiros'];

    if (!isset($tabelas[$tipo])) {
        erro('Tipo de conta inválido.');
    }

    return [$tipo, $tabelas[$tipo]];
}

function numeros(array $linha, array $campos): array
{
    foreach ($campos as $campo) {
        $linha[$campo] = (int) $linha[$campo];
    }

    return $linha;
}


switch (acao()) {

    /* -------------------------------------------------
    ACESSO
    ------------------------------------------------- */

    case 'sessao':
        $usuario = usuarioLogado();
        $admin = $usuario && $usuario['tipo'] === 'admin'
            ? dadosAdmin((int) $usuario['id'])
            : null;

        responder(['admin' => $admin, 'instalado' => totalAdmins() > 0]);

    case 'instalar':
        exigirPost();

        if (totalAdmins() > 0) {
            erro('O painel já foi instalado. Faça login.', 409);
        }

        $chaveConfig = (string) ($VL_CONFIG['admin_chave_instalacao'] ?? '');

        if (strlen($chaveConfig) < 12 || $chaveConfig === 'TROQUE_POR_UMA_CHAVE_SECRETA') {
            erro('Defina "admin_chave_instalacao" (mínimo 12 caracteres) no arquivo api/config.php antes de instalar.', 403);
        }

        verificarTentativas('instalar');

        if (!hash_equals($chaveConfig, (string) (entrada()['chave'] ?? ''))) {
            registrarTentativa('instalar');
            erro('Chave de instalação incorreta.', 403);
        }

        $nome = texto('nome', 120, true, 'nome');
        $email = emailValido();
        $hash = senhaLivre('senha');

        db()->prepare('INSERT INTO administradores (nome, email, senha_hash) VALUES (?, ?, ?)')
            ->execute([$nome, $email, $hash]);

        $adminId = (int) db()->lastInsertId();
        limparTentativas('instalar');
        entrarComoAdmin($adminId);

    case 'login':
        exigirPost();

        $email = emailValido();
        $chave = 'admin|' . $email;

        verificarTentativas($chave);

        $consulta = db()->prepare('SELECT id, senha_hash FROM administradores WHERE email = ?');
        $consulta->execute([$email]);
        $admin = $consulta->fetch();

        if (!$admin || !password_verify((string) (entrada()['senha'] ?? ''), $admin['senha_hash'])) {
            registrarTentativa($chave);
            erro('Email ou senha incorretos.', 401);
        }

        limparTentativas($chave);
        entrarComoAdmin((int) $admin['id']);

    case 'logout':
        exigirPost();
        encerrarSessao();
        responder(['ok' => true]);


    /* -------------------------------------------------
    ADMINISTRADORES
    ------------------------------------------------- */

    case 'admins':
        exigirLogin('admin');

        $lista = db()->query(
            'SELECT id, nome, email, ultimo_acesso, criado_em FROM administradores ORDER BY nome'
        )->fetchAll();

        responder(['admins' => array_map(fn($a) => numeros($a, ['id']), $lista)]);

    case 'criar_admin':
        exigirPost();
        exigirLogin('admin');

        $nome = texto('nome', 120, true, 'nome');
        $email = emailValido();
        $hash = senhaLivre('senha');

        $existe = db()->prepare('SELECT 1 FROM administradores WHERE email = ?');
        $existe->execute([$email]);
        if ($existe->fetchColumn()) {
            erro('Já existe um administrador com este email.', 409);
        }

        db()->prepare('INSERT INTO administradores (nome, email, senha_hash) VALUES (?, ?, ?)')
            ->execute([$nome, $email, $hash]);

        responder(['ok' => true], 201);

    case 'excluir_admin':
        exigirPost();
        $adminId = exigirLogin('admin');
        $id = inteiro('id', 1, PHP_INT_MAX, 'administrador');

        if ($id === $adminId) {
            erro('Você não pode excluir a própria conta.');
        }

        db()->prepare('DELETE FROM administradores WHERE id = ?')->execute([$id]);
        responder(['ok' => true]);

    case 'senha':
        exigirPost();
        $adminId = exigirLogin('admin');

        $consulta = db()->prepare('SELECT senha_hash FROM administradores WHERE id = ?');
        $consulta->execute([$adminId]);

        if (!password_verify((string) (entrada()['senha_atual'] ?? ''), (string) $consulta->fetchColumn())) {
            erro('A senha atual está incorreta.', 403);
        }

        db()->prepare('UPDATE administradores SET senha_hash = ? WHERE id = ?')
            ->execute([senhaLivre('senha_nova'), $adminId]);

        responder(['ok' => true]);


    /* -------------------------------------------------
    VISÃO GERAL
    ------------------------------------------------- */

    case 'resumo':
        exigirLogin('admin');
        $pdo = db();

        $contas = $pdo->query(
            "SELECT
                (SELECT COUNT(*) FROM passageiros) AS passageiros,
                (SELECT COUNT(*) FROM passageiros WHERE criado_em >= NOW() - INTERVAL 30 DAY) AS passageiros_novos,
                (SELECT COUNT(*) FROM motoristas) AS motoristas,
                (SELECT COUNT(*) FROM motoristas WHERE criado_em >= NOW() - INTERVAL 30 DAY) AS motoristas_novos,
                (SELECT COUNT(*) FROM passageiros WHERE bloqueado = 1)
                    + (SELECT COUNT(*) FROM motoristas WHERE bloqueado = 1) AS bloqueados,
                (SELECT COUNT(*) FROM viagens WHERE status = 'ativa' AND data >= CURDATE()) AS viagens_ativas"
        )->fetch();

        $porStatus = ['solicitada' => 0, 'confirmada' => 0, 'recusada' => 0, 'cancelada' => 0];
        foreach ($pdo->query('SELECT status, COUNT(*) AS total FROM reservas GROUP BY status') as $linha) {
            $porStatus[$linha['status']] = (int) $linha['total'];
        }

        $receita = (float) $pdo->query(
            "SELECT COALESCE(SUM(valor_unitario * quantidade), 0) FROM reservas WHERE status = 'confirmada'"
        )->fetchColumn();

        $rotas = $pdo->query(
            "SELECT v.origem, v.destino, COUNT(r.id) AS reservas
             FROM reservas r JOIN viagens v ON v.id = r.viagem_id
             WHERE r.status IN ('solicitada', 'confirmada')
             GROUP BY v.origem, v.destino
             ORDER BY reservas DESC
             LIMIT 5"
        )->fetchAll();

        $ultimas = $pdo->query(
            "SELECT r.id, r.codigo, r.nome, r.quantidade, r.valor_unitario AS valor, r.status, r.criado_em,
                    v.origem, v.destino, v.data, m.nome AS motorista_nome
             FROM reservas r
             JOIN viagens v ON v.id = r.viagem_id
             JOIN motoristas m ON m.id = v.motorista_id
             ORDER BY r.criado_em DESC
             LIMIT 8"
        )->fetchAll();

        responder([
            'contas' => array_map('intval', $contas),
            'reservas' => $porStatus,
            'receita_confirmada' => $receita,
            'rotas' => array_map(fn($r) => numeros($r, ['reservas']), $rotas),
            'ultimas_reservas' => array_map(function ($r) {
                $r = numeros($r, ['id', 'quantidade']);
                $r['valor'] = (float) $r['valor'];
                return $r;
            }, $ultimas),
        ]);


    /* -------------------------------------------------
    LISTAGENS
    ------------------------------------------------- */

    case 'motoristas':
        exigirLogin('admin');
        $q = termoBusca();

        $consulta = db()->prepare(
            "SELECT m.id, m.nome, m.email, m.telefone, m.cpf, m.modelo_van, m.placa_van, m.lugares_van,
                    m.faz_passageiros, m.faz_entregas, m.capacidade_carga_kg, m.tipo_veiculo, m.bloqueado, m.criado_em,
                    (SELECT GROUP_CONCAT(r.cidade ORDER BY r.cidade SEPARATOR ', ')
                        FROM motorista_regioes r WHERE r.motorista_id = m.id) AS regioes,
                    (SELECT COUNT(*) FROM viagens v WHERE v.motorista_id = m.id) AS viagens,
                    (SELECT COUNT(*) FROM viagens v WHERE v.motorista_id = m.id
                        AND v.status = 'ativa' AND v.data >= CURDATE()) AS viagens_ativas,
                    (SELECT COUNT(*) FROM reservas r JOIN viagens v ON v.id = r.viagem_id
                        WHERE v.motorista_id = m.id AND r.status = 'confirmada') AS reservas_confirmadas
             FROM motoristas m
             WHERE ? IS NULL OR m.nome LIKE ? OR m.email LIKE ? OR m.telefone LIKE ? OR m.placa_van LIKE ?
             ORDER BY m.criado_em DESC
             LIMIT " . VL_LIMITE_LISTA
        );
        $consulta->execute([$q, $q, $q, $q, $q]);

        responder(['motoristas' => array_map(
            fn($m) => numeros($m, ['id', 'lugares_van', 'faz_passageiros', 'faz_entregas', 'capacidade_carga_kg',
                                   'bloqueado', 'viagens', 'viagens_ativas', 'reservas_confirmadas']),
            $consulta->fetchAll()
        )]);

    case 'passageiros':
        exigirLogin('admin');
        $q = termoBusca();

        $consulta = db()->prepare(
            "SELECT p.id, p.nome, p.email, p.telefone, p.cidade, p.estado, p.tipo_conta, p.empresa_nome,
                    p.documento, p.bloqueado, p.criado_em,
                    (SELECT COUNT(*) FROM reservas r WHERE r.passageiro_id = p.id) AS reservas,
                    (SELECT COUNT(*) FROM entregas e WHERE e.passageiro_id = p.id) AS entregas
             FROM passageiros p
             WHERE ? IS NULL OR p.nome LIKE ? OR p.email LIKE ? OR p.telefone LIKE ? OR p.cidade LIKE ?
                OR p.empresa_nome LIKE ?
             ORDER BY p.criado_em DESC
             LIMIT " . VL_LIMITE_LISTA
        );
        $consulta->execute([$q, $q, $q, $q, $q, $q]);

        responder(['passageiros' => array_map(
            fn($p) => numeros($p, ['id', 'bloqueado', 'reservas', 'entregas']),
            $consulta->fetchAll()
        )]);

    case 'viagens':
        exigirLogin('admin');
        $q = termoBusca();
        $status = (string) ($_GET['status'] ?? '');

        $filtroStatus = match ($status) {
            'ativa' => "AND v.status = 'ativa' AND v.data >= CURDATE()",
            'encerrada' => "AND v.status = 'ativa' AND v.data < CURDATE()",
            'cancelada' => "AND v.status = 'cancelada'",
            default => '',
        };

        $consulta = db()->prepare(
            "SELECT v.id, v.origem, v.destino, v.data, v.horario, v.valor, v.vagas, v.status,
                    m.id AS motorista_id, m.nome AS motorista_nome,
                    (SELECT COALESCE(SUM(r.quantidade), 0) FROM reservas r
                        WHERE r.viagem_id = v.id AND r.status IN ('solicitada', 'confirmada')) AS ocupadas
             FROM viagens v
             JOIN motoristas m ON m.id = v.motorista_id
             WHERE (? IS NULL OR v.origem LIKE ? OR v.destino LIKE ? OR m.nome LIKE ?) {$filtroStatus}
             ORDER BY v.data DESC, v.horario DESC
             LIMIT " . VL_LIMITE_LISTA
        );
        $consulta->execute([$q, $q, $q, $q]);

        responder(['viagens' => array_map(function ($v) {
            $v = numeros($v, ['id', 'vagas', 'motorista_id', 'ocupadas']);
            $v['valor'] = (float) $v['valor'];
            $v['horario'] = substr($v['horario'], 0, 5);
            return $v;
        }, $consulta->fetchAll())]);

    case 'reservas':
        exigirLogin('admin');
        $q = termoBusca();
        $status = (string) ($_GET['status'] ?? '');
        $status = in_array($status, ['solicitada', 'confirmada', 'recusada', 'cancelada'], true) ? $status : null;

        $consulta = db()->prepare(
            "SELECT r.id, r.codigo, r.nome, r.telefone, r.quantidade, r.valor_unitario AS valor,
                    r.status, r.criado_em, p.email AS passageiro_email,
                    v.origem, v.destino, v.data, v.horario, m.nome AS motorista_nome
             FROM reservas r
             JOIN passageiros p ON p.id = r.passageiro_id
             JOIN viagens v ON v.id = r.viagem_id
             JOIN motoristas m ON m.id = v.motorista_id
             WHERE (? IS NULL OR r.status = ?)
               AND (? IS NULL OR r.codigo LIKE ? OR r.nome LIKE ? OR p.email LIKE ?
                    OR m.nome LIKE ? OR v.origem LIKE ? OR v.destino LIKE ?)
             ORDER BY r.criado_em DESC
             LIMIT " . VL_LIMITE_LISTA
        );
        $consulta->execute([$status, $status, $q, $q, $q, $q, $q, $q, $q]);

        responder(['reservas' => array_map(function ($r) {
            $r = numeros($r, ['id', 'quantidade']);
            $r['valor'] = (float) $r['valor'];
            $r['horario'] = substr($r['horario'], 0, 5);
            return $r;
        }, $consulta->fetchAll())]);


    /* -------------------------------------------------
    AÇÕES
    ------------------------------------------------- */

    case 'bloquear':
        exigirPost();
        exigirLogin('admin');
        [, $tabela] = tipoConta();
        $id = inteiro('id', 1, PHP_INT_MAX, 'conta');
        $bloqueado = !empty(entrada()['bloqueado']) ? 1 : 0;

        $atualiza = db()->prepare("UPDATE {$tabela} SET bloqueado = ? WHERE id = ?");
        $atualiza->execute([$bloqueado, $id]);

        responder(['ok' => true]);

    case 'excluir':
        exigirPost();
        exigirLogin('admin');
        [$tipo, $tabela] = tipoConta();
        $id = inteiro('id', 1, PHP_INT_MAX, 'conta');

        /* guarda as fotos para apagar os arquivos depois */
        if ($tipo === 'motorista') {
            $fotos = db()->prepare("SELECT foto FROM viagens WHERE motorista_id = ? AND foto <> ''");
        } else {
            $fotos = db()->prepare("SELECT foto FROM passageiros WHERE id = ? AND foto <> ''");
        }
        $fotos->execute([$id]);
        $fotos = $fotos->fetchAll(PDO::FETCH_COLUMN);

        /* entregas aceitas voltam a ficar disponíveis; as solicitadas
        por um cliente excluído são canceladas */
        liberarEntregasDaConta($tipo, $id);

        /* viagens, planos e reservas são apagados em cascata */
        $apaga = db()->prepare("DELETE FROM {$tabela} WHERE id = ?");
        $apaga->execute([$id]);

        if ($apaga->rowCount() === 0) {
            erro('Conta não encontrada.', 404);
        }

        array_map('removerImagem', $fotos);

        responder(['ok' => true]);

    case 'cancelar_viagem':
        exigirPost();
        exigirLogin('admin');
        $id = inteiro('id', 1, PHP_INT_MAX, 'viagem');

        $pdo = db();
        $pdo->beginTransaction();

        $atualiza = $pdo->prepare("UPDATE viagens SET status = 'cancelada' WHERE id = ? AND status = 'ativa'");
        $atualiza->execute([$id]);

        if ($atualiza->rowCount() === 0) {
            $pdo->rollBack();
            erro('Viagem não encontrada ou já cancelada.', 404);
        }

        $pdo->prepare(
            "UPDATE reservas SET status = 'recusada'
             WHERE viagem_id = ? AND status IN ('solicitada', 'confirmada')"
        )->execute([$id]);

        $pdo->commit();
        responder(['ok' => true]);

    case 'status_reserva':
        exigirPost();
        exigirLogin('admin');
        $id = inteiro('id', 1, PHP_INT_MAX, 'reserva');
        $status = (string) (entrada()['status'] ?? '');

        if (!in_array($status, ['confirmada', 'recusada', 'cancelada'], true)) {
            erro('Status inválido.');
        }

        $atualiza = db()->prepare(
            "UPDATE reservas SET status = ? WHERE id = ? AND status IN ('solicitada', 'confirmada')"
        );
        $atualiza->execute([$status, $id]);

        if ($atualiza->rowCount() === 0) {
            erro('Reserva não encontrada ou já finalizada.', 409);
        }

        responder(['ok' => true]);



    /* -------------------------------------------------
    ENTREGAS
    ------------------------------------------------- */

    case 'entregas':
        exigirLogin('admin');
        $q = termoBusca();
        $status = (string) ($_GET['status'] ?? '');

        $filtroStatus = match ($status) {
            'disponivel', 'entregue', 'cancelada' => "AND e.status = '{$status}'",
            'andamento' => "AND e.status IN ('aguardando_retirada', 'coletada', 'em_transito')",
            default => '',
        };

        $consulta = db()->prepare(
            'SELECT ' . VL_ENTREGA_CAMPOS . ', m.nome AS motorista_nome, p.nome AS cliente_nome,
                    p.tipo_conta AS cliente_tipo, p.empresa_nome AS cliente_empresa
             FROM entregas e
             LEFT JOIN motoristas m ON m.id = e.motorista_id
             LEFT JOIN passageiros p ON p.id = e.passageiro_id
             WHERE (? IS NULL OR e.codigo LIKE ? OR e.descricao LIKE ? OR e.retirada_cidade LIKE ?
                    OR e.destino_cidade LIKE ? OR m.nome LIKE ? OR p.nome LIKE ? OR p.empresa_nome LIKE ?) ' . $filtroStatus . '
             ORDER BY e.criado_em DESC
             LIMIT ' . VL_LIMITE_LISTA
        );
        $consulta->execute([$q, $q, $q, $q, $q, $q, $q, $q]);

        responder(['entregas' => array_map('formatarEntrega', $consulta->fetchAll())]);

    case 'criar_entrega':
        exigirPost();
        exigirLogin('admin');

        responder(['ok' => true, 'codigo' => criarEntrega(null)], 201);

    case 'cancelar_entrega':
        exigirPost();
        exigirLogin('admin');
        $id = inteiro('id', 1, PHP_INT_MAX, 'entrega');

        $cancela = db()->prepare(
            "UPDATE entregas SET status = 'cancelada', cancelada_em = NOW()
             WHERE id = ? AND status IN ('disponivel', 'aguardando_retirada', 'coletada', 'em_transito')"
        );
        $cancela->execute([$id]);

        if ($cancela->rowCount() === 0) {
            erro('Entrega não encontrada ou já finalizada.', 409);
        }

        responder(['ok' => true]);

    default:
        erro('Ação inválida.', 404);
}
