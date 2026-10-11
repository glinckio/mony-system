/** Junta classes do NativeWind, pulando as condicionais desligadas. */
export function juntarClasses(...partes: (string | false | null | undefined)[]): string {
  return partes
    .filter((parte): parte is string => typeof parte === 'string' && parte !== '')
    .join(' ');
}
