import { describe, expect, it, vi } from 'vitest';
import { S3Client } from '@aws-sdk/client-s3';

import {
  ArmazenamentoMemoria,
  ArmazenamentoS3,
  INICIO_DA_EXTENSAO,
} from '../src/core/arquivos/armazenamento-arquivos';
import { tipoPelosBytes, tipoRealConferido } from '../src/core/arquivos/tipo-real';

const bytes = (...valores: (number | string)[]): Uint8Array =>
  Uint8Array.from(
    valores.flatMap((valor) =>
      typeof valor === 'string' ? [...new TextEncoder().encode(valor)] : [valor],
    ),
  );

describe('tipo real do arquivo pelos primeiros bytes (doc 11, T-144b)', () => {
  it('reconhece cada tipo aceito no envio', () => {
    expect(tipoPelosBytes(INICIO_DA_EXTENSAO.jpg)).toBe('image/jpeg');
    expect(tipoPelosBytes(INICIO_DA_EXTENSAO.png)).toBe('image/png');
    expect(tipoPelosBytes(INICIO_DA_EXTENSAO.webp)).toBe('image/webp');
    expect(tipoPelosBytes(INICIO_DA_EXTENSAO.heic)).toBe('image/heic');
    expect(tipoPelosBytes(bytes(0, 0, 0, 0x18, 'ftypmif1'))).toBe('image/heic');
    expect(tipoPelosBytes(INICIO_DA_EXTENSAO.pdf)).toBe('application/pdf');
    expect(tipoPelosBytes(INICIO_DA_EXTENSAO.m4a)).toBe('audio/mp4');
    expect(tipoPelosBytes(INICIO_DA_EXTENSAO.aac)).toBe('audio/aac');
    expect(tipoPelosBytes(INICIO_DA_EXTENSAO.mp3)).toBe('audio/mpeg');
    expect(tipoPelosBytes(bytes(0xff, 0xfb, 0x90, 0x64))).toBe('audio/mpeg');
    expect(tipoPelosBytes(INICIO_DA_EXTENSAO.webm)).toBe('audio/webm');
  });

  it('o que não é foto, PDF ou áudio não tem tipo', () => {
    expect(tipoPelosBytes(bytes(0x4d, 0x5a, 0x90, 0))).toBeNull(); // executável do Windows
    expect(tipoPelosBytes(bytes('PK', 3, 4))).toBeNull(); // ZIP
    expect(tipoPelosBytes(bytes('<svg xmlns'))).toBeNull();
    expect(tipoPelosBytes(bytes('<html>'))).toBeNull();
    expect(tipoPelosBytes(new Uint8Array())).toBeNull();
  });

  it('o declarado e o real ficam no mesmo grupo; PDF só com PDF', () => {
    expect(tipoRealConferido('image/jpeg', INICIO_DA_EXTENSAO.png)).toBe('image/png');
    expect(tipoRealConferido('audio/aac', INICIO_DA_EXTENSAO.m4a)).toBe('audio/mp4');
    expect(tipoRealConferido('image/jpeg', INICIO_DA_EXTENSAO.pdf)).toBeNull();
    expect(tipoRealConferido('application/pdf', INICIO_DA_EXTENSAO.jpg)).toBeNull();
    expect(tipoRealConferido('image/jpeg', INICIO_DA_EXTENSAO.m4a)).toBeNull();
    expect(tipoRealConferido('audio/mp4', INICIO_DA_EXTENSAO.heic)).toBeNull();
    expect(tipoRealConferido('image/png', bytes(0x4d, 0x5a))).toBeNull();
  });

  it('o S3 lê só o começo do arquivo, com Range', async () => {
    const cliente = new S3Client({
      region: 'sa-east-1',
      credentials: { accessKeyId: 'AKIATESTE', secretAccessKey: 'segredo-de-teste' },
    });
    const envio = vi.spyOn(cliente, 'send').mockResolvedValueOnce({
      Body: { transformToByteArray: () => Promise.resolve(INICIO_DA_EXTENSAO.pdf) },
    } as never);
    const s3 = new ArmazenamentoS3(cliente, 'mony-arquivos');
    expect(await s3.lerInicio('usuarios/u1/a.pdf', 64)).toEqual(INICIO_DA_EXTENSAO.pdf);
    const [comando] = envio.mock.calls[0] ?? [];
    expect(comando?.input).toMatchObject({ Key: 'usuarios/u1/a.pdf', Range: 'bytes=0-63' });
  });

  it('em memória, o arquivo começa como o da extensão, a menos que o teste diga outro', async () => {
    const memoria = new ArmazenamentoMemoria();
    memoria.simularEnvio('usuarios/u1/a.jpg', 10);
    expect(await memoria.lerInicio('usuarios/u1/a.jpg', 64)).toEqual(INICIO_DA_EXTENSAO.jpg);
    memoria.simularEnvio('usuarios/u1/b.jpg', 10, 'image/jpeg', bytes(0x4d, 0x5a));
    expect(await memoria.lerInicio('usuarios/u1/b.jpg', 1)).toEqual(bytes(0x4d));
  });
});
