import type { Compartilhamento, RecursoComConvite } from '@mony/shared/compartilhamentos';
import type { PermissaoCompartilhamento } from '@mony/shared/enums';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { mensagemDeErro } from '@/lib/formularios';
import { Avatar, Botao, BotaoIcone, Campo, Chip, Etiqueta, Folha, Segmentado, Texto } from '@/ui';

import {
  useCompartilhamentos,
  useConvidar,
  useMudarPermissao,
  useTirarCompartilhamento,
} from '../hooks/use-compartilhamentos';
import { enviadosDoRecurso } from '../lib/compartilhamentos';

const PERMISSOES: readonly PermissaoCompartilhamento[] = ['ver', 'editar'];

const TOM_DO_STATUS = { pendente: 'atencao', aceito: 'receita', recusado: 'neutra' } as const;

function Pessoa({ convite }: { convite: Compartilhamento }) {
  const { t } = useTranslation();
  const mudar = useMudarPermissao();
  const tirar = useTirarCompartilhamento();
  const { nome } = convite.convidado;
  return (
    <View className="gap-2 border-t border-borda pt-3" testID={`pessoa-${convite.id}`}>
      <View className="flex-row items-center gap-3">
        <Avatar nome={nome} tamanho={32} />
        <View className="flex-1 gap-0.5">
          <Texto numberOfLines={1}>{nome}</Texto>
          <View className="flex-row">
            <Etiqueta
              texto={t(`compartilhamentos.status.${convite.status}`)}
              tom={TOM_DO_STATUS[convite.status]}
            />
          </View>
        </View>
        <BotaoIcone
          icone="trash"
          cor="perigo"
          rotulo={t('compartilhamentos.tirar', { nome })}
          aoPressionar={() => {
            if (!tirar.isPending) tirar.mutate(convite.id);
          }}
        />
      </View>
      {convite.status === 'recusado' ? null : (
        <View
          className="flex-row gap-2"
          accessibilityLabel={t('compartilhamentos.mudarPermissao', { nome })}
        >
          {PERMISSOES.map((permissao) => (
            <Chip
              key={permissao}
              rotulo={t(`compartilhamentos.permissoes.${permissao}`)}
              selecionado={convite.permissao === permissao}
              desabilitado={mudar.isPending}
              aoPressionar={() => {
                if (convite.permissao !== permissao) mudar.mutate({ id: convite.id, permissao });
              }}
            />
          ))}
        </View>
      )}
      {(mudar.error ?? tirar.error) ? (
        <Texto variante="corpo-sm" cor="perigo" accessibilityRole="alert">
          {mensagemDeErro(mudar.error ?? tirar.error, t('compartilhamentos.semConexao'))}
        </Texto>
      ) : null}
    </View>
  );
}

export interface PropsFolhaCompartilhar {
  recurso: RecursoComConvite;
  recursoId: string;
  visivel: boolean;
  aoFechar: () => void;
}

/**
 * Compartilhar a lista ou o lembrete (RN-074): o dono convida pelo e-mail ou pelo celular de quem
 * tem conta, com "Só ver" ou "Ver e mudar", e vê quem tem acesso (convite enviado, aceitou ou
 * recusou), muda a permissão ou tira a pessoa.
 */
export function FolhaCompartilhar({
  recurso,
  recursoId,
  visivel,
  aoFechar,
}: PropsFolhaCompartilhar) {
  const { t } = useTranslation();
  const consulta = useCompartilhamentos();
  const convidar = useConvidar();
  const [contato, definirContato] = useState('');
  const [permissao, definirPermissao] = useState<PermissaoCompartilhamento>('editar');
  const [erroContato, definirErroContato] = useState<string | null>(null);
  const [enviadoPara, definirEnviadoPara] = useState<string | null>(null);
  const pessoas = enviadosDoRecurso(consulta.data, recurso, recursoId);

  function enviar() {
    const valor = contato.trim();
    definirEnviadoPara(null);
    if (valor.length < 3) {
      definirErroContato(t('compartilhamentos.validacao.contato'));
      return;
    }
    definirErroContato(null);
    convidar.mutate(
      { recurso, recursoId, contato: valor, permissao },
      {
        onSuccess: (convite) => {
          definirContato('');
          definirEnviadoPara(convite.convidado.nome);
        },
      },
    );
  }

  function fechar() {
    convidar.reset();
    definirErroContato(null);
    definirEnviadoPara(null);
    aoFechar();
  }

  return (
    <Folha
      visivel={visivel}
      titulo={t(`compartilhamentos.titulo.${recurso}`)}
      aoFechar={fechar}
      testID="folha-compartilhar"
      rodape={
        <Botao variante="fantasma" titulo={t('compartilhamentos.fechar')} aoPressionar={fechar} />
      }
    >
      <Texto variante="corpo-sm" cor="suave">
        {t('compartilhamentos.ajuda')}
      </Texto>
      <Campo
        rotulo={t('compartilhamentos.contato')}
        placeholder={t('compartilhamentos.contatoExemplo')}
        value={contato}
        onChangeText={definirContato}
        onSubmitEditing={enviar}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        maxLength={254}
        erro={
          erroContato ??
          (convidar.error
            ? mensagemDeErro(convidar.error, t('compartilhamentos.semConexao'))
            : null)
        }
      />
      <View className="gap-1.5">
        <Texto variante="corpo-sm" cor="suave" className="font-forte">
          {t('compartilhamentos.permissao')}
        </Texto>
        <Segmentado
          rotulo={t('compartilhamentos.permissao')}
          opcoes={PERMISSOES.map((valor) => ({
            valor,
            rotulo: t(`compartilhamentos.permissoes.${valor}`),
          }))}
          selecionado={permissao}
          aoEscolher={definirPermissao}
        />
        <Texto variante="corpo-sm" cor="suave">
          {t(`compartilhamentos.permissoesAjuda.${recurso}`)}
        </Texto>
      </View>
      <Botao
        titulo={t('compartilhamentos.convidar')}
        icone="user-plus"
        larguraTotal
        carregando={convidar.isPending}
        aoPressionar={enviar}
      />
      {enviadoPara === null ? null : (
        <Texto cor="receita" accessibilityRole="alert">
          {t('compartilhamentos.convidado', { nome: enviadoPara })}
        </Texto>
      )}
      <View className="gap-3">
        <Texto variante="corpo-sm" cor="suave" className="font-forte" accessibilityRole="header">
          {t('compartilhamentos.pessoas')}
        </Texto>
        {pessoas.length === 0 ? (
          <Texto cor="suave">{t('compartilhamentos.ninguem')}</Texto>
        ) : (
          pessoas.map((convite) => <Pessoa key={convite.id} convite={convite} />)
        )}
      </View>
    </Folha>
  );
}
