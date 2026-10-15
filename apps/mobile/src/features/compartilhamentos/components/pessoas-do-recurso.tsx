import type { AcessoRecurso, RecursoComConvite } from '@mony/shared/compartilhamentos';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Avatar, Texto } from '@/ui';

/** Até quantos avatares aparecem lado a lado; o resto fica no "compartilhada com N". */
const MAXIMO_AVATARES = 3;

export interface PropsPessoasDoRecurso {
  recurso: RecursoComConvite;
  acesso: AcessoRecurso;
  /** O dono, quando a lista ou o lembrete é de outra pessoa. */
  dono: { nome: string } | null;
  /** Quantas pessoas aceitaram o convite (na própria). */
  quantidade: number;
  /** Os nomes para os avatares: o dono, ou quem aceitou. */
  nomes: readonly string[];
  /** O dono abre a folha de compartilhar ao tocar. */
  aoPressionar?: () => void;
}

/**
 * Quem divide a lista ou o lembrete (RN-074; doc 04): os avatares com "Compartilhada com 2
 * pessoas" na própria, ou o do dono com "Lista de Ana" na de outro (e "Você só pode ver." com
 * `ver`). Na própria sem ninguém, não mostra nada.
 */
export function PessoasDoRecurso({
  recurso,
  acesso,
  dono,
  quantidade,
  nomes,
  aoPressionar,
}: PropsPessoasDoRecurso) {
  const { t } = useTranslation();
  if (dono === null && quantidade === 0) return null;
  const texto =
    dono === null
      ? t(
          recurso === 'lista'
            ? 'compartilhamentos.compartilhadaCom'
            : 'compartilhamentos.compartilhadoCom',
          { count: quantidade },
        )
      : t(`compartilhamentos.deOutro.${recurso}`, { nome: dono.nome });
  const conteudo = (
    <View className="flex-row items-center gap-3">
      {nomes.length === 0 ? null : (
        <View className="flex-row" importantForAccessibility="no-hide-descendants">
          {nomes.slice(0, MAXIMO_AVATARES).map((nome, indice) => (
            <View key={`${nome}-${String(indice)}`} className={indice > 0 ? '-ml-2' : undefined}>
              <Avatar nome={nome} tamanho={28} />
            </View>
          ))}
        </View>
      )}
      <View className="flex-1">
        <Texto variante="corpo-sm" cor="suave">
          {texto}
        </Texto>
        {acesso === 'ver' ? (
          <Texto variante="corpo-sm" cor="suave">
            {t('compartilhamentos.soVer')}
          </Texto>
        ) : null}
      </View>
    </View>
  );
  if (!aoPressionar) return <View testID="pessoas-do-recurso">{conteudo}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={texto}
      onPress={aoPressionar}
      className="active:opacity-70"
      testID="pessoas-do-recurso"
    >
      {conteudo}
    </Pressable>
  );
}
