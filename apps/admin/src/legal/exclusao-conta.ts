import { CAMPOS_ABERTOS, EMPRESA } from './campos';
import { type DocumentoLegal, lista, paragrafo, tabela } from './documento';

/**
 * Como excluir a conta (T-146b): a página pública que o Google Play pede na Segurança dos dados, com
 * o caminho no app, o pedido sem o app e o que é apagado e o que fica (RN-161, doc 11).
 */
export const EXCLUSAO_CONTA: DocumentoLegal = {
  titulo: 'Excluir sua conta do Monitorizze',
  secoes: [
    {
      titulo: 'Pelo app',
      blocos: [
        paragrafo(
          `O Monitorizze é oferecido por ${EMPRESA.nome}. Para excluir sua conta e seus dados:`,
        ),
        lista(
          'Abra o app e entre na sua conta.',
          'Toque em **Mais** e depois em **Perfil**.',
          'Toque em **Excluir conta** e confirme com a sua senha ou com o código que enviamos por e-mail.',
        ),
        paragrafo(
          'A conta é excluída em 7 dias. Saímos da conta em todos os aparelhos na hora. Se mudar de ideia dentro desse prazo, é só entrar de novo e tocar em **Desistir da exclusão**.',
        ),
      ],
    },
    {
      titulo: 'Sem o app',
      blocos: [
        paragrafo(
          `Se você não tem mais o app instalado, mande um e-mail para ${EMPRESA.suporte} a partir do e-mail cadastrado na conta, com o assunto "Excluir minha conta". Confirmamos o pedido por e-mail e excluímos a conta com o mesmo prazo de 7 dias.`,
        ),
      ],
    },
    {
      titulo: 'O que é apagado e o que fica',
      blocos: [
        tabela(
          ['Dados', 'O que acontece'],
          ['Nome, e-mail, telefone, senha e foto', 'Apagados (a conta fica anônima)'],
          [
            'Lançamentos, cartões, contas, orçamentos, metas, listas de compras e lembretes',
            'Apagados',
          ],
          ['Conversas com a Mony, fotos, PDFs, comprovantes e áudios', 'Apagados'],
          ['Agendas do Google e do Outlook conectadas', 'Desligadas, e o acesso é revogado'],
          ['Assinatura', 'Cancelada, sem novas cobranças'],
          [
            'Histórico de cobrança da assinatura',
            `Guardado por ${CAMPOS_ABERTOS.guardaCobrancaAnos} anos, por obrigação fiscal`,
          ],
          [
            'Prova dos aceites dos termos e consentimentos, e métricas de uso sem texto',
            'Guardadas sem nenhum dado que identifique você',
          ],
        ),
        paragrafo(
          `Dúvidas sobre seus dados: ${EMPRESA.encarregado}, encarregado de dados, em ${EMPRESA.emailEncarregado}. Mais detalhes na Política de Privacidade.`,
        ),
      ],
    },
  ],
};
