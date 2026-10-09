import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../generated/prisma/client';
import { exclusaoLogica } from './exclusao-logica';

/** Prisma Client da API: conexão pelo driver `pg` e exclusão lógica ligada. */
export function criarClientePrisma(urlBanco: string) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: urlBanco }) }).$extends(
    exclusaoLogica,
  );
}

export type ClientePrisma = ReturnType<typeof criarClientePrisma>;
