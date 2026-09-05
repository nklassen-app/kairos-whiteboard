# Whiteboard — native Android shell

Capacitor wrapper that loads the hosted page
(<https://nklassen-app.github.io/kairos-whiteboard/>) in Android System WebView,
so the app has its own launcher icon and keeps working while Chrome is blocked.
Content updates ship by pushing to `main` as usual (bump the `sw.js` cache
name); the APK only needs rebuilding for shell changes (icon, app name, config).

## Rebuild from a clean clone

Prerequisites (one-time): JDK 17, Android SDK command-line tools with
`platform-tools`, `platforms;android-34`, `build-tools;34.0.0`, licenses
accepted. Point the build at the SDK with either `ANDROID_HOME` or
`android/local.properties` (`sdk.dir=/path/to/android-sdk`).

```sh
cd native
npm install
npx cap sync android   # only needed after changing capacitor.config.json
npm run build:apk
```

APK lands at `android/app/build/outputs/apk/debug/app-debug.apk`. Transfer to
the phone (Drive is fine) and tap to install; debug-signed, sideload only.
Rebuilds reuse the same auto-generated debug keystore, so they install over
the top without losing data.

`android/gradle.properties` keeps the Gradle JVM small because the build
sandbox has under 3 GB of RAM and no swap; harmless on a bigger machine.

Note: the WebView's localStorage starts empty and is the single source of
truth once you switch. Nothing typed into the page in Chrome carries over.
