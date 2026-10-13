import { formatarCentavos } from '@mony/shared/dinheiro';
import { nomeDoEstabelecimento } from '@mony/shared/nfce';

/** Textos da Mony no cupom fiscal lido pelo QR Code (T-066a). */

/** A mensagem da pessoa no histórico, no lugar da URL do QR Code. */
export const MENSAGEM_QR_ENVIADO = 'QR Code do cupom fiscal';

export const MENSAGEM_NAO_E_CUPOM =
  'Esse QR Code não é de um cupom fiscal (NFC-e). Se for um cupom, me manda uma foto dele que eu leio.';
export const MENSAGEM_QR_ILEGIVEL =
  'Não consegui ler esse QR Code direito. Tente de novo, com o cupom esticado e bem iluminado.';
export const MENSAGEM_HOMOLOGACAO =
  'Esse cupom é de teste do estabelecimento (homologação): não vale como compra.';
export const MENSAGEM_JA_LANCADO = 'Esse cupom já foi lançado.';
export const MENSAGEM_JA_AGUARDANDO =
  'Ainda estou esperando esse cupom aparecer na Sefaz. Quando ele aparecer, te aviso aqui.';
export const MENSAGEM_CANCELADA =
  'Esse cupom foi cancelado pelo estabelecimento, então não dá para lançar a compra por ele.';
export const MENSAGEM_PEDIR_FOTO =
  'Não consegui consultar esse cupom na Sefaz. Me manda uma foto dele que eu leio a compra.';
export const MENSAGEM_DESISTIU =
  'Não achei o cupom na Sefaz mesmo depois de algumas horas. Me manda uma foto dele que eu leio a compra.';

/** A primeira consulta não achou a nota ou não conseguiu consultar: a nova tentativa já está marcada. */
export function mensagemAguardando(
  motivo: 'nao_encontrada' | 'indisponivel',
  contingencia: boolean,
): string {
  if (motivo === 'indisponivel') {
    return 'A consulta da Sefaz não respondeu agora. Vou tentar de novo daqui a pouco e te aviso aqui.';
  }
  return contingencia
    ? 'Esse cupom foi emitido sem internet e ainda não chegou na Sefaz. Vou tentar de novo daqui a pouco e te aviso aqui.'
    : 'O cupom ainda não apareceu na Sefaz (às vezes demora alguns minutos). Vou tentar de novo e te aviso aqui.';
}

const itens = (quantidade: number) =>
  `${String(quantidade)} ${quantidade === 1 ? 'item' : 'itens'}`;

/** "Li o cupom de MERCADO X na Sefaz: 3 itens, R$ 70,62." */
export function textoCupomLido(
  emitente: string,
  quantidade: number,
  totalCentavos: number,
): string {
  return `Li o cupom de ${nomeDoEstabelecimento(emitente)} na Sefaz: ${itens(quantidade)}, ${formatarCentavos(totalCentavos)}. Confere e toque em Confirmar para eu anotar.`;
}

/** A nova tentativa achou a nota: a mensagem do chat, com o botão para ver a compra. */
export function textoCupomAchado(
  emitente: string,
  quantidade: number,
  totalCentavos: number,
): string {
  return `Achei na Sefaz o cupom de ${nomeDoEstabelecimento(emitente)}: ${itens(quantidade)}, ${formatarCentavos(totalCentavos)}. Toque em Ver a compra para lançar.`;
}
