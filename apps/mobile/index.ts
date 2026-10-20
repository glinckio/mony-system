/*
 * Entrada do app. A tarefa do push com o app fechado (T-088b) vem primeiro: o sistema roda o JS
 * sem a tela para executá-la, e ela precisa estar definida antes do Expo Router.
 */
import './src/features/notificacoes/tarefa-push';
import 'expo-router/entry';
