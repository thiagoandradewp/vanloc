<?php
/* =====================================================
VANLOC - Entregas de mercadorias
=====================================================
Motorista (com o serviço de entregas ativado)
GET  entregas.php?acao=disponiveis      entregas compatíveis com o motorista  ?cidade=
GET  entregas.php?acao=minhas           entregas aceitas (em andamento e histórico)
POST entregas.php?acao=aceitar          {id}
POST entregas.php?acao=avancar          {id}   próxima etapa do status
POST entregas.php?acao=desistir         {id}   só antes da retirada

Cliente (conta de passageiro)
GET  entregas.php?acao=solicitadas      entregas solicitadas pelo cliente
POST entregas.php?acao=solicitar        dados da entrega
POST entregas.php?acao=cancelar         {id}   só antes da coleta
===================================================== */

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/entregas-comum.php';

/** Exige motorista logado com o serviço de entregas ativado */
function exigirMotoristaEntregas(): array
{
    $motoristaId = exigirLogin('motorista');

    $consulta = db()->prepare('SELECT faz_entregas, capacidade_carga_kg FROM motoristas WHERE id = ?');
    $consulta->execute([$motoristaId]);
    $motorista = $consulta->fetch();

    if (!$motorista || (int) $motorista['faz_entregas'] !== 1) {
        erro('Ative o serviço de entregas em "Meus serviços" para acessar as entregas.', 403);
    }

    return ['id' => $motoristaId, 'capacidade' => (int) $motorista['capacidade_carga_kg']];
}

function entregaDoMotorista(int $id, int $motoristaId): array
{
    $consulta = db()->prepare('SELECT id, status FROM entregas WHERE id = ? AND motorista_id = ?');
    $consulta->execute([$id, $motoristaId]);
    $entrega = $consulta->fetch();

    if (!$entrega) {
        erro('Entrega não encontrada.', 404);
    }

    return $entrega;
}


