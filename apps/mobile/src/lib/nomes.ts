/** "Lúcia Martins" → "LM"; um nome só → as duas primeiras letras. */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const primeira = partes[0] ?? '';
  const ultima = partes.length > 1 ? (partes.at(-1) ?? '') : '';
  const letras = ultima === '' ? primeira.slice(0, 2) : `${primeira[0] ?? ''}${ultima[0] ?? ''}`;
  return letras.toUpperCase();
}

/** "+5511987654321" → "(11) 98765-4321", para mostrar e editar; outro formato volta como veio. */
export function telefoneParaTexto(telefone: string): string {
  const nacional = telefone.replace(/^\+55/, '').replace(/\D/g, '');
  if (nacional.length === 11) {
    return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 7)}-${nacional.slice(7)}`;
  }
  if (nacional.length === 10) {
    return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 6)}-${nacional.slice(6)}`;
  }
  return telefone;
}
