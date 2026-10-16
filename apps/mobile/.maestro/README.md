# Testes de ponta a ponta do app (Maestro)

Os três fluxos do [doc 14](../../../docs/arquitetura/14-testes-e-qualidade.md) (T-143a):

| Arquivo | Fluxo |
|---|---|
| `01-cadastro-onboarding-lancamento.yaml` | Cadastro → onboarding → primeiro lançamento na Mony |
| `02-cartao-parcelada-fatura.yaml` | Cartão → compra parcelada em 3x pelo chat → pagar a fatura |
| `03-limite-gratuito.yaml` | Conta no gratuito → segundo cartão bate no limite → [Ver planos] |

Cada fluxo limpa o app e cria a própria conta com um e-mail novo. `comum/` tem os passos repetidos
(cadastro, cartão, mensagem para a Mony) e `scripts/` os scripts JavaScript do Maestro.

## No CI

O workflow `E2E do app` (`.github/workflows/e2e-mobile.yml`) roda manualmente e quando esta pasta
muda: sobe Postgres, Redis e a API com os provedores fake, gera o APK de release do perfil preview
apontado para `http://10.0.2.2:3000` e roda os fluxos num emulador Android. Capturas, relatório e
log da API ficam no artefato `e2e-mobile`.

## No computador

Com a API rodando (`pnpm --filter api dev`, provedores `fake`) e um emulador Android aberto:

```bash
cd apps/mobile
APP_ENV=preview EXPO_PUBLIC_API_URL=http://10.0.2.2:3000 pnpm exec expo run:android --variant release
maestro test -e API_URL=http://localhost:3000 .maestro
```

O build de release não aceita HTTP sem TLS: depois do `expo prebuild`, acrescente
`android:usesCleartextTraffic="true"` no `<application>` de `android/app/src/main/AndroidManifest.xml`,
como o workflow faz.

## Escrevendo fluxos

- Prefira `id` (o `testID` do componente) a texto quando o texto se repete na tela. Os campos de
  formulário ganham `campo-<nome>` e as abas `aba-<rota>`.
- Valores em reais têm espaço fixo depois do `R$`: use `R\$.45,00` na expressão.
- A IA de teste da API entende frases simples pelas regras (ex.: `gastei 45 no mercado no pix`).
