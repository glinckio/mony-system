import { cssInterop } from 'nativewind';
import type { ComponentProps } from 'react';
import { KeyboardAvoidingView, KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { espacos } from './tokens';

/*
 * O teclado nunca cobre o campo nem o botão (T-017a). No Android o app vai até as bordas da tela
 * (edge-to-edge, obrigatório no SDK 57) e o sistema não encolhe a janela quando o teclado abre:
 * o `react-native-keyboard-controller` mede o teclado igual nos dois sistemas. O `KeyboardProvider`
 * fica na raiz (`app/_layout.tsx`).
 */

cssInterop(KeyboardAwareScrollView, {
  className: 'style',
  contentContainerClassName: 'contentContainerStyle',
});
cssInterop(KeyboardAvoidingView, { className: 'style' });

type PropsRolagem = ComponentProps<typeof KeyboardAwareScrollView> & {
  className?: string;
  contentContainerClassName?: string;
};

/**
 * Rolagem de formulário: ao focar um campo, rola até ele ficar acima do teclado, com folga para o
 * botão logo abaixo. Toque fora do campo com o teclado aberto ainda aciona botões.
 */
export function RolagemFormulario({
  bottomOffset = espacos['8'],
  keyboardShouldPersistTaps = 'handled',
  ...props
}: PropsRolagem) {
  return (
    <KeyboardAwareScrollView
      bottomOffset={bottomOffset}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      {...props}
    />
  );
}

type PropsEvitaTeclado = Omit<ComponentProps<typeof KeyboardAvoidingView>, 'behavior'> & {
  className?: string;
};

/**
 * Sobe o conteúdo junto com o teclado (o rodapé fixo, a caixa de mensagem, a folha): o espaço do
 * teclado vira margem embaixo, nos dois sistemas.
 */
export function EvitaTeclado(props: PropsEvitaTeclado) {
  return <KeyboardAvoidingView behavior="padding" {...props} />;
}
