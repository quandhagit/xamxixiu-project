import { cn } from "../ui/cn";

export type AppView = "workflow" | "library";

export const APP_VIEWS = [
  "workflow",
  "library"
] as const satisfies readonly AppView[];

export const APP_VIEW_HREF: Record<AppView, string> = {
  workflow: "/",
  library: "/library/"
};

export function appViewFromPathname(
  pathname: string
): AppView {
  const path = pathname.replace(/\/+$/, "") || "/";
  return path === "/library" ? "library" : "workflow";
}

export function isAppViewVisible(
  active: AppView,
  view: AppView
): boolean {
  return active === view;
}

export function appViewPanelClass(
  view: AppView,
  active: AppView
): string {
  if (view === "workflow") {
    return cn(
      "min-h-0 flex-1 overflow-hidden",
      isAppViewVisible(active, view) ? "flex" : "hidden"
    );
  }
  return cn(
    "min-h-0 flex-1 overflow-y-auto p-4",
    isAppViewVisible(active, view) ? "block" : "hidden"
  );
}

export function keptAppViewPanels(
  pathname: string
): Array<{
  view: AppView;
  visible: boolean;
  className: string;
}> {
  const active = appViewFromPathname(pathname);
  return APP_VIEWS.map((view) => ({
    view,
    visible: isAppViewVisible(active, view),
    className: appViewPanelClass(view, active)
  }));
}
