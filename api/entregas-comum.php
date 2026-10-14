<?php
/* =====================================================
VANLOC - Entregas: regras compartilhadas
=====================================================
Usado por entregas.php (motorista e cliente) e por
admin.php. Não é acessível diretamente pela web.
===================================================== */

const VL_ENTREGA_PLATAFORMAS = ['mercado_livre', 'shopee', 'amazon', 'loja', 'particular', 'outro'];
const VL_ENTREGA_TAMANHOS = ['pequeno', 'medio', 'grande'];

/* status em andamento (já aceitas por um motorista) */
const VL_ENTREGA_EM_ANDAMENTO = ['aguardando_retirada', 'coletada', 'em_transito'];

/* próxima etapa de cada status e a coluna que guarda a data */
const VL_ENTREGA_PROXIMA = [
    'aguardando_retirada' => ['coletada', 'coletada_em'],
    'coletada' => ['em_transito', 'em_transito_em'],
    'em_transito' => ['entregue', 'entregue_em'],
];

/* número máximo de entregas em andamento por motorista */
const VL_ENTREGA_LIMITE_ATIVAS = 5;

const VL_ENTREGA_CAMPOS =
    'e.id, e.codigo, e.passageiro_id, e.motorista_id, e.plataforma, e.descricao, e.tamanho,
     e.peso_kg, e.volumes, e.retirada_endereco, e.retirada_cidade, e.retirada_contato,
     e.retirada_telefone, e.destino_endereco, e.destino_cidade, e.destinatario_nome,
     e.destinatario_telefone, e.data_retirada, e.valor, e.observacoes, e.status,
     e.aceita_em, e.coletada_em, e.em_transito_em, e.entregue_em, e.cancelada_em, e.criado_em';


function gerarCodigoEntrega(): string
{
    return 'ENT-' . strtoupper(substr(base_convert(bin2hex(random_bytes(6)), 16, 36), 0, 8));
}

/**
 * Valida os dados enviados e grava uma nova solicitação de
 * entrega com status "disponivel". Retorna o código gerado.
 */
function criarEntrega(?int $passageiroId): string
{
    $plataforma = (string) (entrada()['plataforma'] ?? 'particular');
    $tamanho = (string) (entrada()['tamanho'] ?? 'pequeno');

    if (!in_array($plataforma, VL_ENTREGA_PLATAFORMAS, true)) {
        erro('Escolha a origem da mercadoria.');
    }
    if (!in_array($tamanho, VL_ENTREGA_TAMANHOS, true)) {
        erro('Escolha o tamanho da carga.');
    }

    $dados = [
        'passageiro_id' => $passageiroId,
        'plataforma' => $plataforma,
        'descricao' => texto('descricao', 500, true, 'descrição da carga'),
        'tamanho' => $tamanho,
        'peso_kg' => decimal('peso_kg', 0.01, 30000, 'peso (kg)'),
        'volumes' => inteiro('volumes', 1, 999, 'quantidade de volumes'),
        'retirada_endereco' => texto('retirada_endereco', 200, true, 'endereço de retirada'),
        'retirada_cidade' => texto('retirada_cidade', 80, true, 'cidade de retirada'),
        'retirada_contato' => texto('retirada_contato', 120, true, 'responsável pela retirada'),
        'retirada_telefone' => texto('retirada_telefone', 20, true, 'telefone da retirada'),
        'destino_endereco' => texto('destino_endereco', 200, true, 'endereço de entrega'),
        'destino_cidade' => texto('destino_cidade', 80, true, 'cidade de entrega'),
        'destinatario_nome' => texto('destinatario_nome', 120, true, 'nome do destinatário'),
        'destinatario_telefone' => texto('destinatario_telefone', 20, true, 'telefone do destinatário'),
        'data_retirada' => dataFutura('data_retirada', 'de retirada'),
        'valor' => decimal('valor', 1, 100000, 'valor oferecido'),
        'observacoes' => texto('observacoes', 500, false, 'observações'),
        'codigo' => gerarCodigoEntrega(),
    ];

    $colunas = implode(', ', array_keys($dados));
    $marcadores = implode(', ', array_fill(0, count($dados), '?'));

    db()->prepare("INSERT INTO entregas ({$colunas}) VALUES ({$marcadores})")
        ->execute(array_values($dados));

    return $dados['codigo'];
}

/**
 * Converte os tipos e, quando $completa = false, esconde os
 * contatos e o endereço exato do destino (o motorista só vê
 * esses dados depois de aceitar a entrega).
 */
function formatarEntrega(array $e, bool $completa = true): array
{
    foreach (['id', 'volumes'] as $campo) {
        $e[$campo] = (int) $e[$campo];
    }
    foreach (['passageiro_id', 'motorista_id'] as $campo) {
        if (array_key_exists($campo, $e)) {
            $e[$campo] = $e[$campo] === null ? null : (int) $e[$campo];
        }
    }
    $e['peso_kg'] = (float) $e['peso_kg'];
    $e['valor'] = (float) $e['valor'];

    if (!$completa) {
        foreach (['retirada_contato', 'retirada_telefone', 'destino_endereco',
                  'destinatario_nome', 'destinatario_telefone', 'passageiro_id'] as $campo) {
            unset($e[$campo]);
        }
    }

    return $e;
}

/**
 * Libera as entregas aceitas (ainda não coletadas) de um
 * motorista e cancela as solicitações abertas de um cliente.
 * Usado quando o administrador exclui uma conta.
 */
function liberarEntregasDaConta(string $tipo, int $id): void
{
    if ($tipo === 'motorista') {
        db()->prepare(
            "UPDATE entregas SET status = 'disponivel', motorista_id = NULL, aceita_em = NULL
             WHERE motorista_id = ? AND status = 'aguardando_retirada'"
        )->execute([$id]);
    } else {
        db()->prepare(
            "UPDATE entregas SET status = 'cancelada', cancelada_em = NOW()
             WHERE passageiro_id = ? AND status IN ('disponivel', 'aguardando_retirada')"
        )->execute([$id]);
    }
}
