import { Injectable } from '@nestjs/common';
import { dataNoFuso } from '@mony/shared/datas';
import type { RespostaAcaoMony } from '@mony/shared/mony';
import {
  type DadosPedidoNfce,
  EMISSAO_CONTINGENCIA_OFFLINE,
  lerQrNfce,
  nomeDoEstabelecimento,
} from '@mony/shared/nfce';

import { type Contexto, usuarioDoContexto } from '../../core/contexto/contexto';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { CotasService } from '../planos/cotas.service';
import { avisoDoLimite } from './aviso-limite';
import { ConsultasNfce } from './consultas-nfce.service';
import { DocumentosMony } from './documentos.service';
import { MonyRepository } from './mony.repository';
import { type NotaSalva, NfceRepository } from './nfce.repository';
import {
  MENSAGEM_CANCELADA,
  MENSAGEM_HOMOLOGACAO,
  MENSAGEM_JA_AGUARDANDO,
  MENSAGEM_JA_LANCADO,
  MENSAGEM_NAO_E_CUPOM,
  MENSAGEM_PEDIR_FOTO,
  MENSAGEM_QR_ENVIADO,
  MENSAGEM_QR_ILEGIVEL,
  mensagemAguardando,
  textoCupomLido,
} from './nfce-textos';

const soTexto = (texto: string): RespostaAcaoMony => ({
  texto,
  componente: null,
  transacaoId: null,
});

/**
 * O QR Code do cupom fiscal na Mony (T-066a, doc 10 "NFC-e"): `POST /mony/nfce` confere o QR sem
 * rede, consulta a nota na Sefaz pelo `NfceProvider` e devolve a compra para confirmar, como a foto
 * (RN-083). A mesma chave nunca é consultada duas vezes; a consulta conta como `leitura_documento`
 * no gratuito (RN-120). Nota ainda fora da Sefaz: novas tentativas no worker, com o resultado no
 * chat. Sem como consultar: a Mony pede a foto do cupom (T-065).
 */
@Injectable()
export class NfceMony {
  constructor(
    private readonly repositorio: MonyRepository,
    private readonly notas: NfceRepository,
    private readonly consultas: ConsultasNfce,
    private readonly documentos: DocumentosMony,
    private readonly cotas: CotasService,
  ) {}

  /** O QR lido no app: a mensagem da pessoa e a resposta da Mony entram no histórico. */
  async ler(contexto: Contexto, dados: DadosPedidoNfce): Promise<RespostaAcaoMony> {
    const usuarioId = usuarioDoContexto(contexto);
    const conversaId = await this.repositorio.conversaAtual(usuarioId);
    const chave = contexto.idempotencyKey;
    await this.repositorio.salvarMensagem({
      usuarioId,
      conversaId,
      autor: 'usuario',
      tipo: 'texto',
      conteudo: MENSAGEM_QR_ENVIADO,
      componentes: [],
      idempotencyKey: chave,
    });
    const resposta = await this.responder(contexto, dados.conteudo);
    await this.repositorio.salvarMensagem({
      usuarioId,
      conversaId,
      autor: 'mony',
      tipo: 'texto',
      conteudo: resposta.texto,
      componentes: resposta.componente ? [resposta.componente] : [],
      idempotencyKey: chave === undefined ? undefined : `${chave}:resposta`,
    });
    return resposta;
  }

  /** O botão [Ver a compra] da mensagem da nova tentativa (`importar_nfce`). */
  async importarNota(contexto: Contexto, notaId: string): Promise<RespostaAcaoMony> {
    const nota = await this.notas.nota(usuarioDoContexto(contexto), notaId);
    if (!nota) throw new ErroDominio('NAO_ENCONTRADO');
    return this.importar(contexto, nota);
  }

  private async responder(contexto: Contexto, conteudo: string): Promise<RespostaAcaoMony> {
    const usuarioId = usuarioDoContexto(contexto);
    const leitura = lerQrNfce(conteudo);
    if (!leitura.ok) {
      return soTexto(
        leitura.erro === 'DIGITO_INVALIDO' ? MENSAGEM_QR_ILEGIVEL : MENSAGEM_NAO_E_CUPOM,
      );
    }
    if (leitura.ambiente === 'homologacao') return soTexto(MENSAGEM_HOMOLOGACAO);
    const { chave, uf, tipoEmissao } = leitura.nota;
    // A mesma chave não é consultada (nem cobrada) de novo.
    const existente = await this.notas.notaDaChave(usuarioId, chave);
    if (existente) return this.importar(contexto, existente);
    if (await this.consultas.aguardando(usuarioId, chave)) return soTexto(MENSAGEM_JA_AGUARDANDO);
    try {
      await this.cotas.consumir(contexto, 'leitura_documento');
    } catch (erro) {
      const aviso = avisoDoLimite(erro);
      if (aviso) return aviso;
      throw erro;
    }
    const resultado = await this.consultas.consultar(usuarioId, chave, uf);
    switch (resultado.tipo) {
      case 'nota':
        return this.importar(contexto, resultado.nota);
      case 'cancelada':
        return soTexto(MENSAGEM_CANCELADA);
      case 'aguardando':
        return soTexto(
          mensagemAguardando(resultado.motivo, tipoEmissao === EMISSAO_CONTINGENCIA_OFFLINE),
        );
      case 'recusada':
        return soTexto(MENSAGEM_PEDIR_FOTO);
    }
  }

  /** A compra da nota como cartão a confirmar; já lançada, só avisa. */
  private async importar(contexto: Contexto, nota: NotaSalva): Promise<RespostaAcaoMony> {
    if (nota.transacaoId !== null) return soTexto(MENSAGEM_JA_LANCADO);
    const fuso = await this.notas.fusoDoUsuario(usuarioDoContexto(contexto));
    const leitura = await this.documentos.importarCupom(contexto, {
      notaId: nota.id,
      estabelecimento: nomeDoEstabelecimento(nota.emitente),
      valorCentavos: nota.totalCentavos,
      data: dataNoFuso(nota.data, fuso),
      formaPagamento: nota.formaPagamento,
    });
    const [cartao] = leitura.componentes;
    // Um lançamento só: o cartão de resumo, sem o [Confirmar todos]. Sem cartão, a compra já está
    // sendo cuidada (perguntas do rascunho em andamento).
    if (!cartao) return soTexto(leitura.texto);
    return {
      texto: textoCupomLido(nota.emitente, nota.itens, nota.totalCentavos),
      componente: cartao,
      transacaoId: null,
    };
  }
}
