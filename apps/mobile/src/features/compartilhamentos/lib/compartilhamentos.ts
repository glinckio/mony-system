import type {
  Compartilhamento,
  ListaCompartilhamentos,
  RecursoComConvite,
} from '@mony/shared/compartilhamentos';

/** Os convites que o dono mandou para a lista ou o lembrete; quem recusou fica no fim. */
export function enviadosDoRecurso(
  dados: ListaCompartilhamentos | undefined,
  recurso: RecursoComConvite,
  recursoId: string,
): Compartilhamento[] {
  const doRecurso = (dados?.enviados ?? []).filter(
    (convite) => convite.recurso === recurso && convite.recursoId === recursoId,
  );
  return [
    ...doRecurso.filter((convite) => convite.status !== 'recusado'),
    ...doRecurso.filter((convite) => convite.status === 'recusado'),
  ];
}

/** Os convites que esperam a resposta de quem vê, de um tipo de recurso. */
export function convitesPendentes(
  dados: ListaCompartilhamentos | undefined,
  recurso: RecursoComConvite,
): Compartilhamento[] {
  return (dados?.recebidos ?? []).filter(
    (convite) => convite.recurso === recurso && convite.status === 'pendente',
  );
}

/** O convite aceito que dá acesso a quem vê: é ele que "Sair" apaga. */
export function conviteAceito(
  dados: ListaCompartilhamentos | undefined,
  recurso: RecursoComConvite,
  recursoId: string,
): Compartilhamento | null {
  return (
    (dados?.recebidos ?? []).find(
      (convite) =>
        convite.recurso === recurso &&
        convite.recursoId === recursoId &&
        convite.status === 'aceito',
    ) ?? null
  );
}

/** Os nomes para os avatares: o dono (na de outro) e quem aceitou (na própria). */
export function nomesDasPessoas(
  dono: { nome: string } | null,
  enviados: readonly Compartilhamento[],
): string[] {
  if (dono !== null) return [dono.nome];
  return enviados
    .filter(({ status }) => status === 'aceito')
    .map(({ convidado }) => convidado.nome);
}
