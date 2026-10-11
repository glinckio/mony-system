import {
  FORMAS_PAGAMENTO,
  type FormaPagamento,
  ORIGENS_TRANSACAO,
  type OrigemTransacao,
  type StatusTransacao,
  type TipoTransacao,
} from '@mony/shared/enums';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Botao, Folha } from '@/ui';

import type { Catalogos } from '../hooks/use-transacoes';
import type { FiltrosDaFolha } from '../lib/filtro';
import { GrupoOpcoes } from './grupo-opcoes';

interface PropsFolhaFiltros {
  inicial: FiltrosDaFolha;
  catalogos: Catalogos;
  aoAplicar: (filtros: FiltrosDaFolha) => void;
  aoFechar: () => void;
}

/** `''` é "todos" em cada grupo. */
type Escolha<T extends string> = T | '';

const valorOuNada = <T extends string>(valor: Escolha<T>): T | undefined =>
  valor === '' ? undefined : valor;

/**
 * Filtros da RN-047 que não cabem nos chips: tipo e situação combinados, categoria, forma de
 * pagamento, cartão, conta e origem. Nada muda na lista até "Ver lançamentos".
 */
export function FolhaFiltros({ inicial, catalogos, aoAplicar, aoFechar }: PropsFolhaFiltros) {
  const { t } = useTranslation();
  const [tipo, definirTipo] = useState<Escolha<TipoTransacao>>(inicial.tipo ?? '');
  const [status, definirStatus] = useState<Escolha<StatusTransacao>>(inicial.status ?? '');
  const [categoriaId, definirCategoria] = useState<string>(inicial.categoriaId ?? '');
  const [forma, definirForma] = useState<Escolha<FormaPagamento>>(inicial.formaPagamento ?? '');
  const [cartaoId, definirCartao] = useState<string>(inicial.cartaoId ?? '');
  const [contaId, definirConta] = useState<string>(inicial.contaId ?? '');
  const [origem, definirOrigem] = useState<Escolha<OrigemTransacao>>(inicial.origem ?? '');

  const categorias = catalogos.categorias.filter((item) => tipo === '' || item.tipo === tipo);

  function limpar() {
    definirTipo('');
    definirStatus('');
    definirCategoria('');
    definirForma('');
    definirCartao('');
    definirConta('');
    definirOrigem('');
  }

  return (
    <Folha
      visivel
      titulo={t('transacoes.folhaFiltros.titulo')}
      aoFechar={aoFechar}
      testID="folha-filtros"
      rodape={
        <>
          <Botao
            titulo={t('transacoes.folhaFiltros.aplicar')}
            larguraTotal
            aoPressionar={() => {
              aoAplicar({
                tipo: valorOuNada(tipo),
                status: valorOuNada(status),
                categoriaId: valorOuNada(categoriaId),
                formaPagamento: valorOuNada(forma),
                cartaoId: valorOuNada(cartaoId),
                contaId: valorOuNada(contaId),
                origem: valorOuNada(origem),
              });
            }}
          />
          <Botao
            variante="fantasma"
            titulo={t('transacoes.folhaFiltros.limpar')}
            aoPressionar={limpar}
          />
        </>
      }
    >
      <GrupoOpcoes<Escolha<TipoTransacao>>
        titulo={t('transacoes.folhaFiltros.tipo')}
        selecionado={tipo}
        aoEscolher={(valor) => {
          definirTipo(valor);
          // Categoria de outro tipo não acharia nada.
          const categoria = catalogos.categorias.find((item) => item.id === categoriaId);
          if (valor !== '' && categoria && categoria.tipo !== valor) definirCategoria('');
        }}
        opcoes={[
          { valor: '', rotulo: t('transacoes.folhaFiltros.todas') },
          { valor: 'despesa', rotulo: t('transacoes.folhaFiltros.despesas') },
          { valor: 'receita', rotulo: t('transacoes.folhaFiltros.receitas') },
        ]}
      />
      <GrupoOpcoes<Escolha<StatusTransacao>>
        titulo={t('transacoes.folhaFiltros.status')}
        selecionado={status}
        aoEscolher={definirStatus}
        opcoes={[
          { valor: '', rotulo: t('transacoes.folhaFiltros.todos') },
          { valor: 'pago', rotulo: t('transacoes.folhaFiltros.pagos') },
          { valor: 'pendente', rotulo: t('transacoes.folhaFiltros.pendentes') },
        ]}
      />
      <GrupoOpcoes
        titulo={t('transacoes.folhaFiltros.categoria')}
        selecionado={categoriaId}
        aoEscolher={definirCategoria}
        opcoes={[
          { valor: '', rotulo: t('transacoes.folhaFiltros.todas') },
          ...categorias.map(({ id, nome }) => ({ valor: id, rotulo: nome })),
        ]}
      />
      <GrupoOpcoes<Escolha<FormaPagamento>>
        titulo={t('transacoes.folhaFiltros.forma')}
        selecionado={forma}
        aoEscolher={definirForma}
        opcoes={[
          { valor: '', rotulo: t('transacoes.folhaFiltros.todas') },
          ...FORMAS_PAGAMENTO.map((valor) => ({ valor, rotulo: t(`transacoes.formas.${valor}`) })),
        ]}
      />
      {catalogos.cartoes.length > 0 ? (
        <GrupoOpcoes
          titulo={t('transacoes.folhaFiltros.cartao')}
          selecionado={cartaoId}
          aoEscolher={definirCartao}
          opcoes={[
            { valor: '', rotulo: t('transacoes.folhaFiltros.todos') },
            ...catalogos.cartoes.map(({ id, nome }) => ({ valor: id, rotulo: nome })),
          ]}
        />
      ) : null}
      {catalogos.contas.length > 0 ? (
        <GrupoOpcoes
          titulo={t('transacoes.folhaFiltros.conta')}
          selecionado={contaId}
          aoEscolher={definirConta}
          opcoes={[
            { valor: '', rotulo: t('transacoes.folhaFiltros.todas') },
            ...catalogos.contas.map(({ id, nome }) => ({ valor: id, rotulo: nome })),
          ]}
        />
      ) : null}
      <GrupoOpcoes<Escolha<OrigemTransacao>>
        titulo={t('transacoes.folhaFiltros.origem')}
        selecionado={origem}
        aoEscolher={definirOrigem}
        opcoes={[
          { valor: '', rotulo: t('transacoes.folhaFiltros.todas') },
          ...ORIGENS_TRANSACAO.map((valor) => ({
            valor,
            rotulo: t(`transacoes.origens.${valor}`),
          })),
        ]}
      />
    </Folha>
  );
}
