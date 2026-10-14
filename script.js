/* =====================================================
VANLOC - script.js
=====================================================
Arquivo único com a lógica do site:
1) Comunicação com a API PHP (pasta /api) e sessão
2) Lógica da página principal (index.html)
3) Lógica do Painel do Motorista (dashboard.html)

Os dados ficam no banco MySQL da hospedagem, então
viagens, planos e reservas são os mesmos para todos os
visitantes, em qualquer dispositivo.

Cada bloco só executa código que depende do DOM quando
os elementos daquela página realmente existem, então
este mesmo arquivo é incluído em todas as páginas.
===================================================== */


const VANLOC_LIMITE_PLANOS = 3;

const VANLOC_VALOR_MINIMO_PLANO = 20;

const VL_API = "api/";



/* =====================================================
API
===================================================== */


/*
Faz uma requisição para a API e devolve o JSON.
Em caso de erro, lança um Error com a mensagem vinda
do servidor (pronta para mostrar ao usuário).
*/
async function vlApi(caminho, dados) {

    const opcoes = {
        method: dados === undefined ? "GET" : "POST",
        credentials: "same-origin",
        headers: { "X-Requested-With": "VanLoc" }
    };

    if (dados instanceof FormData) {
        opcoes.body = dados;
    } else if (dados !== undefined) {
        opcoes.headers["Content-Type"] = "application/json";
        opcoes.body = JSON.stringify(dados);
    }

    let resposta;

    try {
        resposta = await fetch(VL_API + caminho, opcoes);
    } catch (erro) {
        throw new Error("Sem conexão com o servidor. Verifique sua internet.");
    }

    let json = null;

    try {
        json = await resposta.json();
    } catch (erro) {
        json = null;
    }

    if (!resposta.ok || !json) {
        const falha = new Error(
            (json && json.erro) || "Não foi possível concluir a operação."
        );
        falha.status = resposta.status;
        throw falha;
    }

    return json;

}



/* =====================================================
SESSÃO
=====================================================
vlUsuario guarda o usuário logado (passageiro ou
motorista) ou null. vlSessaoPronta é uma Promise que
resolve quando a sessão já foi consultada no servidor.
===================================================== */


let vlUsuario = null;


const vlSessaoPronta = vlApi("auth.php?acao=sessao")
    .then(function(resposta) {
        vlUsuario = resposta.usuario || null;
        return vlUsuario;
    })
    .catch(function() {
        vlUsuario = null;
        return null;
    });


function vlPassageiroLogado() {

    return vlUsuario && vlUsuario.tipo === "passageiro" ? vlUsuario : null;

}


function vlMotoristaLogado() {

    return vlUsuario && vlUsuario.tipo === "motorista" ? vlUsuario : null;

}


async function vlSair() {

    try {
        await vlApi("auth.php?acao=logout", {});
    } catch (erro) {
        // mesmo com erro, leva o usuário para a página inicial
    }

    window.location.href = "index.html";

}


function atualizarHeaderPassageiro() {

    const botao = document.getElementById("botaoConta");

    if (!botao) {
        return;
    }

    if (vlMotoristaLogado()) {
        botao.classList.add("logado-passageiro");
        botao.innerHTML =
            '<i class="fa-solid fa-gauge"></i> <span>Meu painel</span>';
        botao.onclick = function() {
            window.location.href = "dashboard.html";
        };
        return;
    }

    const passageiro = vlPassageiroLogado();

    if (!passageiro) {
        botao.classList.remove("logado-passageiro");
        botao.innerHTML =
            '<i class="fa-solid fa-user"></i> Entrar';
        botao.onclick = function() {
            abrirLogin();
        };
        return;
    }

    const primeiroNome =
        (passageiro.nome || "Usuário").split(" ")[0];

    const foto = passageiro.foto
        ? `<img class="avatar-header" src="${escapeHtml(passageiro.foto)}" alt="Foto de ${escapeHtml(primeiroNome)}">`
        : '<span class="avatar-header avatar-inicial">' +
          escapeHtml(primeiroNome.charAt(0).toUpperCase()) +
          '</span>';

    botao.classList.add("logado-passageiro");
    botao.innerHTML =
        foto + '<span>' + escapeHtml(primeiroNome) + '</span>' +
        '<i class="fa-solid fa-chevron-down"></i>';

    botao.onclick = function() {
        window.location.href = "dashboard-passageiro.html";
    };

}


vlSessaoPronta.then(function() {

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", atualizarHeaderPassageiro);
    } else {
        atualizarHeaderPassageiro();
    }

});



/* =====================================================
MODAIS
===================================================== */


function abrirLogin(tipo) {

    const avisoReserva = document.getElementById("avisoLoginReserva");
    if (avisoReserva && !vlGetReservaPendente()) {
        avisoReserva.style.display = "none";
    }

    vlDefinirTipoLogin(typeof tipo === "string" ? tipo : "passageiro");

    document.getElementById("modalLogin").style.display = "block";

}


function fecharLogin(cancelarReserva = false) {

    document.getElementById("modalLogin").style.display = "none";

    if (cancelarReserva) {
        vlLimparReservaPendente();
    }

}


function abrirMotorista() {

    if (vlMotoristaLogado()) {
        window.location.href = "dashboard.html";
        return;
    }

    document.getElementById("modalMotorista").style.display = "block";

}


function fecharMotorista() {

    document.getElementById("modalMotorista").style.display = "none";

}


function fecharReserva() {

    document.getElementById("modalReserva").style.display = "none";

}


function fecharPlanos() {

    document.getElementById("modalPlanos").style.display = "none";

}



/* =====================================================
FECHAR MODAL CLICANDO FORA
===================================================== */


window.onclick = function(event) {

    const modais = document.querySelectorAll(".modal");

    modais.forEach(function(modal) {

        if (event.target === modal) {

            modal.style.display = "none";

            if (modal.id === "modalLogin") {
                vlLimparReservaPendente();
            }

        }

    });

};



/* =====================================================
NOTIFICAÇÃO
===================================================== */


let vlTimerNotificacao = null;


function mostrarNotificacao(mensagem) {

    const notificacao =
        document.getElementById("notificacao");

    const texto =
        document.getElementById("mensagemNotificacao");

    if (!notificacao || !texto) {
        alert(mensagem);
        return;
    }

    texto.innerText = mensagem;

    notificacao.style.display = "flex";

    clearTimeout(vlTimerNotificacao);

    vlTimerNotificacao = setTimeout(function() {

        notificacao.style.display = "none";

    }, 4000);

}


