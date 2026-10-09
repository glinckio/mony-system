// Config do Metro do Expo (já preparada para monorepo) com o que o Sentry precisa para ligar os
// erros aos source maps.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
