import type { RecursoComConvite } from '@mony/shared/compartilhamentos';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { mensagemDeErro } from '@/lib/formularios';
import { Botao, Folha, Texto } from '@/ui';

import { useCompartilhamentos, useTirarCompartilhamento } from '../hooks/use-compartilhamentos';
import { conviteAceito } from '../lib/compartilhamentos';

export interface PropsBotaoSair {
  recurso: RecursoComConvite;
  recursoId: string;
  donoNome: string;
  /** Depois de sair: a tela fecha, porque a lista ou o lembrete some para quem saiu. */
  aoSair: () => void;
}

/**
 * Quem recebeu a lista ou o lembrete sai dela (RN-074): apaga o próprio convite aceito, depois de
 * confirmar. Para voltar, o dono precisa convidar de novo.
 */
export function BotaoSair({ recurso, recursoId, donoNome, aoSair }: PropsBotaoSair) {
  const { t } = useTranslation();
  const consulta = useCompartilhamentos();
  const tirar = useTirarCompartilhamento();
  const [confirmando, definirConfirmando] = useState(false);
  const convite = conviteAceito(consulta.data, recurso, recursoId);
  if (convite === null) return null;

  function fechar() {
    definirConfirmando(false);
  }

  return (
    <>
      <Botao
        variante="perigo"
        icone="log-out"
        titulo={t(`compartilhamentos.sair.${recurso}`)}
        larguraTotal
        aoPressionar={() => {
          tirar.reset();
          definirConfirmando(true);
        }}
      />
      <Folha
        visivel={confirmando}
        titulo={t(`compartilhamentos.sair.titulo.${recurso}`)}
        aoFechar={fechar}
        rodape={
          <>
            <Botao
              variante="perigo"
              larguraTotal
              titulo={t('compartilhamentos.sair.confirmar')}
              carregando={tirar.isPending}
              aoPressionar={() => {
                tirar.mutate(convite.id, {
                  onSuccess: () => {
                    fechar();
                    aoSair();
                  },
                });
              }}
            />
            <Botao
              variante="fantasma"
              titulo={t('compartilhamentos.sair.cancelar')}
              aoPressionar={fechar}
            />
          </>
        }
      >
        <Texto cor="suave">{t('compartilhamentos.sair.texto', { nome: donoNome })}</Texto>
        {tirar.isError ? (
          <Texto cor="perigo" accessibilityRole="alert">
            {mensagemDeErro(tirar.error, t('compartilhamentos.semConexao'))}
          </Texto>
        ) : null}
      </Folha>
    </>
  );
}
