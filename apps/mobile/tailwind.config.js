// Tailwind do NativeWind. O `theme` troca (não estende) cores, espaços, raios e tipografia pelos
// tokens de `src/ui/tokens.ts` (o Tailwind lê o TypeScript pelo jiti): classe com valor fora dos
// tokens não existe (doc 04).
const { temaTailwind } = require('./src/ui/tokens');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: temaTailwind,
};
