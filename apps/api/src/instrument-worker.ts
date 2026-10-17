/**
 * Primeiro import do `worker.ts` (T-142c): o Sentry inicia antes dos outros módulos. Sem
 * `SENTRY_DSN`, não faz nada.
 */
import { iniciarSentry } from './core/sentry/sentry';

iniciarSentry('worker');
