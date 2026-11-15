import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately.
//
// On the web, Skia (the orb, charts and icons) runs on CanvasKit (WebAssembly),
// which must be loaded before any module that uses Skia is evaluated; hence the
// lazy require of App. canvaskit.wasm is served from the site root
// (scripts/build-web.sh copies it there).
if (Platform.OS === 'web') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { LoadSkiaWeb } = require('@shopify/react-native-skia/lib/module/web');
  (LoadSkiaWeb({ locateFile: (file: string) => `/${file}` }) as Promise<void>).then(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    registerRootComponent(require('./App').default);
  });
} else {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  registerRootComponent(require('./App').default);
}
