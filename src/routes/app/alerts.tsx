import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/alerts")({
  component: AlertsLayout,
});

function AlertsLayout() {
  return <Outlet />;
}
