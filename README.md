# VANLOC

Plataforma para passageiros encontrarem vans, reservarem vagas e consultarem
planos mensais, para motoristas publicarem viagens e gerenciarem reservas, e
para entregas de mercadorias (lojas, Mercado Livre, Shopee e envios particulares).

O pagamento das viagens e das entregas é feito diretamente ao motorista
(viagens: na hora da partida). A plataforma não processa pagamentos.

- **Front-end:** HTML, CSS e JavaScript puro (`index.html`, `dashboard.html`, `dashboard-passageiro.html`)
- **Back-end:** API em PHP 8.1+ (pasta `api/`)
- **Banco de dados:** MySQL / MariaDB (pasta `sql/`)

Funciona na hospedagem compartilhada da Hostinger sem nenhuma instalação extra.

## Funcionalidades

**Passageiro**
- Cadastro e login com senha criptografada (`password_hash`)
- Lista de viagens em tempo real, com vagas restantes e aviso de "Lotada"
- Reserva com controle de vagas (duas pessoas não conseguem reservar a mesma última vaga)
- Área do passageiro: perfil, foto, histórico de reservas, cancelamento
- Depois que o motorista confirma, aparece o botão de WhatsApp do motorista
- Aviso "PAGAMENTO REALIZADO NA HORA DA PARTIDA PARA VIAGEM" antes de confirmar a reserva
- Aba **Entregas**: acompanhar as entregas solicitadas na Área de Envios

**Área de Envios** (`/envios.html`): para empresas, lojas, comerciantes e clientes
- Conta de **empresa/loja** (nome da empresa, CNPJ opcional) ou **pessoa física**; é a mesma conta usada para reservar viagens
- Publicar entregas com endereço de retirada e destino, descrição, volumes, peso, dimensões aproximadas,
  data e horário desejados, veículo necessário (sugerido automaticamente pela carga) e valor oferecido
- Acompanhar as entregas em andamento, ver o motorista responsável e consultar o histórico
- Motoristas não publicam entregas: só consultam, aceitam e executam

**Motorista**
- Cadastro com senha, dados da van, foto e primeira viagem
- Painel com viagens ativas, receita confirmada e reservas pendentes
- Publicar novas viagens e cancelar viagens (as reservas ativas são recusadas automaticamente)
- Confirmar ou recusar reservas e falar com o passageiro pelo WhatsApp
- Até 3 planos mensais (mínimo de R$ 20,00 por viagem)
- **Meus serviços**: transporte de passageiros, entregas ou ambos; para entregas, tipo de veículo
  (moto, carro, utilitário, van, caminhão), capacidade de carga (kg) e cidades atendidas.
  Os menus do painel aparecem conforme os serviços escolhidos
- **Entregas**: lista de entregas disponíveis compatíveis com o veículo, a capacidade de carga, as dimensões
  da carga e as cidades atendidas (com filtro por cidade),
  aceite, etapas *Aguardando retirada → Mercadoria coletada → Em trânsito → Entregue* e histórico.
  Contatos e endereço exato do destino só aparecem depois de aceitar.

**Administração** (`/admin`)
- Visão geral: passageiros, motoristas, viagens ativas, receita confirmada, reservas por status e rotas mais procuradas
- Reservas: busca, filtro por status, confirmar / recusar / cancelar
- Viagens: busca, filtro (ativas, encerradas, canceladas) e cancelamento
- Entregas: busca, filtro por status, cadastro de entregas de lojas parceiras e cancelamento
- Motoristas e passageiros: busca, bloquear / desbloquear e excluir conta
- Administradores: adicionar e remover administradores e trocar a própria senha

## Publicar na Hostinger

1. **Criar o banco de dados**
   No hPanel: *Bancos de dados → Gerenciamento → Criar banco de dados MySQL*.
   Anote o nome do banco, o usuário e a senha (a Hostinger adiciona um prefixo
   tipo `u123456789_`).

2. **Criar as tabelas**
   Abra o *phpMyAdmin* desse banco → aba *Importar* → envie `sql/schema.sql`.
   Se quiser os 3 motoristas de exemplo, importe também `sql/demo.sql`
   (eles não conseguem fazer login e podem ser apagados depois).

3. **Enviar os arquivos**
   Pelo *Gerenciador de Arquivos* (ou FTP / Git do hPanel), envie todo o
   conteúdo do repositório para `public_html/`, mantendo as pastas `api/`,
   `sql/` e `uploads/` com os respectivos `.htaccess`.

4. **Configurar a conexão**
   Em `public_html/api/`, copie `config.example.php` para `config.php` e
   preencha `db_name`, `db_user` e `db_pass`. O `db_host` normalmente é
   `localhost`. Defina também `admin_chave_instalacao` com uma frase longa
   e secreta (mínimo 12 caracteres).

5. **PHP e SSL**
   - *Avançado → Configuração do PHP*: use PHP **8.1 ou superior** (8.2/8.3 recomendado).
   - *Segurança → SSL*: ative o certificado grátis. O `.htaccess` já redireciona tudo para HTTPS.

6. **Permissões**
   A pasta `uploads/` (e as subpastas `vans/` e `perfis/`) precisa permitir
   escrita pelo PHP. O padrão da Hostinger (755) já funciona.

