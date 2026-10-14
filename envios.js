/* =====================================================
VANLOC - ÁREA DE ENVIOS (envios.html)
=====================================================
Empresas, lojas, comerciantes e clientes publicam
entregas e acompanham o andamento e o histórico.
Usa a sessão e a API de script.js e os componentes de
entregas.js. Motoristas não publicam entregas.
===================================================== */


let enviosAbaAtual = "nova";


function enviosMostrar(id) {

    ["enviosAcesso", "enviosMotorista", "enviosPainel"].forEach(function(bloco) {
        document.getElementById(bloco).style.display = bloco === id ? "" : "none";
    });

}


function enviosAtualizarTela() {

    if (vlMotoristaLogado()) {
        enviosMostrar("enviosMotorista");
        return;
    }

    const cliente = vlPassageiroLogado();

    if (!cliente) {
        enviosMostrar("enviosAcesso");
        return;
    }

    const empresa = cliente.tipo_conta === "empresa" && cliente.empresa_nome;

    document.getElementById("enviosTipoConta").innerText = empresa ? "Empresa / loja" : "Cliente";
    document.getElementById("enviosNomeConta").innerText = empresa
        ? cliente.empresa_nome + " · " + cliente.nome
        : cliente.nome;

    enviosMostrar("enviosPainel");
    enviosCarregar();

}


async function enviosCarregar() {

    try {
        await vlClienteCarregarEntregas();
    } catch (erro) {
        mostrarNotificacao(erro.message);
        return;
    }

    document.getElementById("contEnviosAndamento").innerText = vlClienteFiltrar("andamento").length;
    document.getElementById("contEnviosHistorico").innerText = vlClienteFiltrar("historico").length;

    if (enviosAbaAtual !== "nova") {
        enviosAba(enviosAbaAtual);
    }

}


function enviosAba(aba) {

    enviosAbaAtual = aba;

    document.querySelectorAll(".entregas-aba").forEach(function(botao) {
        botao.classList.toggle("ativo", botao.dataset.lista === aba);
    });

    const lista = document.getElementById("listaEnvios");

    document.getElementById("formEnvio").style.display = aba === "nova" ? "" : "none";
    lista.style.display = aba === "nova" ? "none" : "";

    if (aba === "nova") {
        return;
    }

    const entregas = vlClienteFiltrar(aba);

    lista.innerHTML = entregas.length
        ? entregas.map(vlClienteEntregaCard).join("")
        : '<div class="viagens-vazio">' + (aba === "andamento"
            ? "Nenhuma entrega em andamento. Publique uma nova solicitação!"
            : "Entregas concluídas ou canceladas aparecem aqui.") + '</div>';

}


/* depois de cancelar uma entrega (entregas.js) */
window.vlClienteAposAlterar = enviosCarregar;


document.addEventListener("DOMContentLoaded", function() {

    vlEntregaMontarFormulario(document.getElementById("camposEnvio"));


    /* ---------- publicar entrega ---------- */

    const formEnvio = document.getElementById("formEnvio");

    formEnvio.addEventListener("submit", async function(event) {

        event.preventDefault();
        vlBotaoCarregando(formEnvio, true);

        try {

            const resposta = await vlApi("entregas.php?acao=solicitar", vlEntregaLerFormulario(formEnvio));

            vlBotaoCarregando(formEnvio, false);
            formEnvio.reset();
            vlEntregaMontarFormulario(document.getElementById("camposEnvio"));
            mostrarNotificacao("Entrega " + resposta.codigo + " publicada! Os motoristas compatíveis já podem aceitá-la.");

            await enviosCarregar();
            enviosAba("andamento");

        } catch (erro) {

            vlBotaoCarregando(formEnvio, false);
            mostrarNotificacao(erro.message);

            if (erro.status === 401 || erro.status === 403) {
                vlUsuario = null;
                enviosAtualizarTela();
            }

        }

    });


    /* ---------- login ---------- */

    const formLogin = document.getElementById("formEnviosLogin");

    formLogin.addEventListener("submit", async function(event) {

        event.preventDefault();
        vlBotaoCarregando(formLogin, true);

        try {
            vlUsuario = (await vlApi("auth.php?acao=login", {
                tipo: "passageiro",
                email: document.getElementById("enviosEmail").value,
                senha: document.getElementById("enviosSenha").value
            })).usuario;
            formLogin.reset();
        } catch (erro) {
            mostrarNotificacao(erro.message);
        }

        vlBotaoCarregando(formLogin, false);
        enviosAtualizarTela();

    });


    /* ---------- cadastro (empresa ou pessoa física) ---------- */

    const formCadastro = document.getElementById("formEnviosCadastro");

    function tipoConta() {
        return document.querySelector('input[name="tipoConta"]:checked').value;
    }

    function atualizarTipoConta() {
        const empresa = tipoConta() === "empresa";
        document.getElementById("campoEmpresaNome").style.display = empresa ? "" : "none";
        document.getElementById("cadEmpresa").required = empresa;
        document.getElementById("rotuloDocumento").innerText = empresa ? "CNPJ (opcional)" : "CPF (opcional)";
    }

    document.querySelectorAll('input[name="tipoConta"]').forEach(function(opcao) {
        opcao.addEventListener("change", atualizarTipoConta);
    });

    atualizarTipoConta();

    formCadastro.addEventListener("submit", async function(event) {

        event.preventDefault();

        const senha = document.getElementById("cadSenha").value;

        if (senha !== document.getElementById("cadSenha2").value) {
            mostrarNotificacao("As senhas não coincidem!");
            return;
        }

        vlBotaoCarregando(formCadastro, true);

        try {
            vlUsuario = (await vlApi("auth.php?acao=cadastrar_passageiro", {
                tipo_conta: tipoConta(),
                empresa_nome: document.getElementById("cadEmpresa").value,
                documento: document.getElementById("cadDocumento").value,
                nome: document.getElementById("cadNome").value,
                email: document.getElementById("cadEmail").value,
                telefone: document.getElementById("cadTelefone").value,
                cidade: document.getElementById("cadCidade").value,
                estado: document.getElementById("cadEstado").value,
                senha: senha
            })).usuario;

            formCadastro.reset();
            atualizarTipoConta();
            mostrarNotificacao("Conta criada! Agora é só publicar sua entrega.");

        } catch (erro) {
            mostrarNotificacao(erro.message);
        }

        vlBotaoCarregando(formCadastro, false);
        enviosAtualizarTela();

    });

    vlSessaoPronta.then(enviosAtualizarTela);

});
