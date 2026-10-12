import { formatarCentavos } from '@mony/shared/dinheiro';
import { type DadosNovoAporte, esquemaNovoAporte, type Meta } from '@mony/shared/metas';
import { randomUUID } from 'expo-crypto';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { dataParaTexto, mascararData, textoParaData } from '@/features/transacoes/lib/periodo';
import { mensagemDeErro } from '@/lib/formularios';
import { useHoje } from '@/lib/fuso';
import { Botao, Campo, CampoValor, Folha, Texto } from '@/ui';

import { useAportar, useAtualizarMeta } from '../hooks/use-metas';

interface PropsFolhaAporte {
  meta: Pick<Meta, 'id' | 'titulo' | 'valorAlvoCentavos'>;
  aoFechar: () => void;
}

/**
 * "Guardar" (RN-063): um aporte já feito, de hoje ou de antes. Se ele levar a meta ao alvo, a folha
 * pergunta se é para concluir (`sugerirConclusao` da API). Montada só enquanto aberta: cada
 * abertura é um aporte, com a sua `Idempotency-Key`.
 */
export function FolhaAporte({ meta, aoFechar }: PropsFolhaAporte) {
  const { t } = useTranslation();
  const hoje = useHoje();
  const aportar = useAportar();
  const concluir = useAtualizarMeta();
  const [chave] = useState(() => randomUUID());
  const [valor, definirValor] = useState(0);
  const [data, definirData] = useState(dataParaTexto(hoje));
  const [tentou, definirTentou] = useState(false);
  const [chegou, definirChegou] = useState(false);

  const dataEscolhida = textoParaData(data);
  const dataValida = dataEscolhida !== null && dataEscolhida <= hoje;
  const dados: DadosNovoAporte = {
    valorCentavos: valor,
    ...(dataEscolhida === null || dataEscolhida === hoje ? {} : { data: dataEscolhida }),
  };
  const valido = dataValida && esquemaNovoAporte.safeParse(dados).success;

  if (chegou) {
    return (
      <Folha
        visivel
        titulo={t('metas.aporte.chegou', { titulo: meta.titulo })}
        aoFechar={aoFechar}
        testID="folha-aporte"
        rodape={
          <>
            <Botao
              titulo={t('metas.aporte.concluir')}
              larguraTotal
              carregando={concluir.isPending}
              aoPressionar={() => {
                concluir.mutate(
                  { id: meta.id, dados: { concluida: true } },
                  { onSuccess: aoFechar },
                );
              }}
            />
            <Botao
              variante="fantasma"
              titulo={t('metas.aporte.agoraNao')}
              aoPressionar={aoFechar}
            />
          </>
        }
      >
        <Texto cor="suave">{t('metas.aporte.chegouTexto')}</Texto>
        {concluir.isError ? (
          <Texto cor="perigo" accessibilityRole="alert">
            {mensagemDeErro(concluir.error, t('metas.semConexao'))}
          </Texto>
        ) : null}
      </Folha>
    );
  }

  return (
    <Folha
      visivel
      titulo={t('metas.aporte.titulo', { titulo: meta.titulo })}
      aoFechar={aoFechar}
      testID="folha-aporte"
      rodape={
        <>
          <Botao
            titulo={t('metas.aporte.confirmar', { valor: formatarCentavos(valor) })}
            larguraTotal
            carregando={aportar.isPending}
            aoPressionar={() => {
              definirTentou(true);
              if (!valido) return;
              aportar.mutate(
                { id: meta.id, dados, chave },
                {
                  onSuccess: (resposta) => {
                    if (resposta.sugerirConclusao) definirChegou(true);
                    else aoFechar();
                  },
                },
              );
            }}
          />
          <Botao variante="fantasma" titulo={t('metas.aporte.cancelar')} aoPressionar={aoFechar} />
        </>
      }
    >
      <CampoValor
        rotulo={t('metas.aporte.valor')}
        centavos={valor}
        aoMudar={definirValor}
        erro={tentou && valor <= 0 ? t('metas.aporte.valorInvalido') : null}
      />
      <Campo
        rotulo={t('metas.aporte.data')}
        ajuda={t('metas.aporte.dataAjuda')}
        value={data}
        onChangeText={(texto) => {
          definirData(mascararData(texto));
        }}
        keyboardType="number-pad"
        maxLength={10}
        erro={tentou && !dataValida ? t('metas.aporte.dataInvalida') : null}
      />
      {aportar.isError ? (
        <Texto cor="perigo" accessibilityRole="alert">
          {mensagemDeErro(aportar.error, t('metas.semConexao'))}
        </Texto>
      ) : null}
    </Folha>
  );
}
