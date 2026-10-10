import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { UnrecoverableError, type Job } from 'bullmq';
import type { SendMailOptions, Transporter } from 'nodemailer';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import type { Configuracao } from '../src/core/config/configuracao';
import { EmailBrevo, URL_ENVIO_BREVO } from '../src/integracoes/email/email-brevo';
import { EmailFake } from '../src/integracoes/email/email-fake';
import { EmailSmtp } from '../src/integracoes/email/email-smtp';
import { criarProvedorEmail } from '../src/integracoes/email/email.module';
import {
  EmailProvider,
  ErroEnvioEmail,
  type MensagemEmail,
} from '../src/integracoes/email/email.provider';
import { emailCodigoRecuperacao } from '../src/integracoes/email/modelos/codigo-recuperacao';
import { escaparHtml, primeiroNome } from '../src/integracoes/email/modelos/layout';
import { ProcessadorEmails } from '../src/integracoes/email/processador-emails';
import {
  gerarCodigoRecuperacao,
  MAXIMO_TENTATIVAS_CODIGO,
  situacaoCodigo,
  somarMinutos,
  VALIDADE_CODIGO_MINUTOS,
} from '../src/modulos/autenticacao/dominio/codigos';
import { semServicosExternos } from './utilitarios';

const AGORA = new Date('2026-10-09T12:00:00Z');

describe('código de recuperação (RN-003)', () => {
  it('RN-003 tem sempre 6 dígitos, inclusive quando começa com zero', () => {
    const codigos = Array.from({ length: 2000 }, () => gerarCodigoRecuperacao());
    for (const codigo of codigos) expect(codigo).toMatch(/^\d{6}$/);
    expect(codigos.some((codigo) => codigo.startsWith('0'))).toBe(true);
    expect(new Set(codigos).size).toBeGreaterThan(1990);
  });

  it('RN-003 vale 15 minutos e até 5 tentativas erradas; usado não vale mais', () => {
    expect(VALIDADE_CODIGO_MINUTOS).toBe(15);
    expect(MAXIMO_TENTATIVAS_CODIGO).toBe(5);
    const expiraEm = somarMinutos(AGORA, VALIDADE_CODIGO_MINUTOS);
    expect(expiraEm.toISOString()).toBe('2026-10-09T12:15:00.000Z');

    const codigo = { usado: false, expiraEm, tentativas: 0 };
    expect(situacaoCodigo(codigo, AGORA)).toBe('vigente');
    expect(situacaoCodigo(codigo, somarMinutos(AGORA, 14.99))).toBe('vigente');
    expect(situacaoCodigo(codigo, expiraEm)).toBe('expirado');
    expect(situacaoCodigo({ ...codigo, tentativas: 4 }, AGORA)).toBe('vigente');
    expect(situacaoCodigo({ ...codigo, tentativas: 5 }, AGORA)).toBe('expirado');
    expect(situacaoCodigo({ ...codigo, usado: true }, AGORA)).toBe('expirado');
  });
});

