import {
  ETAPAS_ONBOARDING,
  type EtapaOnboarding,
  type Onboarding,
  type SituacaoEtapa,
} from '@mony/shared/usuario';

/**
 * O progresso do onboarding e as dicas vistas ficam em `dicas_vistas` (doc 06), uma marca por
 * chave: `onboarding:<etapa>:concluida`, `onboarding:<etapa>:dispensada` e `dica:<chave>`.
 */
export interface Marca {
  chave: string;
  vistaEm: Date;
}

const PREFIXO_ETAPA = 'onboarding:';
const PREFIXO_DICA = 'dica:';

export function chaveEtapa(etapa: EtapaOnboarding, situacao: 'concluida' | 'dispensada'): string {
  return `${PREFIXO_ETAPA}${etapa}:${situacao}`;
}

export function chaveDica(dica: string): string {
  return `${PREFIXO_DICA}${dica}`;
}

/**
 * Monta o progresso a partir das marcas. Concluída vale mais que dispensada (a pessoa pode
 * dispensar e fazer depois). RN-024: o checklist some quando nenhuma etapa está pendente.
 */
export function montarOnboarding(concluido: boolean, marcas: readonly Marca[]): Onboarding {
  const quando = new Map(marcas.map((marca) => [marca.chave, marca.vistaEm]));
  const etapas = ETAPAS_ONBOARDING.map((etapa) => {
    const concluidaEm = quando.get(chaveEtapa(etapa, 'concluida'));
    const dispensadaEm = quando.get(chaveEtapa(etapa, 'dispensada'));
    const [situacao, em]: [SituacaoEtapa, Date | undefined] = concluidaEm
      ? ['concluida', concluidaEm]
      : dispensadaEm
        ? ['dispensada', dispensadaEm]
        : ['pendente', undefined];
    return { etapa, situacao, em: em?.toISOString() ?? null };
  });
  return {
    concluido,
    etapas,
    checklistVisivel: etapas.some(({ situacao }) => situacao === 'pendente'),
    dicasVistas: marcas
      .filter(({ chave }) => chave.startsWith(PREFIXO_DICA))
      .map(({ chave }) => chave.slice(PREFIXO_DICA.length))
      .sort(),
  };
}