/* Desabilita o botão de envio enquanto a API responde */
function vlBotaoCarregando(formulario, carregando) {

    const botao = formulario && formulario.querySelector("[type=submit]");

    if (!botao) {
        return;
    }

    if (carregando) {
        botao.dataset.textoOriginal = botao.innerHTML;
        botao.disabled = true;
        botao.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Aguarde...';
    } else {
        botao.disabled = false;
        if (botao.dataset.textoOriginal) {
            botao.innerHTML = botao.dataset.textoOriginal;
        }
    }

}



/* =====================================================
LOGIN (PASSAGEIRO OU MOTORISTA)
===================================================== */


function vlTipoLogin() {

    const marcado = document.querySelector('input[name="tipoLogin"]:checked');

    return marcado ? marcado.value : "passageiro";

}


function vlDefinirTipoLogin(tipo) {

    const opcao = document.querySelector(
        'input[name="tipoLogin"][value="' + tipo + '"]'
    );

    if (opcao) {
        opcao.checked = true;
    }

    vlAtualizarTextosLogin();

}


function vlAtualizarTextosLogin() {

    const motorista = vlTipoLogin() === "motorista";
    const subtitulo = document.getElementById("loginSubtitulo");
    const criarConta = document.getElementById("criarContaPassageiro");

    if (subtitulo) {
        subtitulo.innerText = motorista
            ? "Acesse o seu Painel do Motorista"
            : "Acesse sua conta de passageiro";
    }

    if (criarConta) {
        criarConta.innerHTML = motorista
            ? 'Ainda não é motorista na VANLOC? <a href="#" onclick="fecharLogin(); abrirMotorista(); return false;">Cadastre-se</a>'
            : 'Ainda não possui uma conta? <a href="#passageiro" onclick="irParaCadastroPassageiro(event)">Criar conta</a>';
    }

}


document.querySelectorAll('input[name="tipoLogin"]').forEach(function(opcao) {
    opcao.addEventListener("change", vlAtualizarTextosLogin);
});


const vlFormLogin =
    document.getElementById("formLogin");

if (vlFormLogin) {

vlFormLogin.addEventListener("submit", async function(event) {

    event.preventDefault();

    const formulario = this;
    const tipo = vlTipoLogin();

    vlBotaoCarregando(formulario, true);

    try {

        const resposta = await vlApi("auth.php?acao=login", {
            tipo: tipo,
            email: document.getElementById("emailLogin").value,
            senha: document.getElementById("senhaLogin").value
        });

        vlUsuario = resposta.usuario;

    } catch (erro) {

        vlBotaoCarregando(formulario, false);
        mostrarNotificacao(erro.message);
        return;

    }

    vlBotaoCarregando(formulario, false);
    formulario.reset();
    fecharLogin();
    atualizarHeaderPassageiro();

    if (tipo === "motorista") {
        vlLimparReservaPendente();
        mostrarNotificacao("Login realizado! Abrindo seu painel...");
        setTimeout(function() {
            window.location.href = "dashboard.html";
        }, 700);
        return;
    }

    const reservaPendente = vlGetReservaPendente();

    if (reservaPendente) {

        reservar(reservaPendente.viagemId);

        mostrarNotificacao(
            "Login realizado. Você já pode confirmar sua reserva."
        );

        return;

    }

    mostrarNotificacao("Login realizado com sucesso! Redirecionando...");

    setTimeout(function() {

        window.location.href = "dashboard-passageiro.html";

    }, 700);

});

}



/* =====================================================
CADASTRO DO PASSAGEIRO
===================================================== */


const vlFormCadastroPassageiro =
    document.getElementById("formCadastroPassageiro");

if (vlFormCadastroPassageiro) {

vlFormCadastroPassageiro.addEventListener("submit", async function(event) {

    event.preventDefault();

    const formulario = this;

    const senha =
        document.getElementById("passageiroSenha").value;

    const confirmarSenha =
        document.getElementById("passageiroConfirmarSenha").value;

    if (senha !== confirmarSenha) {

        mostrarNotificacao("As senhas não coincidem!");

        return;

    }

    if (senha.length < 6) {

        mostrarNotificacao("A senha precisa ter pelo menos 6 caracteres.");

        return;

    }

    vlBotaoCarregando(formulario, true);

    try {

        const resposta = await vlApi("auth.php?acao=cadastrar_passageiro", {
            nome: document.getElementById("passageiroNome").value,
            email: document.getElementById("passageiroEmail").value,
            telefone: document.getElementById("passageiroTelefone").value,
            cidade: document.getElementById("passageiroCidade").value,
            estado: document.getElementById("passageiroEstado")?.value || "",
            senha: senha
        });

        vlUsuario = resposta.usuario;

    } catch (erro) {

        vlBotaoCarregando(formulario, false);
        mostrarNotificacao(erro.message);
        return;

    }

    const reservaPendente = vlGetReservaPendente();

    mostrarNotificacao(
        "Cadastro realizado com sucesso! Abrindo sua conta..."
    );

    formulario.reset();

    setTimeout(function() {

        window.location.href = reservaPendente
            ? "index.html?retomarReserva=1#viagens"
            : "dashboard-passageiro.html";

    }, 700);

});

}



/* =====================================================
VIAGENS (vindas da API)
===================================================== */


/* viagens carregadas na página, indexadas pelo id */
const vlViagens = {};


let vlViagensProntas = Promise.resolve();


function vlCardViagem(v) {

    const iniciais = escapeHtml(
        String(v.motorista_nome || "")
        .split(" ")
        .map(palavra => palavra.charAt(0))
        .slice(0, 2)
        .join("")
        .toUpperCase()
    );

    const lotada = v.vagas_restantes <= 0;

    const imagem = v.foto
        ? `<img loading="lazy" decoding="async" src="${escapeHtml(v.foto)}" alt="Van de ${escapeHtml(v.motorista_nome)}"
                onerror="this.onerror=null;this.src='van.png';this.classList.add('img-fallback')">`
        : `<img loading="lazy" decoding="async" src="van.webp" alt="Van de transporte" class="img-fallback">`;

    return `

        <div class="viagem-card" data-data="${escapeHtml(v.data)}" data-id="${v.id}">

            <div class="imagem-van">

                ${imagem}

                <span class="disponivel${lotada ? " lotada" : ""}">
                    ${lotada ? "Lotada" : v.vagas_restantes + (v.vagas_restantes === 1 ? " vaga" : " vagas")}
                </span>

            </div>


            <div class="viagem-info">

                <div class="motorista-info">

                    <div class="avatar">${iniciais}</div>

                    <div>

                        <strong>${escapeHtml(v.motorista_nome)}</strong>

                        <span>
                            Motorista cadastrado
                            <i class="fa-solid fa-circle-check"></i>
                        </span>

                    </div>

                </div>


                <h3>
                    ${escapeHtml(v.origem)}
                    <i class="fa-solid fa-arrow-right"></i>
                    ${escapeHtml(v.destino)}
                </h3>


                <div class="detalhes">

                    <span>
                        <i class="fa-solid fa-calendar"></i>
                        ${formatarData(v.data)}
                    </span>

                    <span>
                        <i class="fa-solid fa-clock"></i>
                        ${escapeHtml(v.horario)}
                    </span>

                </div>


                <div class="rodape-viagem">

                    <div class="preco">

                        <small>Viagem avulsa</small>

                        <strong>R$ ${formatarMoeda(v.valor)}</strong>

                        <small class="valor-minimo">
                            Planos a partir de R$ 20,00/viagem
                        </small>

                    </div>


                    <div class="botoes-viagem">

                        <button class="btn-planos" onclick="consultarPlanos(${v.motorista_id})">
                            <i class="fa-solid fa-tags"></i>
                            Consultar planos
                        </button>

                        <button class="btn-reservar" onclick="reservar(${v.id})" ${lotada ? "disabled" : ""}>
                            ${lotada ? "Lotada" : "Reservar"}
                        </button>

                    </div>

                </div>

            </div>

        </div>

    `;

}


