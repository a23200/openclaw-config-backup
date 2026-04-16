import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.makeapp.androidshell',
  appName: 'Make App',
  webDir: 'android-shell-www',
  server: {
    androidScheme: 'https',
  },
}

export default config
