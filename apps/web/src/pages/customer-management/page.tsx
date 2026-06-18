import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { customersApi } from '../../api/workflow';

export function CustomerManagementPage() {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
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
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customer-options'] });
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createMutation.mutate();
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
            </tr>
          </thead>
          <tbody>
            {result?.items.map((customer) => (
              <tr key={customer.id}>
                <td>{customer.code}</td>
                <td>{customer.name}</td>
                <td>{customer.status}</td>
                <td>{new Date(customer.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {!result || result.items.length === 0 ? (
              <tr>
                <td colSpan={4}>暂无客户</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </section>
  );
}

type CustomerResult = {
  items: Array<{ id: string; code: string; name: string; status: string; createdAt: string }>;
  total: number;
};
