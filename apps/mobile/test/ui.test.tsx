import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { DimensionValue } from 'react-native';

import '@/i18n';
import { usePrivacidade } from '@/stores/privacidade';
import {
  BarraProgresso,
  Botao,
  BotaoPrivacidade,
  Campo,
  Card,
  Chip,
  Erro,
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
