import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip as ReTooltip, ResponsiveContainer } from "recharts";

const Card = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-md border bg-card text-card-foreground shadow-sm">{children}</div>
);
const CardHeader = ({ children }: { children: React.ReactNode }) => (
  <div className="border-b px-4 py-3">{children}</div>
);
const CardTitle = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-base font-semibold">{children}</h3>
);
const CardContent = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`p-4 ${className}`}>{children}</div>
);

interface DashboardViewProps { result: any; runId?: string; }

function formatTs(ts?: number | null): string {
  if (!ts) return "-";
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString();
  } catch {
    return "-";
  }
}

function formatDurationMs(start?: number | null, end?: number | null): string {
  if (!start || !end) return "-";
  const ms = Math.max(0, end - start);
  const secs = Math.floor(ms / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
}

const DashboardView: React.FC<DashboardViewProps> = ({ result, runId }) => {
  if (!result) return null;

  const status: string = result?.status ?? "-";
  const robotId: string | undefined = result?.robotId;

  const createdAt = (result?.createdAt as number | undefined) ?? null;
  const startedAt = (result?.startedAt as number | undefined) ?? null;
  const finishedAt = (result?.finishedAt as number | undefined) ?? null;

  const itemsCount = Array.isArray(result?.items) ? result.items.length : 0;
  const listKeys = result?.capturedLists ? Object.keys(result.capturedLists) : [];
  const listsCount = listKeys.length;
  const listItemsTotal = listKeys.reduce((sum: number, key: string) => {
    const v = result.capturedLists[key];
    return sum + (Array.isArray(v) ? v.length : 0);
  }, 0);
  const textsCount = result?.capturedTexts ? Object.keys(result.capturedTexts).length : 0;
  const screenshotsCount = result?.capturedScreenshots ? Object.keys(result.capturedScreenshots).length : 0;

  const chartData = [
    { name: "Items", value: itemsCount },
    { name: "List items", value: listItemsTotal },
    { name: "Texts", value: textsCount },
    { name: "Screenshots", value: screenshotsCount },
  ];

  const hasAnyData = chartData.some((d) => d.value > 0);

  return (
    <section className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Run summary</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <div className="grid grid-cols-3 gap-2">
              <span className="text-muted-foreground">Run ID</span>
              <span className="col-span-2 break-all">{runId ?? result?.id ?? "-"}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <span className="text-muted-foreground">Robot ID</span>
              <span className="col-span-2 break-all">{robotId ?? "-"}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <span className="text-muted-foreground">Status</span>
              <span className="col-span-2 capitalize">{status}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <span className="text-muted-foreground">Created</span>
              <span className="col-span-2">{formatTs(createdAt)}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <span className="text-muted-foreground">Started</span>
              <span className="col-span-2">{formatTs(startedAt)}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <span className="text-muted-foreground">Finished</span>
              <span className="col-span-2">{formatTs(finishedAt)}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <span className="text-muted-foreground">Duration</span>
              <span className="col-span-2">{formatDurationMs(startedAt ?? createdAt, finishedAt)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Items</div>
                <div className="text-2xl font-semibold">{itemsCount}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Lists</div>
                <div className="text-2xl font-semibold">{listsCount}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">List items</div>
                <div className="text-2xl font-semibold">{listItemsTotal}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Texts</div>
                <div className="text-2xl font-semibold">{textsCount}</div>
              </div>
              <div className="rounded-md border p-3 col-span-2">
                <div className="text-xs text-muted-foreground">Screenshots</div>
                <div className="text-2xl font-semibold">{screenshotsCount}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Data breakdown</CardTitle>
        </CardHeader>
        <CardContent className="h-[260px]">
          {hasAnyData ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <ReTooltip />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground">No structured data yet. Once the run finishes, counts will appear here.</p>
          )}
        </CardContent>
      </Card>
    </section>
  );
};

export default DashboardView;
