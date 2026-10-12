import type { Meta } from '@mony/shared/metas';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { useMesAnoCurto } from '@/lib/datas-texto';
import {
  BarraProgresso,
  Botao,
  Card,
  type CorBarra,
  Etiqueta,
  Icone,
  juntarClasses,
  Texto,
  useTextoDoValor,
} from '@/ui';
import { cores } from '@/ui/tokens';

/** As metas não têm cor própria: alternam o verde e o azul do design. */
const TONS: readonly { barra: CorBarra; fundo: string; icone: string }[] = [
  { barra: 'receita', fundo: 'bg-receita-suave', icone: cores.receita },
  { barra: 'link', fundo: 'bg-primaria-suave', icone: cores.link },
];

export function tomDaMeta(indice: number) {
  return TONS[indice % TONS.length] ?? TONS[0];
}

/** "até dez/2027", ou "Sem prazo". */
export function usePrazoDaMeta(): (prazo: string | null) => string {
  const { t } = useTranslation();
  const mesAnoCurto = useMesAnoCurto();
  return (prazo) =>
    prazo === null ? t('metas.semPrazo') : t('metas.ate', { data: mesAnoCurto(prazo) });
}

interface PropsCartaoMeta {
  meta: Meta;
  indice: number;
  aoAbrir: () => void;
  aoGuardar: () => void;
}

/** A meta na lista (design, página 5): título, prazo, percentual, barra, valores e "Guardar". */
export function CartaoMeta({ meta, indice, aoAbrir, aoGuardar }: PropsCartaoMeta) {
  const { t } = useTranslation();
  const textoDoValor = useTextoDoValor();
  const prazoDaMeta = usePrazoDaMeta();
  const tom = tomDaMeta(indice);
  return (
    <Card className="gap-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={meta.titulo}
        onPress={aoAbrir}
        className="flex-row items-center gap-3 active:opacity-70"
      >
        <View
          className={juntarClasses(
            'h-10 w-10 items-center justify-center rounded-total',
            tom?.fundo,
          )}
        >
          <Icone nome="target" tamanho={18} cor={tom?.icone} />
        </View>
        <View className="flex-1">
          <Texto className="font-forte" numberOfLines={1}>
            {meta.titulo}
          </Texto>
          <Texto variante="corpo-sm" cor="suave">
            {prazoDaMeta(meta.prazo)}
          </Texto>
        </View>
        {meta.concluida ? (
          <Etiqueta tom="receita" texto={t('metas.concluida')} />
        ) : (
          <Texto className="font-forte">
            {t('metas.percentual', { percentual: String(meta.percentual) })}
          </Texto>
        )}
      </Pressable>
      <BarraProgresso
        percentual={meta.percentual}
        cor={tom?.barra}
        rotulo={t('metas.rotuloBarra', {
          titulo: meta.titulo,
          percentual: String(meta.percentual),
        })}
      />
      <View className="flex-row items-center justify-between gap-2">
        <Texto variante="corpo-sm" cor="suave" className="flex-1">
          {t('metas.valores', {
            atual: textoDoValor(meta.valorAtualCentavos),
            alvo: textoDoValor(meta.valorAlvoCentavos),
          })}
        </Texto>
        {meta.concluida ? null : (
          <Botao
            compacto
            titulo={t('metas.guardar')}
            rotulo={t('metas.guardarEm', { titulo: meta.titulo })}
            aoPressionar={aoGuardar}
          />
        )}
      </View>
    </Card>
  );
}
