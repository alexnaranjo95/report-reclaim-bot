
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Play, RefreshCw } from "lucide-react";

type RunRow = {
  id: string;
  user_id: string;
  robot_id: string;
  task_id: string | null;
  status: string;
  credit_report_id: string | null;
  created_at: string;
  updated_at: string;
};

const POLL_INTERVAL_MS = 5000;

export const SmartCreditImport: React.FC = () => {
  const { toast } = useToast();
  const [robotId, setRobotId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [limits, setLimits] = useState({
    credit_scores_limit: 1,
    credit_report_details_limit: 1,
    credit_report_details_transunion_limit: 1,
    credit_report_details_experian_limit: 1,
    credit_report_details_equifax_limit: 1,
    credit_bureaus_comments_limit: 1,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [activeStatus, setActiveStatus] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);

  const canStart = useMemo(() => {
    return !!robotId && !!email && !!password && !isSubmitting;
  }, [robotId, email, password, isSubmitting]);

  const fetchRuns = async () => {
    setLoadingRuns(true);
    const { data, error } = await supabase
      .from("browseai_runs")
      .select("id,user_id,robot_id,task_id,status,credit_report_id,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) {
      console.error("Error fetching runs:", error);
    } else {
      setRuns(data || []);
    }
    setLoadingRuns(false);
  };

  useEffect(() => {
    fetchRuns();
  }, []);

  useEffect(() => {
    let timer: number | undefined;
    if (activeTaskId) {
      const poll = async () => {
        const { data, error } = await supabase.functions.invoke("browseai-status", {
          body: { taskId: activeTaskId },
        });
        if (error) {
          console.error("Polling error:", error);
          setActiveStatus("error");
          toast({
            title: "Status check failed",
            description: "We couldn't check the task status. Please try again.",
            variant: "destructive",
          });
          return;
        }
        const currentStatus = (data as any)?.status || "unknown";
        setActiveStatus(currentStatus);
        if (currentStatus === "completed" || currentStatus === "failed" || currentStatus === "error") {
          window.clearInterval(timer);
          timer = undefined;
          await fetchRuns();
          if (currentStatus === "completed") {
            toast({
              title: "Import complete",
              description: "SmartCredit import finished. A new credit report was created.",
            });
          }
        }
      };
      // Initial run
      poll();
      // Interval
      // deno-lint-ignore no-explicit-any
      timer = window.setInterval(poll, POLL_INTERVAL_MS) as any;
    }
    return () => {
      if (timer) window.clearInterval(timer);
    };
  }, [activeTaskId, toast]);

  const onStart = async () => {
    setIsSubmitting(true);
    setActiveTaskId(null);
    setActiveStatus(null);
    try {
      const { data, error } = await supabase.functions.invoke("browseai-trigger", {
        body: {
          robotId,
          inputParameters: {
            originUrl: "https://www.smartcredit.com",
            email,
            password,
            ...limits,
          },
          tags: ["smartcredit", "import"],
        },
      });

      if (error) {
        console.error("Trigger error:", error);
        toast({
          title: "Failed to start import",
          description: String(error?.message || "Unknown error"),
          variant: "destructive",
        });
        return;
      }

      const taskId = (data as any)?.taskId || null;
      if (!taskId) {
        toast({
          title: "Started, but no taskId returned",
          description: "We'll still show attempts in the Recent Runs list.",
        });
      } else {
        setActiveTaskId(taskId);
        setActiveStatus("queued");
      }

      toast({
        title: "Import started",
        description: "Your Browse.ai robot is running. We'll check status every few seconds.",
      });

      await fetchRuns();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="bg-gradient-card shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Play className="h-5 w-5 text-primary" />
          SmartCredit Import
        </CardTitle>
        <CardDescription>Trigger your Browse.ai robot to import credit data directly from SmartCredit.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="robotId">Robot ID</Label>
            <Input id="robotId" placeholder="rb_..." value={robotId} onChange={(e) => setRobotId(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="email">SmartCredit Email</Label>
            <Input id="email" type="email" placeholder="name@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="password">SmartCredit Password</Label>
            <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="limit-scores">Credit scores limit</Label>
            <Input
              id="limit-scores"
              type="number"
              min={0}
              value={limits.credit_scores_limit}
              onChange={(e) => setLimits({ ...limits, credit_scores_limit: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label htmlFor="limit-details">Report details limit</Label>
            <Input
              id="limit-details"
              type="number"
              min={0}
              value={limits.credit_report_details_limit}
              onChange={(e) => setLimits({ ...limits, credit_report_details_limit: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label htmlFor="limit-comments">Bureaus comments limit</Label>
            <Input
              id="limit-comments"
              type="number"
              min={0}
              value={limits.credit_bureaus_comments_limit}
              onChange={(e) => setLimits({ ...limits, credit_bureaus_comments_limit: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={onStart} disabled={!canStart}>
            <Play className="h-4 w-4 mr-2" />
            Start Import
          </Button>
          {activeTaskId && (
            <div className="text-sm text-muted-foreground">
              Task {activeTaskId} • Status: <span className="font-medium">{activeStatus || "checking..."}</span>
            </div>
          )}
          <Button variant="outline" onClick={fetchRuns} disabled={loadingRuns}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh Runs
          </Button>
        </div>

        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Created</TableHead>
                <TableHead>Robot</TableHead>
                <TableHead>Task</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Linked Report</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell className="font-mono text-xs">{r.robot_id}</TableCell>
                  <TableCell className="font-mono text-xs">{r.task_id || "-"}</TableCell>
                  <TableCell>{r.status}</TableCell>
                  <TableCell className="font-mono text-xs">{r.credit_report_id || "-"}</TableCell>
                </TableRow>
              ))}
              {runs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    No runs yet. Start an import to see activity here.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs text-muted-foreground">
          Note: SmartCredit credentials are only used at run-time to authenticate your session on SmartCredit. They are not stored.
        </p>
      </CardContent>
    </Card>
  );
};
