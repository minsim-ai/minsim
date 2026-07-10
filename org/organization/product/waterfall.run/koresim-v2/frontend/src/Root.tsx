import { useEffect, useState } from "react";
import { AdminPage } from "./AdminPage";
import ClassicApp from "./App";
import { LandingPage } from "./LandingPage";
import { ResultsPage as ClassicResultsPage, ResultsStoryPage } from "./ResultsPage";
import { ValidationPage } from "./ValidationPage";
import type { SimulationType } from "./types/api";
import { MinsimIntakeFlow } from "./v2/MinsimIntakeFlow";
import { ProjectDetailPage } from "./v2/ProjectDetailPage";
import { ProjectsPage } from "./v2/ProjectsPage";
import { SimulationTypePage } from "./v2/SimulationTypePage";
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

  let content = <ProjectsPage />;
  if (route.page === "project") content = <ProjectDetailPage projectId={route.projectId} />;
  if (route.page === "type") content = <SimulationTypePage projectId={route.projectId} />;
  if (route.page === "intake") {
    content = (
      <MinsimIntakeFlow
        projectId={route.projectId}
        simulationType={(route.simulationType as SimulationType | null) ?? null}
      />
    );
  }
  if (route.page === "loading" || route.page === "results") {
    content = (
      <section className="v2-empty-state">
        <p className="v2-kicker">V2</p>
        <h1>{route.page === "loading" ? "실행 중" : "결과"}</h1>
        <p>결과 화면을 준비하고 있습니다.</p>
      </section>
    );
  }

  return <V2AppShell route={route}>{content}</V2AppShell>;
}
