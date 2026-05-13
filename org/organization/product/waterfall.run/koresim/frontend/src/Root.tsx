import { useEffect, useState } from "react";
import App from "./App";
import { LandingPage } from "./LandingPage";
import { ResultsPage, ResultsStoryPage } from "./ResultsPage";
import { ValidationPage } from "./ValidationPage";

type RouteState =
  | { page: "landing" }
  | { page: "app" }
  | { page: "results" }
  | { page: "results-story"; storyId: string }
  | { page: "validation" };

function getRouteState(): RouteState {
  if (window.location.hash === "#app") {
    window.history.replaceState(null, "", "/app");
    return { page: "app" };
  }
  if (window.location.hash === "#results") {
    window.history.replaceState(null, "", "/results");
    return { page: "results" };
  }

  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/app") return { page: "app" };
  if (path === "/results") return { page: "results" };
  if (path === "/validation") return { page: "validation" };
  if (path.startsWith("/results/story/")) {
    return { page: "results-story", storyId: decodeURIComponent(path.slice("/results/story/".length)) };
  }
  return { page: "landing" };
}

export function Root() {
  const [route, setRoute] = useState<RouteState>(getRouteState);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "dark");
  }, []);

  useEffect(() => {
    const handler = () => setRoute(getRouteState());
    window.addEventListener("hashchange", handler);
    window.addEventListener("popstate", handler);
    return () => {
      window.removeEventListener("hashchange", handler);
      window.removeEventListener("popstate", handler);
    };
  }, []);

  if (route.page === "app") return <App />;
  if (route.page === "results") return <ResultsPage />;
  if (route.page === "results-story") return <ResultsStoryPage storyId={route.storyId} />;
  if (route.page === "validation") return <ValidationPage />;
  return <LandingPage />;
}
