<?php
/* =====================================================
VANLOC - Base da API
=====================================================
Carregado por todos os endpoints. Cuida de:
- configuração e conexão com o banco (PDO)
- sessão segura (cookie httpOnly / SameSite)
- respostas JSON, validação e upload de imagens
===================================================== */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const VL_LIMITE_PLANOS = 3;
const VL_VALOR_MINIMO_PLANO = 20;
const VL_TAMANHO_MAX_IMAGEM = 3 * 1024 * 1024;

if (!is_file(__DIR__ . '/config.php')) {
    http_response_code(500);
    echo json_encode(['erro' => 'API não configurada: copie api/config.example.php para api/config.php.']);
    exit;
}

$VL_CONFIG = require __DIR__ . '/config.php';

date_default_timezone_set($VL_CONFIG['timezone'] ?? 'America/Recife');

set_exception_handler(function (Throwable $e) use ($VL_CONFIG) {
    error_log('[VANLOC] ' . $e);
    http_response_code(500);
    echo json_encode([
        'erro' => !empty($VL_CONFIG['debug'])
            ? $e->getMessage()
            : 'Erro interno. Tente novamente em instantes.'
    ], JSON_UNESCAPED_UNICODE);
});


/* =====================================================
BANCO DE DADOS
===================================================== */

function db(): PDO
{
    static $pdo = null;
    global $VL_CONFIG;

    if ($pdo === null) {
        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
            $VL_CONFIG['db_host'],
            $VL_CONFIG['db_port'] ?? 3306,
            $VL_CONFIG['db_name']
        );
        $pdo = new PDO($dsn, $VL_CONFIG['db_user'], $VL_CONFIG['db_pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        $pdo->exec("SET time_zone = '" . date('P') . "'");
    }

    return $pdo;
}


/* =====================================================
SESSÃO
===================================================== */

function vlHttps(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https'
        || (int) ($_SERVER['SERVER_PORT'] ?? 0) === 443;
}

session_name('VANLOCSESS');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => vlHttps(),
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

/** Retorna ['tipo' => 'passageiro'|'motorista', 'id' => int] ou null */
function usuarioLogado(): ?array
{
    return $_SESSION['usuario'] ?? null;
}

function iniciarSessao(string $tipo, int $id): void
{
    session_regenerate_id(true);
    $_SESSION['usuario'] = ['tipo' => $tipo, 'id' => $id];
}

function encerrarSessao(): void
{
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 42000,
            'path' => $p['path'],
            'secure' => $p['secure'],
            'httponly' => $p['httponly'],
            'samesite' => $p['samesite'],
        ]);
    }
    session_destroy();
}

/** Exige login do tipo informado e devolve o id do usuário */
function exigirLogin(string $tipo): int
{
    $usuario = usuarioLogado();

    if (!$usuario) {
        erro('Faça login para continuar.', 401);
    }
    if ($usuario['tipo'] !== $tipo) {
        $mensagens = [
            'motorista' => 'Esta área é exclusiva para motoristas.',
            'passageiro' => 'Esta área é exclusiva para passageiros.',
            'admin' => 'Acesso restrito aos administradores.',
        ];
        erro($mensagens[$tipo] ?? 'Acesso negado.', 403);
    }

    $id = (int) $usuario['id'];

    if (contaBloqueada($tipo, $id)) {
        encerrarSessao();
        erro('Sua conta está bloqueada. Fale com o suporte da VANLOC.', 403);
    }

    return $id;
}

/** true se a conta foi bloqueada pelo administrador (ou não existe mais) */
function contaBloqueada(string $tipo, int $id): bool
{
    $tabelas = [
        'motorista' => 'SELECT bloqueado FROM motoristas WHERE id = ?',
        'passageiro' => 'SELECT bloqueado FROM passageiros WHERE id = ?',
        'admin' => 'SELECT 0 FROM administradores WHERE id = ?',
    ];

    $consulta = db()->prepare($tabelas[$tipo]);
    $consulta->execute([$id]);
    $bloqueado = $consulta->fetchColumn();

    return $bloqueado === false || (int) $bloqueado === 1;
}


/* =====================================================
REQUISIÇÃO / RESPOSTA
===================================================== */

function responder(array $dados, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($dados, JSON_UNESCAPED_UNICODE);
    exit;
}

function erro(string $mensagem, int $status = 400): never
{
    responder(['erro' => $mensagem], $status);
}

function metodo(): string
{
    return $_SERVER['REQUEST_METHOD'] ?? 'GET';
}

function acao(): string
{
    return (string) ($_GET['acao'] ?? '');
}

/**
 * Exige POST com o cabeçalho X-Requested-With.
 * Formulários de outros sites não conseguem enviar esse
 * cabeçalho, o que protege contra CSRF (junto com o
 * cookie SameSite=Lax).
 */
function exigirPost(): void
{
    if (metodo() !== 'POST') {
        erro('Método não permitido.', 405);
    }
    if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'VanLoc') {
        erro('Requisição inválida.', 400);
    }
}