async function vlCarregarViagens() {

    const lista = document.getElementById("listaViagens");

    if (!lista) {
        return;
    }

    let viagens = [];

    try {
        viagens = (await vlApi("viagens.php")).viagens;
    } catch (erro) {
        lista.innerHTML =
            '<div class="viagens-vazio"><i class="fa-solid fa-triangle-exclamation"></i> ' +
            escapeHtml(erro.message) +
            '</div>';
        return;
    }

    viagens.forEach(function(v) {
        vlViagens[v.id] = v;
    });

    lista.innerHTML = viagens.length
        ? viagens.map(vlCardViagem).join("")
        : '<div class="viagens-vazio">Nenhuma viagem disponível no momento. Volte em breve!</div>';

}


if (document.getElementById("listaViagens")) {
    vlViagensProntas = vlCarregarViagens();
}



/* =====================================================
RESERVA
===================================================== */


const VL_CHAVE_RESERVA_PENDENTE = "vanloc_reserva_pendente";


function vlSalvarReservaPendente(viagemId) {

    try {
        sessionStorage.setItem(
            VL_CHAVE_RESERVA_PENDENTE,
            JSON.stringify({ viagemId: Number(viagemId) })
        );
    } catch (erro) {
        // A retomada é opcional se o navegador bloquear o armazenamento da sessão.
    }

}


function vlGetReservaPendente() {

    try {
        const reserva = JSON.parse(
            sessionStorage.getItem(VL_CHAVE_RESERVA_PENDENTE) || "null"
        );

        return reserva && Number(reserva.viagemId) > 0
            ? reserva
            : null;
    } catch (erro) {
        return null;
    }

}


function vlLimparReservaPendente() {

    try {
        sessionStorage.removeItem(VL_CHAVE_RESERVA_PENDENTE);
    } catch (erro) {
        // O restante do fluxo não depende de sessionStorage.
    }

}


function irParaCadastroPassageiro(event, email = "") {

    event?.preventDefault();

    const modalLogin = document.getElementById("modalLogin");
    if (modalLogin) {
        modalLogin.style.display = "none";
    }

    const campoEmail = document.getElementById("passageiroEmail");
    if (campoEmail && email) {
        campoEmail.value = email;
    }

    const formulario = document.querySelector(".card-cadastro-passageiro");
    formulario?.scrollIntoView({ behavior: "smooth", block: "center" });

    if (window.history && window.history.replaceState) {
        window.history.replaceState(null, "", "#passageiro");
    }

    setTimeout(function() {
        document.getElementById("passageiroNome")?.focus();
    }, 350);

}


let vlReservaEmAndamento = null;


function reservar(viagemId) {

    const viagem = vlViagens[viagemId];

    if (!viagem) {
        vlLimparReservaPendente();
        mostrarNotificacao("Esta viagem não está mais disponível.");
        return;
    }

    if (vlMotoristaLogado()) {
        mostrarNotificacao("Você está logado como motorista. Saia e entre como passageiro para reservar.");
        return;
    }

    const passageiro = vlPassageiroLogado();

    if (!passageiro) {

        vlSalvarReservaPendente(viagemId);

        abrirLogin("passageiro");

        const aviso = document.getElementById("avisoLoginReserva");
        if (aviso) {
            aviso.style.display = "block";
        }

        return;

    }

    vlLimparReservaPendente();

    vlReservaEmAndamento = viagem;

    document.getElementById("campoNomeReserva").value = passageiro.nome || "";
    document.getElementById("campoTelefoneReserva").value = passageiro.telefone || "";

    const quantidade = document.getElementById("campoQuantidadeReserva");
    quantidade.max = Math.min(20, viagem.vagas_restantes);
    quantidade.value = 1;

    document
    .getElementById("modalReserva")
    .style.display = "block";

    document
    .getElementById("viagemSelecionada")
    .innerText =
        "Você está reservando: " + viagem.origem + " → " + viagem.destino +
        " em " + formatarData(viagem.data) + " às " + viagem.horario +
        " (R$ " + formatarMoeda(viagem.valor) + " por pessoa)";

}


/* Retoma a reserva depois do cadastro (index.html?retomarReserva=1) */
Promise.all([vlSessaoPronta, vlViagensProntas]).then(function() {

    const parametros = new URLSearchParams(window.location.search);
    const reservaPendente = vlGetReservaPendente();

    if (
        parametros.get("retomarReserva") === "1" &&
        reservaPendente &&
        document.getElementById("modalReserva")
    ) {
        history.replaceState(null, "", window.location.pathname + "#viagens");
        reservar(reservaPendente.viagemId);
    }

    if (parametros.get("login") === "motorista" && document.getElementById("modalLogin")) {
        history.replaceState(null, "", window.location.pathname);
        abrirLogin("motorista");
    }

});


const vlFormReserva =
    document.getElementById("formReserva");

if (vlFormReserva) {

vlFormReserva
.addEventListener("submit", async function(event) {

    event.preventDefault();

    const formulario = this;

    if (!vlPassageiroLogado() || !vlReservaEmAndamento) {
        fecharReserva();
        abrirLogin("passageiro");
        return;
    }

    vlBotaoCarregando(formulario, true);

    try {

        const resposta = await vlApi("reservas.php?acao=criar", {
            viagem_id: vlReservaEmAndamento.id,
            nome: document.getElementById("campoNomeReserva").value,
            telefone: document.getElementById("campoTelefoneReserva").value,
            quantidade: Number.parseInt(
                document.getElementById("campoQuantidadeReserva").value, 10
            ) || 1
        });

        vlBotaoCarregando(formulario, false);
        fecharReserva();
        formulario.reset();

        mostrarNotificacao(
            "Reserva " + resposta.codigo + " enviada ao motorista! Acompanhe na sua conta."
        );

        setTimeout(function() {
            window.location.href = "dashboard-passageiro.html#reservas";
        }, 1200);

    } catch (erro) {

        vlBotaoCarregando(formulario, false);
        mostrarNotificacao(erro.message);

        if (erro.status === 409 || erro.status === 404) {
            vlViagensProntas = vlCarregarViagens();
        }

    }

});

}



