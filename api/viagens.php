<?php
/* =====================================================
VANLOC - Viagens
=====================================================
GET  viagens.php                  viagens futuras (público)
GET  viagens.php?acao=minhas      viagens do motorista logado
POST viagens.php?acao=criar       multipart: origem, destino, data, horario, valor, vagas, foto
POST viagens.php?acao=cancelar    {id}
===================================================== */

require __DIR__ . '/bootstrap.php';

/* soma das vagas já ocupadas por reservas ativas */
const VL_SQL_OCUPADAS =
    "(SELECT COALESCE(SUM(r.quantidade), 0) FROM reservas r
      WHERE r.viagem_id = v.id AND r.status IN ('solicitada', 'confirmada'))";

function formatarViagem(array $v): array
{
    $v['id'] = (int) $v['id'];
    $v['motorista_id'] = (int) $v['motorista_id'];
    $v['valor'] = (float) $v['valor'];
    $v['vagas'] = (int) $v['vagas'];
    $v['ocupadas'] = (int) $v['ocupadas'];
    $v['vagas_restantes'] = max(0, $v['vagas'] - $v['ocupadas']);
    $v['horario'] = substr($v['horario'], 0, 5);

    return $v;
}


switch (acao()) {

    case '':
        $consulta = db()->query(
            'SELECT v.id, v.motorista_id, m.nome AS motorista_nome, v.origem, v.destino,
                    v.data, v.horario, v.valor, v.vagas, v.foto, ' . VL_SQL_OCUPADAS . ' AS ocupadas
             FROM viagens v
             JOIN motoristas m ON m.id = v.motorista_id
             WHERE v.status = \'ativa\' AND v.data >= CURDATE() AND m.bloqueado = 0
             ORDER BY v.data, v.horario
             LIMIT 200'
        );

        responder(['viagens' => array_map('formatarViagem', $consulta->fetchAll())]);

    case 'minhas':
        $motoristaId = exigirLogin('motorista');

        $consulta = db()->prepare(
            'SELECT v.id, v.motorista_id, v.origem, v.destino, v.data, v.horario, v.valor,
                    v.vagas, v.foto, v.status, ' . VL_SQL_OCUPADAS . ' AS ocupadas
             FROM viagens v
             WHERE v.motorista_id = ?
             ORDER BY v.data DESC, v.horario DESC'
        );
        $consulta->execute([$motoristaId]);

        responder(['viagens' => array_map('formatarViagem', $consulta->fetchAll())]);

    case 'criar':
        exigirPost();
        $motoristaId = exigirLogin('motorista');

        $servico = db()->prepare('SELECT faz_passageiros FROM motoristas WHERE id = ?');
        $servico->execute([$motoristaId]);
        if ((int) $servico->fetchColumn() !== 1) {
            erro('Ative o transporte de passageiros em "Meus serviços" para publicar viagens.', 403);
        }

        $origem = texto('origem', 80, true, 'origem');
        $destino = texto('destino', 80, true, 'destino');
        $data = dataFutura('data');
        $horario = horario('horario');
        $valor = decimal('valor', 0, 100000, 'valor da viagem');
        $vagas = inteiro('vagas', 1, 60, 'vagas');
        $foto = salvarImagem('foto', 'vans');

        db()->prepare(
            'INSERT INTO viagens (motorista_id, origem, destino, data, horario, valor, vagas, foto)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([$motoristaId, $origem, $destino, $data, $horario, $valor, $vagas, $foto]);

        responder(['ok' => true, 'id' => (int) db()->lastInsertId()], 201);

    case 'cancelar':
        exigirPost();
        $motoristaId = exigirLogin('motorista');
        $id = inteiro('id', 1, PHP_INT_MAX, 'viagem');

        $pdo = db();
        $pdo->beginTransaction();

        $atualiza = $pdo->prepare(
            "UPDATE viagens SET status = 'cancelada' WHERE id = ? AND motorista_id = ? AND status = 'ativa'"
        );
        $atualiza->execute([$id, $motoristaId]);

        if ($atualiza->rowCount() === 0) {
            $pdo->rollBack();
            erro('Viagem não encontrada.', 404);
        }

        /* as reservas ativas dessa viagem passam a "recusada" */
        $pdo->prepare(
            "UPDATE reservas SET status = 'recusada'
             WHERE viagem_id = ? AND status IN ('solicitada', 'confirmada')"
        )->execute([$id]);

        $pdo->commit();
        responder(['ok' => true]);

    default:
        erro('Ação inválida.', 404);
}
