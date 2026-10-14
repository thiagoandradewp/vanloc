<?php
/* =====================================================
VANLOC - Autenticação e cadastro
=====================================================
GET  auth.php?acao=sessao                 usuário logado (ou null)
POST auth.php?acao=login                  {tipo, email, senha}
POST auth.php?acao=logout
POST auth.php?acao=cadastrar_passageiro   {nome, email, telefone, cidade, estado, senha}
POST auth.php?acao=cadastrar_motorista    multipart: dados do motorista + serviços
                                          (+ 1ª viagem e foto, se fizer transporte de passageiros)
===================================================== */

require __DIR__ . '/bootstrap.php';

function dadosPassageiro(int $id): ?array
{
    $consulta = db()->prepare(
        'SELECT id, nome, email, telefone, cidade, estado, bio, foto
         FROM passageiros WHERE id = ? AND bloqueado = 0'
    );
    $consulta->execute([$id]);

    return $consulta->fetch() ?: null;
}

function dadosMotorista(int $id): ?array
{
    $consulta = db()->prepare(
        'SELECT id, nome, email, telefone, modelo_van, placa_van, lugares_van,
                faz_passageiros, faz_entregas, capacidade_carga_kg
         FROM motoristas WHERE id = ? AND bloqueado = 0'
    );
    $consulta->execute([$id]);

    return $consulta->fetch() ?: null;
}

function respostaSessao(): never
{
    $usuario = usuarioLogado();
    $dados = null;

    if ($usuario && $usuario['tipo'] === 'admin') {
        $usuario = null;
    }

    if ($usuario) {
        $dados = $usuario['tipo'] === 'motorista'
            ? dadosMotorista((int) $usuario['id'])
            : dadosPassageiro((int) $usuario['id']);

        if ($dados) {
            $dados['tipo'] = $usuario['tipo'];
        } else {
            encerrarSessao();
        }
    }

    responder(['usuario' => $dados]);
}


switch (acao()) {

    case 'sessao':
        respostaSessao();

    case 'login':
        exigirPost();

        $tipo = (entrada()['tipo'] ?? '') === 'motorista' ? 'motorista' : 'passageiro';
        $email = emailValido();
        $senha = (string) (entrada()['senha'] ?? '');

        verificarTentativas($email);

        $tabela = $tipo === 'motorista' ? 'motoristas' : 'passageiros';
        $consulta = db()->prepare("SELECT id, senha_hash, bloqueado FROM {$tabela} WHERE email = ?");
        $consulta->execute([$email]);
        $conta = $consulta->fetch();

        if (!$conta || !password_verify($senha, $conta['senha_hash'])) {
            registrarTentativa($email);
            erro('Email ou senha incorretos.', 401);
        }

        if ((int) $conta['bloqueado'] === 1) {
            erro('Sua conta está bloqueada. Fale com o suporte da VANLOC.', 403);
        }

        if (password_needs_rehash($conta['senha_hash'], PASSWORD_DEFAULT)) {
            db()->prepare("UPDATE {$tabela} SET senha_hash = ? WHERE id = ?")
                ->execute([password_hash($senha, PASSWORD_DEFAULT), $conta['id']]);
        }

        limparTentativas($email);
        iniciarSessao($tipo, (int) $conta['id']);
        respostaSessao();

    case 'logout':
        exigirPost();
        encerrarSessao();
        responder(['ok' => true]);

    case 'cadastrar_passageiro':
        exigirPost();

        $nome = texto('nome', 120, true, 'nome');
        $email = emailValido();
        $telefone = texto('telefone', 20, true, 'telefone');
        $cidade = texto('cidade', 80, true, 'cidade');
        $estado = mb_strtoupper(texto('estado', 2, false, 'estado'));
        $hash = senhaNova();

        $existe = db()->prepare('SELECT 1 FROM passageiros WHERE email = ?');
        $existe->execute([$email]);
        if ($existe->fetchColumn()) {
            erro('Já existe uma conta de passageiro com este email. Faça login.', 409);
        }

        db()->prepare(
            'INSERT INTO passageiros (nome, email, senha_hash, telefone, cidade, estado)
             VALUES (?, ?, ?, ?, ?, ?)'
        )->execute([$nome, $email, $hash, $telefone, $cidade, $estado]);

        iniciarSessao('passageiro', (int) db()->lastInsertId());
        respostaSessao();

    case 'cadastrar_motorista':
        exigirPost();

        $nome = texto('nome', 120, true, 'nome');
        $email = emailValido();
        $telefone = texto('telefone', 20, true, 'telefone');
        $cpf = texto('cpf', 14, true, 'CPF');
        $modeloVan = texto('modelo_van', 80, true, 'modelo da van');
        $placaVan = mb_strtoupper(texto('placa_van', 10, true, 'placa'));
        $lugaresVan = inteiro('lugares_van', 1, 60, 'quantidade de lugares');
        $hash = senhaNova();
        [$fazPassageiros, $fazEntregas, $capacidade] = lerServicosMotorista();

        /* a primeira viagem só é exigida de quem transporta passageiros */
        if ($fazPassageiros) {
            $origem = texto('origem', 80, true, 'origem');
            $destino = texto('destino', 80, true, 'destino');
            $data = dataFutura('data');
            $horario = horario('horario');
            $valor = decimal('valor', 0, 100000, 'valor da viagem');
            $vagas = inteiro('vagas', 1, 60, 'vagas');
        }

        $existe = db()->prepare('SELECT 1 FROM motoristas WHERE email = ?');
        $existe->execute([$email]);
        if ($existe->fetchColumn()) {
            erro('Já existe um motorista com este email. Entre como motorista para cadastrar novas viagens.', 409);
        }

        $foto = $fazPassageiros ? salvarImagem('foto', 'vans') : '';

        $pdo = db();
        $pdo->beginTransaction();

        try {
            $pdo->prepare(
                'INSERT INTO motoristas (nome, email, senha_hash, telefone, cpf, modelo_van, placa_van, lugares_van,
                                         faz_passageiros, faz_entregas, capacidade_carga_kg)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            )->execute([$nome, $email, $hash, $telefone, $cpf, $modeloVan, $placaVan, $lugaresVan,
                        $fazPassageiros, $fazEntregas, $capacidade]);

            $motoristaId = (int) $pdo->lastInsertId();

            if ($fazPassageiros) {
                $pdo->prepare(
                    'INSERT INTO viagens (motorista_id, origem, destino, data, horario, valor, vagas, foto)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
                )->execute([$motoristaId, $origem, $destino, $data, $horario, $valor, $vagas, $foto]);
            }

            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            removerImagem($foto);
            throw $e;
        }

        iniciarSessao('motorista', $motoristaId);
        respostaSessao();

    default:
        erro('Ação inválida.', 404);
}
