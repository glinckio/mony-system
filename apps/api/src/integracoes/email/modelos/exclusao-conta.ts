import type { MensagemEmail } from '../email.provider';
import { escaparHtml, moldura, NOME_PRODUTO, primeiroNome } from './layout';

interface Destinatario {
  nome: string;
  email: string;
}

const saudacaoDe = (nomeCompleto: string): string => {
  const nome = primeiroNome(nomeCompleto);
  return nome === '' ? 'Olá!' : `Olá, ${nome}!`;
};

function montar(
  dados: Destinatario,
  modelo: string,
  assunto: string,
  paragrafos: string[],
  aviso: string,
  destaque?: string,
): MensagemEmail {
  const saudacao = saudacaoDe(dados.nome);
  // O destaque (o código) vem logo depois do primeiro parágrafo, que o apresenta.
  const [primeiro = '', ...resto] = paragrafos;
  const meio = destaque === undefined ? [primeiro, ...resto] : [primeiro, destaque, ...resto];
  const texto = [saudacao, ...meio, aviso].join('\n\n');
  const html = moldura(
    assunto,
    [
      `<p style="margin:0 0 16px">${escaparHtml(saudacao)}</p>`,
      ...meio.map((parte) =>
        parte === destaque
          ? `<p style="margin:0 0 16px;font-size:32px;font-weight:bold;letter-spacing:8px">${escaparHtml(parte)}</p>`
          : `<p style="margin:0 0 16px">${escaparHtml(parte)}</p>`,
      ),
      `<p style="margin:0;color:#71717a;font-size:13px">${escaparHtml(aviso)}</p>`,
    ].join('\n'),
  );
  return { para: { email: dados.email, nome: dados.nome }, assunto, html, texto, modelo };
}

/** RN-161: o código de 6 dígitos que confirma a exclusão da conta (quem não tem senha). */
export function emailCodigoExclusaoConta(
  dados: Destinatario & { codigo: string; validadeMinutos: number },
): MensagemEmail {
  return montar(
    dados,
    'codigo-exclusao-conta',
    `Seu código para excluir a conta no ${NOME_PRODUTO}`,
    [
      'Use este código no app para confirmar a exclusão da sua conta:',
      `Ele vale por ${String(dados.validadeMinutos)} minutos e só pode ser usado uma vez.`,
    ],
    'Se você não pediu, ignore este e-mail e troque sua senha: nada foi excluído. Nunca passe este código para ninguém.',
    dados.codigo,
  );
}

/** RN-161: a exclusão foi pedida; até a data, entrar no app e desistir desfaz tudo. */
export function emailExclusaoAgendada(
  dados: Destinatario & { dataExclusao: string },
): MensagemEmail {
  return montar(
    dados,
    'exclusao-agendada',
    `Sua conta no ${NOME_PRODUTO} será excluída em ${dados.dataExclusao}`,
    [
      `Recebemos o pedido para excluir sua conta. Em ${dados.dataExclusao}, apagamos seus lançamentos, cartões, metas, conversas com a Mony, fotos e áudios, e a assinatura é cancelada.`,
      'Mudou de ideia? Até lá, entre no app e toque em Desistir da exclusão, em Perfil > Privacidade. Tudo continua como estava.',
    ],
    'Se não foi você, entre no app agora, desista da exclusão e troque sua senha.',
  );
}

/** RN-161: a exclusão definitiva aconteceu. */
export function emailContaExcluida(dados: Destinatario): MensagemEmail {
  return montar(
    dados,
    'conta-excluida',
    `Sua conta no ${NOME_PRODUTO} foi excluída`,
    [
      'Como você pediu, sua conta e seus dados foram apagados, e a assinatura foi cancelada.',
      `Obrigado por ter usado o ${NOME_PRODUTO}. Se quiser voltar, é só criar uma conta nova.`,
    ],
    'Guardamos só o que a lei exige, sem nada que identifique você no app.',
  );
}
