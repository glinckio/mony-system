import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { ErroVoz, type LigacaoIniciada, VozProvider } from './voz.provider';

/**
 * Ligação e SMS que não saem daqui: guarda o que foi pedido (testes) e, fora de produção, escreve no
 * log (o código do SMS também, para testar no app sem provedor). `falharProxima` faz o próximo
 * pedido falhar, para testar as novas tentativas.
 */
export class VozFake extends VozProvider {
  private readonly log = new Logger(VozFake.name);
  readonly ligacoes: { para: string; texto: string; id: string }[] = [];
  readonly sms: { para: string; texto: string }[] = [];
  private falhas = 0;

  constructor(readonly disponivel: boolean) {
    super();
  }

  ligar(para: string, texto: string): Promise<LigacaoIniciada> {
    this.conferir();
    const id = `fake-${randomUUID()}`;
    this.ligacoes.push({ para, texto, id });
    if (this.disponivel) this.log.log(`Ligação para ${para}: ${texto}`);
    return Promise.resolve({ id, situacao: 'enfileirada' });
  }

  enviarSms(para: string, texto: string): Promise<void> {
    this.conferir();
    this.sms.push({ para, texto });
    if (this.disponivel) this.log.log(`SMS para ${para}: ${texto}`);
    return Promise.resolve();
  }

  falharProxima(vezes = 1): void {
    this.falhas += vezes;
  }

  private conferir(): void {
    if (!this.disponivel) throw new ErroVoz('Provedor de voz falso em produção', true);
    if (this.falhas > 0) {
      this.falhas -= 1;
      throw new ErroVoz('Falha simulada do provedor de voz', false);
    }
  }
}
