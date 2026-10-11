import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { DimensionValue } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import '@/i18n';
import { usePrivacidade } from '@/stores/privacidade';
import { IconeCategoria } from '@/features/categorias/components/icone-categoria';
import {
  BarraProgresso,
  Botao,
  BotaoPrivacidade,
  Campo,
  CampoBusca,
  CampoValor,
  Card,
  Chip,
  digitosParaCentavos,
  Erro,
  Etiqueta,
  Folha,
  Skeleton,
  Texto,
  Valor,
  VALOR_OCULTO,
  Vazio,
} from '@/ui';

/** "R$ 1.234,56" com o espaço não separável que o `formatarCentavos` usa. */
const reais = (texto: string) => texto.replace(' ', ' ');

describe('Botao', () => {
  it('chama a ação ao tocar', () => {
    const aoPressionar = jest.fn();
    render(<Botao titulo="Salvar" aoPressionar={aoPressionar} />);
    fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
    expect(aoPressionar).toHaveBeenCalledTimes(1);
  });

  it('desabilitado ou carregando não responde e avisa o leitor de tela', () => {
    const aoPressionar = jest.fn();
    const { rerender } = render(<Botao titulo="Salvar" aoPressionar={aoPressionar} desabilitado />);
    fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();

    rerender(<Botao titulo="Salvar" aoPressionar={aoPressionar} carregando />);
    const botao = screen.getByRole('button', { name: 'Salvar' });
    fireEvent.press(botao);
    expect(botao).toBeBusy();
    expect(botao).toBeDisabled();
    expect(aoPressionar).not.toHaveBeenCalled();
  });
});

describe('Campo', () => {
  it('liga o rótulo ao campo e mostra o erro no lugar da ajuda', () => {
    const aoMudar = jest.fn();
    const { rerender } = render(
      <Campo rotulo="Descrição" ajuda="Ex.: Mercado" onChangeText={aoMudar} />,
    );
    fireEvent.changeText(screen.getByLabelText('Descrição'), 'Padaria');
    expect(aoMudar).toHaveBeenCalledWith('Padaria');
    expect(screen.getByText('Ex.: Mercado')).toBeOnTheScreen();

    rerender(<Campo rotulo="Descrição" ajuda="Ex.: Mercado" erro="Informe a descrição" />);
    expect(screen.getByText('Informe a descrição')).toBeOnTheScreen();
    expect(screen.queryByText('Ex.: Mercado')).toBeNull();
  });
});