/* =====================================================
CONSULTAR PLANOS DE UM MOTORISTA
===================================================== */


async function consultarPlanos(motoristaId) {

    const lista =
        document
        .getElementById("listaPlanos");

    document.getElementById("tituloPlanos").innerText = "Planos disponíveis";
    document.getElementById("subtituloPlanos").innerText = "";

    lista.innerHTML =
        '<div class="plano-vazio"><i class="fa-solid fa-spinner fa-spin"></i><p>Carregando planos...</p></div>';

    document
    .getElementById("modalPlanos")
    .style.display = "block";


    let resposta;

    try {
        resposta = await vlApi("planos.php?motorista_id=" + encodeURIComponent(motoristaId));
    } catch (erro) {
        lista.innerHTML =
            '<div class="plano-vazio"><i class="fa-solid fa-circle-info"></i><p>' +
            escapeHtml(erro.message) + '</p></div>';
        return;
    }


    const motorista = resposta.motorista;

    const planos = resposta.planos;


    document.getElementById("tituloPlanos").innerText =
        "Planos de " + motorista.nome;

    document.getElementById("subtituloPlanos").innerText =
        "Planos criados por " + motorista.nome + ".";


    if (planos.length === 0) {

        lista.innerHTML = `

            <div class="plano-vazio">

                <i class="fa-solid fa-circle-info"></i>

                <p>

                    Este motorista ainda não cadastrou
                    planos mensais. Você pode reservar a
                    viagem avulsa normalmente.

                </p>

            </div>

        `;

        return;

    }


    lista.innerHTML = planos
    .map(function(plano, indice) {

        const destaque =
            indice === 0 ?
            "plano-card plano-destaque" :
            "plano-card";


        return `

            <div class="${destaque}">

                ${
                    indice === 0 ?
                    `<div class="mais-escolhido">PLANO MAIS COMPLETO</div>` :
                    ""
                }

                <div class="plano-titulo">

                    <i class="fa-solid fa-tags"></i>

                    <h3>${escapeHtml(plano.nome)}</h3>

                </div>


                <div class="preco-plano">

                    <small>Valor por viagem</small>

                    <strong>R$ ${formatarMoeda(plano.valor)}</strong>

                    <span>por viagem</span>

                </div>


                <ul>

                    <li>
                        <i class="fa-solid fa-check"></i>
                        ${
                            plano.quantidade ?
                            plano.quantidade + " viagens/mês" :
                            "Quantidade personalizada"
                        }
                    </li>

                    ${
                        (plano.vantagens || [])
                        .map(function(vantagem) {
                            return `
                                <li>
                                    <i class="fa-solid fa-check"></i>
                                    ${escapeHtml(vantagem)}
                                </li>
                            `;
                        })
                        .join("")
                    }

                </ul>


                <button data-plano="${escapeHtml(plano.nome)}" onclick="assinarPlano(this.dataset.plano)">
                    Assinar plano
                </button>

            </div>

        `;

    })
    .join("");

}



/* =====================================================
ASSINAR PLANO
===================================================== */


function assinarPlano(plano) {

    fecharPlanos();

    if (vlPassageiroLogado()) {

        mostrarNotificacao(
            "Você escolheu o " + plano +
            ". Reserve uma viagem com este motorista e combine a assinatura com ele."
        );

        return;

    }

    mostrarNotificacao(
        "Você selecionou o " +
        plano +
        ". Faça login para continuar."
    );

    setTimeout(function() {

        abrirLogin("passageiro");

    }, 1000);

}



/* =====================================================
CADASTRO DO MOTORISTA
===================================================== */


const vlFormMotorista =
    document.getElementById("formMotorista");

if (vlFormMotorista) {

vlFormMotorista
.addEventListener("submit", async function(event) {

    event.preventDefault();

    const formulario = this;

    const senha = document.getElementById("senhaMotorista").value;

    if (senha !== document.getElementById("confirmarSenhaMotorista").value) {
        mostrarNotificacao("As senhas não coincidem!");
        return;
    }

    if (senha.length < 6) {
        mostrarNotificacao("A senha precisa ter pelo menos 6 caracteres.");
        return;
    }

    const fazPassageiros = document.getElementById("servicoPassageiros").checked;
    const fazEntregas = document.getElementById("servicoEntregas").checked;

    if (!fazPassageiros && !fazEntregas) {
        mostrarNotificacao("Escolha pelo menos um serviço: passageiros ou entregas.");
        return;
    }

    const fotoInput = document.getElementById("fotoVan");

    if (fazPassageiros && !vlImagemValida(fotoInput.files[0])) {
        return;
    }

    const dados = new FormData();

    dados.append("faz_passageiros", fazPassageiros ? "1" : "0");
    dados.append("faz_entregas", fazEntregas ? "1" : "0");
    dados.append("capacidade_carga_kg", document.getElementById("capacidadeCargaMotorista").value);

    dados.append("nome", document.getElementById("nomeMotorista").value);
    dados.append("telefone", document.getElementById("telefoneMotorista").value);
    dados.append("email", document.getElementById("emailMotorista").value);
    dados.append("cpf", document.getElementById("cpfMotorista").value);
    dados.append("senha", senha);
    dados.append("modelo_van", document.getElementById("modeloVan").value);
    dados.append("placa_van", document.getElementById("placaVan").value);
    dados.append("lugares_van", document.getElementById("lugaresVan").value);

    if (fazPassageiros) {
        dados.append("origem", document.getElementById("origem").value);
        dados.append("destino", document.getElementById("destino").value);
        dados.append("data", document.getElementById("dataViagem").value);
        dados.append("horario", document.getElementById("horarioViagem").value);
        dados.append("valor", document.getElementById("valorViagem").value);
        dados.append("vagas", document.getElementById("vagasViagem").value);

        if (fotoInput.files.length > 0) {
            dados.append("foto", fotoInput.files[0]);
        }
    }

    vlBotaoCarregando(formulario, true);

    try {
        vlUsuario = (await vlApi("auth.php?acao=cadastrar_motorista", dados)).usuario;
    } catch (erro) {
        vlBotaoCarregando(formulario, false);
        mostrarNotificacao(erro.message);
        return;
    }

    fecharMotorista();

    mostrarNotificacao(
        "Cadastro realizado! Levando você ao seu Painel do Motorista..."
    );

    formulario.reset();

    setTimeout(function() {

        window.location.href = "dashboard.html";

    }, 1400);

});


/*
Mostra a capacidade de carga só para quem faz entregas e
a primeira viagem só para quem transporta passageiros
(os campos escondidos deixam de ser obrigatórios).
*/
function vlAtualizarServicosCadastro() {

    const fazPassageiros = document.getElementById("servicoPassageiros").checked;
    const fazEntregas = document.getElementById("servicoEntregas").checked;
    const secaoViagem = document.getElementById("secaoViagemMotorista");
    const capacidade = document.getElementById("capacidadeCargaMotorista");

    secaoViagem.style.display = fazPassageiros ? "" : "none";
    secaoViagem.querySelectorAll("input").forEach(function(campo) {
        campo.required = fazPassageiros;
    });

    /* a foto da van aparece nos cards das viagens */
    document.getElementById("fotoVan").closest("div").style.display = fazPassageiros ? "" : "none";

    document.getElementById("campoCapacidadeMotorista").style.display = fazEntregas ? "" : "none";
    capacidade.required = fazEntregas;

}


["servicoPassageiros", "servicoEntregas"].forEach(function(id) {
    document.getElementById(id).addEventListener("change", vlAtualizarServicosCadastro);
});

}


