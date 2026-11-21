# Background notifications on Android

1. Create a Firebase project for AgentLink and register Android package `cc.agentlabs.opencode`. Put the Android configuration in `android/app/google-services.json` in the build checkout and rebuild the APK.
2. Enable Firebase Cloud Messaging HTTP v1 and create a sender service account. Keep its credentials JSON on the computer. Set `AGENTLINK_FCM_CREDENTIALS` to the file path in the OpenCode server process environment.
3. Open Settings > Notifications > Copy FCM delivery token in AgentLink. Save it as UTF-8 text outside the repository on the computer. Set `AGENTLINK_FCM_DEVICE_TOKEN_FILE` to that file path in the same environment.
4. Copy `tools/agentlink-fcm.mjs` to the OpenCode global plugins directory as `agentlink-fcm.js` and restart OpenCode. Complete a test session while the phone app is in the background, then tap the notification. The matching server should be selected in AgentLink. Update the saved token after reinstalling the app.

The sender covers completion and errors from OpenCode. Google receives a generic title, a session ID and a category. Chat text and code stay on the computer. Disable the legacy Termux notification plugin in that OpenCode installation if it duplicates alerts.
