import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.forgeguard.app',
  appName: 'Revelator',
  webDir: 'dist',
  backgroundColor: '#000000',
  android: {
    allowMixedContent: true,
    backgroundColor: '#000000',
    webContentsDebuggingEnabled: true,
  },
  server: {
    androidScheme: 'http',
    cleartext: true,
  },
  plugins: {
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: '412368654322-55pcnvummc3fup2vgr13f6nctjqvkpll.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    },
    Camera: {
      permissions: ['camera', 'photos'],
    },
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#000000',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER',
      showSpinner: false,
    },
  },
};

export default config;
