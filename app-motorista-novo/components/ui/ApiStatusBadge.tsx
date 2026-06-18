import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { API_BASE } from '../../config/api';
import { colors, radius } from '../../lib/ui/theme';

export function ApiStatusBadge() {
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let ativo = true;

    async function checar() {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch(API_BASE, { method: 'GET', signal: ctrl.signal });
        clearTimeout(timer);
        if (ativo) setOnline(res.ok || res.status < 500);
      } catch {
        if (ativo) setOnline(false);
      }
    }

    checar();
    const intervalo = setInterval(checar, 30000);
    return () => {
      ativo = false;
      clearInterval(intervalo);
    };
  }, []);

  const label =
    online === null ? 'Verificando API...' : online ? 'API online' : 'API offline';

  return (
    <View
      style={[
        styles.wrap,
        online === null && styles.neutral,
        online === true && styles.online,
        online === false && styles.offline,
      ]}
    >
      <View
        style={[
          styles.dot,
          online === true && styles.dotOnline,
          online === false && styles.dotOffline,
        ]}
      />
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  neutral: { backgroundColor: 'rgba(255,255,255,0.15)' },
  online: { backgroundColor: 'rgba(22,163,74,0.2)' },
  offline: { backgroundColor: 'rgba(220,38,38,0.2)' },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.textMuted,
    marginRight: 8,
  },
  dotOnline: { backgroundColor: colors.success },
  dotOffline: { backgroundColor: colors.danger },
  text: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
