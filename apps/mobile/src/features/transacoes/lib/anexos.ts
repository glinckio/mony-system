import { lerArquivos, prepararArquivos } from '@mony/api-client';
import { TIPOS_CONTEUDO_ANEXO, tamanhoMaximoDoConteudo } from '@mony/shared/arquivos';
import type { TipoAnexo } from '@mony/shared/enums';
import type { Transacao } from '@mony/shared/transacoes';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/** O anexo como a lista do formulário mostra: o da API e, do recém-enviado, a foto no aparelho. */
export type AnexoNaTela = Transacao['anexos'][number] & { uriLocal?: string };

type TipoConteudo = (typeof TIPOS_CONTEUDO_ANEXO)[number];

interface ArquivoEscolhido {
  uri: string;
  tipo: TipoAnexo;
  tipoConteudo: TipoConteudo;
}

/** Foto reduzida no aparelho (doc 04): lado maior até 2.000 px, em JPEG. */
export const LADO_MAXIMO_FOTO = 2000;

export type MotivoFalhaAnexo = 'semPermissao' | 'grande' | 'tipo' | 'envio';

export class FalhaAnexo extends Error {
  constructor(readonly motivo: MotivoFalhaAnexo) {
    super(motivo);
    this.name = 'FalhaAnexo';
  }
}

async function reduzirFoto(foto: ImagePicker.ImagePickerAsset): Promise<ArquivoEscolhido> {
  const contexto = ImageManipulator.manipulate(foto.uri);
  if (Math.max(foto.width, foto.height) > LADO_MAXIMO_FOTO) {
    contexto.resize(
      foto.width >= foto.height ? { width: LADO_MAXIMO_FOTO } : { height: LADO_MAXIMO_FOTO },
    );
  }
  const imagem = await contexto.renderAsync();
  const salva = await imagem.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  return { uri: salva.uri, tipo: 'foto', tipoConteudo: 'image/jpeg' };
}

/** Câmera ou galeria; `null` se a pessoa desistiu. */
export async function escolherFoto(origem: 'camera' | 'galeria'): Promise<ArquivoEscolhido | null> {
  if (origem === 'camera') {
    const permissao = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissao.granted) throw new FalhaAnexo('semPermissao');
  }
  const opcoes: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const resultado =
    origem === 'camera'
      ? await ImagePicker.launchCameraAsync(opcoes)
      : await ImagePicker.launchImageLibraryAsync(opcoes);
  const foto = resultado.canceled ? undefined : resultado.assets[0];
  return foto ? reduzirFoto(foto) : null;
}

/** PDF do aparelho ou da nuvem (comprovante, boleto); `null` se a pessoa desistiu. */
export async function escolherPdf(): Promise<ArquivoEscolhido | null> {
  const resultado = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    copyToCacheDirectory: true,
  });
  const documento = resultado.canceled ? undefined : resultado.assets[0];
  if (!documento) return null;
  if (documento.mimeType !== undefined && documento.mimeType !== 'application/pdf') {
    throw new FalhaAnexo('tipo');
  }
  return { uri: documento.uri, tipo: 'pdf', tipoConteudo: 'application/pdf' };
}

/**
 * Envia direto ao S3 (doc 05): pede a URL assinada (`POST /arquivos`) com o tipo e o tamanho e faz
 * o `PUT` com os cabeçalhos que ela exige. O anexo só fica no lançamento quando ele é salvo com o
 * id (`anexoIds`).
 *
 * O `PUT` sai pelo `expo-file-system`, direto do arquivo no aparelho e com o tamanho no cabeçalho
 * (T-058a): pelo `fetch` com o `Blob`, o envio falhava no Android.
 */
export async function enviarAnexo(arquivo: ArquivoEscolhido): Promise<AnexoNaTela> {
  const local = new File(arquivo.uri);
  const tamanho = local.size;
  if (tamanho > tamanhoMaximoDoConteudo(arquivo.tipoConteudo)) throw new FalhaAnexo('grande');
  const envio = await prepararArquivos({
    tipo: arquivo.tipo,
    tipoConteudo: arquivo.tipoConteudo,
    tamanho,
  });
  let status: number;
  try {
    ({ status } = await local.upload(envio.url, {
      httpMethod: envio.metodo,
      headers: envio.cabecalhos,
    }));
  } catch (erro) {
    if (__DEV__) console.warn('[anexo] o envio ao armazenamento falhou', erro);
    throw new FalhaAnexo('envio');
  }
  if (status < 200 || status >= 300) {
    if (__DEV__) console.warn(`[anexo] o armazenamento respondeu ${String(status)}`);
    throw new FalhaAnexo('envio');
  }
  return {
    id: envio.id,
    tipo: arquivo.tipo,
    tamanho,
    ...(arquivo.tipo === 'foto' ? { uriLocal: arquivo.uri } : {}),
  };
}

/** A URL de leitura do anexo (15 min), para abrir. */
export async function urlDoAnexo(id: string): Promise<string> {
  return (await lerArquivos(id)).url;
}
