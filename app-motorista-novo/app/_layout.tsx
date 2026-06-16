import 'react-native-gesture-handler';
import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="checklist" options={{ title: 'Checklist' }} />
      <Stack.Screen name="assinatura" options={{ title: 'Assinatura' }} />
      <Stack.Screen name="avaria" options={{ title: 'Marcar avaria' }} />
    </Stack>
  );
}
