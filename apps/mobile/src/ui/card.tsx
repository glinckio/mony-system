import { View, type ViewProps } from 'react-native';

import { juntarClasses } from './classes';
import { sombras } from './tokens';

/** Superfície escura e arredondada sobre o degradê, para agrupar conteúdo. */
export function Card({ className, style, ...props }: ViewProps) {
  return (
    <View
      className={juntarClasses('rounded-lg bg-superficie p-4', className)}
      style={[{ boxShadow: sombras.card }, style]}
      {...props}
    />
  );
}
