import '@testing-library/jest-dom/vitest';
import '@/i18n';

import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// O `findBy…` espera até 1 s por padrão; a primeira rota de cada arquivo demora mais no CI.
configure({ asyncUtilTimeout: 5_000 });

afterEach(() => {
  cleanup();
});
