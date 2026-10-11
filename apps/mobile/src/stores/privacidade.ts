import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface EstadoPrivacidade {
  /** RN-022: com o modo privacidade, todo `Valor` do app aparece oculto. */
  ocultarValores: boolean;
  alternar: () => void;
}

/**
 * Modo privacidade (RN-022). Fica só no aparelho (doc 04), guardado no AsyncStorage: o app abre
 * com os valores ocultos se o usuário deixou assim.
 */
export const usePrivacidade = create<EstadoPrivacidade>()(
  persist(
    (definir) => ({
      ocultarValores: false,
      alternar: () => {
        definir((estado) => ({ ocultarValores: !estado.ocultarValores }));
      },
    }),
    {
      name: 'mony-privacidade',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ ocultarValores }) => ({ ocultarValores }),
    },
  ),
);