/** Corpo da requisição: JSON ou formulário multipart */
function entrada(): array
{
    static $dados = null;

    if ($dados === null) {
        $tipo = $_SERVER['CONTENT_TYPE'] ?? '';
        if (stripos($tipo, 'application/json') !== false) {
            $dados = json_decode((string) file_get_contents('php://input'), true);
            $dados = is_array($dados) ? $dados : [];
        } else {
            $dados = $_POST;
        }
    }

    return $dados;
}


/* =====================================================
VALIDAÇÃO
===================================================== */

/** Texto obrigatório (ou opcional) com tamanho máximo */
function texto(string $campo, int $max, bool $obrigatorio = true, string $rotulo = ''): string
{
    $valor = trim((string) (entrada()[$campo] ?? ''));
    $valor = preg_replace('/\s+/u', ' ', $valor) ?? '';
    $rotulo = $rotulo ?: $campo;

    if ($obrigatorio && $valor === '') {
        erro("Preencha o campo {$rotulo}.");
    }
    if (mb_strlen($valor) > $max) {
        erro("O campo {$rotulo} aceita no máximo {$max} caracteres.");
    }

    return $valor;
}

function emailValido(string $campo = 'email'): string
{
    $email = mb_strtolower(texto($campo, 190, true, 'email'));

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        erro('Informe um email válido.');
    }

    return $email;
}

function senhaNova(): string
{
    $senha = (string) (entrada()['senha'] ?? '');

    if (strlen($senha) < 6) {
        erro('A senha precisa ter pelo menos 6 caracteres.');
    }
    if (strlen($senha) > 72) {
        erro('A senha pode ter no máximo 72 caracteres.');
    }

    return password_hash($senha, PASSWORD_DEFAULT);
}

function inteiro(string $campo, int $min, int $max, string $rotulo = ''): int
{
    $valor = filter_var(entrada()[$campo] ?? null, FILTER_VALIDATE_INT);

    if ($valor === false || $valor < $min || $valor > $max) {
        erro('Informe um valor válido para ' . ($rotulo ?: $campo) . '.');
    }

    return $valor;
}

function decimal(string $campo, float $min, float $max, string $rotulo = ''): float
{
    $bruto = str_replace(',', '.', (string) (entrada()[$campo] ?? ''));
    $valor = filter_var($bruto, FILTER_VALIDATE_FLOAT);

    if ($valor === false || $valor < $min || $valor > $max) {
        erro('Informe um valor válido para ' . ($rotulo ?: $campo) . '.');
    }

    return round($valor, 2);
}

function dataFutura(string $campo, string $rotulo = 'da viagem'): string
{
    $valor = (string) (entrada()[$campo] ?? '');
    $data = DateTime::createFromFormat('!Y-m-d', $valor);

    if (!$data || $data->format('Y-m-d') !== $valor) {
        erro('Informe uma data válida.');
    }
    if ($valor < date('Y-m-d')) {
        erro("A data {$rotulo} não pode estar no passado.");
    }

    return $valor;
}

function horario(string $campo): string
{
    $valor = (string) (entrada()[$campo] ?? '');

    if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $valor)) {
        erro('Informe um horário válido.');
    }

    return $valor;
}


/**
 * Serviços do motorista: transporte de passageiros, entregas
 * ou ambos. Sem os campos (formulários antigos), mantém o
 * padrão "só passageiros".
 * Retorna [faz_passageiros, faz_entregas, capacidade_carga_kg, tipo_veiculo, regioes].
 */
function lerServicosMotorista(): array
{
    $dados = entrada();

    if (!array_key_exists('faz_passageiros', $dados) && !array_key_exists('faz_entregas', $dados)) {
        return [1, 0, 0, 'van', []];
    }

    $marcado = fn(string $campo) => in_array($dados[$campo] ?? '0', [true, 1, '1', 'true', 'on'], true) ? 1 : 0;

    $fazPassageiros = $marcado('faz_passageiros');
    $fazEntregas = $marcado('faz_entregas');

    if (!$fazPassageiros && !$fazEntregas) {
        erro('Escolha pelo menos um serviço: transporte de passageiros ou entregas.');
    }

    $tipoVeiculo = (string) ($dados['tipo_veiculo'] ?? 'van');
    if (!in_array($tipoVeiculo, ['moto', 'carro', 'utilitario', 'van', 'caminhao'], true)) {
        erro('Escolha o tipo de veículo.');
    }

    $capacidade = $fazEntregas
        ? inteiro('capacidade_carga_kg', 1, 30000, 'capacidade de carga (kg)')
        : 0;

    /* cidades separadas por vírgula, ponto e vírgula ou quebra de linha */
    $regioes = [];
    foreach (preg_split('/[,;\n]+/', (string) ($dados['regioes'] ?? '')) as $cidade) {
        $cidade = trim(preg_replace('/\s+/u', ' ', $cidade) ?? '');
        if ($cidade === '') {
            continue;
        }
        if (mb_strlen($cidade) > 80) {
            erro('Cada cidade atendida pode ter no máximo 80 caracteres.');
        }
        $regioes[mb_strtolower($cidade)] ??= $cidade;
    }

    if (count($regioes) > 30) {
        erro('Informe no máximo 30 cidades atendidas.');
    }

    return [$fazPassageiros, $fazEntregas, $capacidade, $tipoVeiculo, array_values($regioes)];
}

