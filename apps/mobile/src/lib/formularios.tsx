import { ErroApi } from '@mony/api-client';
import { type Control, Controller, type FieldPath, type FieldValues } from 'react-hook-form';

import { Campo, type PropsCampo } from '@/ui';

type PropsCampoControlado<T extends FieldValues> = Omit<
  PropsCampo,
  'value' | 'onChangeText' | 'onBlur' | 'erro' | 'ref'
> & {
  controle: Control<T>;
  nome: FieldPath<T>;
  /** Texto do erro do campo (o do Zod sai em inglês e técnico). */
  mensagemErro: string;
  /** Tira espaços das pontas enquanto digita (e-mail, código). */
  aparar?: boolean;
};

/** `Campo` ligado ao React Hook Form, validado pelo schema Zod do `@mony/shared` (doc 04). */
export function CampoControlado<T extends FieldValues>({
  controle,
  nome,
  mensagemErro,
  aparar = false,
  ...props
}: PropsCampoControlado<T>) {
  return (
    <Controller
      control={controle}
      name={nome}
      render={({ field, fieldState }) => (
        <Campo
          // Os testes E2E (Maestro, T-143a) acham o campo pelo nome do formulário.
          testID={`campo-${nome}`}
          {...props}
          ref={field.ref}
          value={typeof field.value === 'string' ? field.value : ''}
          onChangeText={(texto) => {
            field.onChange(aparar ? texto.trim() : texto);
          }}
          onBlur={field.onBlur}
          erro={fieldState.error ? mensagemErro : null}
        />
      )}
    />
  );
}

/** Mensagem para a pessoa: a da API (catálogo em pt-BR) ou a de falta de conexão. */
export function mensagemDeErro(erro: unknown, semConexao: string): string {
  return erro instanceof ErroApi && erro.resposta ? erro.message : semConexao;
}

/** A API recusou porque o plano gratuito chegou ao limite (RN-120): a tela mostra o [Ver planos]. */
export function ehLimiteDoPlano(erro: unknown): boolean {
  return erro instanceof ErroApi && erro.codigo === 'LIMITE_PLANO_ATINGIDO';
}

/** O recurso é só dos planos pagos (a ligação do lembrete, RN-078): a tela também mostra o [Ver planos]. */
export function exigePlanoPago(erro: unknown): boolean {
  return erro instanceof ErroApi && erro.codigo === 'RECURSO_EXIGE_PLANO_PAGO';
}

/** A ligação do lembrete precisa do celular verificado (RN-078): a tela leva à verificação. */
export function ehTelefoneNaoVerificado(erro: unknown): boolean {
  return erro instanceof ErroApi && erro.codigo === 'TELEFONE_NAO_VERIFICADO';
}
