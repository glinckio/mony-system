/**
 * Relógio do app. Tela que depende do "agora" (o "hoje" do usuário, o mês atual) pergunta aqui, e
 * os testes fixam a data com `jest.spyOn(relogio, 'agora')`.
 */
export const relogio = {
  agora: (): Date => new Date(),
};
