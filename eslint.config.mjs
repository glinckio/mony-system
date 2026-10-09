// Arquivos soltos na raiz (configs). Cada pacote tem o próprio eslint.config.js.
import { criarConfigEslint } from '@mony/config/eslint';

export default criarConfigEslint({ tsconfigRootDir: import.meta.dirname });
