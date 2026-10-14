/* =====================================================
VANLOC - DASHBOARD DO PASSAGEIRO
Usa a sessão e a API definidas em script.js.
===================================================== */

function dpEscape(texto) {
    return escapeHtml(texto);
}

function dpPassageiroAtual() {
    return vlPassageiroLogado();
}

function dpMostrarAba(aba) {
    ["inicio", "perfil", "reservas", "entregas", "favoritos", "notificacoes"].forEach(function(item) {
        const secao = document.getElementById("dpAba" + item.charAt(0).toUpperCase() + item.slice(1));
        if (secao) secao.classList.toggle("ativa", item === aba);
    });
    document.querySelectorAll(".dp-nav button").forEach(function(botao) {
        botao.classList.toggle("ativo", botao.dataset.aba === aba);
    });
    window.scrollTo({top: 0, behavior: "smooth"});

    if (aba === "entregas") {
        dpCarregarEntregas();
    }
}

function dpInicial(texto) {
    return (texto || "U").trim().charAt(0).toUpperCase();
}

function dpRenderAvatar(passageiro, classe) {
    if (passageiro.foto) {
        return '<img class="' + classe + '" src="' + dpEscape(passageiro.foto) + '" alt="Foto de perfil">';
    }
    return '<div class="' + classe + ' dp-avatar">' + dpEscape(dpInicial(passageiro.nome)) + '</div>';
}

/* Busca de novo os dados do usuário logado no servidor */
async function dpAtualizarSessao() {
    const resposta = await vlApi("auth.php?acao=sessao");
    vlUsuario = resposta.usuario || null;
    return dpPassageiroAtual();
}

async function dpCarregar() {
    const passageiro = dpPassageiroAtual();
    if (!passageiro) {
        window.location.href = "index.html";
        return;
    }

    const primeiroNome = (passageiro.nome || "Usuário").split(" ")[0];

    document.getElementById("dpSaudacao").textContent = "Olá, " + primeiroNome + "! 👋";
    document.getElementById("dpStatLocalidade").textContent = passageiro.cidade || "—";
    document.getElementById("dpUserMini").innerHTML =
        dpRenderAvatar(passageiro, "dp-avatar") +
        '<strong>' + dpEscape(primeiroNome) + '</strong>';

    document.getElementById("dpNome").value = passageiro.nome || "";
    document.getElementById("dpEmail").value = passageiro.email || "";
    document.getElementById("dpTelefone").value = passageiro.telefone || "";
    document.getElementById("dpCidade").value = passageiro.cidade || "";
    document.getElementById("dpEstado").value = passageiro.estado || "";
    document.getElementById("dpBio").value = passageiro.bio || "";

    dpAtualizarFotoPreview(passageiro);

    document.getElementById("dpResumoPerfil").innerHTML =
        '<div style="display:flex;align-items:center;gap:16px">' +
        dpRenderAvatar(passageiro, "dp-avatar") +
        '<div><strong style="font-size:18px">' + dpEscape(passageiro.nome) + '</strong>' +
        '<div style="color:#667085;margin-top:4px">' + dpEscape(passageiro.email) + '</div>' +
        '<div style="color:#667085;margin-top:3px">📍 ' + dpEscape(passageiro.cidade || "Localidade não informada") +
        (passageiro.estado ? ' - ' + dpEscape(passageiro.estado) : '') + '</div></div></div>';

    await dpCarregarReservas();
}

async function dpCarregarReservas() {
    let reservas = [];

    try {
        reservas = (await vlApi("reservas.php")).reservas;
    } catch (erro) {
        if (erro.status === 401 || erro.status === 403) {
            window.location.href = "index.html";
            return;
        }
        document.getElementById("dpListaReservas").innerHTML =
            '<div class="dp-empty">' + dpEscape(erro.message) + '</div>';
        return;
    }

    const hoje = vlHojeIso();
    const proximas = reservas.filter(function(r) {
        return r.data >= hoje && (r.status === "solicitada" || r.status === "confirmada");
    });

    document.getElementById("dpStatReservas").textContent = reservas.length;
    document.getElementById("dpListaReservas").innerHTML = reservas.length
        ? reservas.map(dpRenderReserva).join("")
        : '<div class="dp-empty">Você ainda não possui reservas. <br><br><a href="index.html#viagens" class="dp-btn" style="display:inline-block;text-decoration:none">Encontrar uma viagem</a></div>';

    document.getElementById("dpProximasViagens").innerHTML = proximas.length
        ? proximas.slice(0, 3).map(dpRenderReserva).join("")
        : 'Você não possui viagens futuras. <br><br><a href="index.html#viagens" class="dp-btn" style="display:inline-block;text-decoration:none">Encontrar viagem</a>';
}

