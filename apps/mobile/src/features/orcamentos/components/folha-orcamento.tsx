import type { Categoria } from '@mony/shared/categorias';
import type { Competencia } from '@mony/shared/datas';
import { esquemaDefinicaoOrcamento, type Orcamento } from '@mony/shared/orcamentos';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch, View } from 'react-native';

import { mensagemDeErro } from '@/lib/formularios';
import { Botao, CampoValor, Folha, GrupoOpcoes, Texto } from '@/ui';
import { cores } from '@/ui/tokens';

import { useDefinirOrcamento, useExcluirOrcamento } from '../hooks/use-orcamentos';

export interface PropsFolhaOrcamento {
  competencia: Competencia;
  /** O orçamento que muda; `null` para um novo. */
  orcamento: Orcamento | null;
  /** Para o novo: as categorias de despesa sem orçamento no mês. Para o existente: a dele. */
  categorias: readonly Pick<Categoria, 'id' | 'nome'>[];
  aoFechar: () => void;
}

/**
 * Definir o orçamento de uma categoria no mês (RN-060): quanto gastar e se repete todo mês. O
 * existente também pode sair do mês. Montada só enquanto aberta.
 */
export function FolhaOrcamento({
  competencia,
  orcamento,
  categorias,
  aoFechar,
}: PropsFolhaOrcamento) {
  const { t } = useTranslation();
  const definir = useDefinirOrcamento();
  const excluir = useExcluirOrcamento();
  const [categoriaId, definirCategoriaId] = useState<string | null>(orcamento?.categoriaId ?? null);
  const [limite, definirLimite] = useState(orcamento?.valorLimiteCentavos ?? 0);
  const [repetir, definirRepetir] = useState(orcamento?.repetirMensal ?? true);
  const [tentou, definirTentou] = useState(false);
  const [tirando, definirTirando] = useState(false);

  const nomeDaCategoria =
    categorias.find(({ id }) => id === orcamento?.categoriaId)?.nome ??
    t('orcamentos.item.semCategoria');
  const dados = {
    categoriaId: categoriaId ?? '',
    competencia,
    valorLimiteCentavos: limite,
    repetirMensal: repetir,
  };
  const valido = esquemaDefinicaoOrcamento.safeParse(dados).success;
  const erroEnvio = definir.isError ? definir.error : excluir.isError ? excluir.error : null;

  if (tirando && orcamento !== null) {
    return (
      <Folha
        visivel
        titulo={t('orcamentos.folha.tirarConfirmar', { categoria: nomeDaCategoria })}
        aoFechar={aoFechar}
        testID="folha-orcamento"
        rodape={
          <>
            <Botao
              variante="perigo"
              larguraTotal
              titulo={t('orcamentos.folha.tirarSim')}
              carregando={excluir.isPending}
              aoPressionar={() => {
                excluir.mutate(orcamento.id, { onSuccess: aoFechar });
              }}
            />
            <Botao
              variante="fantasma"
              titulo={t('orcamentos.folha.cancelar')}
              aoPressionar={() => {
                definirTirando(false);
              }}
            />
          </>
        }
      >
        <Texto cor="suave">{t('orcamentos.folha.tirarTexto')}</Texto>
        {erroEnvio === null ? null : (
          <Texto cor="perigo" accessibilityRole="alert">
            {mensagemDeErro(erroEnvio, t('orcamentos.semConexao'))}
          </Texto>
        )}
      </Folha>
    );
  }

  return (
    <Folha
      visivel
      titulo={
        orcamento === null
          ? t('orcamentos.folha.novo')
          : t('orcamentos.folha.editar', { categoria: nomeDaCategoria })
      }
      aoFechar={aoFechar}
      testID="folha-orcamento"
      rodape={
        <>
          <Botao
            titulo={t('orcamentos.folha.salvar')}
            larguraTotal
            carregando={definir.isPending}
            aoPressionar={() => {
              definirTentou(true);
              if (!valido) return;
              definir.mutate(dados, { onSuccess: aoFechar });
            }}
          />
          {orcamento === null ? (
            <Botao
              variante="fantasma"
              titulo={t('orcamentos.folha.cancelar')}
              aoPressionar={aoFechar}
            />
          ) : (
            <Botao
              variante="perigo"
              icone="trash"
              titulo={t('orcamentos.folha.tirar')}
              larguraTotal
              aoPressionar={() => {
                excluir.reset();
                definirTirando(true);
              }}
            />
          )}
        </>
      }
    >
      {orcamento === null ? (
        <GrupoOpcoes
          titulo={t('orcamentos.folha.categoria')}
          selecionado={categoriaId}
          aoEscolher={definirCategoriaId}
          opcoes={categorias.map(({ id, nome }) => ({ valor: id, rotulo: nome }))}
          vazio={t('orcamentos.folha.semCategorias')}
          erro={tentou && categoriaId === null ? t('orcamentos.folha.validacao.categoria') : null}
        />
      ) : null}
      <CampoValor
        rotulo={t('orcamentos.folha.limite')}
        centavos={limite}
        aoMudar={definirLimite}
        erro={tentou && limite <= 0 ? t('orcamentos.folha.validacao.limite') : null}
      />
      <View className="gap-1">
        <View className="min-h-toque flex-row items-center gap-3">
          <Texto className="flex-1">{t('orcamentos.folha.repetir')}</Texto>
          <Switch
            accessibilityLabel={t('orcamentos.folha.repetir')}
            value={repetir}
            onValueChange={definirRepetir}
            trackColor={{ true: cores.primaria, false: cores.borda }}
          />
        </View>
        <Texto variante="legenda" cor="suave">
          {t('orcamentos.folha.repetirAjuda')}
        </Texto>
      </View>
      {erroEnvio === null ? null : (
        <Texto cor="perigo" accessibilityRole="alert">
          {mensagemDeErro(erroEnvio, t('orcamentos.semConexao'))}
        </Texto>
      )}
    </Folha>
  );
}
