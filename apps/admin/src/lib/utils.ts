import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Junta classes do Tailwind resolvendo conflitos (`cn('px-2', 'px-4')` → `px-4`). Padrão do shadcn/ui. */
export function cn(...classes: ClassValue[]): string {
  return twMerge(clsx(classes));
}
