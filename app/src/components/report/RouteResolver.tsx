import { useEffect, useState } from "react";
import ReportPage from "./ReportPage";
import PostPage from "../feed/PostPage";
import MemberPage from "../people/MemberPage";
import { Card, Empty } from "../console/ui";

type Route = "report" | "post" | "member" | "none";

export default function RouteResolver() {
  const [route, setRoute] = useState<Route | null>(null);

  useEffect(() => {
    const path = window.location.pathname;
    if (/^\/app\/(r|u)\//.test(path)) setRoute("report");
    else if (/^\/app\/p\//.test(path)) setRoute("post");
    else if (/^\/app\/people\//.test(path)) setRoute("member");
    else setRoute("none");
  }, []);

  if (route === null) return null;
  if (route === "report") return <ReportPage />;
  if (route === "post") return <PostPage />;
  if (route === "member") return <MemberPage />;

  return (
    <Card>
      <div className="px-6 py-10">
        <Empty>
          No such page.{" "}
          <a href="/app/" className="text-sky-400 hover:underline">
            Back to the app
          </a>
        </Empty>
      </div>
    </Card>
  );
}
