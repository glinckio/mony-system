import { useVerificarSaude } from '@mony/api-client';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const Route = createFileRoute('/')({ component: Inicio });

function Inicio() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t('inicio.titulo')}</h1>
      <div className="grid max-w-sm">
        <EstadoApi />
      </div>
    </div>
  );
}

/** Mostra se a API responde, pelo hook gerado do contrato (`GET /v1/health`). */
function EstadoApi() {
  const { t } = useTranslation();
  const saude = useVerificarSaude();
  const estado = saude.isPending
    ? t('inicio.api.verificando')
    : saude.isSuccess
      ? t('inicio.api.noAr')
      : t('inicio.api.foraDoAr');
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('inicio.api.titulo')}</CardTitle>
      </CardHeader>
      <CardContent>
        <p role="status">{estado}</p>
      </CardContent>
    </Card>
  );
}
