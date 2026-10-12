<?php
/* =====================================================
VANLOC - Reservas
=====================================================
GET  reservas.php                   reservas do passageiro logado
GET  reservas.php?acao=motorista    reservas nas viagens do motorista logado
POST reservas.php?acao=criar        {viagem_id, nome, telefone, quantidade}  (passageiro)
POST reservas.php?acao=cancelar     {id}                                     (passageiro)
POST reservas.php?acao=status       {id, status: confirmada|recusada}        (motorista)
===================================================== */

require __DIR__ . '/bootstrap.php';

function formatarReserva(array $r): array
{
    $r['id'] = (int) $r['id'];
    $r['viagem_id'] = (int) $r['viagem_id'];
    $r['quantidade'] = (int) $r['quantidade'];
    $r['valor'] = (float) $r['valor'];
    $r['horario'] = substr($r['horario'], 0, 5);

    return $r;
}

function gerarCodigo(): string
{
    return 'VNL-' . strtoupper(substr(base_convert(bin2hex(random_bytes(6)), 16, 36), 0, 8));
}


switch (acao()) {

    case '':
        $passageiroId = exigirLogin('passageiro');

        $consulta = db()->prepare(
            'SELECT r.id, r.codigo, r.viagem_id, r.nome, r.telefone, r.quantidade,
                    r.valor_unitario AS valor, r.status, r.criado_em,
                    v.origem, v.destino, v.data, v.horario,
                    m.nome AS motorista_nome, m.telefone AS motorista_telefone
             FROM reservas r
             JOIN viagens v ON v.id = r.viagem_id
             JOIN motoristas m ON m.id = v.motorista_id
             WHERE r.passageiro_id = ?
             ORDER BY r.criado_em DESC'
        );
        $consulta->execute([$passageiroId]);

        $reservas = array_map(function (array $r) {
            $r = formatarReserva($r);
            /* o telefone do motorista só aparece depois da confirmação */
            if ($r['status'] !== 'confirmada') {
                $r['motorista_telefone'] = '';
            }
            return $r;
        }, $consulta->fetchAll());

        responder(['reservas' => $reservas]);

    case 'motorista':
        $motoristaId = exigirLogin('motorista');

        $consulta = db()->prepare(
            'SELECT r.id, r.codigo, r.viagem_id, r.nome, r.telefone, r.quantidade,
                    r.valor_unitario AS valor, r.status, r.criado_em,
                    v.origem, v.destino, v.data, v.horario
             FROM reservas r
             JOIN viagens v ON v.id = r.viagem_id
             WHERE v.motorista_id = ?
             ORDER BY (r.status = \'solicitada\') DESC, v.data, r.criado_em DESC'
        );
        $consulta->execute([$motoristaId]);

        responder(['reservas' => array_map('formatarReserva', $consulta->fetchAll())]);

    case 'criar':
        exigirPost();
        $passageiroId = exigirLogin('passageiro');

        $viagemId = inteiro('viagem_id', 1, PHP_INT_MAX, 'viagem');
        $nome = texto('nome', 120, true, 'nome');
        $telefone = texto('telefone', 20, true, 'telefone');
        $quantidade = inteiro('quantidade', 1, 20, 'quantidade de passageiros');

        $pdo = db();
        $pdo->beginTransaction();

        /* trava a viagem para que duas reservas simultâneas
        não ultrapassem o número de vagas */
        $consulta = $pdo->prepare(
            "SELECT id, valor, vagas, data FROM viagens
             WHERE id = ? AND status = 'ativa' FOR UPDATE"
        );
        $consulta->execute([$viagemId]);
        $viagem = $consulta->fetch();

        if (!$viagem || $viagem['data'] < date('Y-m-d')) {
            $pdo->rollBack();
            erro('Esta viagem não está mais disponível.', 404);
        }

        $ocupadas = $pdo->prepare(
            "SELECT COALESCE(SUM(quantidade), 0) FROM reservas
             WHERE viagem_id = ? AND status IN ('solicitada', 'confirmada')"
        );
        $ocupadas->execute([$viagemId]);
        $restantes = (int) $viagem['vagas'] - (int) $ocupadas->fetchColumn();

        if ($quantidade > $restantes) {
            $pdo->rollBack();
            erro($restantes > 0
                ? "Restam apenas {$restantes} vaga(s) nesta viagem."
                : 'Esta viagem está lotada.', 409);
        }

        $codigo = gerarCodigo();

        $pdo->prepare(
            'INSERT INTO reservas (codigo, viagem_id, passageiro_id, nome, telefone, quantidade, valor_unitario)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        )->execute([$codigo, $viagemId, $passageiroId, $nome, $telefone, $quantidade, $viagem['valor']]);

        $pdo->commit();

        responder(['ok' => true, 'codigo' => $codigo], 201);

    case 'cancelar':
        exigirPost();
        $passageiroId = exigirLogin('passageiro');
        $id = inteiro('id', 1, PHP_INT_MAX, 'reserva');

        $atualiza = db()->prepare(
            "UPDATE reservas SET status = 'cancelada'
             WHERE id = ? AND passageiro_id = ? AND status IN ('solicitada', 'confirmada')"
        );
        $atualiza->execute([$id, $passageiroId]);

        if ($atualiza->rowCount() === 0) {
            erro('Esta reserva não pode mais ser cancelada.', 409);
        }

        responder(['ok' => true]);

    case 'status':
        exigirPost();
        $motoristaId = exigirLogin('motorista');
        $id = inteiro('id', 1, PHP_INT_MAX, 'reserva');
        $status = (string) (entrada()['status'] ?? '');

        if (!in_array($status, ['confirmada', 'recusada'], true)) {
            erro('Status inválido.');
        }

        /* só reservas de viagens do próprio motorista */
        $atualiza = db()->prepare(
            "UPDATE reservas r
             JOIN viagens v ON v.id = r.viagem_id
             SET r.status = ?
             WHERE r.id = ? AND v.motorista_id = ? AND r.status IN ('solicitada', 'confirmada')"
        );
        $atualiza->execute([$status, $id, $motoristaId]);

        if ($atualiza->rowCount() === 0) {
            erro('Reserva não encontrada ou já finalizada.', 409);
        }

        responder(['ok' => true]);

    default:
        erro('Ação inválida.', 404);
}
