/* =====================================================
VANLOC - PAINEL ADMINISTRATIVO
Usa vlApi, escapeHtml e os formatadores de script.js.
===================================================== */

let adminAtual = null;

const ADMIN_STATUS_RESERVA = {
    solicitada: "Aguardando motorista",
    confirmada: "Confirmada",
    recusada: "Recusada",
    cancelada: "Cancelada"
};

const ADMIN_ABAS = ["resumo", "reservas", "viagens", "entregas", "motoristas", "passageiros", "admins"];

const ADMIN_CARREGAR = {
    resumo: adminCarregarResumo,
    reservas: adminCarregarReservas,
    viagens: adminCarregarViagens,
    entregas: adminCarregarEntregas,
    motoristas: adminCarregarMotoristas,
    passageiros: adminCarregarPassageiros,
    admins: adminCarregarAdmins
};


/* =====================================================
ACESSO
===================================================== */

async function adminIniciar() {
    let sessao;

    try {
        sessao = await vlApi("admin.php?acao=sessao");
    } catch (erro) {
        mostrarNotificacao(erro.message);
        return;
    }

    if (sessao.admin) {
        adminEntrar(sessao.admin);
        return;
    }

    document.getElementById("adminPainel").style.display = "none";
    document.getElementById("adminAcesso").style.display = "flex";
    document.getElementById("formAdminLogin").style.display = sessao.instalado ? "block" : "none";
    document.getElementById("formAdminInstalar").style.display = sessao.instalado ? "none" : "block";
}

function adminEntrar(admin) {
    adminAtual = admin;

    document.getElementById("adminAcesso").style.display = "none";
    document.getElementById("adminPainel").style.display = "";
    document.getElementById("adminSaudacao").innerText = "Olá, " + admin.nome.split(" ")[0] + "!";

    adminAtualizarPendentes();

    const aba = (window.location.hash || "").replace("#", "");
    adminAba(ADMIN_ABAS.includes(aba) ? aba : "resumo");
}

async function adminSair() {
    try {
        await vlApi("admin.php?acao=logout", {});
    } catch (erro) {
        // segue para a tela de login mesmo assim
    }
    window.location.href = "admin";
}

/* Envia um formulário de acesso (login ou instalação) */
function adminFormAcesso(id, acao, campos) {
    const formulario = document.getElementById(id);

    formulario.addEventListener("submit", async function(event) {
        event.preventDefault();
        vlBotaoCarregando(formulario, true);

        try {
            const resposta = await vlApi("admin.php?acao=" + acao, campos());
            formulario.reset();
            adminEntrar(resposta.admin);
        } catch (erro) {
            mostrarNotificacao(erro.message);
        }

        vlBotaoCarregando(formulario, false);
    });
}

/* Trata erros das ações: sessão expirada volta para o login */
function adminErro(erro) {
    if (erro.status === 401 || erro.status === 403) {
        adminIniciar();
    }
    mostrarNotificacao(erro.message);
}


/* =====================================================
NAVEGAÇÃO
===================================================== */

function adminAba(aba) {
    ADMIN_ABAS.forEach(function(item) {
        document.getElementById("adminAba" + item.charAt(0).toUpperCase() + item.slice(1))
            .style.display = item === aba ? "block" : "none";
    });

    document.querySelectorAll(".painel-nav-item").forEach(function(botao) {
        botao.classList.toggle("ativo", botao.dataset.aba === aba);
    });

    history.replaceState(null, "", "#" + aba);
    ADMIN_CARREGAR[aba]();
}

/* Atualiza o contador de reservas pendentes no menu */
async function adminAtualizarPendentes() {
    try {
        adminAtualizarBadge((await vlApi("admin.php?acao=resumo")).reservas.solicitada);
    } catch (erro) {
        // o contador é apenas informativo
    }
}

function adminAtualizarBadge(pendentes) {
    const badge = document.getElementById("adminBadgePendentes");
    badge.innerText = pendentes;
    badge.style.display = pendentes > 0 ? "inline-flex" : "none";
}


/* =====================================================
UTILITÁRIOS
===================================================== */

