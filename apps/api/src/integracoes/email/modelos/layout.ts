/** Nome do produto nos e-mails (docs/arquitetura/01). */
export const NOME_PRODUTO = 'Monitorizze';

const ENTIDADES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapa texto do usuário (nome, por exemplo) antes de entrar no HTML. */
export function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (caractere) => ENTIDADES[caractere] ?? caractere);
}

/** Primeiro nome, para a saudação ("Olá, Ana!"). */
export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? '';
}

/**
 * Moldura comum dos e-mails: tabela com estilos inline, que é o que os leitores de e-mail
 * respeitam. `conteudo` já vem em HTML escapado.
 */
export function moldura(titulo: string, conteudo: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escaparHtml(titulo)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px 24px">
<tr><td style="font-size:18px;font-weight:bold;padding-bottom:16px">${NOME_PRODUTO}</td></tr>
<tr><td style="font-size:15px;line-height:22px">${conteudo}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
