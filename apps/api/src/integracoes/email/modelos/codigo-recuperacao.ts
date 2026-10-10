import type { MensagemEmail } from '../email.provider';
import { escaparHtml, moldura, NOME_PRODUTO, primeiroNome } from './layout';

export interface DadosCodigoRecuperacao {
  nome: string;
  email: string;
  codigo: string;
  validadeMinutos: number;
}

/** RN-003: e-mail com o código de 6 dígitos para criar uma senha nova. */
export function emailCodigoRecuperacao(dados: DadosCodigoRecuperacao): MensagemEmail {
  const nome = primeiroNome(dados.nome);
  const saudacao = nome === '' ? 'Olá!' : `Olá, ${nome}!`;
  const assunto = `Seu código para criar uma nova senha no ${NOME_PRODUTO}`;
  const validade = `Ele vale por ${String(dados.validadeMinutos)} minutos e só pode ser usado uma vez.`;
  const aviso =
    'Se você não pediu, ignore este e-mail: sua senha continua a mesma. Nunca passe este código para ninguém.';

  const texto = [
    saudacao,
    '',
    `Use este código no app para criar uma nova senha: ${dados.codigo}`,
    '',
    validade,
    aviso,
  ].join('\n');

  const html = moldura(
    assunto,
    `<p style="margin:0 0 16px">${escaparHtml(saudacao)}</p>
<p style="margin:0 0 16px">Use este código no app para criar uma nova senha:</p>
<p style="margin:0 0 16px;font-size:32px;font-weight:bold;letter-spacing:8px">${escaparHtml(dados.codigo)}</p>
<p style="margin:0 0 16px">${escaparHtml(validade)}</p>
<p style="margin:0;color:#71717a;font-size:13px">${escaparHtml(aviso)}</p>`,
  );

  return {
    para: { email: dados.email, nome: dados.nome },
    assunto,
    html,
    texto,
    modelo: 'codigo-recuperacao',
  };
}
