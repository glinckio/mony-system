// Config do Metro do Expo (já preparada para monorepo) com o que o Sentry precisa para ligar os
// erros aos source maps, e o NativeWind, que compila o `global.css` com os tokens do app. O
// `nativewind-env.d.ts` já está no repositório: o NativeWind não precisa reescrever o tsconfig.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const { withNativeWind } = require('nativewind/metro');

module.exports = withNativeWind(getSentryExpoConfig(__dirname), {
  input: './global.css',
  disableTypeScriptGeneration: true,
});
