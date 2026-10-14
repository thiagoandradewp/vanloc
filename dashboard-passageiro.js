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
===================================================== */

async function dpCarregarEntregas() {
    const lista = document.getElementById("dpListaEntregas");
    let entregas;

    try {
        entregas = (await vlApi("entregas.php?acao=solicitadas")).entregas;
    } catch (erro) {
        lista.innerHTML = '<div class="dp-empty">' + dpEscape(erro.message) + '</div>';
        return;
    }

    lista.innerHTML = entregas.length
        ? '<h2>Minhas entregas</h2>' + entregas.map(dpRenderEntrega).join("")
        : '<div class="dp-empty">Você ainda não solicitou nenhuma entrega.<br><br>' +
          'Use o botão <strong>Solicitar entrega</strong> para enviar uma encomenda.</div>';
}

function dpRenderEntrega(e) {
    let extra = "";

    if (e.motorista_nome) {
        extra = '<div class="entrega-motorista"><i class="fa-solid fa-id-card"></i><div>' +
            '<span>Motorista</span><strong>' + dpEscape(e.motorista_nome) + '</strong>' +
            '<small>' + dpEscape([e.modelo_van, e.placa_van].filter(Boolean).join(" · ")) + '</small></div>' +
            (["aguardando_retirada", "coletada", "em_transito"].includes(e.status)
                ? vlEntregaWhatsApp(e.motorista_telefone, "Falar com o motorista")
                : "") +
            '</div>';
    } else if (e.status === "disponivel") {
        extra = '<p class="entrega-obs"><i class="fa-solid fa-hourglass-half"></i> ' +
            'Aguardando um motorista compatível aceitar a entrega.</p>';
    }

    const acoes = e.status === "disponivel" || e.status === "aguardando_retirada"
        ? '<button type="button" class="dp-btn secondary" onclick="dpCancelarEntrega(' + Number(e.id) + ')">Cancelar solicitação</button>'
        : "";

    return vlEntregaCard(e, { extra: extra, acoes: acoes });
}

function dpAbrirFormEntrega() {
    const form = document.getElementById("dpFormEntrega");

    if (!form.dataset.montado) {
        vlEntregaMontarFormulario(document.getElementById("dpCamposEntrega"));
        form.dataset.montado = "1";
    }

    form.style.display = "block";
    document.getElementById("dpBotaoNovaEntrega").style.display = "none";
    form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function dpFecharFormEntrega() {
    const form = document.getElementById("dpFormEntrega");
    form.reset();
    form.style.display = "none";
    document.getElementById("dpBotaoNovaEntrega").style.display = "";
}

async function dpCancelarEntrega(id) {
    if (!confirm("Cancelar esta solicitação de entrega?")) return;

    try {
        await vlApi("entregas.php?acao=cancelar", { id: id });
    } catch (erro) {
        alert(erro.message);
    }

    dpCarregarEntregas();
}

document.addEventListener("DOMContentLoaded", function() {
    const form = document.getElementById("dpFormEntrega");
    if (!form) return;

    form.addEventListener("submit", async function(event) {
        event.preventDefault();
        vlBotaoCarregando(form, true);

        try {
            const resposta = await vlApi("entregas.php?acao=solicitar", vlEntregaLerFormulario(form));
            vlBotaoCarregando(form, false);
            dpFecharFormEntrega();
            alert("Solicitação " + resposta.codigo + " enviada! Ela já está visível para os motoristas compatíveis.");
            dpCarregarEntregas();
        } catch (erro) {
            vlBotaoCarregando(form, false);
            alert(erro.message);
        }
    });
});

function dpSair() {
    vlSair();
}
