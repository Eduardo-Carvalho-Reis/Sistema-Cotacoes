import { useState } from 'react';
import { Building2, Boxes, Check, HardHat, Package, Pencil, Plus, Search, Users, X } from 'lucide-react';
import { money, statusNames } from '../utils/formatters.js';
import { Badge, Button, Empty, PageTitle } from '../components/index.js';

const catalogTabs = [
  { id: 'products', label: 'Produtos' },
  { id: 'suppliers', label: 'Fornecedores' },
  { id: 'works', label: 'Obras' },
  { id: 'equipment', label: 'Equipamentos' },
  { id: 'applications', label: 'Aplicações' },
];

const catalogSchema = {
  products: [{ key: 'nome', label: 'Nome do produto', required: true }, { key: 'referencia', label: 'Referência' }, { key: 'unidade', label: 'Unidade', defaultValue: 'UN' }, { key: 'precoAtual', label: 'Preço de referência', type: 'number' }],
  suppliers: [{ key: 'nome', label: 'Nome ou razão social', required: true }, { key: 'cnpj', label: 'CNPJ' }, { key: 'telefone', label: 'Telefone / WhatsApp' }, { key: 'email', label: 'E-mail', type: 'email' }, { key: 'endereco', label: 'Endereço' }],
  works: [{ key: 'nome', label: 'Nome da obra', required: true }, { key: 'endereco', label: 'Endereço' }],
  equipment: [{ key: 'nome', label: 'Nome', required: true }, { key: 'chassi', label: 'Chassi' }, { key: 'potenciaCapacidade', label: 'Potência / capacidade' }, { key: 'ano', label: 'Ano', type: 'number' }, { key: 'placa', label: 'Placa' }],
  applications: [{ key: 'nome', label: 'Nome', required: true }, { key: 'tipo', label: 'Tipo (EQUIPAMENTO ou AREA)', defaultValue: 'AREA' }],
};

const endpoints = {
  products: '/produto',
  suppliers: '/fornecedor',
  works: '/api/catalogos/obras',
  equipment: '/api/catalogos/equipamentos',
  applications: '/api/catalogos/aplicacoes',
};

