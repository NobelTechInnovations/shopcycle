"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { App, Button, Dropdown, Form, Input, Modal, Select, Skeleton, Switch, Tag } from "antd";
import { Plus, MoreHorizontal, Pencil, Trash2, ArrowRight, Workflow, Mail, Activity, Hourglass } from "lucide-react";
import { PageHeader, EmptyState, useConfirmDialog } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { useApps } from "@/lib/apps";
import { useAppActions } from "@/components/apps/useAppActions";
import { StepIcon, TriggerIcon, stepSummary, relative } from "./flow-ui";

function Stat({ icon: Icon, label, value, hint }) {
  return (
    <div className="bg-app-surface border border-app-border rounded-[14px] shadow-card px-4 py-3.5">
      <div className="flex items-center gap-2 text-[12.5px] text-ink-muted">
        <Icon size={14} aria-hidden="true" />
        {label}
      </div>
      <div className="text-[22px] font-semibold text-ink mt-1 tabular-nums" style={{ letterSpacing: "-0.02em" }}>
        {value}
      </div>
      {hint && <div className="text-[12px] text-ink-subtle">{hint}</div>}
    </div>
  );
}

function MiniDiagram({ trigger, steps, catalog }) {
  return (
    <div className="flex items-center gap-1 flex-wrap" aria-label={`${catalog.triggers[trigger]?.label}, then ${steps.length} steps`}>
      <span title={catalog.triggers[trigger]?.label}>
        <TriggerIcon trigger={trigger} size={13} />
      </span>
      {steps.map((s, i) => (
        <span key={s.id || i} className="flex items-center gap-1" title={stepSummary(s, catalog)}>
          <span className="w-2.5 h-px bg-app-border" aria-hidden="true" />
          <StepIcon type={s.type} size={13} className="!w-7 !h-7" />
        </span>
      ))}
    </div>
  );
}

function RecipeCard({ recipe, catalog, onUse, busy }) {
  return (
    <article className="flex flex-col bg-app-surface border border-app-border rounded-[14px] p-4 shadow-card hover:shadow-raised transition-shadow">
      <div className="flex items-center justify-between gap-2">
        <Tag className="!m-0 !border-0 !bg-app-bg !text-ink-muted">{recipe.category}</Tag>
        <span className="text-[12px] text-ink-subtle">{catalog.triggers[recipe.trigger]?.label}</span>
      </div>
      <h3 className="text-[15px] font-semibold text-ink mt-3 mb-1">{recipe.name}</h3>
      <p className="text-[13px] text-ink-muted leading-relaxed m-0 mb-4 flex-1">{recipe.description}</p>
      <div className="flex items-end justify-between gap-2">
        <MiniDiagram trigger={recipe.trigger} steps={recipe.steps} catalog={catalog} />
        <Button size="small" type="primary" loading={busy} onClick={onUse}>
          Use
        </Button>
      </div>
    </article>
  );
}

function NotInstalled() {
  const router = useRouter();
  const { apps } = useApps();
  const { install } = useAppActions();
  const app = (apps || []).find((a) => a.key === "flow");
  return (
    <EmptyState
      icon={<Workflow />}
      title="Install Flow to automate customer emails"
      description="Thank first-time buyers, ask for reviews, win back quiet customers — free."
      actionLabel="Install Flow"
      onAction={async () => app && (await install(app)) && router.refresh()}
      secondary={<Link href="/admin/apps/details/flow">What it does</Link>}
    />
  );
}

