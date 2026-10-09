/**
 * Seed do banco (`pnpm --filter api seed`, que roda `prisma db seed`). Pode rodar várias vezes.
 * - Sempre: limites do plano gratuito (RN-120), sem sobrescrever o que o admin já editou.
 * - Fora de produção: usuário de demonstração `demo@mony.local` no plano gratuito, com as
 *   categorias, preferências de alerta e apps sugeridos que o cadastro cria (RN-006).
 */
import { aplicarPadroesDoUsuario, LIMITES_PLANO_PADRAO } from '../src/core/dados-iniciais/padroes';
import { criarClientePrisma } from '../src/core/prisma/cliente';

const EMAIL_DEMONSTRACAO = 'demo@mony.local';

async function semear(): Promise<void> {
  const urlBanco = process.env.DATABASE_URL;
  if (!urlBanco) throw new Error('Defina DATABASE_URL para rodar o seed.');
  const prisma = criarClientePrisma(urlBanco);
  try {
    for (const limite of LIMITES_PLANO_PADRAO) {
      await prisma.limitePlano.upsert({
        where: { recurso: limite.recurso },
        create: limite,
        update: {},
      });
    }
    console.log(`Limites do plano gratuito: ${String(LIMITES_PLANO_PADRAO.length)} recursos.`);

    if (process.env.NODE_ENV === 'production') return;
    const demo = await prisma.usuario.upsert({
      where: { email: EMAIL_DEMONSTRACAO },
      create: { nome: 'Usuário de demonstração', email: EMAIL_DEMONSTRACAO },
      update: {},
    });
    await prisma.assinatura.upsert({
      where: { usuarioId: demo.id },
      create: { usuarioId: demo.id, plano: 'gratuito' },
      update: {},
    });
    await aplicarPadroesDoUsuario(prisma, demo.id);
    const categorias = await prisma.categoria.count({ where: { usuarioId: demo.id } });
    console.log(`Usuário de demonstração ${EMAIL_DEMONSTRACAO}: ${String(categorias)} categorias.`);
  } finally {
    await prisma.$disconnect();
  }
}

semear().catch((erro: unknown) => {
  console.error('Falha no seed', erro);
  process.exit(1);
});
