import {
  type ComponenteMony,
  esquemaComponenteMony,
  type MensagemConversa,
} from '@mony/shared/mony';
import { z } from 'zod';

import type { MensagemLlm } from '../../integracoes/ia/llm.provider';
import type { MensagemSalva } from './mony.repository';

const esquemaComponentes = z.array(esquemaComponenteMony);

/** Os componentes gravados na mensagem; formato desconhecido (versão antiga) vira lista vazia. */
export function componentesDaMensagem(componentes: unknown): ComponenteMony[] {
  const lidos = esquemaComponentes.safeParse(componentes ?? []);
  return lidos.success ? lidos.data : [];
}

export function paraMensagemConversa(mensagem: MensagemSalva): MensagemConversa {
  return {
    id: mensagem.id,
    autor: mensagem.autor,
    tipo: mensagem.tipo,
    conteudo: mensagem.conteudo,
    componentes: componentesDaMensagem(mensagem.componentes),
    criadoEm: mensagem.criadoEm.toISOString(),
  };
}

/** Como a mensagem aparece para o modelo: o texto, o botão tocado ou os botões oferecidos. */
function textoParaModelo(mensagem: MensagemSalva): string {
  const conteudo = mensagem.conteudo?.trim() ?? '';
  if (mensagem.autor === 'usuario') {
    return mensagem.tipo === 'botao' && conteudo !== '' ? `(tocou em "${conteudo}")` : conteudo;
  }
  const botoes = componentesDaMensagem(mensagem.componentes).flatMap((componente) =>
    componente.opcoes.map(({ rotulo }) => rotulo),
  );
  return [conteudo, botoes.length > 0 ? `[botões: ${botoes.join(' | ')}]` : '']
    .filter((parte) => parte !== '')
    .join('\n');
}

/**
 * A conversa que vai ao modelo (doc 08): as mensagens anteriores (da mais nova para a mais antiga,
 * como saem do banco) até o teto de caracteres, e a mensagem atual no fim. Turnos seguidos do mesmo
 * papel viram um só (uma mensagem sem resposta, por exemplo), e a conversa começa pelo usuário.
 */
export function conversaParaModelo(
  anteriores: readonly MensagemSalva[],
  atual: string,
  tetoCaracteres: number,
): MensagemLlm[] {
  const turnos: { papel: MensagemLlm['papel']; texto: string }[] = [
    { papel: 'usuario', texto: atual },
  ];
  let total = atual.length;
  for (const mensagem of anteriores) {
    const texto = textoParaModelo(mensagem);
    if (texto === '') continue;
    total += texto.length;
    if (total > tetoCaracteres) break;
    turnos.unshift({ papel: mensagem.autor === 'usuario' ? 'usuario' : 'assistente', texto });
  }
  const juntos: { papel: MensagemLlm['papel']; conteudo: string }[] = [];
  for (const { papel, texto } of turnos) {
    const ultimo = juntos.at(-1);
    if (ultimo?.papel === papel) ultimo.conteudo = `${ultimo.conteudo}\n\n${texto}`;
    else juntos.push({ papel, conteudo: texto });
  }
  while (juntos[0]?.papel === 'assistente') juntos.shift();
  return juntos;
}
