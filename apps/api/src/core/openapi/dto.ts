import { createZodDto, type ZodDto } from 'nestjs-zod';

type Esquema = Parameters<typeof createZodDto>[0];
type Propriedade = Record<string, unknown>;

/**
 * O que o `nestjs-zod` entrega ao `@nestjs/swagger` para cada campo do DTO. Um `type` que não é
 * texto já vem marcado como "tipo vazio" (`x-nestjs_zod-empty-type`): o `cleanupOpenApiDoc` apaga
 * o `type: ''` e fica o resto do schema.
 */
function corrigirCampo(campo: Propriedade): Propriedade {
  if (!Array.isArray(campo.type)) return campo;
  const tipos = campo.type.filter((tipo): tipo is string => typeof tipo === 'string');
  return { ...campo, type: '', anyOf: tipos.map((tipo) => ({ type: tipo })) };
}

/**
 * T-018: o Zod 4 escreve `z.string().nullable()` como `type: ['string', 'null']` (JSON Schema
 * 2020-12), e o `@nestjs/swagger` lê `type` em lista como "lista de" (vira `string[]` no cliente
 * gerado). Aqui o campo vira `anyOf: [{ type: 'string' }, { type: 'null' }]`, a mesma forma que o
 * Zod usa para os outros campos que aceitam nulo (ex.: uuid). Campos aninhados não passam pelo
 * swagger e já saem certos.
 */
export function corrigirTiposEmLista(campos: unknown): Record<string, Propriedade> {
  return Object.fromEntries(
    Object.entries(campos as Record<string, Propriedade>).map(([nome, campo]) => [
      nome,
      corrigirCampo(campo),
    ]),
  );
}

const criados = new Set<ZodDto<Esquema, false>>();

/** Os DTOs criados até agora, para o teste do contrato conferir todos. */
export function dtosCriados(): readonly ZodDto<Esquema, false>[] {
  return [...criados];
}

/**
 * DTO a partir do schema Zod do `@mony/shared`, como o `createZodDto`, com os campos que aceitam
 * nulo certos no contrato (T-018). Todo DTO da API usa este (regra do ESLint em `apps/api`).
 */
export function criarDto<TSchema extends Esquema>(schema: TSchema): ZodDto<TSchema, false> {
  const Dto = createZodDto(schema);
  const original = Dto._OPENAPI_METADATA_FACTORY.bind(Dto);
  Dto._OPENAPI_METADATA_FACTORY = () => corrigirTiposEmLista(original());
  criados.add(Dto);
  return Dto;
}