7. **Criar o administrador**
   Acesse `https://seudominio.com.br/admin`. No primeiro acesso aparece
   a tela "Criar administrador": informe a chave de instalação do passo 4,
   seu nome, email e senha. Depois disso essa tela não aparece mais e o
   painel passa a pedir login. Outros administradores são adicionados
   dentro do próprio painel.

Pronto: acesse o domínio, cadastre um motorista e um passageiro e faça uma reserva de teste.

### Atualizando um banco já existente

**O banco é atualizado automaticamente.** Depois de enviar os arquivos novos
(incluindo a pasta `sql/`), a primeira visita ao site cria as tabelas e colunas
que faltam, sem apagar nem alterar dados (`api/migracoes.php`). Não é preciso
importar nada no phpMyAdmin. A versão aplicada fica na tabela `vanloc_versao`.

Se preferir fazer à mão, importe no phpMyAdmin, **uma única vez cada e nesta ordem**,
só as atualizações que o seu banco ainda não recebeu:

1. `sql/atualizacao-001-admin.sql`: tabela de administradores e bloqueio de contas
2. `sql/atualizacao-002-entregas.sql`: serviços do motorista e tabela de entregas
3. `sql/atualizacao-003-envios.sql`: contas de empresa, tipo de veículo e cidades do motorista,
   dimensões/horário/veículo das entregas

Nenhuma delas apaga dados. Depois da 002, os motoristas já cadastrados continuam
como "transporte de passageiros" e podem ativar as entregas em *Meus serviços*.

## Estrutura

```
index.html                  site principal (busca, viagens, cadastros, reservas)
dashboard.html              Painel do Motorista
dashboard-passageiro.html   Área do Passageiro
envios.html / envios.js     Área de Envios (empresas e clientes publicam e acompanham entregas)
admin.html                  Painel administrativo
admin.js                    lógica do painel administrativo
entregas.js                 entregas: componentes compartilhados + abas Entregas / Meus serviços do motorista
script.js                   lógica do site + painel do motorista + cliente da API
dashboard-passageiro.js     lógica da área do passageiro
style.css                   estilos
api/
  bootstrap.php             conexão, sessão, validação, upload (não acessível pela web)
  config.example.php        modelo de configuração
  auth.php                  login, logout, sessão, cadastros
  viagens.php               listar / criar / cancelar viagens
  planos.php                planos dos motoristas
  reservas.php              reservas de passageiros e gestão pelo motorista
  perfil.php                perfil e foto do passageiro
  admin.php                 painel administrativo
  entregas.php              entregas (motorista e cliente)
  entregas-comum.php        regras das entregas usadas pela API e pelo admin (não acessível pela web)
  migracoes.php             atualização automática do banco (não acessível pela web)
  motorista.php             serviços oferecidos pelo motorista
sql/
  schema.sql                estrutura do banco
  demo.sql                  dados de exemplo (opcional)
  atualizacao-001-admin.sql atualização para bancos criados antes do painel admin
  atualizacao-002-entregas.sql atualização para bancos criados antes das entregas
  atualizacao-003-envios.sql   atualização para bancos criados antes da Área de Envios
img/                        logotipos (completo, horizontal, versões para fundo escuro, símbolo
                            e imagem de compartilhamento); favicons ficam na raiz
uploads/                    fotos enviadas (scripts bloqueados por .htaccess)
```

## Segurança

- Senhas com `password_hash` / `password_verify` (bcrypt), nunca em texto puro
- Sessão PHP em cookie `HttpOnly` + `SameSite=Lax` (+ `Secure` com HTTPS) e ID regenerado no login
- Requisições de escrita exigem o cabeçalho `X-Requested-With` (proteção contra CSRF)
- Todas as consultas usam *prepared statements* (PDO)
- Limite de 5 tentativas de login a cada 15 minutos por IP + email
- Uploads: só JPG/PNG/WEBP de até 3 MB, conferidos pelo conteúdo real do arquivo e salvos com nome aleatório; a pasta não executa PHP
- `api/config.php`, `api/bootstrap.php` e `sql/` não podem ser acessados pelo navegador
- O primeiro administrador só pode ser criado com a chave de instalação do `config.php`; contas bloqueadas perdem o acesso imediatamente
- Cada motorista só vê e altera as entregas que aceitou; o aceite é atômico (duas pessoas não aceitam a mesma entrega)
- Telefone do motorista só é exibido ao passageiro depois da confirmação da reserva

## Desenvolvimento local

```bash
# banco local
mysql -e "CREATE DATABASE vanloc CHARACTER SET utf8mb4"
mysql vanloc < sql/schema.sql
mysql vanloc < sql/demo.sql

# configuração
cp api/config.example.php api/config.php   # ajuste usuário/senha

# servidor
php -S localhost:8080
```

Acesse http://localhost:8080.

## Próximos passos sugeridos

- Avisos automáticos (email/WhatsApp) quando surgir uma entrega compatível ou mudar o status;
  hoje o motorista e o cliente acompanham tudo pelo painel
- Recuperação de senha por email (SMTP da Hostinger)
- Notificações por email/WhatsApp quando uma reserva for feita ou confirmada
- Edição de viagens já publicadas
