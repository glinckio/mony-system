import { ehDataCalendario } from '@mony/shared/datas';
import { useLocalSearchParams } from 'expo-router';

import { FormularioCompromisso } from './formulario-compromisso';

/** Novo compromisso (`/agenda/novo?dia=AAAA-MM-DD`), pelo "+" da agenda, no dia escolhido. */
export default function TelaNovoCompromisso() {
  const { dia } = useLocalSearchParams<{ dia?: string }>();
  return (
    <FormularioCompromisso
      original={null}
      dia={dia !== undefined && ehDataCalendario(dia) ? dia : null}
    />
  );
}
