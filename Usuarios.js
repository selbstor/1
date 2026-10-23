// mesmo Apps Script; o que muda de um e-mail para outro é a planilha.
const AZLINKS_URL_APPS_SCRIPT = 'https://script.google.com/macros/s/AKfycbyNRHauds83by09v_Dq5wYROW87ycWqqf1mn48VeRi7MXCHyh0g4v6VtnEULq8_jpA/exec';

// Lista de usuários: 'e-mail': ['Nome', 'ID da planilha', 'Validade'],  (uma linha por pessoa, com vírgula no final)
const USUARIOS = {
    'sbstor@gmail.com':            ['Sebastião Torquato',   '1w85zj8OpavB_Jzb1SnnmExm5PlvIZVvmNoalPlPSHeQ', ''],
    'admin@azlinks.com':           ['Azlinks',               '1f9tzttg-ndB0HHnyw2oqZj1VZSiiHpV834LgPzJRqws', ''],
    'demonstracao@azlinks.com':    ['Demonstracao',           '1ZgJtW_x_0KO6H7-BlMeiA8vWbr_fNGoFm2s4IM3d0Ng', ''],
};

// ============================================================================
// A partir daqui não precisa mexer.
// ============================================================================

// Aceita o ID puro ou o link completo da planilha e devolve só o ID.
function azlinksExtrairId(valor) {
    const texto = String(valor || '').trim();
    const m = texto.match(/\/d\/([a-zA-Z0-9_-]+)/);
    return m ? m[1] : texto;
}

// Converte 'DD/MM/AAAA' (ou 'AAAA-MM-DD') em Date. Retorna null se a data for inválida.
function azlinksParseData(texto) {
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

// true se a licença está vencida. A validade vale até o fim do dia informado.
// Sem validade (vazio) = não vence. Data inválida = tratada como vencida.
function azlinksLicencaVencida(validade) {
    const t = String(validade || '').trim();
    if (!t) return false;
    const data = azlinksParseData(t);
    if (!data) return true;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return hoje > data;
}

// Procura o usuário pelo e-mail (ignora maiúsculas/minúsculas e espaços).
// Retorna { email, nome, url, planilha, validade, vencida } ou null se o e-mail não estiver cadastrado.
function azlinksBuscarUsuario(email) {
    const chave = String(email || '').trim().toLowerCase();
    if (!chave) return null;

    for (const cadastrado in USUARIOS) {
        if (cadastrado.trim().toLowerCase() === chave) {
            const dados = USUARIOS[cadastrado] || [];
            const validade = String(dados[2] || '').trim();
            return {
                email: chave,
                nome: String(dados[0] || '').trim() || chave,
                url: AZLINKS_URL_APPS_SCRIPT,
                planilha: azlinksExtrairId(dados[1]),
                validade: validade,
                vencida: azlinksLicencaVencida(validade)
            };
        }
    }
    return null;
}
