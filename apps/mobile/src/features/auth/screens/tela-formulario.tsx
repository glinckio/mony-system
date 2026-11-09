import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Logo, RolagemFormulario, Tela, Texto } from '@/ui';

interface PropsTelaFormulario {
  titulo: string;
  /** Linha abaixo do título (ex.: "Entre para falar com a Mony."). */
  subtitulo?: string;
  /** Login: logo e título grande, centralizados, como no design. */
  chamada?: boolean;
  /** Fica no fim da tela (ex.: "Novo por aqui? Criar conta"). */
  rodape?: ReactNode;
  children: ReactNode;
}

/** Moldura das telas de autenticação: título, rolagem e teclado que não cobre o campo. */
export function TelaFormulario({
  titulo,
  subtitulo,
  chamada = false,
  rodape,
  children,
}: PropsTelaFormulario) {
  return (
    <Tela bordas={['top', 'bottom']}>
      <View className="flex-1">
        <RolagemFormulario contentContainerClassName="grow gap-4 p-6">
          <View className={chamada ? 'items-center gap-3 pb-4 pt-8' : 'gap-1'}>
            {chamada ? <Logo tamanho={64} /> : null}
            <Texto
              variante={chamada ? 'titulo-xl' : 'titulo-lg'}
              accessibilityRole="header"
              className={chamada ? 'text-center' : undefined}
            >
              {titulo}
            </Texto>
            {subtitulo ? (
              <Texto cor="suave" className={chamada ? 'text-center' : undefined}>
                {subtitulo}
              </Texto>
            ) : null}
          </View>
          {children}
          {rodape ? <View className="mt-auto items-center gap-1 pt-6">{rodape}</View> : null}
        </RolagemFormulario>
      </View>
    </Tela>
  );
}

/** Erro do envio do formulário, anunciado pelo leitor de tela. */
export function ErroDoFormulario({ mensagem }: { mensagem: string | null }) {
  if (mensagem === null) return null;
  return (
    <Texto cor="perigo" accessibilityRole="alert" accessibilityLiveRegion="polite">
      {mensagem}
    </Texto>
  );
}
