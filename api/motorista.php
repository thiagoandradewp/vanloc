<?php
/* =====================================================
VANLOC - Serviços oferecidos pelo motorista
=====================================================
POST motorista.php?acao=servicos   {faz_passageiros, faz_entregas, capacidade_carga_kg, tipo_veiculo, regioes}
===================================================== */

require __DIR__ . '/bootstrap.php';

switch (acao()) {

    case 'servicos':
        exigirPost();
        $motoristaId = exigirLogin('motorista');
        [$fazPassageiros, $fazEntregas, $capacidade, $tipoVeiculo, $regioes] = lerServicosMotorista();

        if (!$fazPassageiros) {
            $ativas = db()->prepare(
                "SELECT COUNT(*) FROM viagens WHERE motorista_id = ? AND status = 'ativa' AND data >= CURDATE()"
            );
            $ativas->execute([$motoristaId]);

            if ((int) $ativas->fetchColumn() > 0) {
                erro('Você tem viagens ativas. Cancele-as antes de desativar o transporte de passageiros.', 409);
            }
        }

        if (!$fazEntregas) {
            $andamento = db()->prepare(
                "SELECT COUNT(*) FROM entregas
                 WHERE motorista_id = ? AND status IN ('aguardando_retirada', 'coletada', 'em_transito')"
            );
            $andamento->execute([$motoristaId]);

            if ((int) $andamento->fetchColumn() > 0) {
                erro('Você tem entregas em andamento. Conclua-as antes de desativar as entregas.', 409);
            }
        }

        $pdo = db();
        $pdo->beginTransaction();

        $pdo->prepare(
            'UPDATE motoristas SET faz_passageiros = ?, faz_entregas = ?, capacidade_carga_kg = ?, tipo_veiculo = ?
             WHERE id = ?'
        )->execute([$fazPassageiros, $fazEntregas, $capacidade, $tipoVeiculo, $motoristaId]);

        salvarRegioesMotorista($motoristaId, $regioes);

        $pdo->commit();

        responder(['ok' => true]);

    default:
        erro('Ação inválida.', 404);
}
