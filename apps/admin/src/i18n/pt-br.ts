import type { Secao } from '@/secoes';

/** Todos os textos do painel em pt-BR. */
export const textosPtBr = {
  comum: {
    produto: 'Monitorizze Admin',
    menu: 'Seções do painel',
    emConstrucao: 'Em construção.',
    naoEncontrada: 'Página não encontrada',
    voltarAoInicio: 'Voltar ao início',
  },
  sessao: {
    sair: 'Sair',
  },
  entrar: {
    descricao: 'Entre com o e-mail e a senha de administrador.',
    email: 'E-mail',
    senha: 'Senha',
    continuar: 'Continuar',
    entrar: 'Entrar',
    voltar: 'Voltar',
    codigo: {
      descricao: 'Digite o código de 6 dígitos do seu aplicativo autenticador.',
      rotulo: 'Código do autenticador',
    },
    configurar: {
      descricao:
        'Primeiro acesso: leia o QR Code com um aplicativo autenticador (Google Authenticator, Authy, 1Password) e digite o código que ele mostrar.',
      qrCode: 'QR Code do autenticador',
      semCamera: 'Sem câmera? Digite esta chave no aplicativo:',
    },
    erros: {
      credenciais: 'E-mail ou senha incorretos.',
      codigo: 'Código incorreto. Confira o relógio do celular e tente o código novo.',
      muitasTentativas: 'Muitas tentativas. Espere alguns minutos e tente de novo.',
      desafioVencido: 'O tempo para digitar o código acabou. Entre de novo.',
      semConexao: 'Não foi possível falar com a API. Tente de novo.',
      inesperado: 'Algo deu errado. Tente de novo.',
    },
  },
  inicio: {
    titulo: 'Início',
    api: {
      titulo: 'API',
      verificando: 'Verificando…',
      noAr: 'No ar',
      foraDoAr: 'Fora do ar',
    },
  },
  secoes: {
    usuarios: 'Usuários',
    assinaturas: 'Assinaturas',
    planos: 'Planos e preços',
    novidades: 'Novidades',
    mony: 'Mony',
    metricas: 'Métricas',
    auditoria: 'Auditoria',
    filas: 'Filas',
    configuracoes: 'Configurações',
  } satisfies Record<Secao, string>,
};
