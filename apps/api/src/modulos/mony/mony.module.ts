import { Module } from '@nestjs/common';

import { IaModule } from '../../integracoes/ia/ia.module';
import { AjudaModule } from '../ajuda/ajuda.module';
import { ArquivosModule } from '../arquivos/arquivos.module';
import { CartoesModule } from '../cartoes/cartoes.module';
import { CategoriasModule } from '../categorias/categorias.module';
import { LembretesModule } from '../lembretes/lembretes.module';
import { ListasModule } from '../listas/listas.module';
import { MetasModule } from '../metas/metas.module';
import { OrcamentosModule } from '../orcamentos/orcamentos.module';
import { ParcelamentosModule } from '../parcelamentos/parcelamentos.module';
import { PlanosModule } from '../planos/planos.module';
import { RelatoriosModule } from '../relatorios/relatorios.module';
import { TransacoesModule } from '../transacoes/transacoes.module';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { ConfigMonyService } from './config.service';
import { ConsultasNfceModule } from './consultas-nfce.module';
import { ConsultoriaMony } from './consultoria.service';
import { ContextoMonyService } from './contexto.service';
import { DocumentosMony } from './documentos.service';
import { AjudaAppTool } from './ferramentas/ajuda-app.tool';
import { AtualizarMetaTool } from './ferramentas/atualizar-meta.tool';
import { ConsultarCartaoTool } from './ferramentas/consultar-cartao.tool';
import { ConsultarLembretesTool } from './ferramentas/consultar-lembretes.tool';
import { ConsultarMetasTool } from './ferramentas/consultar-metas.tool';
import { ConsultarOrcamentosTool } from './ferramentas/consultar-orcamentos.tool';
import { ConsultarTransacoesTool } from './ferramentas/consultar-transacoes.tool';
import { CriarCategoriaTool } from './ferramentas/criar-categoria.tool';
import { CriarLembreteTool } from './ferramentas/criar-lembrete.tool';
import { CriarParcelamentoTool } from './ferramentas/criar-parcelamento.tool';
import { CriarTransacaoTool } from './ferramentas/criar-transacao.tool';
import { DefinirOrcamentoTool } from './ferramentas/definir-orcamento.tool';
import { EditarTransacaoTool } from './ferramentas/editar-transacao.tool';
import { ExcluirTransacaoTool } from './ferramentas/excluir-transacao.tool';
import { GerenciarListaComprasTool } from './ferramentas/gerenciar-lista-compras.tool';
import { ListarCartoesTool } from './ferramentas/listar-cartoes.tool';
import { ListarCategoriasTool } from './ferramentas/listar-categorias.tool';
import { PagarFaturaTool } from './ferramentas/pagar-fatura.tool';
import { ResumoPeriodoTool } from './ferramentas/resumo-periodo.tool';
import { FERRAMENTAS_MONY, type Ferramenta, RegistroFerramentas } from './ferramentas/registro';
import { MonyController } from './mony.controller';
import { LancamentosMony } from './lancamentos.service';
import { LimitesMonyService } from './limites.service';
import { ListasMony } from './listas.service';
import { MonyService } from './mony.service';
import { NfceMony } from './nfce.service';
import { MonyOrquestrador } from './orquestrador.service';
import { PreferenciasService } from './preferencias.service';
import { RascunhosModule } from './rascunhos.module';
import { RoteadorRegras } from './roteador-regras.service';

/**
 * Ferramentas que o modelo pode chamar: finanças (T-062a e T-062b), lembretes e ajuda (T-086a) e
 * listas de compras (T-123c).
 */
const FERRAMENTAS = [
  ListarCategoriasTool,
  ListarCartoesTool,
  CriarCategoriaTool,
  CriarTransacaoTool,
  CriarParcelamentoTool,
  EditarTransacaoTool,
  ExcluirTransacaoTool,
  ConsultarTransacoesTool,
  ResumoPeriodoTool,
  ConsultarCartaoTool,
  PagarFaturaTool,
  ConsultarOrcamentosTool,
  DefinirOrcamentoTool,
  ConsultarMetasTool,
  AtualizarMetaTool,
  CriarLembreteTool,
  ConsultarLembretesTool,
  GerenciarListaComprasTool,
  AjudaAppTool,
];

/**
 * Mony (doc 08): orquestrador (regras, modelo e ferramentas), rascunhos de lançamento, histórico
 * da conversa e `logs_ia`. A limpeza dos rascunhos vencidos roda no worker.
 * Ferramentas e contexto só chamam Services de outros módulos (doc 05).
 */
@Module({
  imports: [
    IaModule,
    AjudaModule,
    ArquivosModule,
    CartoesModule,
    CategoriasModule,
    MetasModule,
    OrcamentosModule,
    ParcelamentosModule,
    PlanosModule,
    RelatoriosModule,
    TransacoesModule,
    UsuariosModule,
    LembretesModule,
    ListasModule,
    RascunhosModule,
    ConsultasNfceModule,
  ],
  controllers: [MonyController],
  providers: [
    MonyOrquestrador,
    MonyService,
    RoteadorRegras,
    LancamentosMony,
    ListasMony,
    ConsultoriaMony,
    ConfigMonyService,
    LimitesMonyService,
    DocumentosMony,
    NfceMony,
    PreferenciasService,
    ContextoMonyService,
    RegistroFerramentas,
    ...FERRAMENTAS,
    {
      provide: FERRAMENTAS_MONY,
      inject: FERRAMENTAS,
      useFactory: (...ferramentas: Ferramenta[]) => ferramentas,
    },
  ],
  // O painel cria, avalia e ativa versões do prompt (T-141e) e muda os limites do dia (T-151).
  exports: [ConfigMonyService, LimitesMonyService],
})
export class MonyModule {}