function Catalog({ data, api, refresh, notify }) {
  const [tab, setTab] = useState('products');
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const current = catalogTabs.find(item => item.id === tab);
  const rows = (data[{ products: 'products', suppliers: 'suppliers', works: 'works', equipment: 'equipment', applications: 'applications' }[tab]] || [])
    .filter(row => `${row.nome} ${row.referencia || ''}`.toLowerCase().includes(query.toLowerCase()));
  const Icon = { products: Package, suppliers: Users, works: Building2, equipment: HardHat, applications: Boxes }[tab];

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
  };

  const save = async values => {
    try {
      const body = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== ''));
      if (body.precoAtual !== undefined) body.precoAtual = Number(body.precoAtual);
      if (body.ano !== undefined) body.ano = Number(body.ano);
      const isEditing = Boolean(editing);
      await api(isEditing ? `${endpoints[tab]}/${editing.id}` : endpoints[tab], {
        method: isEditing ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      await refresh();
      notify(isEditing ? 'Cadastro atualizado.' : 'Cadastro adicionado.');
      closeForm();
    } catch (error) {
      notify(error.message);
    }
  };

  const disable = async row => {
    try {
      await api(`${endpoints[tab]}/${row.id}`, { method: 'DELETE' });
      await refresh();
      notify('Registro desativado.');
    } catch (error) {
      notify(error.message);
    }
  };

  const startEdit = row => {
    setEditing(row);
    setShowForm(true);
  };

  return <>
    <PageTitle
      eyebrow="BASE OPERACIONAL"
      title="Cadastros"
      description="Mantenha as informações usadas para preparar e acompanhar as cotações."
      action={<Button onClick={() => { setEditing(null); setShowForm(value => !value); }}><Plus size={17}/> Novo cadastro</Button>}
    />
    <div className="catalog-tabs">
      {catalogTabs.map(item => <button className={tab === item.id ? 'selected' : ''} key={item.id} onClick={() => { setTab(item.id); closeForm(); }}>
        <span>{item.label}</span><em>{data[item.id]?.length || 0}</em>
      </button>)}
    </div>
    {showForm && <CatalogForm
      key={`${tab}-${editing?.id || 'new'}`}
      fields={catalogSchema[tab]}
      initialValues={editing || undefined}
      title={editing ? `Editar ${current.label.slice(0, -1).toLowerCase()}` : `Novo ${current.label.slice(0, -1).toLowerCase()}`}
      onSave={save}
      onCancel={closeForm}
    />}
    <div className="toolbar">
      <div className="search-input"><Search size={16}/><input placeholder={`Buscar ${current.label.toLowerCase()}`} value={query} onChange={event => setQuery(event.target.value)}/></div>
      <span className="result-count">{rows.length} registros</span>
    </div>
    <div className="panel table-panel"><div className="table-scroll"><table>
      <thead><tr><th>{current.label.slice(0, -1)}</th><th>Informações</th><th>Status</th><th>Ações</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.id}>
        <td><div className="catalog-name"><span className="catalog-icon"><Icon size={16}/></span><div><b>{row.nome}</b><small className="cell-sub">ID {String(row.id).padStart(4, '0')}</small></div></div></td>
        <td>{tab === 'products' ? <>{row.referencia || 'Sem referência'} · {row.unidade}{row.precoAtual ? ` · ${money(row.precoAtual)}` : ''}</> : tab === 'suppliers' ? <>{row.telefone || 'Sem telefone'}{row.email ? ` · ${row.email}` : ''}</> : tab === 'works' ? (row.endereco || 'Sem endereço') : tab === 'equipment' ? [row.chassi, row.placa, row.ano].filter(Boolean).join(' · ') || '—' : statusNames[row.tipo] || row.tipo}</td>
        <td><Badge value={row.ativo === false ? 'CANCELADA' : 'APROVADA'}/></td>
        <td><div className="row-actions"><button className="icon-button" title="Editar cadastro" aria-label={`Editar ${row.nome}`} onClick={() => startEdit(row)}><Pencil size={16}/></button><button className="icon-button" title="Desativar" aria-label={`Desativar ${row.nome}`} onClick={() => disable(row)}><X size={16}/></button></div></td>
      </tr>)}</tbody>
    </table>{!rows.length && <Empty icon={Icon} title={`Sem ${current.label.toLowerCase()} cadastrados`} body="Adicione um registro para usar nas próximas cotações."/>}</div></div>
  </>;
}

function CatalogForm({ fields, initialValues, title, onSave, onCancel }) {
  const [values, setValues] = useState(Object.fromEntries(fields.map(field => [field.key, initialValues?.[field.key] ?? field.defaultValue ?? ''])));

  return <form className="panel catalog-form" onSubmit={event => { event.preventDefault(); onSave(values); }}>
    <div className="catalog-form-head"><div><span className="eyebrow">{initialValues ? 'EDITAR REGISTRO' : 'NOVO REGISTRO'}</span><h2>{title}</h2></div><button type="button" className="icon-button" onClick={onCancel}><X size={17}/></button></div>
    <div className="catalog-form-grid">{fields.map(field => <label className="field-label" key={field.key}>{field.label}<input required={field.required} type={field.type || 'text'} step={field.type === 'number' ? '0.01' : undefined} min={field.type === 'number' ? '0' : undefined} value={values[field.key]} onChange={event => setValues(current => ({ ...current, [field.key]: event.target.value }))}/></label>)}</div>
    <div className="catalog-form-actions"><button type="button" className="button secondary" onClick={onCancel}>Cancelar</button><Button type="submit"><Check size={15}/>{initialValues ? 'Salvar alterações' : 'Salvar cadastro'}</Button></div>
  </form>;
}

export { Catalog, CatalogForm };
