import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';

import { CAMPOS_ABERTOS, EMPRESA } from './campos';
import { type DocumentoLegal, lista, paragrafo, tabela } from './documento';

/** Política de Privacidade, como o cliente entregou em 14/11/2026 (T-140g). */
export const PRIVACIDADE: DocumentoLegal = {
  titulo: 'Política de Privacidade',
  versao: VERSOES_DOCUMENTOS.privacidade,
  secoes: [
    {
      titulo: '1. Quem somos',
      blocos: [
        paragrafo(
          'Esta Política explica como o app Monitorizze trata seus dados pessoais, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018, LGPD).',
        ),
        paragrafo(
          `O controlador dos dados é ${EMPRESA.nome}, CNPJ ${EMPRESA.cnpj}, com sede na ${EMPRESA.endereco}. O encarregado pelo tratamento de dados (DPO) é ${EMPRESA.encarregado}, contato ${EMPRESA.emailEncarregado}.`,
        ),
      ],
    },
    {
      titulo: '2. Resumo',
      blocos: [
        lista(
          'Coletamos o necessário para o app funcionar: cadastro, dados financeiros que você registra e conversas com a Mony.',
          'Não pedimos CPF, endereço, documentos, senhas de banco, localização, contatos nem SMS.',
          'Não vendemos seus dados.',
          'Os servidores ficam no Brasil (AWS, São Paulo). Alguns prestadores ficam no exterior.',
          'Você pode exportar seus dados, corrigi-los, revogar consentimentos e excluir a conta pelo próprio app.',
        ),
      ],
    },
    {
      titulo: '3. Dados que coletamos',
      blocos: [
        tabela(
          ['Categoria', 'Dados', 'De onde vêm'],
          ['Cadastro', 'Nome, e-mail, telefone, foto de perfil (opcional), fuso horário', 'Você'],
          [
            'Credenciais',
            'Resumo criptográfico da senha (a senha não é guardada), conta Google ou Apple vinculada',
            'Você',
          ],
          [
            'Aparelho e sessão',
            'Modelo do aparelho, sistema, identificador do aparelho, token de notificações, sessões ativas, dias de acesso',
            'O app',
          ],
          [
            'Controle do teste grátis',
            'Resumo criptográfico do e-mail, da conta Google ou Apple e do aparelho',
            'O app',
          ],
          [
            'Dados financeiros',
            'Lançamentos, valores, categorias, contas e saldos, faturas, orçamentos, metas, parcelamentos, cartões (nome, bandeira, limite e, se quiser, os 4 últimos dígitos)',
            'Você, no app ou pela Mony',
          ],
          [
            'Comprovantes',
            'Fotos e PDFs de comprovantes e faturas; dados do cupom fiscal (loja, itens, valores, chave da nota)',
            'Você',
          ],
          [
            'Conversas com a Mony',
            'Mensagens, áudios e suas transcrições, hábitos aprendidos (ex.: "cinema, Lazer, Pix")',
            'Você',
          ],
          [
            'Agenda',
            'Compromissos (título, data, local), e-mail da conta Google ou Outlook conectada, chaves de acesso à agenda (criptografadas)',
            'Google, Microsoft e o celular, com sua autorização',
          ],
          [
            'Apps de compra',
            'Quais apps da lista escolhida por você foram abertos e quando',
            'O celular, com sua autorização',
          ],
          [
            'Lembretes e ligações',
            'Texto e horário dos lembretes, telefone verificado, registro das ligações',
            'Você',
          ],
          [
            'Listas compartilhadas',
            'Itens, nome e e-mail de quem foi convidado e a permissão dada',
            'Você',
          ],
          [
            'Assinatura',
            'Plano, datas, situação da cobrança, identificador de cliente na Stripe',
            'Você e a Stripe',
          ],
          [
            'Aceites e consentimentos',
            'Versão e data dos termos e da política aceitos, consentimentos dados e revogados',
            'Você',
          ],
          [
            'Registros técnicos',
            'Erros do app e do servidor, IP nas tentativas de login, dados de uso da IA (modelo, volume, duração, sem o texto)',
            'O app e o servidor',
          ],
        ),
        paragrafo(
          '**O que não coletamos.** CPF, endereço, documentos de identidade, senhas ou dados de acesso a bancos, número completo ou código de segurança do cartão, localização, contatos e SMS. A biometria fica no seu celular: o app recebe só "confirmado" ou "não confirmado". O app não usa ferramentas de análise de comportamento (analytics) nem publicidade.',
        ),
      ],
    },
    {
      titulo: '4. Para que usamos e com qual base legal',
      blocos: [
        tabela(
          ['Finalidade', 'Base legal (LGPD, art. 7º)'],
          [
            'Criar e manter sua conta, fazer login, enviar alertas no horário certo',
            'Execução de contrato (V)',
          ],
          [
            'Registrar e organizar suas finanças, ler comprovantes e cupons, gerar relatórios',
            'Execução de contrato (V)',
          ],
          [
            'Responder e registrar lançamentos pela Mony, sugerir categorias',
            'Execução de contrato (V)',
          ],
          ['Lembretes, notificações e listas compartilhadas', 'Execução de contrato (V)'],
          ['Cobrar a assinatura', 'Execução de contrato (V)'],
          [
            'Conectar a agenda, avisar ao abrir apps de compra, ligar para lembrar',
            'Consentimento (I)',
          ],
          [
            'Guardar a prova dos aceites e consentimentos',
            'Obrigação legal (II) e legítimo interesse (IX)',
          ],
          [
            'Segurança, prevenção a fraude, correção de erros, controle de custo da IA',
            'Legítimo interesse (IX)',
          ],
          ['Impedir uso repetido do teste grátis', 'Legítimo interesse (IX)'],
          ['Manter registros de cobrança', 'Obrigação legal (II)'],
        ),
        paragrafo(
          'Você pode revogar os consentimentos a qualquer momento em Perfil, Permissões. Revogar desliga o recurso e apaga os dados dele.',
        ),
      ],
    },
    {
      titulo: '5. Permissões do celular',
      blocos: [
        paragrafo(
          'Cada permissão é pedida só quando você usa o recurso, com uma tela explicando antes. Recusar não impede o uso do resto do app.',
        ),
        tabela(
          ['Permissão', 'Para quê'],
          ['Câmera', 'Fotografar comprovantes e ler o QR Code do cupom fiscal'],
          ['Fotos e arquivos', 'Anexar uma foto ou PDF já salvo'],
          ['Microfone', 'Mandar áudio para a Mony'],
          ['Notificações', 'Alertas, lembretes e respostas da Mony'],
          ['Alarmes exatos e tela cheia (Android)', 'Tocar o alarme do lembrete na hora certa'],
          ['Agenda do celular', 'Mostrar seus compromissos no app (só leitura)'],
          [
            'Acesso ao uso de apps (Android) ou Tempo de Uso (iPhone)',
            'Saber quando um app de compras escolhido por você foi aberto',
          ],
          ['Digital ou reconhecimento facial', 'Desbloquear o app sem senha'],
        ),
      ],
    },
    {
      titulo: '6. Mony e inteligência artificial',
      blocos: [
        paragrafo(
          'A Mony usa o modelo Claude, da empresa americana Anthropic, para entender suas mensagens e responder. Os áudios são transcritos por um serviço de transcrição antes de chegar ao modelo.',
        ),
        paragrafo('**O que vai ao modelo a cada mensagem:**'),
        lista(
          'sua mensagem (ou a transcrição do áudio) e até 20 mensagens anteriores da conversa;',
          'seu nome, a data e a hora no seu fuso;',
          'suas categorias, cartões, orçamentos do mês, plano e consumo dos limites;',
          'seus hábitos mais usados e o lançamento em andamento, se houver;',
          'a foto ou o PDF enviado, por um link temporário, para leitura dos valores.',
        ),
        paragrafo('**O que nunca vai ao modelo:** e-mail, telefone, senha e chaves de acesso.'),
        paragrafo(
          '**Treino de modelos.** Seus dados não são usados para treinar modelos de inteligência artificial, nossos ou do provedor.',
        ),
        paragrafo(
          '**O que guardamos.** As mensagens e os áudios ficam na sua conta. De cada chamada ao modelo, guardamos só dados técnicos (modelo, volume de texto, duração, erro), sem o conteúdo.',
        ),
        paragrafo(
          '**Decisões automatizadas.** A Mony sugere categorias e interpreta lançamentos de forma automatizada. Lançamentos lidos de foto, PDF ou cupom só são gravados depois da sua confirmação, e você pode corrigir qualquer lançamento. Você pode pedir a revisão de uma decisão automatizada ao encarregado (LGPD, art. 20).',
        ),
      ],
    },
    {
      titulo: '7. Com quem compartilhamos',
      blocos: [
        paragrafo(
          'Não vendemos seus dados. Compartilhamos só o necessário com empresas que prestam serviços para o app (operadores), cada uma limitada à sua função.',
        ),
        tabela(
          ['Empresa', 'Para quê', 'Dados que recebe', 'País'],
          [
            'Amazon Web Services (AWS)',
            'Servidores, banco de dados e arquivos',
            'Todos os dados do app',
            'Brasil',
          ],
          [
            'Anthropic',
            'Inteligência artificial da Mony',
            'O descrito no item 6',
            'Estados Unidos',
          ],
          [
            'Serviço de transcrição de áudio',
            'Transformar áudio em texto',
            'Áudios enviados à Mony',
            'Estados Unidos',
          ],
          [
            'Stripe',
            'Cobrança dos planos',
            'Nome, e-mail, dados de pagamento digitados na Stripe',
            'Estados Unidos e outros',
          ],
          [
            'Google',
            'Login com Google e agenda Google, se conectada',
            'E-mail, nome, compromissos',
            'Estados Unidos e outros',
          ],
          [
            'Apple',
            'Login com Apple e notificações no iPhone',
            'E-mail (pode ser oculto), token do aparelho',
            'Estados Unidos',
          ],
          [
            'Microsoft',
            'Agenda Outlook, se conectada',
            'Compromissos e e-mail da conta',
            'Estados Unidos e outros',
          ],
          [
            'Expo (650 Industries)',
            'Envio de notificações e atualizações do app',
            'Token do aparelho, texto da notificação',
            'Estados Unidos',
          ],
          [
            'Google Firebase',
            'Entrega de notificações no Android',
            'Token do aparelho, texto da notificação',
            'Estados Unidos e outros',
          ],
          [
            'Brevo',
            'E-mails do app (códigos, exportação de dados)',
            'Nome, e-mail, conteúdo do e-mail',
            'França',
          ],
          [
            'Serviço de consulta de NFC-e',
            'Consultar o cupom fiscal na Sefaz',
            'Só a chave de acesso da nota',
            'Brasil',
          ],
          [
            'Serviço de telefonia',
            'Ligação de lembrete e SMS de verificação',
            'Telefone e texto do lembrete',
            CAMPOS_ABERTOS.paisTelefonia,
          ],
          [
            'Serviço de registro de erros',
            'Corrigir falhas do app e do servidor',
            'Dados técnicos do erro, aparelho, identificador da conta',
            'Estados Unidos',
          ],
        ),
        paragrafo('Também podemos compartilhar dados:'),
        lista(
          'com as pessoas que você convidar para uma lista de compras, limitado aos itens da lista;',
          'com autoridades, quando a lei ou uma ordem judicial exigir;',
          'para defender nossos direitos em processo judicial, administrativo ou arbitral.',
        ),
      ],
    },
    {
      titulo: '8. Transferência internacional',
      blocos: [
        paragrafo(
          'Vários prestadores ficam fora do Brasil, como indicado na tabela acima. Essas transferências seguem o art. 33 da LGPD e são feitas com cláusulas-padrão contratuais aprovadas pela ANPD (Resolução CD/ANPD nº 19/2024) ou outro mecanismo previsto em lei. Você pode pedir ao encarregado informações sobre essas garantias.',
        ),
      ],
    },
    {
      titulo: '9. Por quanto tempo guardamos',
      blocos: [
        tabela(
          ['Dado', 'Prazo'],
          [
            'Fotos, PDFs, comprovantes e áudios',
            '90 dias após o envio (o lançamento continua, só o arquivo é apagado)',
          ],
          ['Lançamento em andamento na Mony', '24 horas sem resposta'],
          ['Código de recuperação de senha', '15 minutos, uso único'],
          ['Sessão de login no aparelho', '60 dias sem uso'],
          ['Link de exportação dos dados', '24 horas'],
          ['Conversas com a Mony, lançamentos e demais dados', 'Enquanto a conta existir'],
          ['Conta excluída', 'Apagada 7 dias após o pedido'],
        ),
        paragrafo(
          `Depois da exclusão, a conta é anonimizada: sem nome, e-mail, telefone, senha ou foto. Ficam apenas o histórico de cobrança da assinatura, por ${CAMPOS_ABERTOS.guardaCobrancaAnos} anos para cumprir obrigações fiscais, métricas de uso sem texto, o registro de auditoria do painel e a prova dos aceites e consentimentos. A assinatura é cancelada na Stripe e as agendas conectadas são desligadas.`,
        ),
      ],
    },
    {
      titulo: '10. Segurança',
      blocos: [
        lista(
          'Senhas guardadas só como resumo criptográfico forte (Argon2id).',
          'Comunicação sempre criptografada (HTTPS).',
          'Chaves de acesso às agendas guardadas criptografadas.',
          'Arquivos em armazenamento privado, acessados só por links temporários de 5 a 15 minutos.',
          'Login com tokens de curta duração e opção "Sair de todos os aparelhos".',
          'Limite de tentativas de login e de código.',
          'Registros do servidor sem senhas, tokens ou números de cartão.',
          'Backup do banco de dados.',
          'No celular, o login fica no cofre seguro do sistema (Keychain ou Keystore).',
        ),
        paragrafo(
          'Se ocorrer um incidente de segurança com risco relevante, avisaremos você e a ANPD, conforme a LGPD.',
        ),
      ],
    },
    {
      titulo: '11. Seus direitos',
      blocos: [
        tabela(
          ['Direito', 'Como exercer'],
          [
            'Acesso e portabilidade',
            'Perfil, Privacidade, Exportar meus dados: arquivo ZIP (JSON e Excel), com link válido por 24 horas, enviado no app e por e-mail',
          ],
          ['Correção', 'Edite nome, telefone, foto, lançamentos, cartões e listas no próprio app'],
          ['Eliminação', 'Perfil, Excluir conta, com 7 dias para desistir'],
          ['Revogação do consentimento', 'Perfil, Permissões: agenda, apps de compra e ligações'],
          [
            'Oposição, informação sobre compartilhamento, revisão de decisão automatizada e demais pedidos',
            `E-mail ao encarregado: ${EMPRESA.emailEncarregado}`,
          ],
        ),
        paragrafo(
          'Respondemos aos pedidos em até 15 dias. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).',
        ),
      ],
    },
    {
      titulo: '12. Menores de idade',
      blocos: [
        paragrafo(
          'O app é destinado a pessoas com 18 anos ou mais. Se soubermos que uma conta pertence a um menor, ela será excluída.',
        ),
      ],
    },
    {
      titulo: '13. Acesso da nossa equipe',
      blocos: [
        paragrafo(
          'O painel interno é usado só pela equipe, com senha e verificação em duas etapas. A equipe vê dados de cadastro, plano, aparelhos e sessões, mas não vê seus lançamentos nem suas conversas.',
        ),
        paragrafo(
          'A exceção é uma mensagem que causou erro na Mony: até 500 caracteres dela ficam visíveis para correção. Todo acesso a dados de usuário fica registrado em auditoria que não pode ser editada nem apagada.',
        ),
      ],
    },
    {
      titulo: '14. Notificações e e-mails',
      blocos: [
        paragrafo(
          'Enviamos notificações e e-mails sobre sua conta, segurança, alertas, teste e assinatura. Avisos de novidades do app podem ser desligados nas preferências de notificação, que também têm horário de silêncio.',
        ),
      ],
    },
    {
      titulo: '15. Alterações desta Política',
      blocos: [
        paragrafo(
          'Podemos atualizar esta Política. Avisaremos no app e por e-mail. Quando a mudança for relevante, o app pedirá um novo aceite no próximo acesso.',
        ),
      ],
    },
    {
      titulo: '16. Contato',
      blocos: [
        paragrafo(`Privacidade: ${EMPRESA.emailEncarregado}. Suporte geral: ${EMPRESA.suporte}.`),
        paragrafo(
          `Versão ${VERSOES_DOCUMENTOS.privacidade}, vigente a partir de ${CAMPOS_ABERTOS.vigencia}.`,
        ),
      ],
    },
  ],
};
