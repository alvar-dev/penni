import { Image, StyleSheet, View } from 'react-native';

import { BANK_LOGOS } from '../bankLogos';
import { colors } from '../theme';

/** A bank's own app icon as a small rounded square, like on the home screen. */
export function BankLogo({ id, size }: { id: string; size: number }) {
  const source = BANK_LOGOS[id];
  const radius = Math.round(size * 0.24);
  return (
    <View style={[styles.frame, { width: size, height: size, borderRadius: radius }]}>
      {source ? <Image source={source} style={{ width: size, height: size }} resizeMode="cover" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', backgroundColor: '#FFFFFF', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
});
