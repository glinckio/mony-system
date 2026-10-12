import { formatarCentavos } from '@mony/shared/dinheiro';
import type { Transacao } from '@mony/shared/transacoes';
import { useTranslation } from 'react-i18next';

import { useHoje } from '@/lib/fuso';
import { usePrivacidade } from '@/stores/privacidade';

import type { Catalogos } from './use-transacoes';
import { diaDaSemana, partesDaData, somarDias } from '../lib/periodo';

/** "Hoje, 9 de outubro", "Ontem, 8 de outubro" ou "Terça, 7 de outubro". */
export function useRotuloDoDia(): (data: string) => string {
  const { t } = useTranslation();
  const hoje = useHoje();
  const ontem = somarDias(hoje, -1);
  const meses = t('comum.meses', { returnObjects: true });
  const semana = t('comum.semana', { returnObjects: true });
  return (data) => {
    const { dia, mes } = partesDaData(data);
    const texto = t('transacoes.dia.data', { dia, mes: meses[mes - 1] ?? '' });
    if (data === hoje) return t('transacoes.dia.hoje', { data: texto });
    if (data === ontem) return t('transacoes.dia.ontem', { data: texto });
    return t('transacoes.dia.outro', { semana: semana[diaDaSemana(data)] ?? '', data: texto });
  };
}

/**
 * A linha de baixo do item, como no design: categoria, depois o cartão (ou a forma de pagamento,
 * ou a conta), a frequência da recorrência e a origem ("Alimentação · Nubank · via Mony").
 */
export function useDetalhesDoItem(catalogos: Catalogos): (transacao: Transacao) => string[] {
  const { t } = useTranslation();
  const categorias = new Map(catalogos.categorias.map((item) => [item.id, item.nome]));
  const cartoes = new Map(catalogos.cartoes.map((item) => [item.id, item.nome]));
  const contas = new Map(catalogos.contas.map((item) => [item.id, item.nome]));
  const frequencias = new Map(catalogos.recorrencias.map((item) => [item.id, item.frequencia]));
  return (transacao) => {
    const detalhes = [categorias.get(transacao.categoriaId) ?? t('transacoes.item.semCategoria')];
    const meio =
      (transacao.cartaoId === null ? undefined : cartoes.get(transacao.cartaoId)) ??
      (transacao.formaPagamento === null
        ? undefined
        : t(`transacoes.formas.${transacao.formaPagamento}`)) ??
      (transacao.contaId === null ? undefined : contas.get(transacao.contaId));
    if (meio !== undefined) detalhes.push(meio);
    const frequencia =
      transacao.recorrenciaId === null ? undefined : frequencias.get(transacao.recorrenciaId);
    if (frequencia !== undefined) detalhes.push(t(`transacoes.frequencia.${frequencia}`));
    if (transacao.origem === 'mony') detalhes.push(t('transacoes.item.viaMony'));
    if (transacao.origem === 'open_finance') detalhes.push(t('transacoes.item.doBanco'));
    if (transacao.origem === 'foto') detalhes.push(t('transacoes.item.porFoto'));
    return detalhes;
  };
}

/** Valor com sinal ("-R$ 10,00", "+R$ 6.200,00") ou "Valor oculto" no modo privacidade (RN-022). */
export function useValorFalado(): (transacao: Pick<Transacao, 'tipo' | 'valorCentavos'>) => string {
  const { t } = useTranslation();
  const oculto = usePrivacidade((estado) => estado.ocultarValores);
  return ({ tipo, valorCentavos }) => {
    if (oculto) return t('ui.valorOculto');
    return tipo === 'receita'
      ? `+${formatarCentavos(valorCentavos)}`
      : formatarCentavos(-valorCentavos);
  };
}