export default function FlowHomePage() {
  const router = useRouter();
  const { message } = App.useApp();
  const { confirmDialog } = useConfirmDialog();
  const [data, setData] = useState(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    try {
      setData(await apiFetch("/api/flows"));
      setMissing(false);
    } catch (err) {
      if (err.status === 402) setMissing(true);
      else message.error(err.message);
    }
  }, [message]);

  useEffect(() => {
    load();
    const reload = () => load();
    window.addEventListener("oy:apps-changed", reload);
    return () => window.removeEventListener("oy:apps-changed", reload);
  }, [load]);

  async function create(body) {
    setBusy(body.recipe || "blank");
    try {
      const { flow } = await apiFetch("/api/flows", { method: "POST", body });
      router.push(`/admin/apps/flow/${flow.id}`);
    } catch (err) {
      message.error(err.message);
      setBusy(null);
    }
  }

  async function toggle(flow, enabled) {
    setData((d) => ({ ...d, flows: d.flows.map((f) => (f.id === flow.id ? { ...f, enabled } : f)) }));
    try {
      await apiFetch(`/api/flows/${flow.id}`, { method: "PATCH", body: { enabled } });
      message.success(enabled ? `“${flow.name}” is on` : `“${flow.name}” is off`);
      load();
    } catch (err) {
      message.error(err.message);
      load();
    }
  }

  function remove(flow) {
    confirmDialog({
      title: `Delete “${flow.name}”?`,
      description: "It stops straight away, including any runs that are waiting. This can't be undone.",
      okText: "Delete",
      danger: true,
      onConfirm: async () => {
        await apiFetch(`/api/flows/${flow.id}`, { method: "DELETE" });
        message.success("Flow deleted");
        load();
      },
    });
  }

  if (missing) return <NotInstalled />;
  if (!data) return <Skeleton active paragraph={{ rows: 8 }} />;
  const { flows, stats, catalog } = data;

  return (
    <div>
      <PageHeader
        title="Flow"
        subtitle="Emails that send themselves — a trigger, then waits, conditions and messages."
        actions={
          <Button type="primary" icon={<Plus size={15} aria-hidden="true" />} onClick={() => setCreating(true)}>
            Create flow
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Stat icon={Workflow} label="Active flows" value={stats.active} hint={`${flows.length} in total`} />
        <Stat icon={Activity} label="Runs · 30 days" value={stats.runs30} />
        <Stat icon={Hourglass} label="Waiting now" value={stats.waiting} hint="Paused on a Wait step" />
        <Stat icon={Mail} label="Emails sent" value={stats.emailsSent} hint="All time" />
      </div>

      {flows.length > 0 && (
        <section className="mb-8">
          <h2 className="text-[15px] font-semibold text-ink mb-3">Your flows</h2>
          <ul className="list-none m-0 p-0 bg-app-surface border border-app-border rounded-[14px] shadow-card divide-y divide-app-border overflow-hidden">
            {flows.map((flow) => (
              <li key={flow.id} className="flex flex-col md:flex-row md:items-center gap-3 px-4 py-3.5 hover:bg-app-bg/60 transition-colors">
                <Link href={`/admin/apps/flow/${flow.id}`} className="flex items-center gap-3 min-w-0 flex-1 no-underline">
                  <TriggerIcon trigger={flow.trigger} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-medium text-ink truncate">{flow.name}</span>
                      <span className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${flow.enabled ? "bg-[#E7F7EE] text-status-success" : "bg-app-bg text-ink-muted"}`}>{flow.enabled ? "On" : "Off"}</span>
                    </div>
                    <div className="text-[12.5px] text-ink-muted truncate">
                      When {catalog.triggers[flow.trigger]?.label.toLowerCase()} · {flow.steps.length} step{flow.steps.length === 1 ? "" : "s"}
                    </div>
                  </div>
                </Link>
                <div className="hidden lg:block">
                  <MiniDiagram trigger={flow.trigger} steps={flow.steps} catalog={catalog} />
                </div>
                <div className="flex items-center gap-5 text-[12.5px] text-ink-muted md:w-[260px] md:justify-end">
                  <span className="tabular-nums" title="Times it started">
                    <b className="text-ink font-medium">{flow.runsCount}</b> runs
                  </span>
                  <span className="tabular-nums">
                    <b className="text-ink font-medium">{flow.emailsSent}</b> emails
                  </span>
                  <span>{relative(flow.lastRunAt)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Switch size="small" checked={flow.enabled} onChange={(v) => toggle(flow, v)} aria-label={`${flow.enabled ? "Turn off" : "Turn on"} ${flow.name}`} />
                  <Dropdown
                    trigger={["click"]}
                    placement="bottomRight"
                    menu={{
                      items: [
                        { key: "edit", icon: <Pencil size={14} aria-hidden="true" />, label: "Edit", onClick: () => router.push(`/admin/apps/flow/${flow.id}`) },
                        { key: "delete", icon: <Trash2 size={14} aria-hidden="true" />, label: "Delete", danger: true, onClick: () => remove(flow) },
                      ],
                    }}
                  >
                    <Button type="text" size="small" icon={<MoreHorizontal size={16} aria-hidden="true" />} aria-label={`${flow.name} options`} />
                  </Dropdown>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="flex items-end justify-between gap-3 mb-3">
          <div>
            <h2 className="text-[15px] font-semibold text-ink m-0">{flows.length ? "More recipes" : "Start with a recipe"}</h2>
            <p className="text-[13px] text-ink-muted mt-0.5 mb-0">Ready-made flows. Use one, change the words, send yourself a test, switch it on.</p>
          </div>
          <Button type="link" className="!px-0" onClick={() => setCreating(true)}>
            Or start from scratch <ArrowRight size={13} aria-hidden="true" />
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {catalog.recipes.map((r) => (
            <RecipeCard key={r.key} recipe={r} catalog={catalog} busy={busy === r.key} onUse={() => create({ recipe: r.key })} />
          ))}
        </div>
      </section>

      <Modal title="Create a flow" open={creating} onCancel={() => setCreating(false)} onOk={() => form.submit()} okText="Create" confirmLoading={busy === "blank"} destroyOnHidden>
        <Form form={form} layout="vertical" requiredMark={false} className="mt-3" initialValues={{ trigger: "order_placed" }} onFinish={(v) => create({ name: v.name, trigger: v.trigger, steps: [] })}>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: "Give it a name" }]}>
            <Input placeholder="e.g. Thank VIP customers" autoFocus maxLength={120} />
          </Form.Item>
          <Form.Item name="trigger" label="Starts when" extra="You'll add steps next.">
            <Select
              options={Object.entries(catalog.triggers).map(([value, t]) => ({ value, label: t.label }))}
              optionRender={(o) => (
                <div className="py-0.5">
                  <div className="text-[13.5px]">{o.label}</div>
                  <div className="text-[12px] text-ink-muted whitespace-normal">{catalog.triggers[o.value].hint}</div>
                </div>
              )}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
