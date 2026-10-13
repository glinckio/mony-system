import { ErroNfce, type CupomConsultado, NfceProvider } from './nfce.provider';

/**
 * Cupom de exemplo, sem rede (desenvolvimento e testes). Toda chave devolve o mesmo mercado, com a
 * data do mês da chave; os testes trocam a resposta de uma chave com `programar`.
 */
export class NfceFake extends NfceProvider {
  readonly nome = 'fake';
  /** Chaves consultadas, em ordem. */
  readonly consultas: string[] = [];
  private readonly programadas = new Map<string, (CupomConsultado | ErroNfce)[]>();

  /** A próxima consulta da chave devolve isto (várias chamadas: uma resposta por consulta). */
  programar(chave: string, ...respostas: (CupomConsultado | ErroNfce)[]): void {
    this.programadas.set(chave, [...(this.programadas.get(chave) ?? []), ...respostas]);
  }

  limpar(): void {
    this.consultas.length = 0;
    this.programadas.clear();
  }

  consultar(chave: string): Promise<CupomConsultado> {
    this.consultas.push(chave);
    const fila = this.programadas.get(chave);
    const resposta = fila?.shift() ?? cupomDeExemplo(chave);
    if (fila?.length === 0) this.programadas.delete(chave);
    return resposta instanceof ErroNfce ? Promise.reject(resposta) : Promise.resolve(resposta);
  }
}

/** Mercado de exemplo: arroz, feijão e leite, pagos no débito. */
export function cupomDeExemplo(chave: string): CupomConsultado {
  return {
    chave,
    emitente: { nome: 'MERCADO EXEMPLO LTDA', cnpj: chave.slice(6, 20) },
    emissao: { data: `20${chave.slice(2, 4)}-${chave.slice(4, 6)}-10`, hora: '18:32:05' },
    totalCentavos: 7062,
    itens: [
      {
        descricao: 'ARROZ TIPO 1 5KG',
        quantidade: '1.0000',
        unidade: 'UN',
        valorUnitarioCentavos: 2490,
        valorTotalCentavos: 2490,
      },
      {
        descricao: 'FEIJAO CARIOCA 1KG',
        quantidade: '2.0000',
        unidade: 'UN',
        valorUnitarioCentavos: 849,
        valorTotalCentavos: 1698,
      },
      {
        descricao: 'LEITE INTEGRAL 1L',
        quantidade: '6.0000',
        unidade: 'UN',
        valorUnitarioCentavos: 479,
        valorTotalCentavos: 2874,
      },
    ],
    pagamentos: [{ descricao: 'Cartão de Débito', valorCentavos: 7062 }],
    cancelada: false,
  };
}
