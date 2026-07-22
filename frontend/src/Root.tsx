import { useEffect, useState, type ReactNode } from "react";
import { AdminPage } from "./AdminPage";
import ClassicApp from "./App";
import { LandingPage } from "./LandingPage";
import { LoginPage } from "./LoginPage";
import { ResultsPage as ClassicResultsPage, ResultsStoryPage } from "./ResultsPage";
import { ValidationPage } from "./ValidationPage";
import type { SimulationType } from "./types/api";
import { useRequireAuth } from "./hooks/useRequireAuth";
import { MinsimIntakeFlow } from "./v2/MinsimIntakeFlow";
import { MinsimLoadingPage } from "./v2/MinsimLoadingPage";
import { MinsimResultsPage } from "./v2/MinsimResultsPage";
import { McpConnectPage } from "./v2/McpConnectPage";
import { ProjectDetailPage } from "./v2/ProjectDetailPage";
import { ProjectsPage } from "./v2/ProjectsPage";
import { SimulationTypePage } from "./v2/SimulationTypePage";
import { V2AppShell } from "./v2/V2AppShell";
import { parseV2Route, type V2Route } from "./v2/navigation";

function getRouteState(): V2Route {
  return parseV2Route();
}

function isAuthGatedRoute(route: V2Route): boolean {
  return (
    route.page === "projects" ||
    route.page === "project" ||
    route.page === "type" ||
    route.page === "intake" ||
    route.page === "loading" ||
    route.page === "results" ||
    route.page === "connect" ||
    route.page === "admin" ||
    route.page === "classic-app" ||
    route.page === "classic-results"
  );
}

function AuthGatedShell({ route, children }: { route: V2Route; children: ReactNode }) {
  const allowed = useRequireAuth(isAuthGatedRoute(route));
  if (!allowed) {
    return (
      <div className="minsim-shell">
        <main className="screen wrap" style={{ paddingTop: 72 }}>
          <p className="muted" role="status">
            로그인이 필요해요. 로그인 화면으로 이동 중…
          </p>
        </main>
      </div>
    );
  }
  return <>{children}</>;
}

export function Root() {
  const [route, setRoute] = useState<V2Route>(getRouteState);

  useEffect(() => {
    const handler = () => setRoute(getRouteState());
    window.addEventListener("hashchange", handler);
    window.addEventListener("popstate", handler);
    return () => {
      window.removeEventListener("hashchange", handler);
      window.removeEventListener("popstate", handler);
    };
  }, []);

  if (route.page === "landing") return <LandingPage />;
  if (route.page === "login") return <LoginPage />;
  if (route.page === "results-story") return <ResultsStoryPage storyId={route.storyId} />;
  if (route.page === "validation") return <ValidationPage />;

  if (route.page === "classic-app") {
    return (
      <AuthGatedShell route={route}>
        <ClassicApp />
      </AuthGatedShell>
    );
  }
  if (route.page === "classic-results") {
    return (
      <AuthGatedShell route={route}>
        <ClassicResultsPage />
      </AuthGatedShell>
    );
  }
  if (route.page === "admin") {
    return (
      <AuthGatedShell route={route}>
        <AdminPage />
      </AuthGatedShell>
    );
  }

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
  if (route.page === "loading") content = <MinsimLoadingPage projectId={route.projectId} runId={route.runId} />;
  if (route.page === "results") content = <MinsimResultsPage projectId={route.projectId} runId={route.runId} />;
  if (route.page === "connect") content = <McpConnectPage />;

  return (
    <AuthGatedShell route={route}>
      <V2AppShell route={route}>{content}</V2AppShell>
    </AuthGatedShell>
  );
}
