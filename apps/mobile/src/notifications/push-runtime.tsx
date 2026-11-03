import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useAuth } from "../auth/provider";
import { routeFromPushData } from "./push";
import { ensureReminderChannel, rotateAnonymousAllotmentIfNeeded, rotatePhoneRemindersIfNeeded } from "./push-native";
import { readCatalogueTarget } from "../screens/catalogue-target";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Shows a foreground reminder and opens the IPO after a tap. It does not ask for permission. */
export function PushNotificationRuntime() {
  const opened = useRef<string | null>(null);
  const { state, call } = useAuth();
  const userId = state.phase === "ready" ? state.snapshot.account.id : null;

  useEffect(() => {
    void ensureReminderChannel();
    const open = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const id = response.notification.request.identifier;
      if (opened.current === id) return;
      opened.current = id;
      const route = routeFromPushData(response.notification.request.content.data);
      if (route) router.push(route);
      Notifications.clearLastNotificationResponse();
    };
    open(Notifications.getLastNotificationResponse());
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (userId) {
        await rotatePhoneRemindersIfNeeded(call);
        return;
      }
      const target = await readCatalogueTarget();
      if (!active || "error" in target || target.offline) return;
      await rotateAnonymousAllotmentIfNeeded(target.origin);
    })();
    return () => {
      active = false;
    };
  }, [call, userId]);

  return null;
}
