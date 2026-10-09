import { hash, verify } from '@node-rs/argon2';

/**
 * Argon2id com 64 MB de memória e 3 iterações (docs/arquitetura/11). O algoritmo padrão da
 * biblioteca já é o Argon2id; o hash guardado leva os parâmetros, então mudar os valores aqui não
 * invalida senhas antigas.
 */
const OPCOES = { memoryCost: 64 * 1024, timeCost: 3, parallelism: 1 };

export function gerarHashSenha(senha: string): Promise<string> {
  return hash(senha, OPCOES);
}

let hashFicticio: Promise<string> | undefined;

/**
 * Confere a senha. Sem hash guardado (e-mail que não existe, ou conta só com login social), confere
 * contra um hash fictício e responde `false`, para o tempo de resposta não revelar se o e-mail
 * existe.
 */
export async function conferirSenha(hashGuardado: string | null, senha: string): Promise<boolean> {
  hashFicticio ??= hash('mony-senha-ficticia', OPCOES);
  const alvo = hashGuardado ?? (await hashFicticio);
  try {
    const confere = await verify(alvo, senha);
    return confere && hashGuardado !== null;
  } catch {
    return false;
  }
}
