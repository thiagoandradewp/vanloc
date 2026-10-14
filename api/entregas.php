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

    $consulta = db()->prepare(
        'SELECT faz_entregas, capacidade_carga_kg, tipo_veiculo FROM motoristas WHERE id = ?'
    );
    $consulta->execute([$motoristaId]);
    $motorista = $consulta->fetch();

    if (!$motorista || (int) $motorista['faz_entregas'] !== 1) {
        erro('Ative o serviço de entregas em "Meus serviços" para acessar as entregas.', 403);
    }

    return [
        'id' => $motoristaId,
        'capacidade' => (int) $motorista['capacidade_carga_kg'],
        'tipo_veiculo' => $motorista['tipo_veiculo'],
    ];
}

/** Quem publicou a entrega: empresa, pessoa física ou administração */
const VL_SQL_SOLICITANTE =
    "CASE WHEN p.id IS NULL THEN 'VANLOC (parceiro)'
          WHEN p.tipo_conta = 'empresa' THEN p.empresa_nome
          ELSE 'Pessoa física' END AS solicitante";

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

        /* só aparecem entregas ainda sem motorista e compatíveis com
        veículo, capacidade, dimensões e cidades atendidas */
        [$compativel, $parametros] = condicaoCompatibilidade($motorista);

        $consulta = db()->prepare(
            'SELECT ' . VL_ENTREGA_CAMPOS . ', ' . VL_SQL_SOLICITANTE . '
             FROM entregas e
             LEFT JOIN passageiros p ON p.id = e.passageiro_id
             WHERE e.status = \'disponivel\' AND e.motorista_id IS NULL
               AND e.data_retirada >= CURDATE()
               AND ' . $compativel . '
               AND (? IS NULL OR e.retirada_cidade LIKE ? OR e.destino_cidade LIKE ?)
             ORDER BY e.data_retirada, e.horario_retirada, e.criado_em
             LIMIT 200'
        );
        $consulta->execute([...$parametros, $cidade, $cidade, $cidade]);

        $regioes = db()->prepare('SELECT cidade FROM motorista_regioes WHERE motorista_id = ? ORDER BY cidade');
        $regioes->execute([$motorista['id']]);

        responder([
            'perfil' => [
                'capacidade_carga_kg' => $motorista['capacidade'],
                'tipo_veiculo' => $motorista['tipo_veiculo'],
                'regioes' => $regioes->fetchAll(PDO::FETCH_COLUMN),
            ],
            'entregas' => array_map(fn($e) => formatarEntrega($e, false), $consulta->fetchAll()),
        ]);

    case 'minhas':
        $motorista = exigirMotoristaEntregas();

        $consulta = db()->prepare(
            'SELECT ' . VL_ENTREGA_CAMPOS . ', ' . VL_SQL_SOLICITANTE . ',
                    p.nome AS cliente_nome, p.telefone AS cliente_telefone
             FROM entregas e
             LEFT JOIN passageiros p ON p.id = e.passageiro_id
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

        /* o UPDATE só altera a linha se ela ainda estiver disponível: se
        dois motoristas aceitarem ao mesmo tempo, apenas um consegue */
        [$compativel, $parametros] = condicaoCompatibilidade($motorista);

        $aceita = db()->prepare(
            "UPDATE entregas e
             SET e.motorista_id = ?, e.status = 'aguardando_retirada', e.aceita_em = NOW()
             WHERE e.id = ? AND e.status = 'disponivel' AND e.motorista_id IS NULL
               AND e.data_retirada >= CURDATE() AND " . $compativel
        );
        $aceita->execute([$motorista['id'], $id, ...$parametros]);

        if ($aceita->rowCount() === 0) {
            erro('Esta entrega já foi aceita por outro motorista ou não é compatível com o seu veículo.', 409);
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
