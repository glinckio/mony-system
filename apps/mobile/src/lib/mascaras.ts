/** "22:00" enquanto digita "2200" (horário de silêncio, hora do lembrete). */
export function mascararHora(texto: string): string {
  const digitos = texto.replace(/\D/g, '').slice(0, 4);
  return digitos.length <= 2 ? digitos : `${digitos.slice(0, 2)}:${digitos.slice(2)}`;
}