/* Confere tipo e tamanho antes de enviar (o servidor confere de novo) */
function vlImagemValida(arquivo) {

    if (!arquivo) {
        return true;
    }

    if (!/^image\/(jpeg|png|webp)$/.test(arquivo.type)) {
        mostrarNotificacao("Envie uma imagem JPG, PNG ou WEBP.");
        return false;
    }

    if (arquivo.size > 3 * 1024 * 1024) {
        mostrarNotificacao("A imagem deve ter no máximo 3 MB.");
        return false;
    }

    return true;

}



/* =====================================================
BUSCAR VIAGEM
===================================================== */


function buscarViagem() {

    const destino =
        document
        .getElementById("buscaDestino")
        .value
        .toLowerCase()
        .trim();

    const data =
        document
        .getElementById("buscaData")
        .value;

    const viagens =
        document
        .querySelectorAll(".viagem-card");

    let encontradas = 0;

    viagens.forEach(function(viagem) {

        const texto =
            viagem
            .innerText
            .toLowerCase();

        const destinoEncontrado =
            destino === "" ||
            texto.includes(destino);

        const dataEncontrada =
            data === "" ||
            viagem.dataset.data === data;

        if (destinoEncontrado && dataEncontrada) {

            viagem.style.display = "block";

            encontradas++;

        }

        else {

            viagem.style.display = "none";

        }

    });


    if (encontradas === 0) {

        mostrarNotificacao(
            "Nenhuma viagem encontrada."
        );

    }

    else {

        mostrarNotificacao(
            encontradas +
            " viagem(ns) encontrada(s)!"
        );

        document
        .getElementById("viagens")
        .scrollIntoView({ behavior: "smooth" });

    }

}



/* =====================================================
LIMPAR BUSCA
===================================================== */


const vlBuscaDestino =
    document.getElementById("buscaDestino");

if (vlBuscaDestino) {

vlBuscaDestino
.addEventListener("input", function() {

    if (this.value === "") {

        document
        .querySelectorAll(".viagem-card")
        .forEach(function(viagem) {
            viagem.style.display = "block";
        });

    }

});

}



/* =====================================================
FORMATAÇÃO / PROTEÇÃO DE HTML
===================================================== */


function formatarData(data) {

    if (!data) {

        return "";

    }

    const partes =
        String(data).split("-");

    return (
        partes[2] +
        "/" +
        partes[1] +
        "/" +
        partes[0]
    );

}


function formatarMoeda(valor) {

    return Number(valor || 0)
        .toFixed(2)
        .replace(".", ",");

}


function escapeHtml(texto) {

    if (texto === null || texto === undefined) {

        return "";

    }

    return String(texto)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}



/* =====================================================
PAINEL DO MOTORISTA
===================================================== */


let vantagensEmEdicao = [];

let planoEmEdicaoId = null;

let painelViagens = [];

let painelPlanos = [];

let painelReservas = [];


const VL_STATUS_RESERVA = {
    solicitada: "Aguardando confirmação",
    confirmada: "Confirmada",
    recusada: "Recusada",
    cancelada: "Cancelada pelo passageiro"
};



/* =====================================================
INICIALIZAÇÃO / SESSÃO
===================================================== */


document.addEventListener("DOMContentLoaded", async function() {

    /* só executa a lógica do painel se este arquivo
    estiver sendo carregado dentro do dashboard.html */

    if (!document.getElementById("abaVisaoGeral")) {
        return;
    }

    await vlSessaoPronta;

    const motorista = vlMotoristaLogado();

    if (!motorista) {
        window.location.href = "index.html?login=motorista";
        return;
    }

    document
    .getElementById("saudacaoMotorista")
    .innerText =
        "Olá, " + motorista.nome.split(" ")[0] + "!";

    painelAplicarServicos(motorista);

    await painelRecarregar();

    const abaInicial = window.location.hash.replace("#", "");
    const abaVisivel = document.querySelector('.painel-nav-item[data-aba="' + abaInicial + '"]:not([hidden])');

    mostrarAba(abaVisivel ? abaInicial : painelAbaPadrao(motorista));

});


/* Esconde os menus dos serviços que o motorista não oferece */
function painelAplicarServicos(motorista) {

    const fazPassageiros = Number(motorista.faz_passageiros) === 1;
    const fazEntregas = Number(motorista.faz_entregas) === 1;

    ["visaoGeral", "reservas", "planos"].forEach(function(aba) {
        document.querySelector('.painel-nav-item[data-aba="' + aba + '"]').hidden = !fazPassageiros;
    });

    document.querySelector('.painel-nav-item[data-aba="entregas"]').hidden = !fazEntregas;

}


function painelAbaPadrao(motorista) {

    return Number(motorista.faz_passageiros) === 1 ? "visaoGeral" : "entregas";

}


async function painelRecarregar() {

    try {

        const [viagens, planos, reservas] = await Promise.all([
            vlApi("viagens.php?acao=minhas"),
            vlApi("planos.php?acao=meus"),
            vlApi("reservas.php?acao=motorista")
        ]);

        painelViagens = viagens.viagens;
        painelPlanos = planos.planos;
        painelReservas = reservas.reservas;

    } catch (erro) {

        if (erro.status === 401 || erro.status === 403) {
            window.location.href = "index.html?login=motorista";
            return;
        }

        mostrarNotificacao(erro.message);

    }

    atualizarVisaoGeral();

    renderizarPlanos();

    renderizarReservasMotorista();

}



