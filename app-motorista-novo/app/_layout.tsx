import 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MotoristaProvider } from '../context/MotoristaContext';
import { PushNotificationBootstrap } from '../components/PushNotificationBootstrap';
import { colors } from '../lib/ui/theme';

const headerOptions = {
  headerStyle: { backgroundColor: colors.navy },
  headerTintColor: '#fff',
  headerTitleStyle: { fontWeight: '800' as const },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.bg },
};

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <MotoristaProvider>
        <PushNotificationBootstrap />
        <Stack screenOptions={headerOptions}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="servico/[id]" options={{ title: 'Detalhe do serviço' }} />
          <Stack.Screen name="mensagens/[servico_id]" options={{ title: 'Mensagens' }} />
          <Stack.Screen name="rota" options={{ title: 'Rota', headerShown: false }} />
          <Stack.Screen name="checklist" options={{ title: 'Checklist' }} />
          <Stack.Screen name="checklist-sucesso" options={{ title: 'Concluído', headerShown: false }} />
          <Stack.Screen name="assinatura" options={{ title: 'Assinatura' }} />
          <Stack.Screen name="avaria" options={{ title: 'Marcar avaria' }} />
        </Stack>
      </MotoristaProvider>
    </SafeAreaProvider>
  );
}
