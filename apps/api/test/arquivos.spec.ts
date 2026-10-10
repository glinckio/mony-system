import { NotFound, S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';

import {
  ArmazenamentoDesligado,
  ArmazenamentoS3,
  criarArmazenamento,
} from '../src/core/arquivos/armazenamento-arquivos';
import type { Configuracao } from '../src/core/config/configuracao';

const cliente = () =>
  new S3Client({
    region: 'sa-east-1',
    credentials: { accessKeyId: 'AKIATESTE', secretAccessKey: 'segredo-de-teste' },
  });

describe('armazenamento S3 (doc 11)', () => {
  it('URL de envio assinada com prazo e tipo de conteúdo; leitura com prazo próprio', async () => {
    const s3 = new ArmazenamentoS3(cliente(), 'mony-arquivos');
    const envio = new URL(await s3.urlDeEnvio('usuarios/u1/anexos/a.pdf', 'application/pdf', 300));
    expect(envio.hostname).toBe('mony-arquivos.s3.sa-east-1.amazonaws.com');
    expect(envio.pathname).toBe('/usuarios/u1/anexos/a.pdf');
    expect(envio.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(envio.searchParams.get('X-Amz-SignedHeaders')).toContain('content-type');

    const leitura = new URL(await s3.urlDeLeitura('usuarios/u1/anexos/a.pdf', 900));
    expect(leitura.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(leitura.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('arquivo que não chegou responde null; o tamanho vem do S3', async () => {
    const s3Cliente = cliente();
    const s3 = new ArmazenamentoS3(s3Cliente, 'mony-arquivos');
    const envio = vi.spyOn(s3Cliente, 'send');
    envio.mockRejectedValueOnce(new NotFound({ message: 'not found', $metadata: {} }));
    await expect(s3.consultar('usuarios/u1/x.jpg')).resolves.toBeNull();
    envio.mockResolvedValueOnce({ ContentLength: 1234, ContentType: 'image/jpeg' } as never);
    await expect(s3.consultar('usuarios/u1/x.jpg')).resolves.toEqual({
      tamanho: 1234,
      tipoConteudo: 'image/jpeg',
    });
  });

  it('sem bucket o envio de arquivos fica desligado (503)', async () => {
    const desligado = criarArmazenamento({ bucketArquivos: undefined } as Configuracao);
    expect(desligado).toBeInstanceOf(ArmazenamentoDesligado);
    await expect(desligado.urlDeEnvio('x', 'image/png', 60)).rejects.toMatchObject({
      codigo: 'SERVICO_INDISPONIVEL',
    });
  });

  it('com S3_ENDPOINT usa o S3 local por caminho', async () => {
    const local = criarArmazenamento({
      bucketArquivos: 'mony-local',
      enderecoS3: 'http://localhost:8333',
      regiaoAws: 'us-east-1',
    } as Configuracao);
    process.env.AWS_ACCESS_KEY_ID ??= 'mony-local';
    process.env.AWS_SECRET_ACCESS_KEY ??= 'mony-local-segredo';
    const url = new URL(await local.urlDeEnvio('usuarios/u1/a.png', 'image/png', 300));
    expect(`${url.origin}${url.pathname}`).toBe(
      'http://localhost:8333/mony-local/usuarios/u1/a.png',
    );
  });
});
