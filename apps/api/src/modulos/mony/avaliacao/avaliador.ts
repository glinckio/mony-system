import { randomInt, randomUUID } from 'node:crypto';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import { somarDias } from '@mony/shared/recorrencias';
import {
  type ComponenteMony,
  type EventoMony,
  eventoMonyDoSse,
  LeitorSse,
} from '@mony/shared/mony';
import { normalizar } from '@mony/shared/rascunhos';

import { Clock } from '../../../core/clock/clock';
import type { Contexto } from '../../../core/contexto/contexto';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { ChamadaFerramenta } from '../../../integracoes/ia/llm.provider';
import { CategoriasService } from '../../categorias/categorias.service';
import type { ResultadoAvaliacao } from '../config.service';
import { RegistroFerramentas } from '../ferramentas/registro';
import { PreferenciasService } from '../preferencias.service';
import type { CasoAvaliacao, Esperado } from './casos';

/** O que aconteceu com uma frase: as ferramentas chamadas, os componentes e o texto. */
export interface Observado {
  chamadas: readonly ChamadaFerramenta[];
  componentes: readonly ComponenteMony[];
  texto: string;
  erro: string | null;
}

/** Os motivos de a frase não passar; vazio: passou. */
export function conferir(espera: Esperado, observado: Observado): string[] {
  const motivos: string[] = [];
  if (observado.erro !== null) motivos.push(`erro: ${observado.erro}`);
  const nomes = observado.chamadas.map(({ nome }) => nome);
  if (espera.ferramentas) {
    if (espera.ferramentas.length === 0 && nomes.length > 0) {
      motivos.push(`não esperava ferramentas e veio ${nomes.join(', ')}`);
    }
    for (const esperada of espera.ferramentas) {
      const aceitos = typeof esperada.nome === 'string' ? [esperada.nome] : esperada.nome;
      const candidatas = observado.chamadas.filter(({ nome }) => aceitos.includes(nome));
      const rotulo = aceitos.join(' ou ');
      if (candidatas.length === 0) {
        motivos.push(`faltou ${rotulo} (veio ${nomes.join(', ') || 'nenhuma'})`);
      } else if (
        esperada.args &&
        !candidatas.some(({ entrada }) => contem(entrada, esperada.args ?? {}))
      ) {
        motivos.push(
          `${rotulo} sem ${JSON.stringify(esperada.args)} (veio ${candidatas
            .map(({ entrada }) => JSON.stringify(entrada))
            .join('; ')})`,
        );
      }
    }
  }
  for (const proibida of espera.semFerramentas ?? []) {
    if (nomes.includes(proibida)) motivos.push(`não podia chamar ${proibida}`);
  }
  const [primeiro] = observado.componentes;
  if (espera.semComponente && primeiro)
    motivos.push(`não esperava componente e veio ${primeiro.tipo}`);
  if (espera.componente) {
    const { tipo, pergunta, primeiraOpcao, acoes } = espera.componente;
    if (!primeiro || primeiro.tipo !== tipo) {
      motivos.push(`esperava componente ${tipo} e veio ${primeiro?.tipo ?? 'nenhum'}`);
    } else {
      const campo = primeiro.opcoes[0]?.acao.campo;
      if (pergunta && campo !== pergunta) {
        motivos.push(`esperava a pergunta ${pergunta} e veio ${String(campo)}`);
      }
      const rotulo = primeiro.opcoes[0]?.rotulo;
      if (primeiraOpcao && rotulo !== primeiraOpcao) {
        motivos.push(`esperava ${primeiraOpcao} primeiro e veio ${String(rotulo)}`);
      }
      const ids = primeiro.opcoes.map(({ id }) => id);
      for (const acao of acoes ?? []) {
        if (!ids.includes(acao)) motivos.push(`faltou o botão ${acao} (veio ${ids.join(', ')})`);
      }
    }
  }
  const texto = plano(observado.texto);
  for (const trecho of espera.contem ?? []) {
    if (!texto.includes(plano(trecho))) motivos.push(`o texto não diz "${trecho}"`);
  }
  for (const trecho of espera.naoContem ?? []) {
    if (texto.includes(plano(trecho))) motivos.push(`o texto diz "${trecho}"`);
  }
  return motivos;
}

