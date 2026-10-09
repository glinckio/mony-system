import { Controller, Get } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import { SignJWT, generateKeyPair } from 'jose';
import { afterEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { TokensAcesso, VALIDADE_ACESSO_SEGUNDOS } from '../src/core/auth/tokens-acesso';
import { Clock, ClockFixo } from '../src/core/clock/clock';
import { type Contexto, ContextoAtual } from '../src/core/contexto/contexto';
import { ErroDominio } from '../src/core/erros/erro-dominio';
import { LimiteTentativasMemoria } from '../src/core/limites/limite-tentativas';
import {
  aceitesPendentes,
  gerarTokenRenovacao,
  resumir,
  somarDias,
} from '../src/modulos/autenticacao/dominio/sessoes';
import { conferirSenha, gerarHashSenha } from '../src/modulos/autenticacao/senhas';
import { semServicosExternos } from './utilitarios';

const INSTANTE = '2026-10-09T12:00:00Z';

@Controller('teste-auth')
class RotaProtegidaController {
  @Get()
  quemSou(@ContextoAtual() contexto: Contexto): Contexto {
    return contexto;
  }
}

let app: NestFastifyApplication | undefined;

async function criarApp() {
  const clock = new ClockFixo(INSTANTE);
  const modulo = await semServicosExternos(
    Test.createTestingModule({ imports: [AppModule], controllers: [RotaProtegidaController] }),
  )
    .overrideProvider(Clock)
    .useValue(clock)
    .compile();
  app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
  configurarApp(app, { documentacao: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return { api: app, clock, tokens: modulo.get(TokensAcesso) };
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

const usuario = { id: 'u1', papel: 'usuario' as const, sessaoId: 's1', dispositivoId: 'd1' };

describe('tokens de acesso (JWT ES256)', () => {
  it('RN-004 valem 15 minutos e levam usuário, sessão e aparelho', async () => {
    const { tokens } = await criarApp();
    const { token, expiraEm } = await tokens.emitir(usuario);
    expect(expiraEm.toISOString()).toBe('2026-10-09T12:15:00.000Z');
    const [cabecalho] = token.split('.');
    expect(JSON.parse(Buffer.from(cabecalho ?? '', 'base64url').toString())).toMatchObject({
      alg: 'ES256',
      kid: 'mony-1',
    });
    await expect(tokens.verificar(token)).resolves.toEqual(usuario);
  });

  it('RN-004 depois de 15 minutos o token expira (TOKEN_EXPIRADO)', async () => {
    const { tokens, clock } = await criarApp();
    const { token } = await tokens.emitir(usuario);
    clock.avancar(VALIDADE_ACESSO_SEGUNDOS * 1000 + 1000);
    await expect(tokens.verificar(token)).rejects.toMatchObject({ codigo: 'TOKEN_EXPIRADO' });
  });

  it('recusa token alterado, assinado por outra chave ou sem assinatura', async () => {
    const { tokens } = await criarApp();
    const { token } = await tokens.emitir(usuario);
    const [cabecalho, corpo, assinatura] = token.split('.');
    const corpoAlterado = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(corpo ?? '', 'base64url').toString()),
        sub: 'u2',
      }),
    ).toString('base64url');
    const outraChave = (await generateKeyPair('ES256')).privateKey;
    const deOutraChave = await new SignJWT({ papel: 'usuario', sid: 's1' })
      .setProtectedHeader({ alg: 'ES256' })
      .setSubject('u1')
      .setIssuer('mony-api')
      .setAudience('mony')
      .setExpirationTime('10m')
      .sign(outraChave);
    const semAssinatura = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${corpo ?? ''}.`;

    for (const invalido of [
      `${cabecalho ?? ''}.${corpoAlterado}.${assinatura ?? ''}`,
      deOutraChave,
      semAssinatura,
      'nao-e-jwt',
    ]) {
      await expect(tokens.verificar(invalido)).rejects.toMatchObject({ codigo: 'NAO_AUTENTICADO' });
    }
  });
});

describe('guarda de autenticação', () => {
  it('rota protegida sem token → 401 NAO_AUTENTICADO', async () => {
    const { api } = await criarApp();
    const resposta = await api.inject({ method: 'GET', url: '/v1/teste-auth' });
    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toMatchObject({ erro: { codigo: 'NAO_AUTENTICADO' } });
  });

  it('token expirado → 401 TOKEN_EXPIRADO (o app renova e repete)', async () => {
    const { api, tokens, clock } = await criarApp();
    const { token } = await tokens.emitir(usuario);
    clock.avancar(16 * 60 * 1000);
    const resposta = await api.inject({
      method: 'GET',
      url: '/v1/teste-auth',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toMatchObject({ erro: { codigo: 'TOKEN_EXPIRADO' } });
  });

  it('token válido: o Contexto da rota sabe quem é o usuário', async () => {
    const { api, tokens } = await criarApp();
    const { token } = await tokens.emitir(usuario);
    const resposta = await api.inject({
      method: 'GET',
      url: '/v1/teste-auth',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({ usuarioId: 'u1', origem: 'app' });
  });

  it('rotas públicas seguem abertas', async () => {
    const { api } = await criarApp();
    expect((await api.inject({ method: 'GET', url: '/v1/health' })).statusCode).toBe(200);
  });

  it('sair de todos exige token', async () => {
    const { api } = await criarApp();
    const resposta = await api.inject({ method: 'POST', url: '/v1/auth/sair-todos' });
    expect(resposta.statusCode).toBe(401);
  });

  it('cadastro valida o corpo antes de tocar no banco', async () => {
    const { api } = await criarApp();
    const resposta = await api.inject({
      method: 'POST',
      url: '/v1/auth/cadastro',
      payload: { nome: 'Ana', email: 'ana@exemplo.com', senha: '123' },
    });
    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toMatchObject({ erro: { codigo: 'REQUISICAO_INVALIDA' } });
  });
});

describe('senhas (Argon2id)', () => {
  it('guarda só o hash Argon2id com 64 MB e 3 iterações, e confere', async () => {
    const hash = await gerarHashSenha('segredo123');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
    expect(hash).not.toContain('segredo123');
    await expect(conferirSenha(hash, 'segredo123')).resolves.toBe(true);
    await expect(conferirSenha(hash, 'segredo124')).resolves.toBe(false);
  });

  it('sem hash (e-mail inexistente ou só login social) responde falso', async () => {
    await expect(conferirSenha(null, 'qualquer')).resolves.toBe(false);
    await expect(conferirSenha('lixo', 'qualquer')).resolves.toBe(false);
  });
});

describe('sessões', () => {
  it('token de renovação tem 256 bits e o banco guarda só o resumo', () => {
    const { token, resumo } = gerarTokenRenovacao();
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(resumo).toBe(resumir(token));
    expect(resumo).toMatch(/^[0-9a-f]{64}$/);
    expect(gerarTokenRenovacao().token).not.toBe(token);
  });

  it('RN-006 teste grátis de 3 dias a partir do cadastro', () => {
    expect(somarDias(new Date(INSTANTE), 3).toISOString()).toBe('2026-10-12T12:00:00.000Z');
  });

  it('RN-007 aponta os documentos com versão nova a aceitar', () => {
    const vigentes = { termos: 't2', privacidade: 'p1' };
    expect(
      aceitesPendentes(
        [
          { documento: 'termos', versao: 't1' },
          { documento: 'privacidade', versao: 'p1' },
        ],
        vigentes,
      ),
    ).toEqual(['termos']);
    expect(
      aceitesPendentes(
        [
          { documento: 'termos', versao: 't1' },
          { documento: 'termos', versao: 't2' },
          { documento: 'privacidade', versao: 'p1' },
        ],
        vigentes,
      ),
    ).toEqual([]);
    expect(aceitesPendentes([])).toEqual(['termos', 'privacidade']);
    expect(
      aceitesPendentes([
        { documento: 'termos', versao: VERSOES_DOCUMENTOS.termos },
        { documento: 'privacidade', versao: VERSOES_DOCUMENTOS.privacidade },
      ]),
    ).toEqual([]);
  });
});

describe('limite de tentativas (RN-008)', () => {
  it('RN-008 passa do máximo na janela → MUITAS_TENTATIVAS com o fim da janela', async () => {
    const clock = new ClockFixo(INSTANTE);
    const limite = new LimiteTentativasMemoria(clock);
    const regras = [{ chave: 'login:email:x', maximo: 5 }];
    for (let i = 0; i < 5; i += 1) await limite.registrar(regras, 900);
    const erro = await limite.registrar(regras, 900).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroDominio);
    expect(erro).toMatchObject({
      codigo: 'MUITAS_TENTATIVAS',
      detalhes: { tenteNovamenteEm: '2026-10-09T12:15:00.000Z' },
    });
  });

  it('RN-008 a janela termina e a contagem recomeça; zerar libera na hora', async () => {
    const clock = new ClockFixo(INSTANTE);
    const limite = new LimiteTentativasMemoria(clock);
    const regras = [{ chave: 'login:ip:1.2.3.4', maximo: 2 }];
    await limite.registrar(regras, 900);
    await limite.registrar(regras, 900);
    await expect(limite.registrar(regras, 900)).rejects.toThrow();
    clock.avancar(900_000);
    await expect(limite.registrar(regras, 900)).resolves.toBeUndefined();
    await limite.registrar(regras, 900);
    await limite.zerar('login:ip:1.2.3.4');
    await expect(limite.registrar(regras, 900)).resolves.toBeUndefined();
  });
});
