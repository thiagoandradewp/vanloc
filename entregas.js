/* =====================================================
VANLOC - ENTREGAS DE MERCADORIAS
=====================================================
1) Componentes compartilhados (painel do motorista,
   Área de Envios, área do passageiro e administração):
   rótulos, cartão da entrega, etapas, formulário de
   solicitação e lista de entregas do cliente
2) Aba "Entregas" e "Meus serviços" do Painel do Motorista

Depende de script.js (vlApi, escapeHtml, formatarData,
formatarMoeda, mostrarNotificacao, vlBotaoCarregando).
===================================================== */


const VL_ENTREGA_STATUS = {
    disponivel: { rotulo: "Aguardando motorista", classe: "solicitada" },
    aguardando_retirada: { rotulo: "Aguardando retirada", classe: "solicitada" },
    coletada: { rotulo: "Mercadoria coletada", classe: "andamento" },
    em_transito: { rotulo: "Em trânsito", classe: "andamento" },
    entregue: { rotulo: "Entregue", classe: "confirmada" },
    cancelada: { rotulo: "Cancelada", classe: "cancelada" }
};

/* etapas depois que um motorista aceita: [status, rótulo, campo com a data] */
const VL_ENTREGA_ETAPAS = [
    ["aguardando_retirada", "Aguardando retirada", "aceita_em"],
    ["coletada", "Mercadoria coletada", "coletada_em"],
    ["em_transito", "Em trânsito", "em_transito_em"],
    ["entregue", "Entregue", "entregue_em"]
];

/* botão que leva à próxima etapa */
const VL_ENTREGA_PROXIMA_ACAO = {
    aguardando_retirada: "Confirmar coleta",
    coletada: "Iniciar transporte",
    em_transito: "Confirmar entrega"
};

const VL_ENTREGA_PLATAFORMAS = {
    mercado_livre: "Mercado Livre",
    shopee: "Shopee",
    amazon: "Amazon",
    loja: "Loja / comércio local",
    particular: "Envio particular",
    outro: "Outro"
};

const VL_ENTREGA_TAMANHOS = {
    pequeno: "Pequeno",
    medio: "Médio",
    grande: "Grande"
};

const VL_ENTREGA_ANDAMENTO = ["aguardando_retirada", "coletada", "em_transito"];

/* do menor para o maior: [rótulo, peso usual máx. (kg), maior dimensão (cm)]
   (os mesmos limites de api/entregas-comum.php) */
const VL_VEICULOS = {
    moto: ["Moto", 20, 50],
    carro: ["Carro", 200, 100],
    utilitario: ["Utilitário (Fiorino, Strada...)", 700, 180],
    van: ["Van", 1500, 300],
    caminhao: ["Caminhão", 30000, 1200]
};


/* Menor veículo em que a carga cabe, pelo peso e pela maior dimensão */
function vlVeiculoMinimo(pesoKg, maiorDimensaoCm) {

    return Object.keys(VL_VEICULOS).find(function(veiculo) {
        return pesoKg <= VL_VEICULOS[veiculo][1] && maiorDimensaoCm <= VL_VEICULOS[veiculo][2];
    }) || "caminhao";

}


function vlNivelVeiculo(veiculo) {

    return Object.keys(VL_VEICULOS).indexOf(veiculo);

}



/* =====================================================
COMPONENTES COMPARTILHADOS
===================================================== */


function vlEntregaDataHora(texto) {

    if (!texto) {
        return "";
    }

    const data = new Date(String(texto).replace(" ", "T"));

    return Number.isNaN(data.getTime())
        ? escapeHtml(texto)
        : data.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

}