/** Sem acento, caixa nem espaço especial (o "R$ 10,00" tem espaço que não quebra). */
function plano(texto: string): string {
  return normalizar(texto).replace(/\s+/g, ' ');
}

/** `esperado` está contido em `valor`: os campos que ele tem são iguais (texto sem acento e caixa). */
function contem(valor: unknown, esperado: unknown): boolean {
  if (typeof esperado === 'string') {
    return typeof valor === 'string' && normalizar(valor) === normalizar(esperado);
  }
  if (esperado === null || typeof esperado !== 'object') return valor === esperado;
  if (valor === null || typeof valor !== 'object') return false;
  return Object.entries(esperado).every(([chave, item]) =>
    contem((valor as Record<string, unknown>)[chave], item),
  );
}

/**
 * Roda as frases contra a app (a conversa de verdade, com o modelo configurado): um usuário novo
 * por frase, com o estado do caso, e apaga os usuários no fim. As frases rodam uma por vez; as
 * chamadas de ferramenta são anotadas no registro.
 */
export async function avaliar(
  app: NestFastifyApplication,
  casos: readonly CasoAvaliacao[],
  modelo: string,
): Promise<ResultadoAvaliacao> {
  const registro = app.get(RegistroFerramentas, { strict: false });
  const chamadas: ChamadaFerramenta[] = [];
  const executar = registro.executar.bind(registro);
  registro.executar = (contexto, chamada) => {
    chamadas.push(chamada);
    return executar(contexto, chamada);
  };
  const usuarios: string[] = [];
  const resultados: ResultadoAvaliacao['casos'] = [];
  try {
    for (const caso of casos) {
      chamadas.length = 0;
      let observado: Observado;
      try {
        const usuario = await cadastrar(app);
        usuarios.push(usuario.usuarioId);
        await prepararEstado(app, usuario, caso);
        observado = { ...(await conversar(app, usuario, caso.entrada)), chamadas: [...chamadas] };
      } catch (erro) {
        observado = {
          chamadas: [...chamadas],
          componentes: [],
          texto: '',
          erro: erro instanceof Error ? erro.message : String(erro),
        };
      }
      const motivos = conferir(caso.espera, observado);
      resultados.push({ id: caso.id, passou: motivos.length === 0, motivos });
    }
  } finally {
    registro.executar = executar;
    await app
      .get(PrismaService, { strict: false })
      .cliente.usuario.deleteMany({ where: { id: { in: usuarios } } });
  }
  const aprovados = resultados.filter(({ passou }) => passou).length;
  return {
    total: resultados.length,
    aprovados,
    percentual: resultados.length > 0 ? Math.floor((aprovados * 100) / resultados.length) : 0,
    modelo,
    em: app.get(Clock, { strict: false }).agora().toISOString(),
    casos: resultados,
  };
}

interface UsuarioAvaliacao {
  usuarioId: string;
  acesso: string;
}

async function cadastrar(app: NestFastifyApplication): Promise<UsuarioAvaliacao> {
  const resposta = await app.inject({
    method: 'POST',
    url: '/v1/auth/cadastro',
    // Um endereço por cadastro: o limite de tentativas é por IP.
    remoteAddress: `10.${String(randomInt(256))}.${String(randomInt(256))}.${String(randomInt(1, 255))}`,
    payload: {
      nome: 'Avaliação Mony',
      telefone: '(11) 90000-0000',
      email: `avaliacao-${randomUUID()}@mony.invalid`,
      senha: `avaliacao-${randomUUID()}`,
      aceites: { ...VERSOES_DOCUMENTOS },
      dispositivo: { identificador: `avaliacao-${randomUUID()}`, plataforma: 'ios' },
    },
  });
  if (resposta.statusCode !== 201) throw new Error(`cadastro: ${resposta.body}`);
  const sessao = resposta.json<{ usuario: { id: string }; tokens: { acesso: string } }>();
  return { usuarioId: sessao.usuario.id, acesso: sessao.tokens.acesso };
}

