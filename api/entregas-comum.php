<?php
/* =====================================================
VANLOC - Entregas: regras compartilhadas
=====================================================
Usado por entregas.php (motorista e cliente) e por
admin.php. Não é acessível diretamente pela web.
===================================================== */

const VL_ENTREGA_PLATAFORMAS = ['mercado_livre', 'shopee', 'amazon', 'loja', 'particular', 'outro'];
const VL_ENTREGA_TAMANHOS = ['pequeno', 'medio', 'grande'];

/*
Tipos de veículo, do menor para o maior:
[peso máximo usual (kg), maior dimensão de um volume (cm)].
Uma entrega exige pelo menos o veículo em que a carga cabe;
um motorista atende entregas que exigem o veículo dele ou menor.
*/
const VL_VEICULOS = [
    'moto' => [20, 50],
    'carro' => [200, 100],
    'utilitario' => [700, 180],
    'van' => [1500, 300],
    'caminhao' => [30000, 1200],
];

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
     e.peso_kg, e.volumes, e.comprimento_cm, e.largura_cm, e.altura_cm, e.veiculo_necessario,
     e.horario_retirada, e.retirada_endereco, e.retirada_cidade, e.retirada_contato,
     e.retirada_telefone, e.destino_endereco, e.destino_cidade, e.destinatario_nome,
     e.destinatario_telefone, e.data_retirada, e.valor, e.observacoes, e.status,
     e.aceita_em, e.coletada_em, e.em_transito_em, e.entregue_em, e.cancelada_em, e.criado_em';


function gerarCodigoEntrega(): string
{
    return 'ENT-' . strtoupper(substr(base_convert(bin2hex(random_bytes(6)), 16, 36), 0, 8));
}

/** Posição do veículo na escala (1 = moto ... 5 = caminhão) */
function nivelVeiculo(string $veiculo): int
{
    return array_search($veiculo, array_keys(VL_VEICULOS), true) + 1;
}

/** Menor veículo em que a carga cabe, pelo peso e pela maior dimensão */
function veiculoMinimo(float $pesoKg, int $maiorDimensaoCm): string
{
    foreach (VL_VEICULOS as $veiculo => [$pesoMax, $dimensaoMax]) {
        if ($pesoKg <= $pesoMax && $maiorDimensaoCm <= $dimensaoMax) {
            return $veiculo;
        }
    }

    return 'caminhao';
}

/** Tamanho exibido nos cartões, calculado pela maior dimensão */
function tamanhoPelaDimensao(int $maiorDimensaoCm): string
{
    return $maiorDimensaoCm <= 50 ? 'pequeno' : ($maiorDimensaoCm <= 120 ? 'medio' : 'grande');
}

/**
 * Condição SQL (para "entregas e") que seleciona só as entregas
 * compatíveis com o motorista: peso dentro da capacidade, veículo
 * necessário igual ou menor que o dele, maior dimensão que cabe no
 * veículo e cidade de retirada ou de destino entre as atendidas
 * (sem cidades cadastradas = atende qualquer cidade).
 * Retorna [sql, parâmetros].
 */
function condicaoCompatibilidade(array $motorista): array
{
    $sql = "e.peso_kg <= ?
        AND FIELD(e.veiculo_necessario, 'moto', 'carro', 'utilitario', 'van', 'caminhao') <= ?
        AND GREATEST(COALESCE(e.comprimento_cm, 0), COALESCE(e.largura_cm, 0), COALESCE(e.altura_cm, 0)) <= ?
        AND (NOT EXISTS (SELECT 1 FROM motorista_regioes r WHERE r.motorista_id = ?)
             OR EXISTS (SELECT 1 FROM motorista_regioes r WHERE r.motorista_id = ?
                        AND (r.cidade = e.retirada_cidade OR r.cidade = e.destino_cidade)))";

    return [$sql, [
        $motorista['capacidade'],
        nivelVeiculo($motorista['tipo_veiculo']),
        VL_VEICULOS[$motorista['tipo_veiculo']][1],
        $motorista['id'],
        $motorista['id'],
    ]];
}

/**
 * Valida os dados enviados e grava uma nova solicitação de
 * entrega com status "disponivel". Retorna o código gerado.
 */
function criarEntrega(?int $passageiroId): string
{
    $plataforma = (string) (entrada()['plataforma'] ?? 'particular');
    $veiculoEscolhido = (string) (entrada()['veiculo_necessario'] ?? 'moto');

    if (!in_array($plataforma, VL_ENTREGA_PLATAFORMAS, true)) {
        erro('Escolha a origem da mercadoria.');
    }
    if (!isset(VL_VEICULOS[$veiculoEscolhido])) {
        erro('Escolha o veículo necessário.');
    }

    $peso = decimal('peso_kg', 0.01, 30000, 'peso (kg)');
    $comprimento = inteiro('comprimento_cm', 1, 1500, 'comprimento (cm)');
    $largura = inteiro('largura_cm', 1, 1500, 'largura (cm)');
    $altura = inteiro('altura_cm', 1, 1500, 'altura (cm)');
    $maiorDimensao = max($comprimento, $largura, $altura);

    /* nunca aceita um veículo menor do que a carga exige */
    $veiculoMinimo = veiculoMinimo($peso, $maiorDimensao);
    $veiculo = nivelVeiculo($veiculoEscolhido) >= nivelVeiculo($veiculoMinimo) ? $veiculoEscolhido : $veiculoMinimo;

    $dados = [
        'passageiro_id' => $passageiroId,
        'plataforma' => $plataforma,
        'descricao' => texto('descricao', 500, true, 'descrição da carga'),
        'tamanho' => tamanhoPelaDimensao($maiorDimensao),
        'peso_kg' => $peso,
        'volumes' => inteiro('volumes', 1, 999, 'quantidade de volumes'),
        'comprimento_cm' => $comprimento,
        'largura_cm' => $largura,
        'altura_cm' => $altura,
        'veiculo_necessario' => $veiculo,
        'retirada_endereco' => texto('retirada_endereco', 200, true, 'endereço de retirada'),
        'retirada_cidade' => texto('retirada_cidade', 80, true, 'cidade de retirada'),
        'retirada_contato' => texto('retirada_contato', 120, true, 'responsável pela retirada'),
        'retirada_telefone' => texto('retirada_telefone', 20, true, 'telefone da retirada'),
        'destino_endereco' => texto('destino_endereco', 200, true, 'endereço de entrega'),
        'destino_cidade' => texto('destino_cidade', 80, true, 'cidade de entrega'),
        'destinatario_nome' => texto('destinatario_nome', 120, true, 'nome do destinatário'),
        'destinatario_telefone' => texto('destinatario_telefone', 20, true, 'telefone do destinatário'),
        'data_retirada' => dataFutura('data_retirada', 'de retirada'),
        'horario_retirada' => horario('horario_retirada'),
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
    foreach (['comprimento_cm', 'largura_cm', 'altura_cm'] as $campo) {
        $e[$campo] = $e[$campo] === null ? null : (int) $e[$campo];
    }
    $e['horario_retirada'] = $e['horario_retirada'] === null ? null : substr($e['horario_retirada'], 0, 5);
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
