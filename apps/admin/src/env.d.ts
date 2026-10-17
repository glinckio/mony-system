/** Variáveis públicas do painel (ver .env.example). */
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** DSN do projeto `admin` no Sentry. Vazio: Sentry desligado (T-142c). */
  readonly VITE_SENTRY_DSN?: string;
  /** Ambiente no Sentry (ex.: `staging`); sem ele, o modo do Vite. */
  readonly VITE_SENTRY_AMBIENTE?: string;
  /** Release: o commit do build (o workflow de deploy define). */
  readonly VITE_SENTRY_RELEASE?: string;
}
