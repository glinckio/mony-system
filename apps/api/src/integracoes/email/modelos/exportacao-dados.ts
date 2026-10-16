import type { MensagemEmail } from '../email.provider';
import { escaparHtml, moldura, NOME_PRODUTO, primeiroNome } from './layout';

export interface DadosEmailExportacao {
  nome: string;
  email: string;
  url: string;
  validadeHoras: number;
}

/** RN-160: a exportação dos dados ficou pronta; o link baixa o ZIP com JSON e planilha. */
export function emailExportacaoDados(dados: DadosEmailExportacao): MensagemEmail {
  const nome = primeiroNome(dados.nome);
  const saudacao = nome === '' ? 'Olá!' : `Olá, ${nome}!`;
  const assunto = `Seus dados do ${NOME_PRODUTO} estão prontos`;
  const explicacao =
    'O arquivo tem tudo o que o app guarda sobre você, em JSON e em planilha (XLSX).';
  const validade = `O link vale por ${String(dados.validadeHoras)} horas. Depois, peça de novo no app, em Perfil > Privacidade.`;
  const aviso =
    'Se você não pediu, troque sua senha: a senha nova encerra as sessões em todos os aparelhos.';

  const texto = [saudacao, '', explicacao, '', `Baixar: ${dados.url}`, '', validade, aviso].join(
    '\n',
  );
  const html = moldura(
    assunto,
    `<p style="margin:0 0 16px">${escaparHtml(saudacao)}</p>
<p style="margin:0 0 16px">${escaparHtml(explicacao)}</p>
<p style="margin:0 0 16px"><a href="${escaparHtml(dados.url)}" style="font-weight:bold">Baixar meus dados</a></p>
<p style="margin:0 0 16px">${escaparHtml(validade)}</p>
<p style="margin:0;color:#71717a;font-size:13px">${escaparHtml(aviso)}</p>`,
  );
  return {
    para: { email: dados.email, nome: dados.nome },
    assunto,
    html,
    texto,
    modelo: 'exportacao-dados',
  };
}