/* =====================================================
NAVEGAÇÃO ENTRE ABAS
===================================================== */


function mostrarAba(aba) {

    const abas = ["visaoGeral", "reservas", "planos", "entregas", "servicos"];

    abas.forEach(function(item) {

        document
        .getElementById(
            "aba" +
            item.charAt(0).toUpperCase() +
            item.slice(1)
        )
        .style.display =
            item === aba ? "block" : "none";

    });

    document
    .querySelectorAll(".painel-nav-item")
    .forEach(function(botao) {

        botao.classList.toggle(
            "ativo",
            botao.dataset.aba === aba
        );

    });

    history.replaceState(null, "", "#" + aba);

    /* entregas e serviços ficam em entregas.js */
    if (aba === "entregas" && typeof painelEntregasAbrir === "function") {
        painelEntregasAbrir();
    }

    if (aba === "servicos" && typeof painelServicosPreencher === "function") {
        painelServicosPreencher();
    }

}



/* =====================================================
SAIR DO PAINEL
===================================================== */


function sairPainel() {

    vlSair();

}



/* =====================================================
VISÃO GERAL
===================================================== */


function vlHojeIso() {

    const d = new Date();

    return d.getFullYear() + "-" +
        String(d.getMonth() + 1).padStart(2, "0") + "-" +
        String(d.getDate()).padStart(2, "0");

}


function atualizarVisaoGeral() {

    const hoje = vlHojeIso();

    const ativas = painelViagens.filter(
        v => v.status === "ativa" && v.data >= hoje
    );

    const receitaConfirmada = painelReservas
        .filter(r => r.status === "confirmada")
        .reduce((total, r) => total + r.valor * r.quantidade, 0);

    const pendentes = painelReservas
        .filter(r => r.status === "solicitada").length;

    document.getElementById("statViagens").innerText = ativas.length;

    document.getElementById("statReceita").innerText =
        "R$ " + formatarMoeda(receitaConfirmada);

    document.getElementById("statPlanos").innerText =
        painelPlanos.length + "/" + VANLOC_LIMITE_PLANOS;

    document.getElementById("statPendentes").innerText = pendentes;

    const badge = document.getElementById("badgeReservas");
    if (badge) {
        badge.innerText = pendentes;
        badge.style.display = pendentes > 0 ? "inline-flex" : "none";
    }


    const lista =
        document
        .getElementById("listaViagensMotorista");


    if (painelViagens.length === 0) {

        lista.innerHTML = `
            <div class="viagens-vazio">
                Você ainda não cadastrou nenhuma viagem.
            </div>
        `;

        return;

    }


    lista.innerHTML = painelViagens
    .map(function(v) {

        const passou = v.data < hoje;
        const cancelada = v.status === "cancelada";

        const situacao = cancelada
            ? '<em class="status-viagem cancelada">Cancelada</em>'
            : passou
                ? '<em class="status-viagem encerrada">Encerrada</em>'
                : '<em class="status-viagem ativa">' + v.ocupadas + "/" + v.vagas + " vagas ocupadas</em>";

        return `

            <div class="linha-viagem">

                <strong>
                    ${escapeHtml(v.origem)}
                    <i class="fa-solid fa-arrow-right"></i>
                    ${escapeHtml(v.destino)}
                </strong>

                <span>${formatarData(v.data)} • ${escapeHtml(v.horario)}</span>

                <span>R$ ${formatarMoeda(v.valor)}</span>

                ${situacao}

                ${
                    !cancelada && !passou
                        ? `<button class="btn-remover-plano" onclick="cancelarViagem(${v.id})">Cancelar</button>`
                        : ""
                }

            </div>

        `;

    })
    .join("");

}



/* =====================================================
NOVA VIAGEM / CANCELAR VIAGEM
===================================================== */


function abrirFormViagem() {

    const container = document.getElementById("formViagemContainer");

    container.style.display = "block";

    document.getElementById("novaViagemData").min = vlHojeIso();

    container.scrollIntoView({ behavior: "smooth" });

}


function fecharFormViagem() {

    document.getElementById("formViagemContainer").style.display = "none";

    document.getElementById("formNovaViagem").reset();

}


const vlFormNovaViagem = document.getElementById("formNovaViagem");

if (vlFormNovaViagem) {

vlFormNovaViagem.addEventListener("submit", async function(event) {

    event.preventDefault();

    const formulario = this;
    const foto = document.getElementById("novaViagemFoto").files[0];

    if (!vlImagemValida(foto)) {
        return;
    }

    const dados = new FormData();

    dados.append("origem", document.getElementById("novaViagemOrigem").value);
    dados.append("destino", document.getElementById("novaViagemDestino").value);
    dados.append("data", document.getElementById("novaViagemData").value);
    dados.append("horario", document.getElementById("novaViagemHorario").value);
    dados.append("valor", document.getElementById("novaViagemValor").value);
    dados.append("vagas", document.getElementById("novaViagemVagas").value);

    if (foto) {
        dados.append("foto", foto);
    }

    vlBotaoCarregando(formulario, true);

    try {
        await vlApi("viagens.php?acao=criar", dados);
    } catch (erro) {
        vlBotaoCarregando(formulario, false);
        mostrarNotificacao(erro.message);
        return;
    }

    vlBotaoCarregando(formulario, false);
    fecharFormViagem();
    await painelRecarregar();
    mostrarNotificacao("Viagem cadastrada! Ela já aparece no site.");

});

}


async function cancelarViagem(id) {

    if (!confirm("Cancelar esta viagem? As reservas ativas serão recusadas automaticamente.")) {
        return;
    }

    try {
        await vlApi("viagens.php?acao=cancelar", { id: id });
    } catch (erro) {
        mostrarNotificacao(erro.message);
        return;
    }

    await painelRecarregar();
    mostrarNotificacao("Viagem cancelada.");

}



/* =====================================================
RESERVAS RECEBIDAS
===================================================== */