/**
 * Conta de cliente: pessoa física ou empresa (loja, comércio).
 * Retorna [tipo_conta, empresa_nome, documento (só dígitos)].
 */
function lerDadosCliente(): array
{
    $tipo = (string) (entrada()['tipo_conta'] ?? 'pessoa');

    if (!in_array($tipo, ['pessoa', 'empresa'], true)) {
        erro('Tipo de conta inválido.');
    }

    $empresa = $tipo === 'empresa' ? texto('empresa_nome', 120, true, 'nome da empresa ou loja') : '';
    $documento = preg_replace('/\D/', '', (string) (entrada()['documento'] ?? '')) ?? '';

    if ($documento !== '' && !in_array(strlen($documento), [11, 14], true)) {
        erro('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido, ou deixe em branco.');
    }

    return [$tipo, $empresa, $documento];
}

/** Substitui as cidades atendidas pelo motorista */
function salvarRegioesMotorista(int $motoristaId, array $regioes): void
{
    db()->prepare('DELETE FROM motorista_regioes WHERE motorista_id = ?')->execute([$motoristaId]);

    $insere = db()->prepare('INSERT IGNORE INTO motorista_regioes (motorista_id, cidade) VALUES (?, ?)');
    foreach ($regioes as $cidade) {
        $insere->execute([$motoristaId, $cidade]);
    }
}


/* =====================================================
UPLOAD DE IMAGENS
===================================================== */

/**
 * Salva a imagem enviada em uploads/<pasta> e retorna o
 * caminho relativo (ex: "uploads/vans/abc.jpg"), ou ''
 * quando nenhum arquivo foi enviado.
 */
function salvarImagem(string $campo, string $pasta): string
{
    $arquivo = $_FILES[$campo] ?? null;

    if (!$arquivo || $arquivo['error'] === UPLOAD_ERR_NO_FILE) {
        return '';
    }
    if ($arquivo['error'] === UPLOAD_ERR_INI_SIZE || $arquivo['error'] === UPLOAD_ERR_FORM_SIZE
        || $arquivo['size'] > VL_TAMANHO_MAX_IMAGEM) {
        erro('A imagem deve ter no máximo 3 MB.');
    }
    if ($arquivo['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($arquivo['tmp_name'])) {
        erro('Não foi possível receber a imagem.');
    }

    $tipos = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
    ];
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($arquivo['tmp_name']);

    if (!isset($tipos[$mime]) || @getimagesize($arquivo['tmp_name']) === false) {
        erro('Envie uma imagem JPG, PNG ou WEBP.');
    }

    $relativo = 'uploads/' . $pasta . '/' . bin2hex(random_bytes(16)) . '.' . $tipos[$mime];
    $destino = dirname(__DIR__) . '/' . $relativo;

    if (!is_dir(dirname($destino))) {
        mkdir(dirname($destino), 0755, true);
    }
    if (!move_uploaded_file($arquivo['tmp_name'], $destino)) {
        throw new RuntimeException('Falha ao mover upload para ' . $destino);
    }

    return $relativo;
}

function removerImagem(string $relativo): void
{
    if ($relativo !== '' && str_starts_with($relativo, 'uploads/') && !str_contains($relativo, '..')) {
        @unlink(dirname(__DIR__) . '/' . $relativo);
    }
}


/* =====================================================
LIMITE DE TENTATIVAS DE LOGIN
===================================================== */

function chaveTentativa(string $email): string
{
    return hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . '|' . $email);
}

function verificarTentativas(string $email): void
{
    db()->exec('DELETE FROM tentativas_login WHERE criado_em < NOW() - INTERVAL 1 DAY');

    $consulta = db()->prepare(
        'SELECT COUNT(*) FROM tentativas_login
         WHERE chave = ? AND criado_em > NOW() - INTERVAL 15 MINUTE'
    );
    $consulta->execute([chaveTentativa($email)]);

    if ((int) $consulta->fetchColumn() >= 5) {
        erro('Muitas tentativas de login. Aguarde 15 minutos e tente novamente.', 429);
    }
}

function registrarTentativa(string $email): void
{
    db()->prepare('INSERT INTO tentativas_login (chave) VALUES (?)')
        ->execute([chaveTentativa($email)]);
}

function limparTentativas(string $email): void
{
    db()->prepare('DELETE FROM tentativas_login WHERE chave = ?')
        ->execute([chaveTentativa($email)]);
}
