// Babel do Expo com o NativeWind: o `className` dos componentes vira estilo pelo
// `react-native-css-interop`. O React Compiler continua ligado pelo `app.config.ts`.
module.exports = function configBabel(api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  };
};
