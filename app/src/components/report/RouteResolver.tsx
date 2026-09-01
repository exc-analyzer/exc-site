import { useEffect, useState } from 'react';
import ReportPage from './ReportPage';
import { Card, Empty } from '../console/ui';

export default function RouteResolver() {
  const [isReport, setIsReport] = useState<boolean | null>(null);
  useEffect(() => {
    setIsReport(/^\/app\/(r|u)\//.test(window.location.pathname));
  }, []);
  if (isReport === null) return null;
  if (isReport) return <ReportPage />;
  return (
    <Card>
      <div className="px-6 py-10">
        <Empty>
          No such page.{' '}
          <a href="/app/" className="text-sky-400 hover:underline">
            Back to the app
          </a>
        </Empty>
      </div>
    </Card>
  );
}