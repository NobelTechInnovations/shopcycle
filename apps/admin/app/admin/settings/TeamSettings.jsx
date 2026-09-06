"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Button, Modal, Form, Input, Select, Tag, App } from "antd";
import { Plus, Trash2, Copy } from "lucide-react";
import { useConfirmDialog } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

const ROLE_OPTIONS = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "staff", label: "Staff" },
];

const INVITE_ROLE_OPTIONS = ROLE_OPTIONS.filter((r) => r.value !== "owner");

export function TeamSettings() {
  const { message } = App.useApp();
  const { confirmDialog } = useConfirmDialog();
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/api/team");
      setMembers(data.members);
      setInvitations(data.invitations);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleInvite(values) {
    try {
      await apiFetch("/api/team/invite", { method: "POST", body: values });
      message.success("Invitation created");
      setInviteOpen(false);
      form.resetFields();
      load();
    } catch (err) {
      message.error(err.message);
    }
  }

  async function handleRoleChange(member, role) {
    try {
      await apiFetch(`/api/team/${member.id}`, { method: "PATCH", body: { role } });
      load();
    } catch (err) {
      message.error(err.message);
    }
  }

  function handleRemove(member) {
    confirmDialog({
      title: `Remove ${member.user.name}?`,
      description: "They'll immediately lose access to this store.",
      okText: "Remove",
      danger: true,
      onConfirm: async () => {
        try {
          await apiFetch(`/api/team/${member.id}`, { method: "DELETE" });
          load();
        } catch (err) {
          message.error(err.message);
        }
      },
    });
  }

  function handleCancelInvite(invitation) {
    confirmDialog({
      title: `Cancel invitation to ${invitation.email}?`,
      okText: "Cancel invite",
      danger: true,
      onConfirm: async () => {
        await apiFetch(`/api/team/invitations/${invitation.id}`, { method: "DELETE" });
        load();
      },
    });
  }

  function copyInviteLink(invitation) {
    const url = `${window.location.origin}/accept-invite?token=${invitation.token}`;
    navigator.clipboard.writeText(url);
    message.success("Invite link copied — share it with them directly (no email is sent automatically yet)");
  }

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <div className="flex justify-end">
        <Button type="primary" icon={<Plus size={14} aria-hidden="true" />} onClick={() => setInviteOpen(true)}>
          Invite team member
        </Button>
      </div>

      <Card size="small" title="Members" loading={loading}>
        {members.map((member) => (
          <div key={member.id} className="flex items-center justify-between py-2 border-t border-app-border first:border-t-0">
            <div>
              <p className="text-sm m-0 font-medium">{member.user.name}</p>
              <p className="text-xs text-ink-muted m-0">{member.user.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <Select
                size="small"
                value={member.role}
                options={ROLE_OPTIONS}
                style={{ width: 100 }}
                onChange={(role) => handleRoleChange(member, role)}
              />
              <Button type="text" danger size="small" icon={<Trash2 size={13} aria-hidden="true" />} onClick={() => handleRemove(member)} />
            </div>
          </div>
        ))}
      </Card>

      {invitations.length > 0 && (
        <Card size="small" title="Pending invitations">
          {invitations.map((invitation) => (
            <div key={invitation.id} className="flex items-center justify-between py-2 border-t border-app-border first:border-t-0">
              <div>
                <p className="text-sm m-0">{invitation.email}</p>
                <Tag className="mt-1">{invitation.role}</Tag>
              </div>
              <div className="flex items-center gap-2">
                <Button size="small" icon={<Copy size={12} aria-hidden="true" />} onClick={() => copyInviteLink(invitation)}>
                  Copy invite link
                </Button>
                <Button type="text" danger size="small" icon={<Trash2 size={13} aria-hidden="true" />} onClick={() => handleCancelInvite(invitation)} />
              </div>
            </div>
          ))}
        </Card>
      )}

      <Modal title="Invite team member" open={inviteOpen} onCancel={() => setInviteOpen(false)} onOk={() => form.submit()} okText="Send invite" destroyOnHidden>
        <Form layout="vertical" form={form} onFinish={handleInvite} requiredMark={false} initialValues={{ role: "staff" }}>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: "email", message: "Enter a valid email" }]}>
            <Input placeholder="teammate@example.com" />
          </Form.Item>
          <Form.Item name="role" label="Role" className="mb-0">
            <Select options={INVITE_ROLE_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
