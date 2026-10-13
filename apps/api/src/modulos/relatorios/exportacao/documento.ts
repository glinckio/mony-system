import { type DataCalendario } from '@mony/shared/datas';
import type { FormaPagamento } from '@mony/shared/enums';
import type {
  RelatorioAnual,
  RelatorioCartoes,
  RelatorioCategorias,
  RelatorioDiasDaSemana,
  RelatorioFormasPagamento,
  RelatorioMensal,
} from '@mony/shared/relatorios';

/** Como a célula é mostrada: texto, dinheiro (em centavos), número inteiro ou percentual. */
export type TipoColuna = 'texto' | 'dinheiro' | 'numero' | 'percentual';

export interface ColunaRelatorio {
  titulo: string;
  tipo: TipoColuna;
}

/** Uma tabela do relatório exportado; dinheiro sempre em centavos (quem desenha converte). */
export interface TabelaRelatorio {
  titulo: string;
  colunas: readonly ColunaRelatorio[];
  linhas: readonly (string | number)[][];
  /** Linha de total, com `null` onde não há total. */
  total?: readonly (string | number | null)[];
}

/** O relatório exportado (RN-151): o mesmo para o PDF e para o XLSX. */
export interface DocumentoRelatorio {
  titulo: string;
  /** "Ana Souza · 01/11/2025 a 31/10/2026". */
  subtitulo: string;
  /** "Gerado em 15/10/2026 às 12:00". */
  geradoEm: string;
  tabelas: readonly TabelaRelatorio[];
}

/** Os dados dos relatórios do período (RN-150), como as rotas devolvem. */
export interface DadosRelatorio {
  mensal: RelatorioMensal;
  anual: RelatorioAnual;
  despesas: RelatorioCategorias;
  receitas: RelatorioCategorias;
  diasDaSemana: RelatorioDiasDaSemana;
  cartoes: RelatorioCartoes;
  formasPagamento: RelatorioFormasPagamento;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const FORMAS: Record<FormaPagamento, string> = {
  cartao_credito: 'Cartão de crédito',
  pix: 'Pix',
  debito: 'Débito',
  dinheiro: 'Dinheiro',
  boleto: 'Boleto',
};

/** `2026-10-15` → `15/10/2026`. */
export function dataBr(data: DataCalendario): string {
  const [ano = '', mes = '', dia = ''] = data.split('-');
  return `${dia}/${mes}/${ano}`;
}

/** `2026-10-01` → `out/2026`. */
function mesAno(competencia: string): string {
  const [ano = '', mes = '1'] = competencia.split('-');
  return `${MESES[Number(mes) - 1] ?? mes}/${ano}`;
}

const dinheiro = (titulo: string): ColunaRelatorio => ({ titulo, tipo: 'dinheiro' });
const texto = (titulo: string): ColunaRelatorio => ({ titulo, tipo: 'texto' });
const numero = (titulo: string): ColunaRelatorio => ({ titulo, tipo: 'numero' });

function porCategoria(titulo: string, relatorio: RelatorioCategorias): TabelaRelatorio {
  return {
    titulo,
    colunas: [
      texto('Categoria'),
      dinheiro('Total'),
      { titulo: '%', tipo: 'percentual' },
      numero('Lançamentos'),
    ],
    linhas: relatorio.itens.map((item) => [
      item.nome,
      item.totalCentavos,
      item.percentual,
      item.quantidade,
    ]),
    total: [
      'Total',
      relatorio.totalCentavos,
      null,
      relatorio.itens.reduce((soma, item) => soma + item.quantidade, 0),
    ],
  };
}

/**
 * O relatório do período (RN-150) como tabelas: receitas × despesas por mês, despesas e receitas
 * por categoria, dias da semana, cartões, formas de pagamento e, com mais de um ano, a evolução
 * anual. Tabela sem linha fica de fora, menos a dos meses.
 */
export function montarDocumento(
  dados: DadosRelatorio,
  quem: { nome: string; geradoEm: { data: DataCalendario; hora: string } },
): DocumentoRelatorio {
  const { mensal } = dados;
  const tabelas: TabelaRelatorio[] = [
    {
      titulo: 'Receitas × despesas por mês',
      colunas: [
        texto('Mês'),
        dinheiro('Receitas'),
        dinheiro('Despesas'),
        dinheiro('Saldo'),
        dinheiro('Acumulado'),
      ],
      linhas: mensal.itens.map((item) => [
        mesAno(item.competencia),
        item.receitasCentavos,
        item.despesasCentavos,
        item.saldoCentavos,
        item.saldoAcumuladoCentavos,
      ]),
      total: [
        'Total',
        mensal.totais.receitasCentavos,
        mensal.totais.despesasCentavos,
        mensal.totais.saldoCentavos,
        null,
      ],
    },
    porCategoria('Despesas por categoria', dados.despesas),
    porCategoria('Receitas por categoria', dados.receitas),
    {
      titulo: 'Despesas por dia da semana',
      colunas: [texto('Dia'), dinheiro('Total'), numero('Lançamentos')],
      linhas: dados.diasDaSemana.itens.map((item) => [
        DIAS[item.diaDaSemana] ?? '',
        item.totalCentavos,
        item.quantidade,
      ]),
    },
    {
      titulo: 'Despesas por cartão',
      colunas: [texto('Cartão'), dinheiro('Total'), numero('Lançamentos')],
      linhas: dados.cartoes.itens.map((item) => [item.nome, item.totalCentavos, item.quantidade]),
    },
    {
      titulo: 'Despesas por forma de pagamento',
      colunas: [texto('Forma de pagamento'), dinheiro('Total'), numero('Lançamentos')],
      linhas: dados.formasPagamento.itens.map((item) => [
        FORMAS[item.formaPagamento],
        item.totalCentavos,
        item.quantidade,
      ]),
    },
  ];
  if (dados.anual.itens.length > 1) {
    tabelas.push({
      titulo: 'Evolução anual',
      colunas: [texto('Ano'), dinheiro('Receitas'), dinheiro('Despesas'), dinheiro('Saldo')],
      linhas: dados.anual.itens.map((item) => [
        String(item.ano),
        item.receitasCentavos,
        item.despesasCentavos,
        item.saldoCentavos,
      ]),
    });
  }
  return {
    titulo: 'Relatório financeiro',
    subtitulo: `${quem.nome} · ${dataBr(mensal.inicio)} a ${dataBr(mensal.fim)}`,
    geradoEm: `Gerado em ${dataBr(quem.geradoEm.data)} às ${quem.geradoEm.hora}`,
    tabelas: tabelas.filter((tabela, indice) => indice === 0 || tabela.linhas.length > 0),
  };
}
