import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as Sentry from '@sentry/react-native';

import { iniciarSentry } from '@/lib/sentry';

jest.mock('@sentry/react-native', () => ({ init: jest.fn() }));

describe('iniciarSentry', () => {
  beforeEach(() => {
    jest.mocked(Sentry.init).mockClear();
  });

  it('sem DSN, fica desligado', () => {
    expect(iniciarSentry({ ambiente: 'development', sentryDsn: undefined })).toBe(false);
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('com DSN, liga no ambiente do build e sem dados pessoais', () => {
    const dsn = 'https://chave@sentry.exemplo.test/1';
    expect(iniciarSentry({ ambiente: 'preview', sentryDsn: dsn })).toBe(true);
    expect(Sentry.init).toHaveBeenCalledWith({
      dsn,
      environment: 'preview',
      sendDefaultPii: false,
    });
  });
});
