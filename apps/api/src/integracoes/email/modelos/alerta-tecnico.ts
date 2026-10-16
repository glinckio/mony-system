import type { MensagemEmail } from '../email.provider';
import { escaparHtml, moldura, NOME_PRODUTO } from './layout';

/**
 * Alerta para o responsável técnico (T-142a, doc 12): fila parada, falha em webhook, custo de IA.
 * `origem` é o endereço público da API, para saber de qual ambiente veio.
 */
export function emailAlertaTecnico(dados: {
  email: string;
  origem: string;
  assunto: string;
  texto: string;
}): MensagemEmail {
  const assunto = `[${NOME_PRODUTO}] ${dados.assunto}`;
  const origem = `Enviado pelo worker de ${dados.origem}.`;
  return {
    para: { email: dados.email },
    assunto,
    texto: `${dados.texto}\n\n${origem}`,
    html: moldura(
      assunto,
      `<p style="margin:0 0 16px">${escaparHtml(dados.texto)}</p>
<p style="margin:0;color:#71717a;font-size:13px">${escaparHtml(origem)}</p>`,
    ),
    modelo: 'alerta-tecnico',
  };
}