describe('e-mail do código', () => {
  it('RN-003 leva o código no texto e no HTML, sem o código no assunto', () => {
    const mensagem = emailCodigoRecuperacao({
      nome: 'Ana Souza',
      email: 'ana@exemplo.com',
      codigo: '004217',
      validadeMinutos: 15,
    });
    expect(mensagem).toMatchObject({
      para: { email: 'ana@exemplo.com', nome: 'Ana Souza' },
      modelo: 'codigo-recuperacao',
    });
    expect(mensagem.assunto).not.toContain('004217');
    expect(mensagem.texto).toContain('Olá, Ana!');
    expect(mensagem.texto).toContain('004217');
    expect(mensagem.texto).toContain('15 minutos');
    expect(mensagem.html).toContain('004217');
    expect(mensagem.html).toContain('lang="pt-BR"');
  });

  it('escapa o nome do usuário no HTML', () => {
    const mensagem = emailCodigoRecuperacao({
      nome: '<script>alert(1)</script> & cia',
      email: 'x@exemplo.com',
      codigo: '123456',
      validadeMinutos: 15,
    });
    expect(mensagem.html).not.toContain('<script>');
    expect(mensagem.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(escaparHtml(`"a" & 'b'`)).toBe('&quot;a&quot; &amp; &#39;b&#39;');
    expect(primeiroNome('  Ana   Maria ')).toBe('Ana');
    expect(primeiroNome('')).toBe('');
  });
});

const mensagem: MensagemEmail = {
  para: { email: 'ana@exemplo.com', nome: 'Ana' },
  assunto: 'Assunto',
  html: '<p>Oi</p>',
  texto: 'Oi',
  modelo: 'codigo-recuperacao',
};

function respostaFalsa(status: number, corpo = '') {
  return Promise.resolve(new Response(corpo, { status }));
}

describe('EmailBrevo', () => {
  it('envia remetente, destinatário, assunto, HTML, texto e etiqueta com a chave no cabeçalho', async () => {
    const buscar = vi.fn<typeof fetch>(() => respostaFalsa(201, '{"messageId":"<1@brevo>"}'));
    const brevo = new EmailBrevo(
      'xkeysib-teste',
      { email: 'nao-responda@exemplo.com', nome: 'Monitorizze' },
      buscar,
    );
    await brevo.enviar(mensagem);

    expect(buscar).toHaveBeenCalledOnce();
    const [url, init] = buscar.mock.calls[0] ?? [];
    expect(url).toBe(URL_ENVIO_BREVO);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ 'api-key': 'xkeysib-teste' });
    expect(JSON.parse(init?.body as string)).toEqual({
      sender: { email: 'nao-responda@exemplo.com', name: 'Monitorizze' },
      to: [{ email: 'ana@exemplo.com', name: 'Ana' }],
      subject: 'Assunto',
      htmlContent: '<p>Oi</p>',
      textContent: 'Oi',
      tags: ['codigo-recuperacao'],
    });
  });

  it('erro 4xx é permanente; 429, 5xx e falha de rede a fila tenta de novo', async () => {
    const remetente = { email: 'nao-responda@exemplo.com', nome: 'Monitorizze' };
    const casos: [() => Promise<Response>, boolean][] = [
      [() => respostaFalsa(400, '{"code":"invalid_parameter"}'), true],
      [() => respostaFalsa(401, '{"code":"unauthorized"}'), true],
      [() => respostaFalsa(429), false],
      [() => respostaFalsa(503), false],
      [() => Promise.reject(new TypeError('fetch failed')), false],
    ];
    for (const [resposta, permanente] of casos) {
      const erro = await new EmailBrevo('chave', remetente, resposta)
        .enviar(mensagem)
        .catch((e: unknown) => e);
      expect(erro).toBeInstanceOf(ErroEnvioEmail);
      expect(erro).toMatchObject({ permanente });
    }
  });
});

describe('EmailSmtp', () => {
  function transporteFalso(sendMail: (opcoes: SendMailOptions) => Promise<unknown>) {
    return { sendMail: vi.fn(sendMail) };
  }
  const remetente = { email: 'nao-responda@mony.local', nome: 'Monitorizze' };

  it('manda remetente, destinatário, assunto, HTML, texto e a etiqueta do Mailpit', async () => {
    const transporte = transporteFalso(() => Promise.resolve({ messageId: '1' }));
    await new EmailSmtp(
      'smtp://localhost:1025',
      remetente,
      transporte as unknown as Transporter,
    ).enviar(mensagem);
    expect(transporte.sendMail).toHaveBeenCalledWith({
      from: { address: 'nao-responda@mony.local', name: 'Monitorizze' },
      to: { address: 'ana@exemplo.com', name: 'Ana' },
      subject: 'Assunto',
      html: '<p>Oi</p>',
      text: 'Oi',
      headers: { 'X-Tags': 'codigo-recuperacao' },
    });
  });

  it('resposta 5xx do servidor é permanente; conexão recusada a fila tenta de novo', async () => {
    const casos: [Error, boolean][] = [
      [Object.assign(new Error('550 mailbox unavailable'), { responseCode: 550 }), true],
      [Object.assign(new Error('421 try later'), { responseCode: 421 }), false],
      [new Error('connect ECONNREFUSED 127.0.0.1:1025'), false],
    ];
    for (const [falha, permanente] of casos) {
      const transporte = transporteFalso(() => Promise.reject(falha));
      const erro = await new EmailSmtp('smtp://x', remetente, transporte as unknown as Transporter)
        .enviar(mensagem)
        .catch((e: unknown) => e);
      expect(erro).toMatchObject({ name: 'ErroEnvioEmail', permanente });
    }
  });
});

