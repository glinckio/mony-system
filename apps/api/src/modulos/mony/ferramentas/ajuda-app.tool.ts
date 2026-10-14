import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { AjudaService } from '../../ajuda/ajuda.service';
import type { Ferramenta, SaidaFerramenta } from './registro';

const esquema = z.object({
  pergunta: z
    .string()
    .trim()
    .min(2)
    .max(300)
    .describe('A dúvida sobre como usar o app, com as palavras da pessoa.'),
});

/**
 * `ajuda_app` (doc 08): dúvida sobre como usar o app ("como exporto o relatório?"). Devolve os
 * tópicos da base de ajuda versionada (`AjudaService.buscar`); sem nenhum, a Mony diz que não sabe.
 */
@Injectable()
export class AjudaAppTool implements Ferramenta<typeof esquema> {
  readonly nome = 'ajuda_app';
  readonly descricao =
    'Busca na ajuda do app como fazer algo no Monitorizze (onde fica, como usar). Responda só com o que voltar; sem tópicos, diga que não sabe.';
  readonly esquema = esquema;

  constructor(private readonly ajuda: AjudaService) {}

  executar(_contexto: unknown, entrada: z.output<typeof esquema>): Promise<SaidaFerramenta> {
    return Promise.resolve({ dados: this.ajuda.buscar(entrada.pergunta) });
  }
}
