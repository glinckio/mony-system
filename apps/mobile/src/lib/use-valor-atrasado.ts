import { useEffect, useState } from 'react';

/**
 * O valor depois de `atrasoMs` sem mudar (debounce). Para a busca não chamar a API a cada letra.
 */
export function useValorAtrasado<T>(valor: T, atrasoMs: number): T {
  const [atrasado, definirAtrasado] = useState(valor);
  useEffect(() => {
    const espera = setTimeout(() => {
      definirAtrasado(valor);
    }, atrasoMs);
    return () => {
      clearTimeout(espera);
    };
  }, [valor, atrasoMs]);
  return atrasado;
}
