import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';

import { CAMPOS_ABERTOS, EMPRESA } from './campos';
import { type DocumentoLegal, lista, paragrafo, tabela } from './documento';

/** Termos de Uso, como o cliente entregou em 14/11/2026 (T-140g). */
export const TERMOS: DocumentoLegal = {
  titulo: 'Termos de Uso',
  versao: VERSOES_DOCUMENTOS.termos,
  secoes: [
    {
      titulo: '1. Aceitação',
      blocos: [
        paragrafo(
          'Estes Termos de Uso regem o uso do aplicativo Monitorizze. Ao criar uma conta e marcar o aceite, você concorda com estes Termos e com a Política de Privacidade. Guardamos a versão e a data do seu aceite.',
        ),
        paragrafo('Se não concordar, não use o app.'),
      ],
    },
    {
      titulo: '2. Quem somos',
      blocos: [
        paragrafo(
          `O Monitorizze é oferecido por ${EMPRESA.nome}, CNPJ ${EMPRESA.cnpj}, com sede na ${EMPRESA.endereco} ("Monitorizze", "nós"). Contato: ${EMPRESA.suporte}.`,
        ),
      ],
    },
    {
      titulo: '3. O que o app faz',
      blocos: [
        paragrafo(
          'O Monitorizze é um app de finanças pessoais para Android e iPhone, com uma assistente de inteligência artificial em formato de chat, a Mony. Com ele você pode:',
        ),
        lista(
          'registrar receitas e despesas, inclusive por texto, áudio, foto ou PDF enviados à Mony;',
          'controlar cartões de crédito, faturas, contas, orçamentos e metas;',
          'ler o QR Code do cupom fiscal (NFC-e) para criar despesas;',
          'criar listas de compras e compartilhá-las com outra pessoa que tenha conta;',
          'criar lembretes com notificação, alarme ou ligação telefônica;',
          'ver e criar compromissos da agenda do celular, do Google ou do Outlook;',
          'receber alertas de orçamento, fatura, metas e assinatura;',
          'ver relatórios e exportar seus dados.',
        ),
        paragrafo(
          'O app é para uso pessoal, por pessoas físicas. Cada conta tem uma única visão financeira. Não há perfil de empresa.',
        ),
        paragrafo(
          'O app não se conecta a bancos, não movimenta dinheiro e não faz pagamentos em seu nome. Saldos e lançamentos são informados por você. A conexão automática com bancos (Open Finance) poderá ser oferecida no futuro, com regras próprias.',
        ),
      ],
    },
    {
      titulo: '4. Quem pode usar',
      blocos: [
        paragrafo(
          'O app é destinado a pessoas com 18 anos ou mais. Ao criar a conta, você declara ter essa idade.',
        ),
        paragrafo(
          'Você deve informar dados verdadeiros e mantê-los atualizados. Cada pessoa pode ter uma conta.',
        ),
      ],
    },
    {
      titulo: '5. Conta e segurança',
      blocos: [
        paragrafo(
          'Você pode entrar com e-mail e senha ou com sua conta Google (e Apple, quando disponível). Também pode desbloquear o app com digital ou rosto. A biometria fica no seu celular: o app recebe só a confirmação do sistema.',
        ),
        paragrafo(
          'Você é responsável por guardar sua senha e pelo uso feito na sua conta. Se suspeitar de acesso indevido, troque a senha, use "Sair de todos os aparelhos" no Perfil e avise o suporte.',
        ),
      ],
    },
    {
      titulo: '6. Mony e inteligência artificial',
      blocos: [
        paragrafo(
          'A Mony informa e organiza. Ela não é consultoria financeira, de investimentos, contábil, fiscal ou jurídica, e não recomenda investimentos. As dicas são informativas. Decisões sobre seu dinheiro são suas.',
        ),
        paragrafo(
          'Como toda inteligência artificial, a Mony pode errar: interpretar mal uma mensagem, ler um valor errado ou sugerir a categoria errada. Por isso:',
        ),
        lista(
          'lançamentos lidos de foto, PDF ou cupom fiscal só são gravados depois da sua confirmação;',
          'excluir um lançamento pela Mony exige confirmação por botão;',
          'você pode desfazer um lançamento feito pela Mony em até 24 horas;',
          'confira seus lançamentos com frequência.',
        ),
        paragrafo(
          'A Mony só acessa os dados da sua própria conta, pelas mesmas regras do app. O tratamento das suas mensagens está descrito na Política de Privacidade.',
        ),
      ],
    },
    {
      titulo: '7. Dados que você insere',
      blocos: [
        paragrafo(
          'Você é responsável pela exatidão dos valores, datas, saldos e demais informações que registra. Os relatórios, alertas e respostas da Mony dependem desses dados.',
        ),
        paragrafo(
          'Não envie ao app dados de outras pessoas sem autorização, nem conteúdo ilegal. Nunca informe o número completo nem o código de segurança do seu cartão: o app não pede esses dados.',
        ),
      ],
    },
    {
      titulo: '8. Recursos que dependem de terceiros',
      blocos: [
        paragrafo(
          'Alguns recursos dependem de serviços de outras empresas, como a consulta do cupom fiscal na Sefaz, as agendas Google e Outlook, as ligações telefônicas e as notificações do celular. Se um desses serviços falhar ou mudar, o recurso pode ficar indisponível.',
        ),
        paragrafo(
          'O app pede permissões do celular (câmera, microfone, agenda, notificações, uso de apps) só quando você usa o recurso. Recusar uma permissão desliga só aquele recurso.',
        ),
        paragrafo(
          'O recurso "Apps de compra" avisa quando você abre um app de compras escolhido por você. O Monitorizze não vê o que você faz dentro desses apps.',
        ),
      ],
    },
    {
      titulo: '9. Listas compartilhadas',
      blocos: [
        paragrafo(
          'Você pode convidar para uma lista de compras outra pessoa que tenha conta no Monitorizze. A pessoa convidada vê e, conforme a permissão dada, edita os itens da lista. Compartilhe apenas o que quiser que ela veja.',
        ),
      ],
    },
    {
      titulo: '10. Planos e limites',
      blocos: [
        paragrafo(
          '**Teste grátis.** Ao criar a conta, você tem 3 dias com todos os recursos, sem cadastrar cartão. O teste vale uma vez por pessoa, controlado pelo e-mail, pela conta Google ou Apple e pelo aparelho. Avisamos no 2º e no último dia. Se você não assinar, a conta passa sozinha para o plano gratuito, sem cobrança.',
        ),
        paragrafo('**Plano gratuito.** Tem os limites abaixo. Os valores atuais aparecem no app.'),
        tabela(
          ['Recurso', 'Limite no gratuito'],
          ['Lançamentos (manuais e pela Mony)', '3 por dia e 30 por mês'],
          ['Mensagens para a Mony (texto e áudio)', '10 por dia'],
          ['Leitura de documentos (foto, PDF, cupom fiscal)', '3 por mês'],
          ['Cartões cadastrados', '1'],
          ['Listas de compras', '1'],
          ['Lembretes ativos', '5'],
          ['Relatórios', 'Mês atual, sem exportação'],
          ['Apps de compra e ligação de lembrete', 'Não disponíveis'],
        ),
        paragrafo(
          '**Planos mensal e anual.** Liberam todos os recursos assim que o pagamento é confirmado. A ligação de lembrete tem limite de 10 por mês.',
        ),
        paragrafo(
          '**Uso justo.** Em todos os planos, a Mony tem um limite diário de mensagens e de leituras de documentos por pessoa, para evitar abuso. Hoje são 200 mensagens e 30 leituras por dia.',
        ),
      ],
    },
    {
      titulo: '11. Pagamento e renovação',
      blocos: [
        paragrafo(
          'Os planos pagos são cobrados pela Stripe, por cartão ou Pix, numa página da própria Stripe. Os dados do cartão são digitados na Stripe e não passam pelo Monitorizze.',
        ),
        paragrafo(
          'A assinatura renova automaticamente ao fim de cada período (mês ou ano), pelo mesmo meio de pagamento, até que você cancele.',
        ),
        paragrafo(
          'Cupons de desconto, quando houver, dão desconto percentual na primeira cobrança.',
        ),
        paragrafo(
          'Se um pagamento for recusado, você recebe um alerta e a Stripe tenta cobrar de novo. Esgotadas as tentativas, a conta volta para o plano gratuito.',
        ),
      ],
    },
    {
      titulo: '12. Cancelamento',
      blocos: [
        paragrafo(
          'Você pode cancelar a qualquer momento pelo portal da Stripe, aberto no app. O cancelamento impede a próxima cobrança. O acesso pago continua até o fim do período já pago e, depois, a conta passa para o plano gratuito.',
        ),
        paragrafo(
          'Voltar para o gratuito não apaga nada. O histórico continua visível. Itens acima do limite, como um segundo cartão, continuam visíveis e editáveis, mas não é possível criar novos.',
        ),
      ],
    },
    {
      titulo: '13. Arrependimento e reembolso',
      blocos: [
        paragrafo(
          `Você pode desistir da primeira contratação de um plano pago em até 7 dias, conforme o art. 49 do Código de Defesa do Consumidor. O valor é devolvido integralmente, pelo mesmo meio de pagamento. Para pedir, escreva para ${EMPRESA.suporte}.`,
        ),
        paragrafo(
          'Fora desse prazo, não há reembolso de períodos já iniciados, salvo quando a lei exigir ou quando o serviço ficar indisponível por falha nossa.',
        ),
      ],
    },
    {
      titulo: '14. Mudanças de preço e de limites',
      blocos: [
        paragrafo(
          'Podemos mudar preços, planos e limites. Um preço novo vale para quem assinar depois da mudança. Quem já assina continua pagando o preço anterior enquanto a assinatura estiver ativa.',
        ),
        paragrafo(
          `Mudanças nos limites dos planos são avisadas no app com ${CAMPOS_ABERTOS.avisoMudancaLimitesDias} dias de antecedência.`,
        ),
      ],
    },
    {
      titulo: '15. Uso aceitável',
      blocos: [
        paragrafo('É proibido:'),
        lista(
          'criar mais de uma conta ou usar dados falsos para repetir o teste grátis;',
          'tentar acessar a conta ou os dados de outra pessoa;',
          'copiar, descompilar, modificar ou fazer engenharia reversa do app;',
          'usar robôs ou automações para acessar o app ou a Mony;',
          'sobrecarregar a Mony ou tentar contornar seus limites e regras;',
          'enviar conteúdo ilegal, ofensivo ou que viole direitos de terceiros;',
          'usar o app para fraude ou qualquer atividade ilegal;',
          'revender ou explorar comercialmente o app.',
        ),
      ],
    },
    {
      titulo: '16. Suspensão e bloqueio',
      blocos: [
        paragrafo(
          `Podemos suspender ou bloquear sua conta se houver violação destes Termos, indício de fraude, risco à segurança do app ou de outros usuários, ou ordem de autoridade. Quando possível, avisaremos o motivo antes. Você pode contestar pelo ${EMPRESA.suporte}.`,
        ),
      ],
    },
    {
      titulo: '17. Exclusão da conta',
      blocos: [
        paragrafo(
          'Você pode excluir sua conta em Perfil, Excluir conta, confirmando com a senha ou com um código enviado por e-mail. A exclusão fica agendada por 7 dias. Nesse prazo, basta entrar de novo e tocar em "Desistir" para cancelar.',
        ),
        paragrafo(
          'Depois de 7 dias, seus dados são apagados conforme a Política de Privacidade e a assinatura é cancelada na Stripe. Se quiser guardar uma cópia, use antes Perfil, Privacidade, Exportar meus dados.',
        ),
      ],
    },
    {
      titulo: '18. Propriedade intelectual',
      blocos: [
        paragrafo(
          `O app, a marca Monitorizze, a Mony, o design e os textos pertencem a ${EMPRESA.nome}. Você recebe uma licença pessoal, gratuita ou paga conforme o plano, não exclusiva e intransferível para usar o app enquanto tiver uma conta.`,
        ),
        paragrafo(
          'Seus dados são seus. Usamos esses dados apenas para prestar o serviço, conforme a Política de Privacidade.',
        ),
      ],
    },
    {
      titulo: '19. Disponibilidade',
      blocos: [
        paragrafo(
          'Trabalhamos para manter o app funcionando, mas podem ocorrer interrupções por manutenção, atualização ou falha de serviços de terceiros. Recomendamos exportar seus dados periodicamente.',
        ),
        paragrafo(
          'Podemos alterar, incluir ou retirar recursos do app. Se retirarmos um recurso pago essencial, avisaremos com antecedência.',
        ),
      ],
    },
    {
      titulo: '20. Limitação de responsabilidade',
      blocos: [
        paragrafo('O Monitorizze não responde por:'),
        lista(
          'decisões financeiras tomadas com base nas informações do app ou da Mony;',
          'erros em dados informados por você ou lançamentos confirmados sem conferência;',
          'falhas de serviços de terceiros, como Sefaz, Google, Microsoft, operadoras e lojas de aplicativos;',
          'uso da sua conta por quem tenha acesso à sua senha ou ao seu celular.',
        ),
        paragrafo(
          'Nada nestes Termos afasta direitos que o Código de Defesa do Consumidor garante a você.',
        ),
      ],
    },
    {
      titulo: '21. Alterações destes Termos',
      blocos: [
        paragrafo(
          'Podemos atualizar estes Termos. Avisaremos no app e por e-mail. Quando a mudança for relevante, o app pedirá um novo aceite no próximo acesso. Se não concordar, você pode excluir sua conta.',
        ),
      ],
    },
    {
      titulo: '22. Lei aplicável e foro',
      blocos: [
        paragrafo(
          'Estes Termos seguem a lei brasileira. Fica eleito o foro do domicílio do usuário.',
        ),
      ],
    },
    {
      titulo: '23. Contato',
      blocos: [
        paragrafo(`Dúvidas, pedidos e reclamações: ${EMPRESA.suporte}.`),
        paragrafo(
          `Versão ${VERSOES_DOCUMENTOS.termos}, vigente a partir de ${CAMPOS_ABERTOS.vigencia}.`,
        ),
      ],
    },
  ],
};