describe('fila de e-mails', () => {
  function processador(enviar: (m: MensagemEmail) => Promise<void>) {
    return new ProcessadorEmails({ enviar } satisfies EmailProvider);
  }
  const job = { name: 'codigo-recuperacao', data: mensagem } as Job<MensagemEmail>;

  it('o worker entrega a mensagem do job ao provedor', async () => {
    const fake = new EmailFake(false);
    await new ProcessadorEmails(fake).process(job);
    expect(fake.enviados).toEqual([mensagem]);
  });

  it('erro permanente não gasta as outras tentativas; temporário volta para a fila', async () => {
    await expect(
      processador(() => Promise.reject(new ErroEnvioEmail('400', true))).process(job),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    const temporario = new ErroEnvioEmail('503', false);
    await expect(processador(() => Promise.reject(temporario)).process(job)).rejects.toBe(
      temporario,
    );
  });

  it('EMAIL_PROVEDOR escolhe o Brevo ou o fake', () => {
    const config = (valores: Partial<Configuracao>) => valores as Configuracao;
    expect(
      criarProvedorEmail(
        config({
          provedorEmail: 'brevo',
          chaveApiBrevo: 'xkeysib-1',
          remetenteEmail: 'nao-responda@exemplo.com',
        }),
      ),
    ).toBeInstanceOf(EmailBrevo);
    expect(
      criarProvedorEmail(config({ provedorEmail: 'smtp', urlSmtp: 'smtp://localhost:1025' })),
    ).toBeInstanceOf(EmailSmtp);
    expect(() => criarProvedorEmail(config({ provedorEmail: 'smtp' }))).toThrow(/SMTP_URL/);
    expect(criarProvedorEmail(config({ provedorEmail: 'fake', ehProducao: false }))).toBeInstanceOf(
      EmailFake,
    );
    expect(criarProvedorEmail(config({ provedorEmail: 'fake', ehProducao: true }))).toBeInstanceOf(
      EmailFake,
    );
    expect(() => criarProvedorEmail(config({ provedorEmail: 'brevo' }))).toThrow(/BREVO_CHAVE_API/);
  });
});

describe('rotas de recuperação', () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('são públicas e validam o corpo antes de tocar no banco', async () => {
    const modulo = await semServicosExternos(
      Test.createTestingModule({ imports: [AppModule] }),
    ).compile();
    app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const pedidos = [
      { url: '/v1/auth/senha/codigo', payload: { email: 'nao-e-email' } },
      { url: '/v1/auth/senha/conferir', payload: { email: 'ana@exemplo.com', codigo: '12345' } },
      {
        url: '/v1/auth/senha/redefinir',
        payload: { email: 'ana@exemplo.com', codigo: '123456', senha: 'curta' },
      },
    ];
    for (const { url, payload } of pedidos) {
      const resposta = await app.inject({ method: 'POST', url, payload });
      expect(resposta.statusCode).toBe(400);
      expect(resposta.json()).toMatchObject({ erro: { codigo: 'REQUISICAO_INVALIDA' } });
    }
  });
});
