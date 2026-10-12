<?php
/* =====================================================
VANLOC - Perfil do passageiro
=====================================================
POST perfil.php?acao=salvar         {nome, telefone, cidade, estado, bio}
POST perfil.php?acao=foto           multipart: foto
POST perfil.php?acao=remover_foto
===================================================== */

require __DIR__ . '/bootstrap.php';

exigirPost();
$passageiroId = exigirLogin('passageiro');

function fotoAtual(int $passageiroId): string
{
    $consulta = db()->prepare('SELECT foto FROM passageiros WHERE id = ?');
    $consulta->execute([$passageiroId]);

    return (string) $consulta->fetchColumn();
}

switch (acao()) {

    case 'salvar':
        $nome = texto('nome', 120, true, 'nome');
        $telefone = texto('telefone', 20, false, 'telefone');
        $cidade = texto('cidade', 80, false, 'cidade');
        $estado = mb_strtoupper(texto('estado', 2, false, 'estado'));
        $bio = texto('bio', 500, false, 'sobre você');

        db()->prepare(
            'UPDATE passageiros SET nome = ?, telefone = ?, cidade = ?, estado = ?, bio = ? WHERE id = ?'
        )->execute([$nome, $telefone, $cidade, $estado, $bio, $passageiroId]);

        responder(['ok' => true]);

    case 'foto':
        $nova = salvarImagem('foto', 'perfis');

        if ($nova === '') {
            erro('Escolha uma imagem.');
        }

        $antiga = fotoAtual($passageiroId);
        db()->prepare('UPDATE passageiros SET foto = ? WHERE id = ?')->execute([$nova, $passageiroId]);
        removerImagem($antiga);

        responder(['ok' => true, 'foto' => $nova]);

    case 'remover_foto':
        $antiga = fotoAtual($passageiroId);
        db()->prepare("UPDATE passageiros SET foto = '' WHERE id = ?")->execute([$passageiroId]);
        removerImagem($antiga);

        responder(['ok' => true]);

    default:
        erro('Ação inválida.', 404);
}
