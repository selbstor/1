// Centralizador da URL da API do Apps Script e cadastro de Lojas.
// ATENÇÃO: se você criar uma nova implantação do Apps Script com URL diferente, atualize API_URL abaixo.
// O ID da planilha fica SOMENTE no Code.gs (servidor). Aqui ficam apenas a URL, o nome e a validade.
// Ao cadastrar uma loja nova, cadastre a mesma URL também na lista USUARIOS do Code.gs (com o ID da planilha).
const API_URL = 'https://script.google.com/macros/s/AKfycbwCnCd5Mspd5KkcTAlAb3HfjEpsHyzvBFDo09bXJDfXK3dOfiFSkGQkWWSLluSFcWtY/exec';

// 'URL da loja': ['Nome', 'validade (dd/mm/aaaa, vazio = sem limite)']
const USUARIOS = {
    'https://selbstor.github.io/1': ['Sebastião Torquato', ''],
   
};

function selbstorNormalizarUrl(url) {
    let t = String(url || '').trim().toLowerCase();
    t = t.split('#')[0].split('?')[0];
    t = t.replace(/\/index\.html?$/, '');
    t = t.replace(/\/+$/, '');
    return t;
}

function selbstorUrlAtual() {
    return selbstorNormalizarUrl(window.location.origin + window.location.pathname);
}

function selbstorParseData(texto) {
    const t = String(texto || '').trim();
    let dia, mes, ano;
    let r = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (r) {
        dia = +r[1]; mes = +r[2]; ano = +r[3];
    } else {
        r = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (!r) return null;
        ano = +r[1]; mes = +r[2]; dia = +r[3];
    }
    const data = new Date(ano, mes - 1, dia);
    if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) return null;
    return data;
}

function selbstorLicencaVencida(validade) {
    const t = String(validade || '').trim();
    if (!t) return false;
    const data = selbstorParseData(t);
    if (!data) return true;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return hoje > data;
}

function selbstorBuscarUsuario(urlLoja) {
    const chave = selbstorNormalizarUrl(urlLoja || selbstorUrlAtual());
    if (!chave) return null;

    let melhor = null;
    let melhorTam = -1;
    for (const cadastrado in USUARIOS) {
        const norm = selbstorNormalizarUrl(cadastrado);
        if (!norm) continue;
        if (chave === norm || chave.indexOf(norm + '/') === 0) {
            if (norm.length > melhorTam) { melhorTam = norm.length; melhor = cadastrado; }
        }
    }
    if (melhor === null) return null;

    const dados = USUARIOS[melhor] || [];
    const validade = String(dados[1] || '').trim();
    return {
        url: selbstorNormalizarUrl(melhor),
        nome: String(dados[0] || '').trim() || melhor,
        apiUrl: API_URL,
        validade: validade,
        vencida: selbstorLicencaVencida(validade)
    };
}
