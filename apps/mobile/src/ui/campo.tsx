import type { Ref } from 'react';
import { TextInput, type TextInputProps, View } from 'react-native';

import { juntarClasses } from './classes';
import { Texto } from './texto';
import { cores } from './tokens';

export interface PropsCampo extends Omit<TextInputProps, 'className' | 'style'> {
  rotulo: string;
  /** Mensagem de erro do campo; com ela a borda fica vermelha e o leitor de tela avisa. */
  erro?: string | null;
  ajuda?: string;
  ref?: Ref<TextInput>;
}

/** Campo de texto com rótulo, ajuda e erro. */
export function Campo({ rotulo, erro, ajuda, ref, editable = true, ...props }: PropsCampo) {
  const temErro = typeof erro === 'string' && erro !== '';
  return (
    <View className="gap-1">
      <Texto variante="corpo-sm" cor="suave" className="font-medio">
        {rotulo}
      </Texto>
      <TextInput
        ref={ref}
        accessibilityLabel={rotulo}
        accessibilityHint={temErro ? erro : ajuda}
        accessibilityState={{ disabled: !editable }}
        editable={editable}
        placeholderTextColor={cores['texto-suave']}
        className={juntarClasses(
          'min-h-toque rounded-md border bg-superficie px-3 text-corpo text-texto',
          temErro ? 'border-perigo' : 'border-borda',
          !editable && 'opacity-50',
        )}
        {...props}
      />
      {temErro ? (
        <Texto variante="legenda" cor="perigo" accessibilityLiveRegion="polite">
          {erro}
        </Texto>
      ) : ajuda ? (
        <Texto variante="legenda" cor="suave">
          {ajuda}
        </Texto>
      ) : null}
    </View>
  );
}