describe('Valor e modo privacidade (RN-022)', () => {
  beforeEach(async () => {
    usePrivacidade.setState({ ocultarValores: false });
    await AsyncStorage.clear();
  });

  it('formata centavos em reais', () => {
    render(<Valor centavos={123_456} testID="valor" />);
    expect(screen.getByTestId('valor')).toHaveTextContent(reais('R$ 1.234,56'));
    render(<Valor centavos={-1_050} testID="negativo" />);
    expect(screen.getByTestId('negativo')).toHaveTextContent(reais('-R$ 10,50'));
  });

  it('com sinal, o positivo ganha "+" (receita na lista)', () => {
    render(<Valor centavos={620_000} comSinal testID="receita" />);
    expect(screen.getByTestId('receita')).toHaveTextContent(reais('+R$ 6.200,00'));
    render(<Valor centavos={-1_000} comSinal testID="despesa" />);
    expect(screen.getByTestId('despesa')).toHaveTextContent(reais('-R$ 10,00'));
  });

  it('o olho oculta todos os valores de uma vez e guarda a escolha no aparelho', async () => {
    render(
      <>
        <BotaoPrivacidade />
        <Valor centavos={500_000} testID="saldo" />
        <Valor centavos={12_000} tipo="despesa" testID="gasto" />
        <Valor centavos={2_990} ocultavel={false} testID="preco" />
      </>,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Ocultar valores' }));

    expect(screen.getByTestId('saldo')).toHaveTextContent(VALOR_OCULTO);
    expect(screen.getByTestId('gasto')).toHaveTextContent(VALOR_OCULTO);
    expect(screen.getAllByLabelText('Valor oculto')).toHaveLength(2);
    expect(screen.getByTestId('preco')).toHaveTextContent(reais('R$ 29,90'));
    expect(await AsyncStorage.getItem('mony-privacidade')).toContain('"ocultarValores":true');

    fireEvent.press(screen.getByRole('button', { name: 'Mostrar valores' }));
    expect(screen.getByTestId('saldo')).toHaveTextContent(reais('R$ 5.000,00'));
  });
});

describe('BarraProgresso (RN-062)', () => {
  const casos: [number, string, number, DimensionValue][] = [
    [40, 'normal', 40, '40%'],
    [80, 'atencao', 80, '80%'],
    [130, 'estourado', 100, '100%'],
  ];

  it.each(casos)(
    '%i%% fica na faixa %s, com a barra em %i%%',
    (percentual, faixa, preenchido, largura) => {
      render(<BarraProgresso percentual={percentual} rotulo="Mercado" />);
      const barra = screen.getByRole('progressbar', { name: 'Mercado' });
      expect(barra).toHaveAccessibilityValue({
        min: 0,
        max: 100,
        now: preenchido,
        text: `${String(percentual)}% usado`,
      });
      expect(screen.getByTestId(`barra-${faixa}`)).toHaveStyle({ width: largura });
    },
  );
});

describe('Chip, Card, Vazio, Erro e Skeleton', () => {
  it('chip informa se está selecionado', () => {
    const aoPressionar = jest.fn();
    render(<Chip rotulo="Este mês" selecionado aoPressionar={aoPressionar} />);
    const chip = screen.getByRole('button', { name: 'Este mês' });
    expect(chip).toBeSelected();
    fireEvent.press(chip);
    expect(aoPressionar).toHaveBeenCalledTimes(1);
  });

  it('vazio mostra a ação que resolve', () => {
    const cadastrar = jest.fn();
    render(
      <Card>
        <Vazio
          titulo="Nenhum cartão"
          descricao="Cadastre um cartão para acompanhar a fatura."
          acao={{ titulo: 'Cadastrar cartão', aoPressionar: cadastrar }}
        />
      </Card>,
    );
    expect(screen.getByRole('header', { name: 'Nenhum cartão' })).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Cadastrar cartão' }));
    expect(cadastrar).toHaveBeenCalledTimes(1);
  });

  it('erro tem mensagem padrão e "Tentar de novo"', () => {
    const tentar = jest.fn();
    render(<Erro aoTentarDeNovo={tentar} />);
    expect(screen.getByRole('alert', { name: /Não foi possível carregar/ })).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(tentar).toHaveBeenCalledTimes(1);
  });

  it('skeleton avisa que está carregando', () => {
    render(<Skeleton altura={24} />);
    expect(screen.getByLabelText('Carregando')).toBeOnTheScreen();
  });

  it('texto de título pode ser cabeçalho', () => {
    render(
      <Texto variante="titulo-lg" accessibilityRole="header">
        Início
      </Texto>,
    );
    expect(screen.getByRole('header', { name: 'Início' })).toBeOnTheScreen();
  });
});

describe('CampoValor', () => {
  it('lê só os dígitos como centavos, sem passar de R$ 999.999.999,99', () => {
    expect(digitosParaCentavos('1050')).toBe(1_050);
    expect(digitosParaCentavos(reais('R$ 10,505'))).toBe(10_505);
    expect(digitosParaCentavos('R$ 0,0')).toBe(0);
    expect(digitosParaCentavos('')).toBe(0);
    expect(digitosParaCentavos('1234567890123')).toBe(12_345_678_901);
  });

  it('mostra o valor formatado enquanto digita e avisa o erro', () => {
    const aoMudar = jest.fn();
    const { rerender } = render(<CampoValor rotulo="Valor" centavos={0} aoMudar={aoMudar} />);
    expect(screen.getByLabelText('Valor')).toHaveDisplayValue('');
    fireEvent.changeText(screen.getByLabelText('Valor'), '2390');
    expect(aoMudar).toHaveBeenCalledWith(2_390);

    rerender(
      <CampoValor rotulo="Valor" centavos={2_390} aoMudar={aoMudar} erro="Valor inválido" />,
    );
    expect(screen.getByLabelText('Valor')).toHaveDisplayValue(reais('R$ 23,90'));
    expect(screen.getByText('Valor inválido')).toBeOnTheScreen();
  });
});

describe('CampoBusca, Etiqueta, Folha e Chip desabilitado', () => {
  it('busca com X que limpa', () => {
    const aoMudar = jest.fn();
    const { rerender } = render(<CampoBusca rotulo="Buscar" valor="" aoMudar={aoMudar} />);
    expect(screen.queryByRole('button', { name: 'Limpar busca' })).toBeNull();
    fireEvent.changeText(screen.getByLabelText('Buscar'), 'uber');
    expect(aoMudar).toHaveBeenCalledWith('uber');

    rerender(<CampoBusca rotulo="Buscar" valor="uber" aoMudar={aoMudar} />);
    fireEvent.press(screen.getByRole('button', { name: 'Limpar busca' }));
    expect(aoMudar).toHaveBeenLastCalledWith('');
  });

  it('etiqueta mostra o texto', () => {
    render(<Etiqueta texto="Pendente" tom="atencao" />);
    expect(screen.getByText('Pendente')).toBeOnTheScreen();
  });

  it('folha tem título, fecha pelo X e só aparece visível', () => {
    const aoFechar = jest.fn();
    const metricas = {
      frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 47, left: 0, right: 0, bottom: 34 },
    };
    const { rerender } = render(
      <Folha visivel titulo="Filtros" aoFechar={aoFechar} rodape={<Texto>Rodapé</Texto>}>
        <Texto>Conteúdo</Texto>
      </Folha>,
      {
        wrapper: ({ children }) => (
          <SafeAreaProvider initialMetrics={metricas}>{children}</SafeAreaProvider>
        ),
      },
    );
    expect(screen.getByRole('header', { name: 'Filtros' })).toBeOnTheScreen();
    expect(screen.getByText('Conteúdo')).toBeOnTheScreen();
    expect(screen.getByText('Rodapé')).toBeOnTheScreen();
    // O véu também fecha, mas fica fora da folha para o leitor de tela (`accessibilityViewIsModal`).
    fireEvent.press(screen.getByRole('button', { name: 'Fechar' }));
    expect(aoFechar).toHaveBeenCalledTimes(1);

    rerender(
      <Folha visivel={false} titulo="Filtros" aoFechar={aoFechar}>
        <Texto>Conteúdo</Texto>
      </Folha>,
    );
    expect(screen.queryByText('Conteúdo')).toBeNull();
  });

  it('chip desabilitado não responde', () => {
    const aoPressionar = jest.fn();
    render(<Chip rotulo="Pix" desabilitado aoPressionar={aoPressionar} />);
    fireEvent.press(screen.getByRole('button', { name: 'Pix' }));
    expect(screen.getByRole('button', { name: 'Pix' })).toBeDisabled();
    expect(aoPressionar).not.toHaveBeenCalled();
  });

  it('ícone de categoria aceita chave e cor desconhecidas', () => {
    render(
      <>
        <IconeCategoria icone="mercado" cor="#22C55E" />
        <IconeCategoria icone="nao-existe" cor="vermelho" />
        <IconeCategoria />
      </>,
    );
  });
});
