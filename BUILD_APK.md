# Building Revelator Android APK

## Prerequisites

1. **Node.js** (v18+): https://nodejs.org
2. **Android Studio**: https://developer.android.com/studio
   - During install, make sure to install the Android SDK
   - Set `ANDROID_HOME` environment variable to SDK location
3. **Java JDK 17**: Required by Android Studio / Gradle

## Step-by-Step Build

### 1. Install frontend dependencies

```bash
cd frontend
npm install
```

### 2. Build the web app

```bash
npm run build
```

This creates the `dist/` folder that Capacitor will bundle.

### 3. Add Android platform

```bash
npx cap add android
```

### 4. Sync web assets to Android

```bash
npx cap sync android
```

### 5. Open in Android Studio (optional, for customization)

```bash
npx cap open android
```

### 6. Build the APK

**Option A: From Android Studio**
- Open the `frontend/android` project in Android Studio
- Build > Build Bundle(s) / APK(s) > Build APK(s)
- APK will be at: `android/app/build/outputs/apk/debug/app-debug.apk`

**Option B: From command line**

```bash
cd android
./gradlew assembleDebug
```

APK location: `android/app/build/outputs/apk/debug/app-debug.apk`

### 7. Install on device

```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

Or just transfer the `.apk` file to your phone and install it.

## Connecting to Your Backend

The Android app needs to reach your Revelator API server:

### During Development (local network)
Edit `frontend/src/api/client.js` and change `API_BASE`:
```js
const API_BASE = 'http://YOUR_PC_IP:8000/api';
```

Then rebuild: `npm run build && npx cap sync android`

### For Production
Deploy your backend to a server and update `API_BASE` to the server URL.

## Signing for Release (Google Play Store)

For a release APK (not debug):
1. Generate a keystore: `keytool -genkey -v -keystore forgeguard.keystore -alias forgeguard -keyalg RSA -keysize 2048 -validity 10000`
2. Configure signing in `android/app/build.gradle`
3. Build: `./gradlew assembleRelease`

## Troubleshooting

- **"SDK not found"**: Set `ANDROID_HOME` env var or create `android/local.properties` with `sdk.dir=/path/to/sdk`
- **Camera not working**: Run `npx cap sync` after any plugin changes
- **API calls failing**: Check that your phone and PC are on the same network, and that the backend URL is correct