const DP_STATUS = {
    solicitada: { classe: "pendente", rotulo: "Aguardando o motorista" },
    confirmada: { classe: "confirmada", rotulo: "Confirmada" },
    recusada: { classe: "recusada", rotulo: "Recusada pelo motorista" },
    cancelada: { classe: "cancelada", rotulo: "Cancelada por você" }
};

function dpRenderReserva(reserva) {
    const status = DP_STATUS[reserva.status] || DP_STATUS.solicitada;
    const quantidade = Math.max(1, Number.parseInt(reserva.quantidade, 10) || 1);
    const moeda = new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL"
    });
    let realizadaEm = "";

    if (reserva.criado_em) {
        const dataCriacao = new Date(String(reserva.criado_em).replace(" ", "T"));
        if (!Number.isNaN(dataCriacao.getTime())) {
            realizadaEm = dataCriacao.toLocaleString("pt-BR", {
                dateStyle: "short",
                timeStyle: "short"
            });
        }
    }

    let aviso = "Aguarde a confirmação do motorista.";
    if (reserva.status === "confirmada") {
        aviso = "Reserva confirmada pelo motorista.";
    } else if (reserva.status === "recusada") {
        aviso = "O motorista não pôde aceitar esta reserva.";
    } else if (reserva.status === "cancelada") {
        aviso = "Você cancelou esta reserva.";
    }

    const acoes = [];
    const telefone = String(reserva.motorista_telefone || "").replace(/\D/g, "");

    if (telefone) {
        acoes.push('<a class="dp-btn" style="text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/55' +
            dpEscape(telefone) + '"><i class="fa-brands fa-whatsapp"></i> Falar com o motorista</a>');
    }
    if (reserva.status === "solicitada" || reserva.status === "confirmada") {
        acoes.push('<button type="button" class="dp-btn secondary" onclick="dpCancelarReserva(' +
            Number(reserva.id) + ')">Cancelar reserva</button>');
    }

    return '<article class="dp-trip">' +
        '<div class="dp-trip-topline">' +
        '<span class="dp-chip dp-chip--' + status.classe + '">' + dpEscape(status.rotulo) + '</span>' +
        '<span class="dp-trip-code">Código: ' + dpEscape(reserva.codigo || "—") + '</span>' +
        '</div>' +
        '<h3>' + dpEscape(reserva.origem) + " → " + dpEscape(reserva.destino) + '</h3>' +
        '<div class="dp-trip-details">' +
        '<div><span>Data da viagem</span><strong>' + dpEscape(formatarData(reserva.data)) + '</strong></div>' +
        '<div><span>Horário de saída</span><strong>' + dpEscape(reserva.horario) + '</strong></div>' +
        '<div><span>Motorista</span><strong>' + dpEscape(reserva.motorista_nome || "VANLOC") + '</strong></div>' +
        '<div><span>Passageiros</span><strong>' + quantidade + (quantidade === 1 ? " pessoa" : " pessoas") + '</strong></div>' +
        '<div><span>Valor por pessoa</span><strong>' + moeda.format(reserva.valor) + '</strong></div>' +
        '<div><span>Total</span><strong>' + moeda.format(reserva.valor * quantidade) + '</strong></div>' +
        '</div>' +
        '<p class="dp-trip-created">' + (realizadaEm ? 'Solicitada em ' + dpEscape(realizadaEm) + ' · ' : '') + dpEscape(aviso) + '</p>' +
        (acoes.length ? '<div class="dp-trip-actions">' + acoes.join("") + '</div>' : '') +
        '</article>';
}

async function dpCancelarReserva(id) {
    if (!confirm("Deseja cancelar esta reserva?")) return;

    try {
        await vlApi("reservas.php?acao=cancelar", { id: id });
    } catch (erro) {
        alert(erro.message);
        return;
    }

    await dpCarregarReservas();
}