async function chamar(
  app: NestFastifyApplication,
  usuario: UsuarioAvaliacao,
  metodo: 'POST' | 'PUT',
  url: string,
  corpo: object,
): Promise<{ id: string }> {
  const resposta = await app.inject({
    method: metodo,
    url: `/v1${url}`,
    headers: { authorization: `Bearer ${usuario.acesso}`, 'idempotency-key': randomUUID() },
    payload: corpo,
  });
  if (resposta.statusCode >= 300) throw new Error(`${metodo} ${url}: ${resposta.body}`);
  return resposta.json<{ id: string }>();
}

async function prepararEstado(
  app: NestFastifyApplication,
  usuario: UsuarioAvaliacao,
  caso: CasoAvaliacao,
): Promise<void> {
  const estado = caso.estado;
  if (!estado) return;
  const contexto: Contexto = { usuarioId: usuario.usuarioId, origem: 'mony' };
  const categorias = (await app.get(CategoriasService, { strict: false }).listar(contexto)).itens;
  const categoria = (nome: string) => {
    const achada = categorias.find((item) => item.nome === nome);
    if (!achada) throw new Error(`categoria ${nome} não existe`);
    return achada.id;
  };
  const cartoes = new Map<string, string>();
  for (const nome of estado.cartoes ?? []) {
    const { id } = await chamar(app, usuario, 'POST', '/cartoes', {
      nome,
      limiteTotalCentavos: 500_000,
      diaFechamento: 3,
      diaVencimento: 10,
      cor: '#7C3AED',
    });
    cartoes.set(nome, id);
  }
  for (const [estabelecimento, { categoria: nome, cartao }] of Object.entries(
    estado.preferencias ?? {},
  )) {
    const cartaoId = cartao === undefined ? null : (cartoes.get(cartao) ?? null);
    await app.get(PreferenciasService, { strict: false }).aprender(contexto, estabelecimento, {
      categoriaId: categoria(nome),
      cartaoId,
      formaPagamento: cartaoId ? 'cartao_credito' : 'pix',
    });
  }
  for (const [nome, valorLimiteCentavos] of Object.entries(estado.orcamentos ?? {})) {
    await chamar(app, usuario, 'PUT', '/orcamentos', {
      categoriaId: categoria(nome),
      valorLimiteCentavos,
    });
  }
  const hoje = app.get(Clock, { strict: false }).agora().toISOString().slice(0, 10);
  for (const despesa of estado.despesas ?? []) {
    await chamar(app, usuario, 'POST', '/transacoes', {
      tipo: 'despesa',
      descricao: despesa.descricao,
      valorCentavos: despesa.valorCentavos,
      data: somarDias(hoje, -despesa.diasAtras),
      categoriaId: categoria(despesa.categoria),
      formaPagamento: 'pix',
    });
  }
}

async function conversar(
  app: NestFastifyApplication,
  usuario: UsuarioAvaliacao,
  texto: string,
): Promise<Omit<Observado, 'chamadas'>> {
  const resposta = await app.inject({
    method: 'POST',
    url: '/v1/mony/mensagens',
    headers: { authorization: `Bearer ${usuario.acesso}` },
    payload: { texto },
  });
  const eventos = new LeitorSse()
    .ler(resposta.body)
    .map(eventoMonyDoSse)
    .filter((evento): evento is EventoMony => evento !== null);
  const erro = eventos.find((evento) => evento.tipo === 'erro');
  return {
    componentes: eventos.flatMap((evento) =>
      evento.tipo === 'componente' ? [evento.componente] : [],
    ),
    texto: eventos.map((evento) => (evento.tipo === 'texto.delta' ? evento.texto : '')).join(''),
    erro:
      resposta.statusCode !== 200
        ? `HTTP ${String(resposta.statusCode)}`
        : erro?.tipo === 'erro'
          ? erro.mensagem
          : null,
  };
}
