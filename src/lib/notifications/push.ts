// ---------------------------------------------------------------------------
// Push notifications via Firebase Cloud Messaging (FCM)
// ---------------------------------------------------------------------------
//
// TODO: Integrate the Firebase Admin SDK to send push notifications.
//
// Prerequisites:
//   1. Add `firebase-admin` as a dependency.
//   2. Initialise the Admin app with a service account credential
//      (GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_JSON).
//   3. Replace the stub implementation below with calls to
//      `admin.messaging().send()`.
// ---------------------------------------------------------------------------

/**
 * Payload accepted by `sendPushNotification`.
 */
export interface PushPayload {
  /** FCM device registration token. */
  token: string;
  /** Notification title displayed to the user. */
  title: string;
  /** Notification body text. */
  body: string;
  /** Optional key-value data payload forwarded to the client app. */
  data?: Record<string, string>;
}

/**
 * Send a push notification to a single device via Firebase Cloud Messaging.
 *
 * This is currently a **stub** -- it logs the payload and returns `false`.
 * Once the Firebase Admin SDK is wired in, this function should call
 * `admin.messaging().send()` with the constructed message and return `true`
 * on success.
 *
 * @returns `true` if the notification was accepted by FCM, `false` otherwise.
 */
export async function sendPushNotification(
  payload: PushPayload
): Promise<boolean> {
  // TODO: Implement FCM integration.
  //
  // Example (once firebase-admin is initialised):
  //
  //   const message: admin.messaging.Message = {
  //     token: payload.token,
  //     notification: {
  //       title: payload.title,
  //       body: payload.body,
  //     },
  //     data: payload.data,
  //   };
  //   await admin.messaging().send(message);
  //   return true;

  console.warn(
    '[notifications/push] FCM integration not yet configured -- skipping push delivery.',
    {
      token: payload.token.slice(0, 8) + '...',
      title: payload.title,
    }
  );

  return false;
}
