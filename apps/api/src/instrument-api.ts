/**
 * Primeiro import do `main.ts` (T-142c): o Sentry precisa iniciar antes dos outros módulos para
 * instrumentar o HTTP e o Fastify. Sem `SENTRY_DSN`, não faz nada.
 */
import { iniciarSentry } from './core/sentry/sentry';

iniciarSentry('api');
