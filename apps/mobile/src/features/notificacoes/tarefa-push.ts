import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

import { executarTarefaPush, TAREFA_PUSH } from './push-segundo-plano';

/*
 * Define e registra a tarefa do push com o app fechado (T-088b). Precisa rodar no escopo do módulo
 * e antes de tudo (`index.ts`): o sistema carrega o JS do app sem a tela para rodar a tarefa, e ela
 * tem de existir antes de o JS terminar de subir. Registrar de novo a cada abertura não duplica.
 */
if (!TaskManager.isTaskDefined(TAREFA_PUSH)) {
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(TAREFA_PUSH, ({ data, error }) =>
    error
      ? Promise.resolve(Notifications.BackgroundNotificationTaskResult.Failed)
      : executarTarefaPush(data),
  );
}
void Notifications.registerTaskAsync(TAREFA_PUSH).catch(() => undefined);