function dpAtualizarFotoPreview(passageiro) {
    const box = document.getElementById("dpFotoPreview");
    if (passageiro.foto) {
        box.innerHTML = '<img src="' + dpEscape(passageiro.foto) + '" alt="Foto de perfil">';
    } else {
        box.textContent = dpInicial(passageiro.nome);
    }
}

async function dpRemoverFoto() {
    if (!dpPassageiroAtual()) return;

    try {
        await vlApi("perfil.php?acao=remover_foto", {});
        await dpAtualizarSessao();
    } catch (erro) {
        alert(erro.message);
        return;
    }

    dpCarregar();
}

document.addEventListener("DOMContentLoaded", async function() {
    await vlSessaoPronta;
    await dpCarregar();

    if (window.location.hash === "#reservas") {
        dpMostrarAba("reservas");
    } else if (window.location.hash === "#entregas") {
        dpMostrarAba("entregas");
    }

    const inputFoto = document.getElementById("dpFotoInput");
    if (inputFoto) {
        inputFoto.addEventListener("change", async function() {
            const arquivo = this.files && this.files[0];
            if (!arquivo) return;
            if (!/^image\/(jpeg|png|webp)$/.test(arquivo.type)) {
                alert("Escolha uma imagem JPG, PNG ou WEBP.");
                this.value = "";
                return;
            }
            if (arquivo.size > 3 * 1024 * 1024) {
                alert("Escolha uma imagem de até 3 MB.");
                this.value = "";
                return;
            }

            const dados = new FormData();
            dados.append("foto", arquivo);

            try {
                await vlApi("perfil.php?acao=foto", dados);
                await dpAtualizarSessao();
            } catch (erro) {
                alert(erro.message);
            }

            this.value = "";
            dpCarregar();
        });
    }

    const form = document.getElementById("dpFormPerfil");
    if (form) {
        form.addEventListener("submit", async function(event) {
            event.preventDefault();
            if (!dpPassageiroAtual()) return;

            vlBotaoCarregando(form, true);

            try {
                await vlApi("perfil.php?acao=salvar", {
                    nome: document.getElementById("dpNome").value,
                    telefone: document.getElementById("dpTelefone").value,
                    cidade: document.getElementById("dpCidade").value,
                    estado: document.getElementById("dpEstado").value,
                    bio: document.getElementById("dpBio").value
                });
                await dpAtualizarSessao();
            } catch (erro) {
                vlBotaoCarregando(form, false);
                alert(erro.message);
                return;
            }

            vlBotaoCarregando(form, false);
            dpCarregar();
            alert("Perfil atualizado com sucesso!");
        });
    }
});

/* =====================================================
ENTREGAS (solicitações do cliente)
As solicitações são feitas na Área de Envios (envios.html);
aqui o cliente acompanha todas elas.
===================================================== */

async function dpCarregarEntregas() {
    const lista = document.getElementById("dpListaEntregas");

    try {
        await vlClienteCarregarEntregas();
    } catch (erro) {
        lista.innerHTML = '<div class="dp-empty">' + dpEscape(erro.message) + '</div>';
        return;
    }

    const andamento = vlClienteFiltrar("andamento");
    const historico = vlClienteFiltrar("historico");

    lista.innerHTML = andamento.length || historico.length
        ? '<h2>Em andamento</h2>' +
          (andamento.length ? andamento.map(vlClienteEntregaCard).join("") : '<div class="dp-empty">Nenhuma entrega em andamento.</div>') +
          '<h2 style="margin-top:26px">Histórico</h2>' +
          (historico.length ? historico.map(vlClienteEntregaCard).join("") : '<div class="dp-empty">Nenhuma entrega concluída ainda.</div>')
        : '<div class="dp-empty">Você ainda não solicitou nenhuma entrega.<br><br>' +
          '<a href="envios.html" class="dp-btn" style="display:inline-block;text-decoration:none">Abrir a Área de Envios</a></div>';
}

/* depois de cancelar uma entrega (entregas.js) */
window.vlClienteAposAlterar = dpCarregarEntregas;

function dpSair() {
    vlSair();
}
