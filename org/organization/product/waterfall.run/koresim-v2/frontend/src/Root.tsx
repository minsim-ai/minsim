import { useEffect, useState } from "react";
import { AdminPage } from "./AdminPage";
import ClassicApp from "./App";
import { LandingPage } from "./LandingPage";
import { ResultsPage as ClassicResultsPage, ResultsStoryPage } from "./ResultsPage";
import { ValidationPage } from "./ValidationPage";
import { V2AppShell } from "./v2/V2AppShell";
import { parseV2Route, type V2Route } from "./v2/navigation";

function getRouteState(): V2Route {
  return parseV2Route();
}

export function Root() {
  const [route, setRoute] = useState<V2Route>(getRouteState);

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

  if (route.page === "classic-app") return <ClassicApp />;
  if (route.page === "classic-results") return <ClassicResultsPage />;
  if (route.page === "admin") return <AdminPage />;
  if (route.page === "results-story") return <ResultsStoryPage storyId={route.storyId} />;
  if (route.page === "validation") return <ValidationPage />;
  if (route.page === "landing") return <LandingPage />;

  return (
    <V2AppShell route={route}>
      <section className="v2-empty-state">
        <p className="v2-kicker">V2</p>
        <h1>프로젝트</h1>
        <p>V2 화면을 불러오는 중입니다.</p>
      </section>
    </V2AppShell>
  );
}
