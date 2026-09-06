"use client";

import { Modal, Form, Select, Input } from "antd";

const FOLDER_OPTIONS = ["sections", "snippets", "templates", "config", "assets", "locales"].map((f) => ({
  value: f,
  label: f,
}));

export function NewFileModal({ open, onClose, onCreate }) {
  const [form] = Form.useForm();

  function handleOk() {
    form.validateFields().then((values) => {
      const path = `${values.folder}/${values.filename}`;
      onCreate(path);
      form.resetFields();
    });
  }

  return (
    <Modal title="New file" open={open} onCancel={onClose} onOk={handleOk} okText="Create" destroyOnHidden>
      <Form layout="vertical" form={form} initialValues={{ folder: "sections" }} requiredMark={false}>
        <Form.Item name="folder" label="Folder" rules={[{ required: true }]}>
          <Select options={FOLDER_OPTIONS} />
        </Form.Item>
        <Form.Item
          name="filename"
          label="File name"
          rules={[
            { required: true, message: "File name is required" },
            {
              pattern: /^[a-z0-9][a-z0-9-]*\.(liquid|json|css|js)$/,
              message: "Use lowercase letters, numbers, hyphens, and a .liquid/.json/.css/.js extension",
            },
          ]}
        >
          <Input placeholder="my-section.liquid" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