function vlEntregaPeso(kg) {

    return Number(kg || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " kg";

}


function vlEntregaChip(status) {

    const info = VL_ENTREGA_STATUS[status] || { rotulo: status, classe: "" };

    return '<em class="status-reserva ' + escapeHtml(info.classe) + '">' + escapeHtml(info.rotulo) + '</em>';

}


function vlEntregaWhatsApp(telefone, rotulo) {

    const numero = String(telefone || "").replace(/\D/g, "");

    if (!numero) {
        return escapeHtml(telefone || "");
    }

    return '<a class="entrega-whatsapp" href="https://wa.me/55' + escapeHtml(numero) +
        '" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> ' +
        escapeHtml(rotulo || telefone) + '</a>';

}


/* Linha do tempo: Aguardando retirada → Coletada → Em trânsito → Entregue */
function vlEntregaEtapas(e) {

    if (e.status === "disponivel") {
        return "";
    }

    const atual = VL_ENTREGA_ETAPAS.findIndex(etapa => etapa[0] === e.status);

    return '<ol class="entrega-etapas' + (e.status === "cancelada" ? " cancelada" : "") + '">' +
        VL_ENTREGA_ETAPAS.map(function(etapa, indice) {
            const feita = Boolean(e[etapa[2]]) && (atual === -1 || indice <= atual);
            const classe = indice === atual ? "atual" : feita ? "feita" : "";
            return '<li class="' + classe + '">' +
                '<span class="entrega-etapa-ponto"><i class="fa-solid fa-check"></i></span>' +
                '<strong>' + etapa[1] + '</strong>' +
                '<small>' + (feita ? vlEntregaDataHora(e[etapa[2]]) : "") + '</small>' +
                '</li>';
        }).join("") +
        '</ol>';

}


/*
Cartão de uma entrega.
opcoes.acoes  HTML dos botões
opcoes.extra  HTML adicional (ex: dados do motorista)
Os contatos e o endereço exato do destino só aparecem
quando vieram da API (o motorista só os recebe depois
de aceitar a entrega).
*/
function vlEntregaCard(e, opcoes = {}) {

    const temContatos = Boolean(e.destino_endereco);

    const destino = temContatos
        ? escapeHtml(e.destino_endereco) + '<br><small>' + escapeHtml(e.destino_cidade) + '</small>'
        : escapeHtml(e.destino_cidade) + '<br><small>Endereço completo liberado ao aceitar</small>';

    const contatos = temContatos
        ? '<div class="entrega-contatos">' +
            '<div><span>Responsável pela retirada</span><strong>' + escapeHtml(e.retirada_contato) + '</strong>' +
                vlEntregaWhatsApp(e.retirada_telefone) + '</div>' +
            '<div><span>Destinatário</span><strong>' + escapeHtml(e.destinatario_nome) + '</strong>' +
                vlEntregaWhatsApp(e.destinatario_telefone) + '</div>' +
          '</div>'
        : "";

    return '<article class="entrega-card status-' + escapeHtml(e.status) + '">' +

        '<div class="entrega-topo">' +
            '<span class="entrega-plataforma plataforma-' + escapeHtml(e.plataforma) + '">' +
                escapeHtml(VL_ENTREGA_PLATAFORMAS[e.plataforma] || e.plataforma) + '</span>' +
            vlEntregaChip(e.status) +
            '<span class="entrega-codigo">' + escapeHtml(e.codigo) + '</span>' +
        '</div>' +

        '<p class="entrega-descricao">' + escapeHtml(e.descricao) + '</p>' +

        '<div class="entrega-rota">' +
            '<div><span><i class="fa-solid fa-location-dot"></i> Retirada</span>' +
                '<strong>' + escapeHtml(e.retirada_endereco) + '<br><small>' + escapeHtml(e.retirada_cidade) + '</small></strong></div>' +
            '<i class="fa-solid fa-arrow-right entrega-seta"></i>' +
            '<div><span><i class="fa-solid fa-flag-checkered"></i> Destino</span><strong>' + destino + '</strong></div>' +
        '</div>' +

        '<div class="entrega-detalhes">' +
            '<div><span>Retirada desejada</span><strong>' + formatarData(e.data_retirada) +
                (e.horario_retirada ? ' às ' + escapeHtml(e.horario_retirada) : '') + '</strong></div>' +
            '<div><span>Carga</span><strong>' + vlEntregaPeso(e.peso_kg) + ' · ' + e.volumes +
                (e.volumes === 1 ? ' volume' : ' volumes') + '</strong></div>' +
            '<div><span>Dimensões aprox.</span><strong>' + (e.comprimento_cm
                ? e.comprimento_cm + ' × ' + e.largura_cm + ' × ' + e.altura_cm + ' cm'
                : escapeHtml(VL_ENTREGA_TAMANHOS[e.tamanho] || e.tamanho)) + '</strong></div>' +
            '<div><span>Veículo mínimo</span><strong>' +
                escapeHtml((VL_VEICULOS[e.veiculo_necessario] || [e.veiculo_necessario])[0]) + '</strong></div>' +
            '<div><span>Valor oferecido</span><strong class="entrega-valor">R$ ' + formatarMoeda(e.valor) + '</strong></div>' +
            (e.solicitante ? '<div><span>Solicitante</span><strong>' + escapeHtml(e.solicitante) + '</strong></div>' : '') +
        '</div>' +

        (e.observacoes ? '<p class="entrega-obs"><i class="fa-solid fa-note-sticky"></i> ' + escapeHtml(e.observacoes) + '</p>' : '') +

        contatos +
        (opcoes.extra || "") +
        vlEntregaEtapas(e) +

        (opcoes.acoes ? '<div class="entrega-acoes">' + opcoes.acoes + '</div>' : '') +

    '</article>';

}


/* Campos do formulário de solicitação (área do passageiro e administração) */
function vlEntregaFormularioHtml() {

    const opcoes = (mapa, selecionada) => Object.keys(mapa).map(chave =>
        '<option value="' + chave + '"' + (chave === selecionada ? " selected" : "") + '>' + mapa[chave] + '</option>'
    ).join("");

    return '' +
        '<h3><i class="fa-solid fa-box"></i> Mercadoria</h3>' +
        '<div class="entrega-form-grid">' +
            '<div><label>Origem do pedido</label><select name="plataforma" required>' + opcoes(VL_ENTREGA_PLATAFORMAS, "particular") + '</select></div>' +
            '<div><label>Quantidade de volumes</label><input type="number" name="volumes" min="1" max="999" value="1" required></div>' +
            '<div class="largura-total"><label>Descrição da mercadoria</label><textarea name="descricao" maxlength="500" rows="2" placeholder="Ex: 2 caixas de roupas de um pedido da Shopee" required></textarea></div>' +
            '<div><label>Peso total aproximado (kg)</label><input type="number" name="peso_kg" min="0.01" step="0.01" placeholder="Ex: 3.5" class="entrega-calc" required></div>' +
            '<div><label>Dimensões do maior volume (cm)</label><div class="entrega-dimensoes">' +
                '<input type="number" name="comprimento_cm" min="1" max="1500" placeholder="Compr." aria-label="Comprimento (cm)" class="entrega-calc" required>' +
                '<span>×</span><input type="number" name="largura_cm" min="1" max="1500" placeholder="Larg." aria-label="Largura (cm)" class="entrega-calc" required>' +
                '<span>×</span><input type="number" name="altura_cm" min="1" max="1500" placeholder="Alt." aria-label="Altura (cm)" class="entrega-calc" required>' +
            '</div></div>' +
            '<div class="largura-total"><label>Veículo necessário</label><select name="veiculo_necessario" class="entrega-veiculo" required>' +
                Object.keys(VL_VEICULOS).map(v => '<option value="' + v + '">' + VL_VEICULOS[v][0] + '</option>').join("") +
            '</select><small class="entregas-ajuda entrega-veiculo-dica"></small></div>' +
        '</div>' +

        '<h3><i class="fa-solid fa-location-dot"></i> Retirada</h3>' +
        '<div class="entrega-form-grid">' +
            '<div class="largura-total"><label>Endereço de retirada</label><input type="text" name="retirada_endereco" maxlength="200" placeholder="Rua, número, bairro" required></div>' +
            '<div><label>Cidade</label><input type="text" name="retirada_cidade" maxlength="80" required></div>' +
            '<div><label>Data desejada para a retirada</label><input type="date" name="data_retirada" class="entrega-data" required></div>' +
            '<div><label>Horário desejado</label><input type="time" name="horario_retirada" required></div>' +
            '<div><label>Responsável pela entrega ao motorista</label><input type="text" name="retirada_contato" maxlength="120" required></div>' +
            '<div><label>Telefone do responsável</label><input type="tel" name="retirada_telefone" maxlength="20" class="entrega-telefone" required></div>' +
        '</div>' +

        '<h3><i class="fa-solid fa-flag-checkered"></i> Destino</h3>' +
        '<div class="entrega-form-grid">' +
            '<div class="largura-total"><label>Endereço de entrega</label><input type="text" name="destino_endereco" maxlength="200" placeholder="Rua, número, bairro" required></div>' +
            '<div><label>Cidade</label><input type="text" name="destino_cidade" maxlength="80" required></div>' +
            '<div><label>Valor oferecido ao motorista (R$)</label><input type="number" name="valor" min="1" step="0.01" placeholder="Ex: 40.00" required></div>' +
            '<div><label>Nome do destinatário</label><input type="text" name="destinatario_nome" maxlength="120" required></div>' +
            '<div><label>Telefone do destinatário</label><input type="tel" name="destinatario_telefone" maxlength="20" class="entrega-telefone" required></div>' +
            '<div class="largura-total"><label>Observações (opcional)</label><textarea name="observacoes" maxlength="500" rows="2" placeholder="Ex: frágil, retirar no balcão, horário comercial"></textarea></div>' +
        '</div>' +

        '<p class="entregas-ajuda"><i class="fa-solid fa-circle-info"></i> ' +
            'O valor é pago diretamente ao motorista. A VANLOC não faz cobranças pelo site.</p>';

}


/* Insere o formulário no container e liga máscaras / data mínima */
function vlEntregaMontarFormulario(container) {

    container.innerHTML = vlEntregaFormularioHtml();

    container.querySelectorAll(".entrega-data").forEach(function(campo) {
        campo.min = vlHojeIso();
    });

    /* sugere o menor veículo em que a carga cabe e impede escolher um menor */
    const veiculo = container.querySelector(".entrega-veiculo");
    const dica = container.querySelector(".entrega-veiculo-dica");

    function sugerirVeiculo() {
        const valor = nome => Number(container.querySelector('[name="' + nome + '"]').value) || 0;
        const minimo = vlVeiculoMinimo(
            valor("peso_kg"),
            Math.max(valor("comprimento_cm"), valor("largura_cm"), valor("altura_cm"))
        );

        Array.from(veiculo.options).forEach(function(opcao) {
            opcao.disabled = vlNivelVeiculo(opcao.value) < vlNivelVeiculo(minimo);
        });

        if (vlNivelVeiculo(veiculo.value) < vlNivelVeiculo(minimo)) {
            veiculo.value = minimo;
        }

        dica.innerHTML = '<i class="fa-solid fa-truck-fast"></i> Pelo peso e pelas dimensões, a carga precisa de pelo menos: <strong>' +
            VL_VEICULOS[minimo][0] + '</strong>. Só motoristas com veículo compatível verão a entrega.';
    }

    container.querySelectorAll(".entrega-calc").forEach(function(campo) {
        campo.addEventListener("input", sugerirVeiculo);
    });

    sugerirVeiculo();

    container.querySelectorAll(".entrega-telefone").forEach(function(campo) {
        campo.addEventListener("input", function() {
            const n = campo.value.replace(/\D/g, "").slice(0, 11);
            campo.value = n.length <= 2 ? (n ? "(" + n : "")
                : n.length <= 6 ? "(" + n.slice(0, 2) + ") " + n.slice(2)
                : n.length <= 10 ? "(" + n.slice(0, 2) + ") " + n.slice(2, 6) + "-" + n.slice(6)
                : "(" + n.slice(0, 2) + ") " + n.slice(2, 7) + "-" + n.slice(7);
        });
    });

}


function vlEntregaLerFormulario(formulario) {

    return Object.fromEntries(new FormData(formulario).entries());

}



/* =====================================================
ENTREGAS DO CLIENTE (Área de Envios e área do passageiro)
===================================================== */


let vlClienteEntregas = [];


async function vlClienteCarregarEntregas() {

    vlClienteEntregas = (await vlApi("entregas.php?acao=solicitadas")).entregas;

    return vlClienteEntregas;

}


/* filtro: "andamento" (aguardando motorista ou em execução) ou "historico" */
function vlClienteFiltrar(lista) {

    return vlClienteEntregas.filter(function(e) {
        const aberta = e.status === "disponivel" || VL_ENTREGA_ANDAMENTO.includes(e.status);
        return lista === "historico" ? !aberta : aberta;
    });

}


function vlClienteEntregaCard(e) {

    let extra = "";

    if (e.motorista_nome) {
        extra = '<div class="entrega-motorista"><i class="fa-solid fa-id-card"></i><div>' +
            '<span>Motorista responsável</span><strong>' + escapeHtml(e.motorista_nome) + '</strong>' +
            '<small>' + escapeHtml([e.modelo_van, e.placa_van].filter(Boolean).join(" · ")) + '</small></div>' +
            (VL_ENTREGA_ANDAMENTO.includes(e.status)
                ? vlEntregaWhatsApp(e.motorista_telefone, "Falar com o motorista")
                : "") +
            '</div>';
    } else if (e.status === "disponivel") {
        extra = '<p class="entrega-obs"><i class="fa-solid fa-hourglass-half"></i> ' +
            'Publicada. Aguardando um motorista compatível aceitar a entrega.</p>';
    }

    const acoes = e.status === "disponivel" || e.status === "aguardando_retirada"
        ? '<button type="button" class="btn-cancelar-plano" onclick="vlClienteCancelarEntrega(' + Number(e.id) + ')">Cancelar solicitação</button>'
        : "";

    return vlEntregaCard(e, { extra: extra, acoes: acoes });

}


/* Cada página define window.vlClienteAposAlterar para recarregar a lista */
async function vlClienteCancelarEntrega(id) {

    if (!confirm("Cancelar esta solicitação de entrega?")) {
        return;
    }

    try {
        await vlApi("entregas.php?acao=cancelar", { id: id });
        mostrarNotificacao("Solicitação cancelada.");
    } catch (erro) {
        mostrarNotificacao(erro.message);
    }

    if (typeof window.vlClienteAposAlterar === "function") {
        window.vlClienteAposAlterar();
    }

}



/* =====================================================
PAINEL DO MOTORISTA: ABA ENTREGAS
===================================================== */


let painelEntregasDisponiveis = [];

let painelEntregasMinhas = [];

let painelEntregasCapacidade = 0;

let painelEntregasPerfil = null;

let painelEntregasListaAtual = "disponiveis";


async function painelEntregasCarregar() {

    const cidade = document.getElementById("filtroEntregasCidade").value.trim();

    try {

        const [disponiveis, minhas] = await Promise.all([
            vlApi("entregas.php?acao=disponiveis" + (cidade ? "&cidade=" + encodeURIComponent(cidade) : "")),
            vlApi("entregas.php?acao=minhas")
        ]);

        painelEntregasDisponiveis = disponiveis.entregas;
        painelEntregasCapacidade = disponiveis.perfil.capacidade_carga_kg;
        painelEntregasPerfil = disponiveis.perfil;
        painelEntregasMinhas = minhas.entregas;

    } catch (erro) {

        document.getElementById("listaEntregasMotorista").innerHTML =
            '<div class="viagens-vazio">' + escapeHtml(erro.message) + '</div>';
        return false;

    }

    const andamento = painelEntregasMinhas.filter(e => VL_ENTREGA_ANDAMENTO.includes(e.status));

    document.getElementById("contEntregasDisponiveis").innerText = painelEntregasDisponiveis.length;
    document.getElementById("contEntregasAndamento").innerText = andamento.length;
    document.getElementById("contEntregasHistorico").innerText = painelEntregasMinhas.length - andamento.length;

    const badge = document.getElementById("badgeEntregas");
    badge.innerText = andamento.length;
    badge.style.display = andamento.length > 0 ? "inline-flex" : "none";

    document.getElementById("entregasCapacidadeInfo").innerHTML =
        '<i class="fa-solid fa-truck-fast"></i> Compatíveis com: <strong>' +
        escapeHtml(VL_VEICULOS[painelEntregasPerfil.tipo_veiculo][0]) + '</strong> · até <strong>' +
        vlEntregaPeso(painelEntregasCapacidade) + '</strong> · ' +
        (painelEntregasPerfil.regioes.length
            ? 'cidades: <strong>' + escapeHtml(painelEntregasPerfil.regioes.join(", ")) + '</strong>'
            : 'todas as cidades') +
        ' · <a href="#servicos" onclick="mostrarAba(\'servicos\'); return false;">alterar</a>';

    return true;

}


async function painelEntregasAbrir() {

    document.getElementById("listaEntregasMotorista").innerHTML =
        '<div class="viagens-vazio"><i class="fa-solid fa-spinner fa-spin"></i> Carregando entregas...</div>';

    if (await painelEntregasCarregar()) {
        painelEntregasLista(painelEntregasListaAtual);
    }

}


function painelEntregasLista(lista) {

    painelEntregasListaAtual = lista;

    document.querySelectorAll(".entregas-aba").forEach(function(botao) {
        botao.classList.toggle("ativo", botao.dataset.lista === lista);
    });

    document.getElementById("entregasFiltros").style.display = lista === "disponiveis" ? "" : "none";

    const container = document.getElementById("listaEntregasMotorista");
    let entregas;
    let vazio;

    if (lista === "disponiveis") {

        entregas = painelEntregasDisponiveis;
        vazio = "Nenhuma entrega compatível com o seu veículo e as suas cidades no momento. Volte mais tarde!";

        container.innerHTML = entregas.length
            ? entregas.map(e => vlEntregaCard(e, {
                acoes: '<button type="button" class="btn-salvar-plano" onclick="painelEntregaAceitar(' + e.id + ')">' +
                    '<i class="fa-solid fa-check"></i> Aceitar entrega</button>'
            })).join("")
            : '<div class="viagens-vazio">' + vazio + '</div>';

        return;

    }

    entregas = painelEntregasMinhas.filter(e =>
        lista === "andamento"
            ? VL_ENTREGA_ANDAMENTO.includes(e.status)
            : !VL_ENTREGA_ANDAMENTO.includes(e.status)
    );

    vazio = lista === "andamento"
        ? "Você não tem entregas em andamento. Veja as disponíveis e aceite uma!"
        : "As entregas concluídas ou canceladas aparecem aqui.";

    container.innerHTML = entregas.length
        ? entregas.map(function(e) {
            const acoes = [];

            if (VL_ENTREGA_PROXIMA_ACAO[e.status]) {
                acoes.push('<button type="button" class="btn-salvar-plano" onclick="painelEntregaAvancar(' + e.id + ')">' +
                    '<i class="fa-solid fa-arrow-right"></i> ' + VL_ENTREGA_PROXIMA_ACAO[e.status] + '</button>');
            }

            if (e.status === "aguardando_retirada") {
                acoes.push('<button type="button" class="btn-cancelar-plano" onclick="painelEntregaDesistir(' + e.id + ')">Desistir</button>');
            }

            return vlEntregaCard(e, { acoes: acoes.join("") });
        }).join("")
        : '<div class="viagens-vazio">' + vazio + '</div>';

}


async function painelEntregaAcao(acao, id, mensagem) {

    try {
        await vlApi("entregas.php?acao=" + acao, { id: id });
    } catch (erro) {
        mostrarNotificacao(erro.message);
        await painelEntregasCarregar();
        painelEntregasLista(painelEntregasListaAtual);
        return false;
    }

    await painelEntregasCarregar();
    mostrarNotificacao(mensagem);
    return true;

}


async function painelEntregaAceitar(id) {

    if (!confirm("Aceitar esta entrega? Você se compromete a retirar a mercadoria na data indicada.")) {
        return;
    }

    if (await painelEntregaAcao("aceitar", id, "Entrega aceita! Os contatos foram liberados.")) {
        painelEntregasLista("andamento");
    }

}


async function painelEntregaAvancar(id) {

    const entrega = painelEntregasMinhas.find(e => e.id === id);
    const acao = entrega ? VL_ENTREGA_PROXIMA_ACAO[entrega.status] : "Avançar etapa";

    if (!confirm(acao + "?")) {
        return;
    }

    const concluiu = entrega && entrega.status === "em_transito";

    if (await painelEntregaAcao("avancar", id, concluiu ? "Entrega concluída!" : "Status atualizado.")) {
        painelEntregasLista(concluiu ? "historico" : "andamento");
    }

}


async function painelEntregaDesistir(id) {

    if (!confirm("Desistir desta entrega? Ela volta a ficar disponível para outros motoristas.")) {
        return;
    }

    if (await painelEntregaAcao("desistir", id, "Você desistiu da entrega.")) {
        painelEntregasLista("andamento");
    }

}



/* =====================================================
PAINEL DO MOTORISTA: MEUS SERVIÇOS
===================================================== */


function painelServicosAtualizarCampos() {

    const fazEntregas = document.getElementById("servicoPainelEntregas").checked;

    document.getElementById("campoCapacidadePainel").style.display = fazEntregas ? "" : "none";
    document.getElementById("capacidadeCargaPainel").required = fazEntregas;

}


function painelServicosPreencher() {

    const motorista = vlMotoristaLogado();

    if (!motorista) {
        return;
    }

    document.getElementById("servicoPainelPassageiros").checked = Number(motorista.faz_passageiros) === 1;
    document.getElementById("servicoPainelEntregas").checked = Number(motorista.faz_entregas) === 1;
    document.getElementById("capacidadeCargaPainel").value = motorista.capacidade_carga_kg || "";
    document.getElementById("tipoVeiculoPainel").value = motorista.tipo_veiculo || "van";
    document.getElementById("regioesPainel").value = motorista.regioes || "";

    painelServicosAtualizarCampos();

}


document.addEventListener("DOMContentLoaded", function() {

    const formServicos = document.getElementById("formServicos");

    if (!formServicos) {
        return;
    }

    document.getElementById("servicoPainelEntregas").addEventListener("change", painelServicosAtualizarCampos);

    formServicos.addEventListener("submit", async function(event) {

        event.preventDefault();

        const fazPassageiros = document.getElementById("servicoPainelPassageiros").checked;
        const fazEntregas = document.getElementById("servicoPainelEntregas").checked;

        if (!fazPassageiros && !fazEntregas) {
            mostrarNotificacao("Escolha pelo menos um serviço.");
            return;
        }

        vlBotaoCarregando(formServicos, true);

        try {

            await vlApi("motorista.php?acao=servicos", {
                faz_passageiros: fazPassageiros,
                faz_entregas: fazEntregas,
                capacidade_carga_kg: document.getElementById("capacidadeCargaPainel").value,
                tipo_veiculo: document.getElementById("tipoVeiculoPainel").value,
                regioes: document.getElementById("regioesPainel").value
            });

            vlUsuario = (await vlApi("auth.php?acao=sessao")).usuario;

        } catch (erro) {

            vlBotaoCarregando(formServicos, false);
            mostrarNotificacao(erro.message);
            return;

        }

        vlBotaoCarregando(formServicos, false);
        painelAplicarServicos(vlUsuario);
        painelServicosPreencher();
        mostrarNotificacao("Serviços atualizados!");

    });

    /* filtro por cidade nas entregas disponíveis */
    let espera = null;

    document.getElementById("filtroEntregasCidade").addEventListener("input", function() {
        clearTimeout(espera);
        espera = setTimeout(async function() {
            if (await painelEntregasCarregar()) {
                painelEntregasLista("disponiveis");
            }
        }, 350);
    });

    /* contador de entregas em andamento no menu */
    vlSessaoPronta.then(function(usuario) {
        if (usuario && usuario.tipo === "motorista" && Number(usuario.faz_entregas) === 1) {
            painelEntregasCarregar();
        }
    });

});
