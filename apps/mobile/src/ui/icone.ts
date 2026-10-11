import type Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

/** Ícones provisórios (Ionicons) até o cliente mandar os dele (doc 04). */
export type NomeIcone = ComponentProps<typeof Ionicons>['name'];
