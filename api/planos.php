<?php
/* =====================================================
VANLOC - Planos mensais dos motoristas
=====================================================
GET  planos.php?motorista_id=1    planos de um motorista (público)
GET  planos.php?acao=meus         planos do motorista logado
POST planos.php?acao=salvar       {id?, nome, valor, quantidade, vantagens[]}
POST planos.php?acao=remover      {id}
===================================================== */

require __DIR__ . '/bootstrap.php';

/* do mais caro para o mais barato */
function listarPlanos(int $motoristaId): array
{
    $consulta = db()->prepare(
        'SELECT id, nome, valor, quantidade, vantagens
         FROM planos WHERE motorista_id = ?
         ORDER BY valor DESC, id'
    );
    $consulta->execute([$motoristaId]);

    return array_map(function (array $p) {
        $p['id'] = (int) $p['id'];
        $p['valor'] = (float) $p['valor'];
        $p['quantidade'] = $p['quantidade'] === null ? null : (int) $p['quantidade'];
        $p['vantagens'] = json_decode($p['vantagens'], true) ?: [];
        return $p;
    }, $consulta->fetchAll());
}


switch (acao()) {

    case '':
        $motoristaId = filter_var($_GET['motorista_id'] ?? null, FILTER_VALIDATE_INT);

        if (!$motoristaId) {
            erro('Motorista inválido.');
        }

        $consulta = db()->prepare('SELECT id, nome FROM motoristas WHERE id = ? AND bloqueado = 0');
        $consulta->execute([$motoristaId]);
        $motorista = $consulta->fetch();

        if (!$motorista) {
            erro('Motorista não encontrado.', 404);
        }

        $motorista['id'] = (int) $motorista['id'];

        responder(['motorista' => $motorista, 'planos' => listarPlanos($motoristaId)]);

    case 'meus':
        $motoristaId = exigirLogin('motorista');
        responder(['planos' => listarPlanos($motoristaId)]);

    case 'salvar':
        exigirPost();
        $motoristaId = exigirLogin('motorista');

        $id = filter_var(entrada()['id'] ?? null, FILTER_VALIDATE_INT) ?: null;
        $nome = texto('nome', 80, true, 'nome do plano');
        $valor = decimal('valor', 0, 100000, 'valor do plano');
        $quantidadeBruta = entrada()['quantidade'] ?? '';
        $quantidade = $quantidadeBruta === '' || $quantidadeBruta === null
            ? null
            : inteiro('quantidade', 1, 999, 'quantidade de viagens');

        if ($valor < VL_VALOR_MINIMO_PLANO) {
            erro('O valor mínimo do plano é R$ ' . number_format(VL_VALOR_MINIMO_PLANO, 2, ',', '.') . ' por viagem.');
        }

        $vantagens = entrada()['vantagens'] ?? [];
        $vantagens = is_array($vantagens) ? $vantagens : [];
        $vantagens = array_values(array_filter(array_map(
            fn($v) => mb_substr(trim((string) $v), 0, 120),
            array_slice($vantagens, 0, 10)
        ), fn($v) => $v !== ''));

        $json = json_encode($vantagens, JSON_UNESCAPED_UNICODE);

        if ($id) {
            $atualiza = db()->prepare(
                'UPDATE planos SET nome = ?, valor = ?, quantidade = ?, vantagens = ?
                 WHERE id = ? AND motorista_id = ?'
            );
            $atualiza->execute([$nome, $valor, $quantidade, $json, $id, $motoristaId]);

            $existe = db()->prepare('SELECT 1 FROM planos WHERE id = ? AND motorista_id = ?');
            $existe->execute([$id, $motoristaId]);
            if (!$existe->fetchColumn()) {
                erro('Plano não encontrado.', 404);
            }
        } else {
            $total = db()->prepare('SELECT COUNT(*) FROM planos WHERE motorista_id = ?');
            $total->execute([$motoristaId]);

            if ((int) $total->fetchColumn() >= VL_LIMITE_PLANOS) {
                erro('Você já atingiu o limite de ' . VL_LIMITE_PLANOS . ' planos.');
            }

            db()->prepare(
                'INSERT INTO planos (motorista_id, nome, valor, quantidade, vantagens)
                 VALUES (?, ?, ?, ?, ?)'
            )->execute([$motoristaId, $nome, $valor, $quantidade, $json]);
        }

        responder(['ok' => true, 'planos' => listarPlanos($motoristaId)]);

    case 'remover':
        exigirPost();
        $motoristaId = exigirLogin('motorista');
        $id = inteiro('id', 1, PHP_INT_MAX, 'plano');

        db()->prepare('DELETE FROM planos WHERE id = ? AND motorista_id = ?')
            ->execute([$id, $motoristaId]);

        responder(['ok' => true, 'planos' => listarPlanos($motoristaId)]);

    default:
        erro('Ação inválida.', 404);
}