function adminDataHora(texto) {
    if (!texto) return "—";
    const data = new Date(String(texto).replace(" ", "T"));
    return Number.isNaN(data.getTime())
        ? escapeHtml(texto)
        : data.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function adminChipStatus(status) {
    return '<em class="status-reserva ' + escapeHtml(status) + '">' +
        escapeHtml(ADMIN_STATUS_RESERVA[status] || status) + '</em>';
}

function adminTabela(colunas, linhas, vazio) {
    if (linhas.length === 0) {
        return '<div class="viagens-vazio">' + vazio + '</div>';
    }

    return '<table class="admin-tabela"><thead><tr>' +
        colunas.map(c => "<th>" + c + "</th>").join("") +
        "</tr></thead><tbody>" +
        linhas.map(l => "<tr>" + l.map(c => "<td>" + c + "</td>").join("") + "</tr>").join("") +
        "</tbody></table>";
}

function adminBotao(rotulo, classe, acao) {
    return '<button type="button" class="admin-btn ' + classe + '" onclick="' + acao + '">' + rotulo + '</button>';
}

function adminCarregando(id) {
    document.getElementById(id).innerHTML =
        '<div class="viagens-vazio"><i class="fa-solid fa-spinner fa-spin"></i> Carregando...</div>';
}

/* Liga um campo de busca/filtro a uma função de recarga (com atraso na digitação) */
function adminFiltro(id, recarregar) {
    const campo = document.getElementById(id);
    let espera = null;

    campo.addEventListener(campo.tagName === "SELECT" ? "change" : "input", function() {
        clearTimeout(espera);
        espera = setTimeout(recarregar, 300);
    });
}

function adminParametros(idBusca, idStatus) {
    const parametros = new URLSearchParams();
    const busca = document.getElementById(idBusca).value.trim();

    if (busca) parametros.set("q", busca);
    if (idStatus) {
        const status = document.getElementById(idStatus).value;
        if (status) parametros.set("status", status);
    }

    return parametros.toString();
}


/* =====================================================
VISÃO GERAL
===================================================== */

async function adminCarregarResumo() {
    let r;

    try {
        r = await vlApi("admin.php?acao=resumo");
    } catch (erro) {
        adminErro(erro);
        return;
    }

    document.getElementById("resPassageiros").innerText = r.contas.passageiros;
    document.getElementById("resPassageirosNovos").innerText =
        "Passageiros · " + r.contas.passageiros_novos + " novos em 30 dias";
    document.getElementById("resMotoristas").innerText = r.contas.motoristas;
    document.getElementById("resMotoristasNovos").innerText =
        "Motoristas · " + r.contas.motoristas_novos + " novos em 30 dias";
    document.getElementById("resViagens").innerText = r.contas.viagens_ativas;
    document.getElementById("resReceita").innerText = "R$ " + formatarMoeda(r.receita_confirmada);

    adminAtualizarBadge(r.reservas.solicitada);

    const total = Object.values(r.reservas).reduce((a, b) => a + b, 0);

    document.getElementById("resStatus").innerHTML = total === 0
        ? '<div class="viagens-vazio">Nenhuma reserva ainda.</div>'
        : Object.keys(ADMIN_STATUS_RESERVA).map(function(status) {
            const quantidade = r.reservas[status] || 0;
            const largura = Math.round(quantidade / total * 100);
            return '<div class="admin-barra">' +
                '<span>' + ADMIN_STATUS_RESERVA[status] + '</span>' +
                '<div class="admin-barra-trilho"><div class="admin-barra-valor ' + status + '" style="width:' + largura + '%"></div></div>' +
                '<strong>' + quantidade + '</strong>' +
                '</div>';
        }).join("");

    document.getElementById("resRotas").innerHTML = r.rotas.length === 0
        ? '<div class="viagens-vazio">Ainda não há reservas ativas.</div>'
        : '<ol class="admin-rotas">' + r.rotas.map(function(rota) {
            return '<li><span>' + escapeHtml(rota.origem) + ' → ' + escapeHtml(rota.destino) + '</span>' +
                '<strong>' + rota.reservas + (rota.reservas === 1 ? ' reserva' : ' reservas') + '</strong></li>';
        }).join("") + '</ol>';

    document.getElementById("resUltimas").innerHTML = adminTabela(
        ["Código", "Passageiro", "Viagem", "Motorista", "Total", "Status", "Feita em"],
        r.ultimas_reservas.map(x => [
            escapeHtml(x.codigo),
            escapeHtml(x.nome),
            escapeHtml(x.origem) + " → " + escapeHtml(x.destino) + "<br><small>" + formatarData(x.data) + "</small>",
            escapeHtml(x.motorista_nome),
            "R$ " + formatarMoeda(x.valor * x.quantidade),
            adminChipStatus(x.status),
            adminDataHora(x.criado_em)
        ]),
        "Nenhuma reserva ainda."
    );
}


/* =====================================================
RESERVAS
===================================================== */

async function adminCarregarReservas() {
    adminCarregando("listaAdminReservas");
    let reservas;

    try {
        reservas = (await vlApi("admin.php?acao=reservas&" + adminParametros("filtroReservasQ", "filtroReservasStatus"))).reservas;
    } catch (erro) {
        adminErro(erro);
        return;
    }

    document.getElementById("listaAdminReservas").innerHTML = adminTabela(
        ["Código", "Passageiro", "Viagem", "Motorista", "Total", "Status", "Ações"],
        reservas.map(function(x) {
            const ativa = x.status === "solicitada" || x.status === "confirmada";
            const acoes = [];

            if (x.status === "solicitada") acoes.push(adminBotao("Confirmar", "verde", "adminStatusReserva(" + x.id + ", 'confirmada')"));
            if (ativa) acoes.push(adminBotao("Recusar", "vermelho", "adminStatusReserva(" + x.id + ", 'recusada')"));
            if (ativa) acoes.push(adminBotao("Cancelar", "cinza", "adminStatusReserva(" + x.id + ", 'cancelada')"));

            return [
                escapeHtml(x.codigo) + "<br><small>" + adminDataHora(x.criado_em) + "</small>",
                escapeHtml(x.nome) + "<br><small>" + escapeHtml(x.passageiro_email) + " · " + escapeHtml(x.telefone) + "</small>",
                escapeHtml(x.origem) + " → " + escapeHtml(x.destino) +
                    "<br><small>" + formatarData(x.data) + " às " + escapeHtml(x.horario) + "</small>",
                escapeHtml(x.motorista_nome),
                "R$ " + formatarMoeda(x.valor * x.quantidade) + "<br><small>" + x.quantidade + " × R$ " + formatarMoeda(x.valor) + "</small>",
                adminChipStatus(x.status),
                '<div class="admin-acoes">' + acoes.join("") + '</div>'
            ];
        }),
        "Nenhuma reserva encontrada."
    );
}

async function adminStatusReserva(id, status) {
    const textos = {
        confirmada: "Confirmar esta reserva em nome do motorista?",
        recusada: "Recusar esta reserva?",
        cancelada: "Cancelar esta reserva?"
    };

    if (!confirm(textos[status])) return;

    try {
        await vlApi("admin.php?acao=status_reserva", { id: id, status: status });
    } catch (erro) {
        adminErro(erro);
        return;
    }

    mostrarNotificacao("Reserva atualizada.");
    adminCarregarReservas();
    adminAtualizarPendentes();
}


/* =====================================================
VIAGENS
===================================================== */

async function adminCarregarViagens() {
    adminCarregando("listaAdminViagens");
    let viagens;

    try {
        viagens = (await vlApi("admin.php?acao=viagens&" + adminParametros("filtroViagensQ", "filtroViagensStatus"))).viagens;
    } catch (erro) {
        adminErro(erro);
        return;
    }

    const hoje = vlHojeIso();

    document.getElementById("listaAdminViagens").innerHTML = adminTabela(
        ["Rota", "Data", "Motorista", "Valor", "Ocupação", "Situação", "Ações"],
        viagens.map(function(v) {
            const ativa = v.status === "ativa" && v.data >= hoje;
            const situacao = v.status === "cancelada"
                ? '<em class="status-viagem cancelada">Cancelada</em>'
                : ativa
                    ? '<em class="status-viagem ativa">Ativa</em>'
                    : '<em class="status-viagem encerrada">Encerrada</em>';

            return [
                escapeHtml(v.origem) + " → " + escapeHtml(v.destino),
                formatarData(v.data) + "<br><small>" + escapeHtml(v.horario) + "</small>",
                escapeHtml(v.motorista_nome),
                "R$ " + formatarMoeda(v.valor),
                v.ocupadas + "/" + v.vagas,
                situacao,
                v.status === "ativa"
                    ? adminBotao("Cancelar", "vermelho", "adminCancelarViagem(" + v.id + ")")
                    : ""
            ];
        }),
        "Nenhuma viagem encontrada."
    );
}

async function adminCancelarViagem(id) {
    if (!confirm("Cancelar esta viagem? As reservas ativas serão recusadas e ela sairá do site.")) return;

    try {
        await vlApi("admin.php?acao=cancelar_viagem", { id: id });
    } catch (erro) {
        adminErro(erro);
        return;
    }

    mostrarNotificacao("Viagem cancelada.");
    adminCarregarViagens();
    adminAtualizarPendentes();
}


/* =====================================================
ENTREGAS
===================================================== */

async function adminCarregarEntregas() {
    adminCarregando("listaAdminEntregas");
    let entregas;

    try {
        entregas = (await vlApi("admin.php?acao=entregas&" + adminParametros("filtroEntregasQ", "filtroEntregasStatus"))).entregas;
    } catch (erro) {
        adminErro(erro);
        return;
    }

    document.getElementById("listaAdminEntregas").innerHTML = adminTabela(
        ["Código", "Carga", "Rota", "Retirada", "Valor", "Solicitante", "Motorista", "Status", "Ações"],
        entregas.map(e => [
            escapeHtml(e.codigo) + "<br><small>" + adminDataHora(e.criado_em) + "</small>",
            escapeHtml(e.descricao) + "<br><small>" + escapeHtml(VL_ENTREGA_PLATAFORMAS[e.plataforma] || e.plataforma) +
                " · " + vlEntregaPeso(e.peso_kg) + " · " + e.volumes + " vol.</small>",
            escapeHtml(e.retirada_cidade) + " → " + escapeHtml(e.destino_cidade),
            formatarData(e.data_retirada),
            "R$ " + formatarMoeda(e.valor),
            e.cliente_nome ? escapeHtml(e.cliente_nome) : "<small>Cadastrada pela administração</small>",
            e.motorista_nome ? escapeHtml(e.motorista_nome) : "—",
            vlEntregaChip(e.status),
            ["entregue", "cancelada"].includes(e.status)
                ? ""
                : adminBotao("Cancelar", "vermelho", "adminCancelarEntrega(" + e.id + ")")
        ]),
        "Nenhuma entrega encontrada."
    );
}

function adminAbrirFormEntrega() {
    const form = document.getElementById("formEntregaAdmin");

    if (!form.dataset.montado) {
        vlEntregaMontarFormulario(document.getElementById("camposEntregaAdmin"));
        form.dataset.montado = "1";
    }

    form.style.display = "block";
    document.getElementById("botaoNovaEntregaAdmin").style.display = "none";
}

function adminFecharFormEntrega() {
    const form = document.getElementById("formEntregaAdmin");
    form.reset();
    form.style.display = "none";
    document.getElementById("botaoNovaEntregaAdmin").style.display = "";
}

async function adminCancelarEntrega(id) {
    if (!confirm("Cancelar esta entrega? Ela sai da lista do motorista e do cliente como cancelada.")) return;

    try {
        await vlApi("admin.php?acao=cancelar_entrega", { id: id });
    } catch (erro) {
        adminErro(erro);
        return;
    }

    mostrarNotificacao("Entrega cancelada.");
    adminCarregarEntregas();
}


/* =====================================================
MOTORISTAS E PASSAGEIROS
===================================================== */

function adminAcoesConta(tipo, conta) {
    const nome = escapeHtml(JSON.stringify(conta.nome));

    return '<div class="admin-acoes">' +
        (conta.bloqueado
            ? adminBotao("Desbloquear", "verde", "adminBloquear('" + tipo + "', " + conta.id + ", false)")
            : adminBotao("Bloquear", "cinza", "adminBloquear('" + tipo + "', " + conta.id + ", true)")) +
        adminBotao("Excluir", "vermelho", "adminExcluir('" + tipo + "', " + conta.id + ", " + nome + ")") +
        '</div>';
}

function adminNomeConta(conta) {
    return escapeHtml(conta.nome) +
        (conta.bloqueado ? ' <em class="status-reserva recusada">Bloqueado</em>' : "") +
        "<br><small>" + escapeHtml(conta.email) + "</small>";
}

async function adminCarregarMotoristas() {
    adminCarregando("listaAdminMotoristas");
    let motoristas;

    try {
        motoristas = (await vlApi("admin.php?acao=motoristas&" + adminParametros("filtroMotoristasQ"))).motoristas;
    } catch (erro) {
        adminErro(erro);
        return;
    }

    document.getElementById("listaAdminMotoristas").innerHTML = adminTabela(
        ["Motorista", "Contato", "Van", "Viagens", "Reservas confirmadas", "Cadastro", "Ações"],
        motoristas.map(m => [
            adminNomeConta(m),
            escapeHtml(m.telefone) + "<br><small>CPF " + escapeHtml(m.cpf || "—") + "</small>",
            escapeHtml(m.modelo_van || "—") + "<br><small>" + escapeHtml(m.placa_van || "") +
                (m.lugares_van ? " · " + m.lugares_van + " lugares" : "") + "</small>" +
                "<br><small>" + [
                    m.faz_passageiros ? "Passageiros" : "",
                    m.faz_entregas ? "Entregas até " + m.capacidade_carga_kg + " kg" : ""
                ].filter(Boolean).join(" · ") + "</small>",
            m.viagens_ativas + " ativas<br><small>" + m.viagens + " no total</small>",
            m.reservas_confirmadas,
            adminDataHora(m.criado_em),
            adminAcoesConta("motorista", m)
        ]),
        "Nenhum motorista encontrado."
    );
}

async function adminCarregarPassageiros() {
    adminCarregando("listaAdminPassageiros");
    let passageiros;

    try {
        passageiros = (await vlApi("admin.php?acao=passageiros&" + adminParametros("filtroPassageirosQ"))).passageiros;
    } catch (erro) {
        adminErro(erro);
        return;
    }

    document.getElementById("listaAdminPassageiros").innerHTML = adminTabela(
        ["Passageiro", "Telefone", "Localidade", "Reservas", "Cadastro", "Ações"],
        passageiros.map(p => [
            adminNomeConta(p),
            escapeHtml(p.telefone || "—"),
            escapeHtml(p.cidade || "—") + (p.estado ? " - " + escapeHtml(p.estado) : ""),
            p.reservas,
            adminDataHora(p.criado_em),
            adminAcoesConta("passageiro", p)
        ]),
        "Nenhum passageiro encontrado."
    );
}

function adminRecarregarConta(tipo) {
    return tipo === "motorista" ? adminCarregarMotoristas() : adminCarregarPassageiros();
}

async function adminBloquear(tipo, id, bloquear) {
    if (bloquear && !confirm("Bloquear esta conta? A pessoa perde o acesso imediatamente.")) return;

    try {
        await vlApi("admin.php?acao=bloquear", { tipo: tipo, id: id, bloqueado: bloquear });
    } catch (erro) {
        adminErro(erro);
        return;
    }

    mostrarNotificacao(bloquear ? "Conta bloqueada." : "Conta desbloqueada.");
    adminRecarregarConta(tipo);
}

async function adminExcluir(tipo, id, nome) {
    const consequencia = tipo === "motorista"
        ? "Todas as viagens, planos e reservas dele também serão apagados."
        : "Todas as reservas dele também serão apagadas.";

    if (!confirm("Excluir definitivamente a conta de " + nome + "?\n\n" + consequencia + "\nEssa ação não pode ser desfeita.")) return;

    try {
        await vlApi("admin.php?acao=excluir", { tipo: tipo, id: id });
    } catch (erro) {
        adminErro(erro);
        return;
    }

    mostrarNotificacao("Conta excluída.");
    adminRecarregarConta(tipo);
    adminAtualizarPendentes();
}


/* =====================================================
ADMINISTRADORES
===================================================== */

async function adminCarregarAdmins() {
    adminCarregando("listaAdmins");
    let admins;

    try {
        admins = (await vlApi("admin.php?acao=admins")).admins;
    } catch (erro) {
        adminErro(erro);
        return;
    }

    document.getElementById("listaAdmins").innerHTML = adminTabela(
        ["Nome", "Email", "Último acesso", "Ações"],
        admins.map(a => [
            escapeHtml(a.nome) + (a.id === adminAtual.id ? " <small>(você)</small>" : ""),
            escapeHtml(a.email),
            adminDataHora(a.ultimo_acesso),
            a.id === adminAtual.id
                ? ""
                : adminBotao("Remover", "vermelho", "adminExcluirAdmin(" + a.id + ")")
        ]),
        "Nenhum administrador."
    );
}

async function adminExcluirAdmin(id) {
    if (!confirm("Remover este administrador?")) return;

    try {
        await vlApi("admin.php?acao=excluir_admin", { id: id });
    } catch (erro) {
        adminErro(erro);
        return;
    }

    mostrarNotificacao("Administrador removido.");
    adminCarregarAdmins();
}


/* =====================================================
INICIALIZAÇÃO
===================================================== */

document.addEventListener("DOMContentLoaded", function() {

    adminFormAcesso("formAdminLogin", "login", () => ({
        email: document.getElementById("adminEmail").value,
        senha: document.getElementById("adminSenha").value
    }));

    adminFormAcesso("formAdminInstalar", "instalar", () => ({
        chave: document.getElementById("instalarChave").value,
        nome: document.getElementById("instalarNome").value,
        email: document.getElementById("instalarEmail").value,
        senha: document.getElementById("instalarSenha").value
    }));

    adminFiltro("filtroReservasQ", adminCarregarReservas);
    adminFiltro("filtroReservasStatus", adminCarregarReservas);
    adminFiltro("filtroViagensQ", adminCarregarViagens);
    adminFiltro("filtroViagensStatus", adminCarregarViagens);
    adminFiltro("filtroEntregasQ", adminCarregarEntregas);
    adminFiltro("filtroEntregasStatus", adminCarregarEntregas);
    adminFiltro("filtroMotoristasQ", adminCarregarMotoristas);

    const formEntrega = document.getElementById("formEntregaAdmin");
    formEntrega.addEventListener("submit", async function(event) {
        event.preventDefault();
        vlBotaoCarregando(formEntrega, true);

        try {
            const resposta = await vlApi("admin.php?acao=criar_entrega", vlEntregaLerFormulario(formEntrega));
            vlBotaoCarregando(formEntrega, false);
            adminFecharFormEntrega();
            mostrarNotificacao("Entrega " + resposta.codigo + " publicada para os motoristas.");
            adminCarregarEntregas();
        } catch (erro) {
            vlBotaoCarregando(formEntrega, false);
            adminErro(erro);
        }
    });
    adminFiltro("filtroPassageirosQ", adminCarregarPassageiros);

    const formNovo = document.getElementById("formNovoAdmin");
    formNovo.addEventListener("submit", async function(event) {
        event.preventDefault();
        vlBotaoCarregando(formNovo, true);

        try {
            await vlApi("admin.php?acao=criar_admin", {
                nome: document.getElementById("novoAdminNome").value,
                email: document.getElementById("novoAdminEmail").value,
                senha: document.getElementById("novoAdminSenha").value
            });
            formNovo.reset();
            mostrarNotificacao("Administrador adicionado.");
            adminCarregarAdmins();
        } catch (erro) {
            adminErro(erro);
        }

        vlBotaoCarregando(formNovo, false);
    });

    const formSenha = document.getElementById("formSenhaAdmin");
    formSenha.addEventListener("submit", async function(event) {
        event.preventDefault();

        const nova = document.getElementById("senhaNovaAdmin").value;
        if (nova !== document.getElementById("senhaConfirmaAdmin").value) {
            mostrarNotificacao("As senhas não coincidem!");
            return;
        }

        vlBotaoCarregando(formSenha, true);

        try {
            await vlApi("admin.php?acao=senha", {
                senha_atual: document.getElementById("senhaAtualAdmin").value,
                senha_nova: nova
            });
            formSenha.reset();
            mostrarNotificacao("Senha alterada com sucesso.");
        } catch (erro) {
            /* senha atual errada também responde 403, mas não encerra a sessão */
            mostrarNotificacao(erro.message);
        }

        vlBotaoCarregando(formSenha, false);
    });

    adminIniciar();
});
