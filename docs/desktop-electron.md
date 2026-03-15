# Electron Desktop App - Notes & Known Issues

## Figma Tab URL Persistence

The Figma tab in the Electron app persists the current URL per session. When you navigate to a Figma file and switch to another tab/project, the URL is saved. Returning to the Figma tab restores the last viewed file or page.

## Passkey / WebAuthn in Webview (Gmail, Google Login)

**Known limitation:** When signing in to Google (or other services using passkeys) inside the Figma webview, the biometric prompt (Touch ID / Face ID) may not appear. This is due to a [known Electron issue](https://github.com/electron/electron/issues/27355) on macOS—WebAuthn/passkey support in Chromium is broken for embedded webviews.

### Workaround

When Google shows "Complete sign-in using your passkey" and the biometric window does not open:

1. Click **"Try another way"** on the sign-in screen
2. Choose password, or a verification code sent to your phone/email

### Technical Notes

Fixing this would require integrating a native addon (e.g. [electron-webauthn-mac](https://github.com/vault12/electron-webauthn-mac)) and patching `navigator.credentials` in the webview—a non-trivial integration. The addon provides a programmatic API but does not auto-patch third-party sites. Native apps that implement their own auth flow can use it; embedded sites like Google need custom interception logic.