switch (acao()) {

    /* -------------------------------------------------
    MOTORISTA
    ------------------------------------------------- */

    case 'disponiveis':
        $motorista = exigirMotoristaEntregas();

        $cidade = trim((string) ($_GET['cidade'] ?? ''));
        $cidade = $cidade === '' ? null : '%' . addcslashes(mb_substr($cidade, 0, 80), '%_\\') . '%';

        /* compatível = cabe na capacidade de carga do motorista */
        $consulta = db()->prepare(
            'SELECT ' . VL_ENTREGA_CAMPOS . '
             FROM entregas e
             WHERE e.status = \'disponivel\'
               AND e.data_retirada >= CURDATE()
               AND e.peso_kg <= ?
               AND (? IS NULL OR e.retirada_cidade LIKE ? OR e.destino_cidade LIKE ?)
             ORDER BY e.data_retirada, e.criado_em
             LIMIT 200'
        );
        $consulta->execute([$motorista['capacidade'], $cidade, $cidade, $cidade]);

        responder([
            'capacidade_carga_kg' => $motorista['capacidade'],
            'entregas' => array_map(fn($e) => formatarEntrega($e, false), $consulta->fetchAll()),
        ]);

    case 'minhas':
        $motorista = exigirMotoristaEntregas();

        $consulta = db()->prepare(
            'SELECT ' . VL_ENTREGA_CAMPOS . '
             FROM entregas e
             WHERE e.motorista_id = ?
             ORDER BY FIELD(e.status, \'aguardando_retirada\', \'coletada\', \'em_transito\') DESC,
                      e.data_retirada DESC, e.aceita_em DESC'
        );
        $consulta->execute([$motorista['id']]);

        responder(['entregas' => array_map('formatarEntrega', $consulta->fetchAll())]);

    case 'aceitar':
        exigirPost();
        $motorista = exigirMotoristaEntregas();
        $id = inteiro('id', 1, PHP_INT_MAX, 'entrega');

        $ativas = db()->prepare(
            "SELECT COUNT(*) FROM entregas
             WHERE motorista_id = ? AND status IN ('aguardando_retirada', 'coletada', 'em_transito')"
        );
        $ativas->execute([$motorista['id']]);

        if ((int) $ativas->fetchColumn() >= VL_ENTREGA_LIMITE_ATIVAS) {
            erro('Você já tem ' . VL_ENTREGA_LIMITE_ATIVAS . ' entregas em andamento. Conclua alguma antes de aceitar outra.', 409);
        }

        /* a condição de status evita que dois motoristas aceitem a mesma entrega */
        $aceita = db()->prepare(
            "UPDATE entregas
             SET motorista_id = ?, status = 'aguardando_retirada', aceita_em = NOW()
             WHERE id = ? AND status = 'disponivel' AND motorista_id IS NULL
               AND data_retirada >= CURDATE() AND peso_kg <= ?"
        );
        $aceita->execute([$motorista['id'], $id, $motorista['capacidade']]);

        if ($aceita->rowCount() === 0) {
            erro('Esta entrega não está mais disponível ou excede a sua capacidade de carga.', 409);
        }

        responder(['ok' => true]);

    case 'avancar':
        exigirPost();
        $motorista = exigirMotoristaEntregas();
        $id = inteiro('id', 1, PHP_INT_MAX, 'entrega');
        $entrega = entregaDoMotorista($id, $motorista['id']);

        if (!isset(VL_ENTREGA_PROXIMA[$entrega['status']])) {
            erro('Esta entrega já foi finalizada.', 409);
        }

        [$novoStatus, $colunaData] = VL_ENTREGA_PROXIMA[$entrega['status']];

        $atualiza = db()->prepare(
            "UPDATE entregas SET status = ?, {$colunaData} = NOW()
             WHERE id = ? AND motorista_id = ? AND status = ?"
        );
        $atualiza->execute([$novoStatus, $id, $motorista['id'], $entrega['status']]);

        if ($atualiza->rowCount() === 0) {
            erro('A entrega foi alterada por outra pessoa. Atualize a página.', 409);
        }

        responder(['ok' => true, 'status' => $novoStatus]);

    case 'desistir':
        exigirPost();
        $motorista = exigirMotoristaEntregas();
        $id = inteiro('id', 1, PHP_INT_MAX, 'entrega');
        entregaDoMotorista($id, $motorista['id']);

        $libera = db()->prepare(
            "UPDATE entregas SET status = 'disponivel', motorista_id = NULL, aceita_em = NULL
             WHERE id = ? AND motorista_id = ? AND status = 'aguardando_retirada'"
        );
        $libera->execute([$id, $motorista['id']]);

        if ($libera->rowCount() === 0) {
            erro('Só é possível desistir antes de coletar a mercadoria.', 409);
        }

        responder(['ok' => true]);


    /* -------------------------------------------------
    CLIENTE (CONTA DE PASSAGEIRO)
    ------------------------------------------------- */

    case 'solicitadas':
        $passageiroId = exigirLogin('passageiro');

        $consulta = db()->prepare(
            'SELECT ' . VL_ENTREGA_CAMPOS . ', m.nome AS motorista_nome,
                    m.telefone AS motorista_telefone, m.modelo_van, m.placa_van
             FROM entregas e
             LEFT JOIN motoristas m ON m.id = e.motorista_id
             WHERE e.passageiro_id = ?
             ORDER BY e.criado_em DESC'
        );
        $consulta->execute([$passageiroId]);

        responder(['entregas' => array_map('formatarEntrega', $consulta->fetchAll())]);

    case 'solicitar':
        exigirPost();
        $passageiroId = exigirLogin('passageiro');

        $abertas = db()->prepare(
            "SELECT COUNT(*) FROM entregas WHERE passageiro_id = ? AND status = 'disponivel'"
        );
        $abertas->execute([$passageiroId]);

        if ((int) $abertas->fetchColumn() >= 20) {
            erro('Você já tem 20 solicitações aguardando motorista. Aguarde ou cancele alguma.', 409);
        }

        responder(['ok' => true, 'codigo' => criarEntrega($passageiroId)], 201);

    case 'cancelar':
        exigirPost();
        $passageiroId = exigirLogin('passageiro');
        $id = inteiro('id', 1, PHP_INT_MAX, 'entrega');

        $dona = db()->prepare('SELECT 1 FROM entregas WHERE id = ? AND passageiro_id = ?');
        $dona->execute([$id, $passageiroId]);
        if (!$dona->fetchColumn()) {
            erro('Entrega não encontrada.', 404);
        }

        $cancela = db()->prepare(
            "UPDATE entregas SET status = 'cancelada', cancelada_em = NOW()
             WHERE id = ? AND passageiro_id = ? AND status IN ('disponivel', 'aguardando_retirada')"
        );
        $cancela->execute([$id, $passageiroId]);

        if ($cancela->rowCount() === 0) {
            erro('Esta entrega já foi coletada ou finalizada e não pode mais ser cancelada.', 409);
        }

        responder(['ok' => true]);

    default:
        erro('Ação inválida.', 404);
}
