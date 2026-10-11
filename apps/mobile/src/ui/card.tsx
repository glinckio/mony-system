import { View, type ViewProps } from 'react-native';

import { juntarClasses } from './classes';
import { sombras } from './tokens';

/** Superfície com borda e sombra leve, para agrupar conteúdo. */
export function Card({ className, style, ...props }: ViewProps) {
  return (
    <View
      className={juntarClasses('rounded-lg border border-borda bg-superficie p-4', className)}
      style={[{ boxShadow: sombras.card }, style]}
      {...props}
    />
  );
}
