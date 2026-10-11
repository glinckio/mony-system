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
