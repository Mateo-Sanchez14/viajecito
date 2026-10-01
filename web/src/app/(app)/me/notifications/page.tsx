import { NotificationsPage } from "@/features/push/containers/NotificationsPage";

// Static client content: the (app) layout already enforces the session via `requireMe()`.
export default function MeNotificationsPage() {
  return <NotificationsPage />;
}
