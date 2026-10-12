import {
  type DadosPagamentoFatura,
  esquemaPagamentoFatura,
  type Fatura,
  FORMAS_PAGAMENTO_FATURA,
} from '@mony/shared/cartoes';
import { formatarCentavos } from '@mony/shared/dinheiro';
import { randomUUID } from 'expo-crypto';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useContas } from '@/features/contas/hooks/use-contas';
import { dataParaTexto, mascararData, textoParaData } from '@/features/transacoes/lib/periodo';
import { useNomeDoMes } from '@/lib/datas-texto';
import { mensagemDeErro } from '@/lib/formularios';
import { useHoje } from '@/lib/fuso';
import { Botao, Campo, CampoValor, Folha, GrupoOpcoes, Texto } from '@/ui';

import { usePagarFatura } from '../hooks/use-cartoes';

type FormaFatura = (typeof FORMAS_PAGAMENTO_FATURA)[number];

interface PropsFolhaPagarFatura {
  fatura: Pick<Fatura, 'id' | 'competencia' | 'saldoCentavos'>;
  /** A conta de pagamento do cartão, sugerida (doc 05). */
  contaSugerida: string | null;
  aoFechar: () => void;
  aoPagar?: () => void;
}

/**
 * "Marcar fatura como paga" (RN-036): o valor começa no que falta pagar e pode ser menor (parcial,
 * o resto fica na fatura, sem juros). A data é até hoje; a conta sugerida é a do cartão. Montada
 * só enquanto aberta: cada abertura é um pagamento, com a sua `Idempotency-Key`.
 */
export function FolhaPagarFatura({
  fatura,
  contaSugerida,
  aoFechar,
  aoPagar,
}: PropsFolhaPagarFatura) {
  const { t } = useTranslation();
  const hoje = useHoje();
  const nomeDoMes = useNomeDoMes();
  const contas = useContas();
  const pagar = usePagarFatura();
  const [chave] = useState(() => randomUUID());
  const [valor, definirValor] = useState(fatura.saldoCentavos);
  const [data, definirData] = useState(dataParaTexto(hoje));
  const [contaId, definirContaId] = useState<string>(contaSugerida ?? '');
  const [forma, definirForma] = useState<FormaFatura | null>(null);
  const [tentou, definirTentou] = useState(false);

  const dataEscolhida = textoParaData(data);
  const dataValida = dataEscolhida !== null && dataEscolhida <= hoje;
  const acimaDoSaldo = valor > fatura.saldoCentavos;
  const dados: DadosPagamentoFatura = {
    valorCentavos: valor,
    ...(dataEscolhida === null || dataEscolhida === hoje ? {} : { data: dataEscolhida }),
    contaId: contaId === '' ? null : contaId,
    ...(forma === null ? {} : { formaPagamento: forma }),
  };
  const valido =
    dataValida && !acimaDoSaldo && valor > 0 && esquemaPagamentoFatura.safeParse(dados).success;

  return (
    <Folha
      visivel
      titulo={t('cartoes.pagamento.titulo', { mes: nomeDoMes(fatura.competencia) })}
      aoFechar={aoFechar}
      testID="folha-pagar-fatura"
      rodape={
        <>
          <Botao
            titulo={t('cartoes.pagamento.confirmar', { valor: formatarCentavos(valor) })}
            larguraTotal
            carregando={pagar.isPending}
            aoPressionar={() => {
              definirTentou(true);
              if (!valido) return;
              pagar.mutate(
                { faturaId: fatura.id, dados, chave },
                {
                  onSuccess: () => {
                    aoPagar?.();
                    aoFechar();
                  },
                },
              );
            }}
          />
          <Botao
            variante="fantasma"
            titulo={t('cartoes.pagamento.cancelar')}
            aoPressionar={aoFechar}
          />
        </>
      }
    >
      <CampoValor
        rotulo={t('cartoes.pagamento.valor')}
        centavos={valor}
        aoMudar={definirValor}
        erro={
          acimaDoSaldo
            ? t('cartoes.pagamento.acimaDoSaldo', { saldo: formatarCentavos(fatura.saldoCentavos) })
            : null
        }
      />
      {valor > 0 && valor < fatura.saldoCentavos ? (
        <Texto variante="corpo-sm" cor="atencao">
          {t('cartoes.pagamento.parcial')}
        </Texto>
      ) : null}
      <Campo
        rotulo={t('cartoes.pagamento.data')}
        ajuda={t('cartoes.pagamento.dataAjuda')}
        value={data}
        onChangeText={(texto) => {
          definirData(mascararData(texto));
        }}
        keyboardType="number-pad"
        maxLength={10}
        erro={tentou && !dataValida ? t('cartoes.pagamento.dataInvalida') : null}
      />
      {(contas.data?.itens.length ?? 0) > 0 ? (
        <GrupoOpcoes
          titulo={t('cartoes.pagamento.conta')}
          selecionado={contaId}
          aoEscolher={definirContaId}
          opcoes={[
            { valor: '', rotulo: t('cartoes.pagamento.nenhuma') },
            ...(contas.data?.itens ?? []).map(({ id, nome }) => ({ valor: id, rotulo: nome })),
          ]}
        />
      ) : null}
      <GrupoOpcoes
        titulo={t('cartoes.pagamento.forma')}
        selecionado={forma}
        aoEscolher={(escolhida) => {
          definirForma(escolhida === forma ? null : escolhida);
        }}
        opcoes={FORMAS_PAGAMENTO_FATURA.map((valorForma) => ({
          valor: valorForma,
          rotulo: t(`cartoes.formas.${valorForma}`),
        }))}
      />
      {pagar.isError ? (
        <Texto cor="perigo" accessibilityRole="alert">
          {mensagemDeErro(pagar.error, t('cartoes.semConexao'))}
        </Texto>
      ) : null}
    </Folha>
  );
}
