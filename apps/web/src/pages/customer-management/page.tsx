import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit3, Plus, RefreshCw, Save } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { customersApi } from '../../api/workflow';

export function CustomerManagementPage() {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ code: '', name: '' });
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const customersQuery = useQuery({
    queryKey: ['customers'],
    queryFn: () => customersApi.list({ page: 1, pageSize: 50 }),
  });
  const result = customersQuery.data as CustomerResult | undefined;
  const createMutation = useMutation({
    mutationFn: () => customersApi.create({ code, name }),
    onSuccess: () => {
      setCode('');
      setName('');
      setMessage('客户已新增');
      setErrorMessage('');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customer-options'] });
    },
    onError: (error) => setErrorMessage(toUserErrorMessage(error, '新增客户失败')),
  });
  const updateMutation = useMutation({
    mutationFn: (customer: { id: string; code: string; name: string }) =>
      customersApi.update(customer.id, {
        code: customer.code.trim().toUpperCase(),
        name: customer.name.trim(),
      }),
    onSuccess: () => {
      setEditingCustomerId(null);
      setEditDraft({ code: '', name: '' });
      setMessage('客户已保存');
      setErrorMessage('');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customer-options'] });
    },
    onError: (error) => setErrorMessage(toUserErrorMessage(error, '保存客户失败')),
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createMutation.mutate();
  };
  const startEdit = (customer: CustomerRow) => {
    setEditingCustomerId(customer.id);
    setEditDraft({ code: customer.code, name: customer.name });
    setMessage('');
    setErrorMessage('');
  };
  const saveEdit = (customerId: string) => {
    const nextCode = editDraft.code.trim().toUpperCase();
    const nextName = editDraft.name.trim();
    if (!nextCode || !nextName) {
      setErrorMessage('客户编码和客户名称不能为空');
      return;
    }
    updateMutation.mutate({ id: customerId, code: nextCode, name: nextName });
  };

  return (
    <section className="page-frame">
      <div className="page-heading">
        <p>Master Data</p>
        <h1>客户管理</h1>
      </div>

      <form className="panel workflow-form" onSubmit={handleSubmit}>
        <label>
          <span>客户编码</span>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="CUST-001"
          />
        </label>
        <label>
          <span>客户名称</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Customer name"
          />
        </label>
        <button type="submit" disabled={!code || !name || createMutation.isPending}>
          <Plus size={16} />
          新增客户
        </button>
        <button type="button" onClick={() => customersQuery.refetch()}>
          <RefreshCw size={16} />
          刷新
        </button>
      </form>
      {message ? <div className="inline-success">{message}</div> : null}
      {errorMessage ? <div className="inline-error">{errorMessage}</div> : null}

      <section className="panel data-panel">
        <div className="section-title">
          <h2>客户列表</h2>
          <span>共 {result?.total ?? 0} 条</span>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>编码</th>
              <th>名称</th>
              <th>状态</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {result?.items.map((customer) => {
              const isEditing = editingCustomerId === customer.id;
              return (
                <tr key={customer.id}>
                  <td>
                    {isEditing ? (
                      <input
                        className="table-inline-input"
                        value={editDraft.code}
                        onChange={(event) =>
                          setEditDraft((current) => ({
                            ...current,
                            code: event.target.value.toUpperCase(),
                          }))
                        }
                      />
                    ) : (
                      customer.code
                    )}
                  </td>
                  <td>
                    {isEditing ? (
                      <input
                        className="table-inline-input"
                        value={editDraft.name}
                        onChange={(event) =>
                          setEditDraft((current) => ({ ...current, name: event.target.value }))
                        }
                      />
                    ) : (
                      customer.name
                    )}
                  </td>
                  <td>{customer.status}</td>
                  <td>{new Date(customer.createdAt).toLocaleString()}</td>
                  <td>
                    <div className="customer-row-actions">
                      <button
                        type="button"
                        className="table-action secondary"
                        disabled={updateMutation.isPending}
                        onClick={() => startEdit(customer)}
                      >
                        <Edit3 size={14} />
                        编辑
                      </button>
                      <button
                        type="button"
                        className="table-action"
                        disabled={!isEditing || updateMutation.isPending}
                        onClick={() => saveEdit(customer.id)}
                      >
                        <Save size={14} />
                        保存
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!result || result.items.length === 0 ? (
              <tr>
                <td colSpan={5}>暂无客户</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </section>
  );
}

type CustomerResult = {
  items: CustomerRow[];
  total: number;
};

type CustomerRow = { id: string; code: string; name: string; status: string; createdAt: string };

function toUserErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
