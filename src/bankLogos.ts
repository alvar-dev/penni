import type { ImageSourcePropType } from 'react-native';

/** The banks' own app icons (from their websites), bundled so the demo works offline. */
export const BANK_LOGOS: Record<string, ImageSourcePropType> = {
  spankki: require('../assets/banks/spankki.png'),
  op: require('../assets/banks/op.png'),
  nordea: require('../assets/banks/nordea.png'),
  danske: require('../assets/banks/danske.png'),
  revolut: require('../assets/banks/revolut.png'),
  handelsbanken: require('../assets/banks/handelsbanken.png'),
  aktia: require('../assets/banks/aktia.png'),
  saastopankki: require('../assets/banks/saastopankki.png'),
  pop: require('../assets/banks/pop.png'),
  omasp: require('../assets/banks/omasp.png'),
  alandsbanken: require('../assets/banks/alandsbanken.png'),
};