function renderizarReservasMotorista() {

    const lista = document.getElementById("listaReservasMotorista");

    if (!lista) {
        return;
    }

    if (painelReservas.length === 0) {

        lista.innerHTML = `
            <div class="viagens-vazio">
                Nenhuma reserva recebida ainda. Assim que um
                passageiro reservar uma das suas viagens, ela
                aparece aqui.
            </div>
        `;

        return;

    }

    lista.innerHTML = painelReservas
    .map(function(r) {

        const telefone = String(r.telefone || "").replace(/\D/g, "");

        const acoes = [];

        if (r.status === "solicitada") {
            acoes.push(`<button class="btn-salvar-plano" onclick="alterarStatusReserva(${r.id}, 'confirmada')">Confirmar</button>`);
        }

        if (r.status === "solicitada" || r.status === "confirmada") {
            acoes.push(`<button class="btn-remover-plano" onclick="alterarStatusReserva(${r.id}, 'recusada')">Recusar</button>`);
        }

        if (telefone) {
            acoes.push(`<a class="btn-editar-plano" href="https://wa.me/55${escapeHtml(telefone)}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> WhatsApp</a>`);
        }

        return `

            <div class="linha-reserva status-${escapeHtml(r.status)}">

                <div>
                    <strong>${escapeHtml(r.nome)}</strong>
                    <span>${escapeHtml(r.telefone)} • ${r.quantidade} ${r.quantidade === 1 ? "passageiro" : "passageiros"}</span>
                </div>

                <div>
                    <strong>
                        ${escapeHtml(r.origem)}
                        <i class="fa-solid fa-arrow-right"></i>
                        ${escapeHtml(r.destino)}
                    </strong>
                    <span>${formatarData(r.data)} • ${escapeHtml(r.horario)} • Código ${escapeHtml(r.codigo)}</span>
                </div>

                <div>
                    <em class="status-reserva ${escapeHtml(r.status)}">${VL_STATUS_RESERVA[r.status] || escapeHtml(r.status)}</em>
                    <span>Total: R$ ${formatarMoeda(r.valor * r.quantidade)}</span>
                </div>

                <div class="plano-acoes">${acoes.join("")}</div>

            </div>

        `;

    })
    .join("");

}


async function alterarStatusReserva(id, status) {

    if (status === "recusada" && !confirm("Recusar esta reserva?")) {
        return;
    }

    try {
        await vlApi("reservas.php?acao=status", { id: id, status: status });
    } catch (erro) {
        mostrarNotificacao(erro.message);
        return;
    }

    await painelRecarregar();

    mostrarNotificacao(
        status === "confirmada" ? "Reserva confirmada!" : "Reserva recusada."
    );

}



/* =====================================================
RENDERIZAR PLANOS
===================================================== */


function renderizarPlanos() {

    const planos = painelPlanos;

    const lista =
        document
        .getElementById("listaPlanosMotorista");

    const botaoNovo =
        document
        .getElementById("btnNovoPlano");


    botaoNovo.disabled =
        planos.length >= VANLOC_LIMITE_PLANOS;

    botaoNovo.innerHTML =
        planos.length >= VANLOC_LIMITE_PLANOS ?
        `<i class="fa-solid fa-check"></i> Limite de planos atingido`
        :
        `<i class="fa-solid fa-plus"></i> Criar novo plano`;


    if (planos.length === 0) {

        lista.innerHTML = `

            <div class="planos-vazio-painel">

                <i class="fa-solid fa-tags"></i>

                <p>

                    Você ainda não criou nenhum plano.
                    Crie até 3 planos mensais para que
                    apareçam para os seus passageiros.

                </p>

            </div>

        `;

        return;

    }


    lista.innerHTML = planos
    .map(function(plano, indice) {

        const rotulo =
            indice === 0 ?
            "Mais caro" :
            (
                indice === planos.length - 1 ?
                "Mais barato" :
                "Intermediário"
            );


        return `

            <div class="plano-card-painel">

                <span class="badge-ordem">${rotulo}</span>

                <h3>${escapeHtml(plano.nome)}</h3>

                <div class="valor">

                    R$ ${formatarMoeda(plano.valor)}
                    <span>/ viagem</span>

                </div>

                <ul>

                    <li>

                        <i class="fa-solid fa-check"></i>
                        ${
                            plano.quantidade ?
                            plano.quantidade + " viagens/mês" :
                            "Quantidade personalizada"
                        }

                    </li>

                    ${
                        (plano.vantagens || [])
                        .map(function(vantagem) {

                            return `
                                <li>
                                    <i class="fa-solid fa-check"></i>
                                    ${escapeHtml(vantagem)}
                                </li>
                            `;

                        })
                        .join("")
                    }

                </ul>

                <div class="plano-acoes">

                    <button
                        class="btn-editar-plano"
                        onclick="abrirFormPlano(${plano.id})"
                    >
                        Editar
                    </button>

                    <button
                        class="btn-remover-plano"
                        onclick="removerPlano(${plano.id})"
                    >
                        Remover
                    </button>

                </div>

            </div>

        `;

    })
    .join("");

}



/* =====================================================
FORMULÁRIO DE PLANO
===================================================== */


function abrirFormPlano(planoId) {

    const limiteAtingido =
        !planoId &&
        painelPlanos.length >= VANLOC_LIMITE_PLANOS;


    if (limiteAtingido) {

        mostrarNotificacao(
            "Você já atingiu o limite de " +
            VANLOC_LIMITE_PLANOS +
            " planos."
        );

        return;

    }


    planoEmEdicaoId = planoId || null;


    const planoExistente =
        planoId ?
        painelPlanos.find(p => p.id === planoId) :
        null;


    document
    .getElementById("formPlanoTitulo")
    .innerText =
        planoExistente ? "Editar plano" : "Novo plano";

    document
    .getElementById("inputNomePlano")
    .value =
        planoExistente ? planoExistente.nome : "";

    document
    .getElementById("inputValorPlano")
    .value =
        planoExistente ? planoExistente.valor : "";

    document
    .getElementById("inputQuantidadePlano")
    .value =
        planoExistente && planoExistente.quantidade ? planoExistente.quantidade : "";


    vantagensEmEdicao =
        planoExistente && planoExistente.vantagens ?
        [...planoExistente.vantagens] :
        [];


    renderizarVantagensForm();


    document
    .getElementById("formPlanoContainer")
    .style.display = "block";

    document
    .getElementById("formPlanoContainer")
    .scrollIntoView({ behavior: "smooth" });

}


function fecharFormPlano() {

    document
    .getElementById("formPlanoContainer")
    .style.display = "none";

    planoEmEdicaoId = null;

    vantagensEmEdicao = [];

}


function adicionarVantagem() {

    const input =
        document
        .getElementById("inputVantagem");

    const texto = input.value.trim();

    if (texto === "") {

        return;

    }

    vantagensEmEdicao.push(texto);

    input.value = "";

    renderizarVantagensForm();

}


function removerVantagem(indice) {

    vantagensEmEdicao.splice(indice, 1);

    renderizarVantagensForm();

}


function renderizarVantagensForm() {

    const lista =
        document
        .getElementById("listaVantagens");

    lista.innerHTML = vantagensEmEdicao
    .map(function(vantagem, indice) {

        return `

            <li>

                ${escapeHtml(vantagem)}

                <button
                    type="button"
                    onclick="removerVantagem(${indice})"
                >
                    <i class="fa-solid fa-xmark"></i>
                </button>

            </li>

        `;

    })
    .join("");

}


