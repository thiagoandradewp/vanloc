<?php
/* =====================================================
VANLOC - Configuração
=====================================================
Copie este arquivo para "config.php" (na mesma pasta) e
preencha com os dados do banco criado no hPanel da
Hostinger (Bancos de dados > Gerenciamento).

O config.php NÃO deve ir para o GitHub (já está no
.gitignore).
===================================================== */

return [
    'db_host' => 'localhost',
    'db_port' => 3306,
    'db_name' => 'u000000000_vanloc',
    'db_user' => 'u000000000_vanloc',
    'db_pass' => 'COLOQUE_A_SENHA_AQUI',

    'timezone' => 'America/Recife',

    // Deixe false em produção. true mostra a mensagem
    // de erro real na resposta da API (só para testes).
    'debug' => false,

    // Chave usada UMA VEZ para criar o primeiro administrador
    // em /admin.html. Troque por uma frase longa e secreta.
    // Depois de criar o administrador, pode deixar vazio ('').
    'admin_chave_instalacao' => 'TROQUE_POR_UMA_CHAVE_SECRETA',
];
