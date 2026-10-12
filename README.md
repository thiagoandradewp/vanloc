# VANLOC

Plataforma para passageiros encontrarem vans, reservarem vagas e consultarem
planos mensais, e para motoristas publicarem viagens e gerenciarem reservas.

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

**Motorista**
- Cadastro com senha, dados da van, foto e primeira viagem
- Painel com viagens ativas, receita confirmada e reservas pendentes
- Publicar novas viagens e cancelar viagens (as reservas ativas são recusadas automaticamente)
- Confirmar ou recusar reservas e falar com o passageiro pelo WhatsApp
- Até 3 planos mensais (mínimo de R$ 20,00 por viagem)

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
   `localhost`.

5. **PHP e SSL**
   - *Avançado → Configuração do PHP*: use PHP **8.1 ou superior** (8.2/8.3 recomendado).
   - *Segurança → SSL*: ative o certificado grátis. O `.htaccess` já redireciona tudo para HTTPS.

6. **Permissões**
   A pasta `uploads/` (e as subpastas `vans/` e `perfis/`) precisa permitir
   escrita pelo PHP. O padrão da Hostinger (755) já funciona.

Pronto: acesse o domínio, cadastre um motorista e um passageiro e faça uma reserva de teste.

## Estrutura

```
index.html                  site principal (busca, viagens, cadastros, reservas)
dashboard.html              Painel do Motorista
dashboard-passageiro.html   Área do Passageiro
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
sql/
  schema.sql                estrutura do banco
  demo.sql                  dados de exemplo (opcional)
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

- Recuperação de senha por email (SMTP da Hostinger)
- Notificações por email/WhatsApp quando uma reserva for feita ou confirmada
- Assinatura dos planos mensais com pagamento online (Pix / Mercado Pago)
- Edição de viagens já publicadas