async function salvarPlano() {

    const nome =
        document
        .getElementById("inputNomePlano")
        .value
        .trim();

    const valor =
        document
        .getElementById("inputValorPlano")
        .value;

    const quantidade =
        document
        .getElementById("inputQuantidadePlano")
        .value;


    if (nome === "" || valor === "") {

        mostrarNotificacao(
            "Preencha ao menos o nome e o valor do plano."
        );

        return;

    }

    if (Number(valor) < VANLOC_VALOR_MINIMO_PLANO) {

        mostrarNotificacao(
            "O valor mínimo do plano é R$ " +
            formatarMoeda(VANLOC_VALOR_MINIMO_PLANO) +
            " por viagem."
        );

        return;

    }


    try {

        const resposta = await vlApi("planos.php?acao=salvar", {
            id: planoEmEdicaoId,
            nome: nome,
            valor: valor,
            quantidade: quantidade,
            vantagens: vantagensEmEdicao
        });

        painelPlanos = resposta.planos;

    } catch (erro) {

        mostrarNotificacao(erro.message);

        return;

    }


    fecharFormPlano();

    renderizarPlanos();

    atualizarVisaoGeral();

    mostrarNotificacao("Plano salvo com sucesso!");

}


async function removerPlano(planoId) {

    if (!confirm("Remover este plano?")) {
        return;
    }

    try {
        painelPlanos = (await vlApi("planos.php?acao=remover", { id: planoId })).planos;
    } catch (erro) {
        mostrarNotificacao(erro.message);
        return;
    }

    renderizarPlanos();

    atualizarVisaoGeral();

    mostrarNotificacao("Plano removido.");

}



/* =====================================================
MELHORIAS V2
===================================================== */

document.addEventListener("DOMContentLoaded", function () {

    /* ---------- Menu mobile ---------- */

    const topo = document.getElementById("topo");
    const botaoMenu = document.getElementById("menuToggle");

    function alternarMenu(abrir) {
        if (!topo || !botaoMenu) return;
        topo.classList.toggle("menu-aberto", abrir);
        botaoMenu.setAttribute("aria-expanded", String(abrir));
        botaoMenu.setAttribute("aria-label", abrir ? "Fechar menu" : "Abrir menu");
        botaoMenu.innerHTML = abrir
            ? '<i class="fa-solid fa-xmark"></i>'
            : '<i class="fa-solid fa-bars"></i>';
    }

    if (botaoMenu) {
        botaoMenu.addEventListener("click", function () {
            alternarMenu(!topo.classList.contains("menu-aberto"));
        });

        document.querySelectorAll("#menuPrincipal a, #menuPrincipal button")
            .forEach(function (item) {
                item.addEventListener("click", function () { alternarMenu(false); });
            });
    }

    /* ---------- Modais: acessibilidade, ESC e trava de rolagem ---------- */

    const modais = document.querySelectorAll(".modal");

    function atualizarModais() {
        const algumAberto = Array.from(modais).some(function (m) {
            return m.style.display === "block";
        });
        document.body.classList.toggle("modal-aberto", algumAberto);
    }

    modais.forEach(function (modal) {
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");

        new MutationObserver(function () {
            atualizarModais();
            if (modal.style.display === "block") {
                const campo = modal.querySelector("input:not([type=hidden]):not([type=radio]), button:not(.fechar)");
                if (campo) setTimeout(function () { campo.focus(); }, 60);
            }
        }).observe(modal, { attributes: true, attributeFilter: ["style"] });
    });

    document.addEventListener("keydown", function (e) {
        if (e.key !== "Escape") return;
        modais.forEach(function (m) { m.style.display = "none"; });
        alternarMenu(false);
    });

    /* ---------- Máscaras ---------- */

    function aplicarMascara(id, formatar) {
        const campo = document.getElementById(id);
        if (!campo) return;
        campo.addEventListener("input", function () {
            campo.value = formatar(campo.value);
        });
    }

    function mascaraTelefone(valor) {
        const n = valor.replace(/\D/g, "").slice(0, 11);
        if (n.length <= 2) return n ? "(" + n : "";
        if (n.length <= 6) return "(" + n.slice(0, 2) + ") " + n.slice(2);
        if (n.length <= 10) return "(" + n.slice(0, 2) + ") " + n.slice(2, 6) + "-" + n.slice(6);
        return "(" + n.slice(0, 2) + ") " + n.slice(2, 7) + "-" + n.slice(7);
    }

    function mascaraCpf(valor) {
        const n = valor.replace(/\D/g, "").slice(0, 11);
        return n
            .replace(/(\d{3})(\d)/, "$1.$2")
            .replace(/(\d{3})(\d)/, "$1.$2")
            .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    }

    aplicarMascara("passageiroTelefone", mascaraTelefone);
    aplicarMascara("telefoneMotorista", mascaraTelefone);
    aplicarMascara("campoTelefoneReserva", mascaraTelefone);
    aplicarMascara("dpTelefone", mascaraTelefone);
    aplicarMascara("cpfMotorista", mascaraCpf);
    aplicarMascara("placaVan", function (v) {
        return v.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 8);
    });

    /* ---------- Datas: não permitir dias passados ---------- */

    ["dataViagem", "buscaData", "novaViagemData"].forEach(function (id) {
        const campo = document.getElementById(id);
        if (campo) campo.min = vlHojeIso();
    });
});


/* =====================================================
EFEITO 3D DA VAN (card do topo da página principal)
=====================================================
A van inclina levemente acompanhando o mouse (ou o dedo)
sobre o card. Só roda se o card existir na página, então
o mesmo arquivo continua funcionando no dashboard.html.
===================================================== */

document.addEventListener("DOMContentLoaded", function () {

    const card = document.getElementById("heroCard");
    const inclinar = document.getElementById("vanTilt");

    if (!card || !inclinar) return;

    // Respeita quem prefere menos movimento
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const MAX_X = 9;   // inclinação vertical máxima (graus)
    const MAX_Y = 14;  // inclinação horizontal máxima (graus)

    let quadro = null;

    function aplicar(rx, ry) {
        if (quadro) cancelAnimationFrame(quadro);

        quadro = requestAnimationFrame(function () {
            inclinar.style.setProperty("--rx", rx + "deg");
            inclinar.style.setProperty("--ry", ry + "deg");
        });
    }

    card.addEventListener("pointermove", function (evento) {
        const caixa = card.getBoundingClientRect();

        // Posição entre -0.5 e 0.5 dentro do card
        const x = (evento.clientX - caixa.left) / caixa.width - 0.5;
        const y = (evento.clientY - caixa.top) / caixa.height - 0.5;

        aplicar((-y * MAX_X * 2).toFixed(2), (x * MAX_Y * 2).toFixed(2));
    });

    card.addEventListener("pointerleave", function () {
        aplicar(0, 0);
    });
});
