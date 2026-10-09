import type { Secao } from '@/secoes';

/** Todos os textos do painel em pt-BR. */
export const textosPtBr = {
  comum: {
    produto: 'Monitorizze Admin',
    menu: 'Seções do painel',
    emConstrucao: 'Em construção.',
    naoEncontrada: 'Página não encontrada',
    voltarAoInicio: 'Voltar ao início',
  },
  inicio: {
    titulo: 'Início',
    api: {
      titulo: 'API',
      verificando: 'Verificando…',
      noAr: 'No ar',
      foraDoAr: 'Fora do ar',
    },
  },
  secoes: {
    usuarios: 'Usuários',
    assinaturas: 'Assinaturas',
    planos: 'Planos e preços',
    novidades: 'Novidades',
    mony: 'Mony',
    metricas: 'Métricas',
    auditoria: 'Auditoria',
    filas: 'Filas',
    configuracoes: 'Configurações',
  } satisfies Record<Secao, string>,
};
