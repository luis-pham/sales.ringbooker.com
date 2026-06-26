"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { BarChart3, Users } from "lucide-react";
import { StatCard } from "@/components/overview/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LeadStage } from "@/types";

const FunnelChart = dynamic(() => import("@/components/overview/FunnelChart").then((mod) => mod.FunnelChart), {
  ssr: false,
  loading: () => null,
});

const TrendChart = dynamic(() => import("@/components/overview/TrendChart").then((mod) => mod.TrendChart), {
  ssr: false,
  loading: () => null,
});

const AlertsBlock = dynamic(() => import("@/components/overview/AlertsBlock").then((mod) => mod.AlertsBlock), {
  ssr: false,
  loading: () => null,
});

const VelocityBlock = dynamic(() => import("@/components/overview/VelocityBlock").then((mod) => mod.VelocityBlock), {
  ssr: false,
  loading: () => null,
});

const TeamTable = dynamic(() => import("@/components/overview/TeamTable").then((mod) => mod.TeamTable), {
  ssr: false,
  loading: () => null,
});

/** Splits "active leads" into what's actually being worked vs sitting in the pool. */
function InventoryCard({
  inventory,
}: {
  inventory: {
    inProgress: number;
    readyTotal: number;
    pool: { p1: number; p2: number; p3: number; total: number };
  };
}) {
  const notAssignable = Math.max(0, inventory.readyTotal - inventory.pool.total);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Kho lead</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-3">
          {/* In progress */}
          <div className="rounded-lg border border-border p-3">
            <div className="text-xs text-muted">Đang xử lý</div>
            <div className="mt-1 text-2xl font-semibold text-violet-700">{inventory.inProgress}</div>
            <div className="mt-0.5 text-xs text-muted">Đang được xử lý (đã gửi → dùng thử)</div>
          </div>

          {/* Assignable pool by priority */}
          <div className="rounded-lg border border-border p-3">
            <div className="text-xs text-muted">Kho có thể giao</div>
            <div className="mt-1 text-2xl font-semibold text-emerald-600">{inventory.pool.total}</div>
            <div className="mt-1 flex flex-wrap gap-2 text-xs">
              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">P1 {inventory.pool.p1}</span>
              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">P2 {inventory.pool.p2}</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">P3 {inventory.pool.p3}</span>
            </div>
            <div className="mt-1 text-xs text-muted">Sẵn sàng · có social · chưa giao</div>
          </div>

          {/* Raw ready */}
          <div className="rounded-lg border border-border p-3">
            <div className="text-xs text-muted">Sẵn sàng thô</div>
            <div className="mt-1 text-2xl font-semibold text-text">{inventory.readyTotal}</div>
            <div className="mt-0.5 text-xs text-muted">
              {notAssignable} không thể giao (không có social / chưa chấm điểm / đã giao)
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type Pipeline = {
  activeLeads: number;
  hotNow: number;
  dmsSentThisWeek: number;
  viewsThisWeek: number;
  viewRate: number;
  convertedThisMonth: number;
  trialConvertedRate: number;
  avgDemoPct: number;
  funnel: Array<{ stage: LeadStage; count: number }>;
  velocity: {
    sentToViewed: number | null;
    viewedToReplied: number | null;
    repliedToSignedup: number | null;
  };
  trend: Array<{ date: string; label: string; dmsSent: number; views: number; conversions: number }>;
  alerts: { stuckLeads: number; hotUncontacted: number; trialOverdue: number };
  inventory: {
    inProgress: number;
    readyTotal: number;
    pool: { p1: number; p2: number; p3: number; total: number };
  };
};

type Team = {
  activeOutreachers: number;
  teamDmsThisWeek: number;
  members: Array<{
    id: string;
    name: string;
    email: string;
    assigned: number;
    active: number;
    dmsSentThisWeek: number;
    viewsThisWeek: number;
    converted: number;
    ghostedPct: number;
  }>;
};

type Tab = "pipeline" | "team";

export function OverviewClient({
  pipeline,
  team,
}: {
  pipeline: Pipeline;
  team: Team;
}) {
  const [tab, setTab] = useState<Tab>("pipeline");

  const alertTotal =
    pipeline.alerts.hotUncontacted +
    pipeline.alerts.trialOverdue +
    pipeline.alerts.stuckLeads;

  const tabs: Array<{ id: Tab; label: string; icon: React.ElementType; badge?: number }> = [
    { id: "pipeline", label: "Pipeline",    icon: BarChart3, badge: alertTotal || undefined },
    { id: "team",     label: "Đội ngũ",     icon: Users },
  ];

  return (
    <div className="space-y-5">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border">
        {tabs.map(({ id, label, icon: Icon, badge }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === id
                ? "border-violet-600 text-violet-700"
                : "border-transparent text-muted hover:text-text"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {badge ? (
              <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-xs text-white leading-none">
                {badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Pipeline tab */}
      {tab === "pipeline" && (
        <div className="space-y-5">
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              label="Lead đang hoạt động"
              value={pipeline.activeLeads}
              sub="Không gồm đã chuyển đổi / mất liên lạc / rời bỏ"
            />
            <StatCard
              label="Đang quan tâm cao"
              value={pipeline.hotNow}
              sub="Cần theo dõi hôm nay"
              accent={pipeline.hotNow > 0 ? "red" : undefined}
            />
            <StatCard
              label="DM đã gửi tuần này"
              value={pipeline.dmsSentThisWeek}
            />
            <StatCard
              label="Lượt xem demo tuần này"
              value={pipeline.viewsThisWeek}
              accent="violet"
            />
            <StatCard
              label="Tỷ lệ xem"
              value={`${pipeline.viewRate}%`}
              sub="Đã gửi → đã xem"
              accent={pipeline.viewRate >= 50 ? "emerald" : pipeline.viewRate >= 25 ? "amber" : "red"}
            />
            <StatCard
              label="Chuyển đổi tháng này"
              value={pipeline.convertedThisMonth}
              accent={pipeline.convertedThisMonth > 0 ? "emerald" : undefined}
            />
            <StatCard
              label="Dùng thử → chuyển đổi"
              value={`${pipeline.trialConvertedRate}%`}
              sub="Trong nhóm lead dùng thử"
            />
            <StatCard
              label="Thời lượng xem demo TB"
              value={`${pipeline.avgDemoPct}%`}
              sub="Trên tất cả phiên"
              accent={pipeline.avgDemoPct >= 70 ? "emerald" : pipeline.avgDemoPct >= 40 ? "amber" : "red"}
            />
          </div>

          {/* Lead inventory — breaks "active" into in-progress vs assignable pool vs raw ready */}
          <InventoryCard inventory={pipeline.inventory} />

          {/* Alerts */}
          {alertTotal > 0 && <AlertsBlock alerts={pipeline.alerts} />}

          {/* Trend + Funnel */}
          <div className="grid gap-4 md:grid-cols-2">
            <TrendChart trend={pipeline.trend} />
            <FunnelChart funnel={pipeline.funnel} />
          </div>

          {/* Velocity */}
          <VelocityBlock velocity={pipeline.velocity} />
        </div>
      )}

      {/* Team tab */}
      {tab === "team" && (
        <div className="space-y-5">
          {/* Team summary cards */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <StatCard
              label="Outreacher đang hoạt động"
              value={team.activeOutreachers}
            />
            <StatCard
              label="DM đội ngũ tuần này"
              value={team.teamDmsThisWeek}
              accent="violet"
            />
            <StatCard
              label="Tổng chuyển đổi"
              value={team.members.reduce((s, m) => s + m.converted, 0)}
              accent="emerald"
            />
          </div>

          {/* Per-person table */}
          <TeamTable members={team.members} />

          {/* Legend note */}
          <p className="text-xs text-muted">
            DM đã gửi / lượt xem được tính trong tuần này (7 ngày gần nhất). % mất liên lạc là toàn thời gian.
          </p>
        </div>
      )}
    </div>
  );
}
