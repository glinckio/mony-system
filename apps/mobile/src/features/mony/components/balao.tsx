import type { OpcaoBotao, ResumoLancamento } from '@mony/shared/mony';
import type { FaixaOrcamento } from '@mony/shared/orcamentos';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { Mensagem, TipoArquivo } from '@/features/mony/lib/mensagens';
import { useDataCurta } from '@/lib/datas-texto';
import {
  Card,
  Chip,
  type CorTexto,
  cores,
  Icone,
  type NomeIcone,
  juntarClasses,
  Texto,
  useTextoDoValor,
} from '@/ui';

const ICONE_ARQUIVO: Record<TipoArquivo, NomeIcone> = {
  audio: 'mic',
  foto: 'camera',
  pdf: 'paperclip',
};

/**
 * Uma mensagem do chat (doc 04): o balão (com o arquivo, quando há) e os componentes, botões e
 * cartões de resumo. Da Mony sem texto ainda, "escrevendo".
 */
export function Balao({
  mensagem,
  aoTocar,
}: {
  mensagem: Mensagem;
  aoTocar: (indice: number, opcao: OpcaoBotao) => void;
}) {
  const { t } = useTranslation();
  const minha = mensagem.autor === 'usuario';
  const semTexto = mensagem.texto === '' && !mensagem.erro && mensagem.arquivo === null;
  const escrevendo = !minha && semTexto && mensagem.componentes.length === 0;
  return (
    <View className={juntarClasses('gap-2', minha ? 'items-end' : 'items-start')}>
      {semTexto && !escrevendo ? null : (
        <View
          style={{ maxWidth: '85%' }}
          className={juntarClasses(
            'rounded-md px-4 py-3',
            minha && 'bg-balao-usuario',
            !minha && !mensagem.erro && 'bg-superficie-alta',
            mensagem.erro && 'bg-perigo-suave',
          )}
        >
          {mensagem.arquivo ? (
            <View className="flex-row items-center gap-1">
              <Icone
                nome={ICONE_ARQUIVO[mensagem.arquivo]}
                tamanho={14}
                cor={cores['texto-suave']}
              />
              <Texto variante="corpo-sm" cor="suave">
                {t(`mony.arquivo.${mensagem.arquivo}`)}
              </Texto>
            </View>
          ) : null}
          {mensagem.texto === '' && !escrevendo ? null : (
            <Texto
              cor={minha ? 'texto' : mensagem.erro ? 'perigo' : escrevendo ? 'suave' : 'texto'}
            >
              {escrevendo ? t('mony.escrevendo') : mensagem.texto}
            </Texto>
          )}
        </View>
      )}
      {mensagem.componentes.map((componente, indice) =>
        componente.tipo === 'resumo' ? (
          <CartaoResumo
            // Os componentes não guardam estado: o índice basta como chave.
            key={indice}
            lancamento={componente.lancamento}
            aConfirmar={componente.aConfirmar ?? false}
            opcoes={componente.opcoes}
            aoTocar={(opcao) => {
              aoTocar(indice, opcao);
            }}
          />
        ) : (
          <Opcoes
            key={indice}
            opcoes={componente.opcoes}
            aoTocar={(opcao) => {
              aoTocar(indice, opcao);
            }}
          />
        ),
      )}
    </View>
  );
}

function Opcoes({
  opcoes,
  aoTocar,
}: {
  opcoes: readonly OpcaoBotao[];
  aoTocar: (opcao: OpcaoBotao) => void;
}) {
  if (opcoes.length === 0) return null;
  return (
    <View className="flex-row flex-wrap gap-2">
      {opcoes.map((opcao) => (
        <Chip
          key={opcao.id}
          rotulo={opcao.rotulo}
          aoPressionar={() => {
            aoTocar(opcao);
          }}
        />
      ))}
    </View>
  );
}

const COR_DA_FAIXA: Record<FaixaOrcamento, CorTexto> = {
  normal: 'suave',
  atencao: 'atencao',
  estourado: 'perigo',
};

/**
 * O que a Mony gravou (RN-082): valor, descrição, categoria, data e forma, com o [Desfazer]. No lido
 * a confirmar, o aviso da API (T-149): parece já lançado, ou a parcela que vira o parcelamento.
 */
function CartaoResumo({
  lancamento,
  aConfirmar,
  opcoes,
  aoTocar,
}: {
  lancamento: ResumoLancamento;
  /** Lido de foto ou PDF e ainda não gravado (RN-083): o que falta aparece "a escolher". */
  aConfirmar: boolean;
  opcoes: readonly OpcaoBotao[];
  aoTocar: (opcao: OpcaoBotao) => void;
}) {
  const { t } = useTranslation();
  const textoDoValor = useTextoDoValor();
  const dataCurta = useDataCurta();
  const forma = lancamento.cartao
    ? lancamento.parcelas
      ? t('mony.resumo.cartaoParcelado', {
          cartao: lancamento.cartao,
          parcelas: String(lancamento.parcelas),
          valor: textoDoValor(lancamento.valorParcelaCentavos ?? 0),
        })
      : lancamento.cartao
    : lancamento.formaPagamento
      ? t(`transacoes.formas.${lancamento.formaPagamento}`)
      : aConfirmar && lancamento.tipo === 'despesa'
        ? t('mony.resumo.formaAEscolher')
        : null;
  const categoria =
    lancamento.categoria ?? (aConfirmar ? t('mony.resumo.categoriaAEscolher') : null);
  // RN-089: o impacto no orçamento e no cartão, na cor da faixa mais alta.
  const impacto = lancamento.impacto ?? null;
  const faixas = [impacto?.orcamento?.faixa, impacto?.cartao?.faixa];
  const faixa: FaixaOrcamento = faixas.includes('estourado')
    ? 'estourado'
    : faixas.includes('atencao')
      ? 'atencao'
      : 'normal';
  return (
    <Card className="gap-2" style={{ maxWidth: '85%' }} testID="mony-resumo">
      <Texto variante="corpo-sm" cor="suave">
        {aConfirmar
          ? t(
              lancamento.tipo === 'receita'
                ? 'mony.resumo.receitaAConfirmar'
                : 'mony.resumo.despesaAConfirmar',
            )
          : t(lancamento.tipo === 'receita' ? 'mony.resumo.receita' : 'mony.resumo.despesa')}
      </Texto>
      <Texto className="font-forte">
        {`${textoDoValor(lancamento.valorCentavos)} · ${lancamento.descricao}`}
      </Texto>
      <Texto variante="corpo-sm" cor="suave">
        {[categoria, dataCurta(lancamento.data), forma].filter(Boolean).join(' · ')}
      </Texto>
      {lancamento.aviso ? (
        <Texto variante="corpo-sm" cor="atencao" testID="mony-aviso">
          {lancamento.aviso}
        </Texto>
      ) : null}
      {impacto ? (
        <Texto variante="corpo-sm" cor={COR_DA_FAIXA[faixa]} testID="mony-impacto">
          {impacto.comentario}
        </Texto>
      ) : null}
      <Opcoes opcoes={opcoes} aoTocar={aoTocar} />
    </Card>
  );
}
