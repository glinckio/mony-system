import { dataNoFuso } from '@mony/shared/datas';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useDataCurta } from '@/lib/datas-texto';
import { mensagemDeErro } from '@/lib/formularios';
import { Botao, Campo, Folha, Texto } from '@/ui';

import { useExclusaoConta } from '../hooks/use-exclusao-conta';

interface PropsFolhaExcluirConta {
  visivel: boolean;
  aoFechar: () => void;
  /** Quem só entra pelo Google ou pela Apple confirma com o código por e-mail. */
  temSenha: boolean;
  fuso: string;
}

/**
 * Excluir a conta (RN-161, T-140b): explica o que acontece em 7 dias e confirma com a senha ou
 * com o código por e-mail. Pedida, mostra a data e sai da conta (a API encerrou as sessões). Com a
 * exclusão já agendada (entrou de novo dentro do prazo), oferece desistir.
 */
export function FolhaExcluirConta({ visivel, aoFechar, temSenha, fuso }: PropsFolhaExcluirConta) {
  const { t } = useTranslation();
  const dataCurta = useDataCurta();
  const exclusao = useExclusaoConta();
  const [senha, definirSenha] = useState('');
  const [codigo, definirCodigo] = useState('');
  const dia = (instante: string) => dataCurta(dataNoFuso(new Date(instante), fuso));

  const erro = exclusao.erro ? (
    <Texto cor="perigo" accessibilityRole="alert">
      {mensagemDeErro(exclusao.erro, t('mais.semConexao'))}
    </Texto>
  ) : null;

  if (exclusao.pedidaPara !== null) {
    return (
      <Folha
        visivel={visivel}
        titulo={t('mais.excluirConta.titulo')}
        aoFechar={exclusao.sairDaConta}
      >
        <View className="gap-3">
          <Texto accessibilityLiveRegion="polite">
            {t('mais.excluirConta.pedida', { data: dia(exclusao.pedidaPara) })}
          </Texto>
          <Botao
            larguraTotal
            titulo={t('mais.excluirConta.entendi')}
            aoPressionar={exclusao.sairDaConta}
          />
        </View>
      </Folha>
    );
  }

  if (exclusao.agendadaPara !== null) {
    return (
      <Folha visivel={visivel} titulo={t('mais.excluirConta.titulo')} aoFechar={aoFechar}>
        <View className="gap-3">
          <Texto>{t('mais.excluirConta.agendada', { data: dia(exclusao.agendadaPara) })}</Texto>
          {erro}
          <Botao
            larguraTotal
            titulo={t('mais.excluirConta.desistir')}
            carregando={exclusao.desistindo}
            aoPressionar={exclusao.desistir}
          />
        </View>
      </Folha>
    );
  }

  return (
    <Folha visivel={visivel} titulo={t('mais.excluirConta.titulo')} aoFechar={aoFechar}>
      <View className="gap-3">
        <Texto>{t('mais.excluirConta.explicacao')}</Texto>
        <Texto cor="suave">{t('mais.excluirConta.antes')}</Texto>
        {temSenha ? (
          <Campo
            rotulo={t('mais.excluirConta.senha')}
            value={senha}
            onChangeText={definirSenha}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
          />
        ) : exclusao.codigoEnviado ? (
          <Campo
            rotulo={t('mais.excluirConta.codigo')}
            ajuda={t('mais.excluirConta.codigoEnviado')}
            value={codigo}
            onChangeText={(texto) => {
              definirCodigo(texto.replace(/\D/g, '').slice(0, 6));
            }}
            keyboardType="number-pad"
            autoComplete="one-time-code"
          />
        ) : null}
        {erro}
        {temSenha || exclusao.codigoEnviado ? (
          <Botao
            variante="perigo"
            larguraTotal
            titulo={t('mais.excluirConta.confirmar')}
            carregando={exclusao.excluindo}
            desabilitado={temSenha ? senha === '' : codigo.length !== 6}
            aoPressionar={() => {
              exclusao.excluir(temSenha ? { senha } : { codigo });
            }}
          />
        ) : (
          <Botao
            larguraTotal
            titulo={t('mais.excluirConta.enviarCodigo')}
            carregando={exclusao.pedindoCodigo}
            aoPressionar={exclusao.pedirCodigo}
          />
        )}
      </View>
    </Folha>
  );
}
