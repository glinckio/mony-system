/* global http, json, API_URL, EMAIL -- o Maestro dá http e json; API_URL e EMAIL vêm do fluxo */
// Cria uma conta direto na API, sem o app (T-143a). O fluxo do limite do gratuito usa para gastar o
// teste grátis do e-mail: o mesmo e-mail com "+tag" não ganha outro teste (RN-125).
// Entrada: API_URL e EMAIL. As versões vigentes dos termos vêm da própria API, na primeira recusa.
function cadastrar(aceites) {
  return http.post(API_URL + '/v1/auth/cadastro', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nome: 'Conta E2E',
      email: EMAIL,
      telefone: '(11) 98765-4321',
      senha: 'senha-e2e-123',
      aceites: aceites,
      dispositivo: { identificador: 'e2e-api-' + Date.now(), plataforma: 'android' },
    }),
  });
}

var resposta = cadastrar({ termos: '0', privacidade: '0' });
if (resposta.status === 403) {
  var erro = json(resposta.body).erro;
  resposta = cadastrar(erro.detalhes.versoesVigentes);
}
if (resposta.status !== 201) {
  throw new Error('Cadastro pela API falhou: ' + resposta.status + ' ' + resposta.body);
}
