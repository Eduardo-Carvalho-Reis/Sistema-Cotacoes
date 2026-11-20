import { useState } from 'react';
import { Building2, Boxes, Check, HardHat, Package, Pencil, Plus, Search, Users, X } from 'lucide-react';
import { money, statusNames } from '../utils/formatters.js';
import { Badge, Button, Empty, PageTitle } from '../components/index.js';

const catalogTabs = [
  { id: 'products', label: 'Produtos' }, { id: 'categories', label: 'Categorias' },
  { id: 'suppliers', label: 'Fornecedores' }, { id: 'works', label: 'Obras' },
  { id: 'equipment', label: 'Equipamentos' }, { id: 'applications', label: 'Aplicacoes' },
];
const catalogSchema = {
  products: [{ key: 'nome', label: 'Nome do produto', required: true }, { key: 'referencia', label: 'Referencia' }, { key: 'especificacao', label: 'Especificacao' }, { key: 'categoriaId', label: 'Categoria', type: 'select' }, { key: 'unidade', label: 'Unidade', defaultValue: 'UN' }, { key: 'precoAtual', label: 'Preco de referencia', type: 'number' }],
  categories: [{ key: 'nome', label: 'Nome da categoria', required: true }, { key: 'descricao', label: 'Descricao' }],
  suppliers: [{ key: 'nome', label: 'Nome ou razao social', required: true }, { key: 'cnpj', label: 'CNPJ' }, { key: 'telefone', label: 'Telefone / WhatsApp' }, { key: 'email', label: 'E-mail', type: 'email' }, { key: 'endereco', label: 'Endereco' }],
  works: [{ key: 'nome', label: 'Nome da obra', required: true }, { key: 'endereco', label: 'Endereco' }],
  equipment: [{ key: 'nome', label: 'Nome', required: true }, { key: 'chassi', label: 'Chassi' }, { key: 'potenciaCapacidade', label: 'Potencia / capacidade' }, { key: 'ano', label: 'Ano', type: 'number' }, { key: 'placa', label: 'Placa' }],
  applications: [{ key: 'nome', label: 'Nome', required: true }, { key: 'tipo', label: 'Tipo (EQUIPAMENTO ou AREA)', defaultValue: 'AREA' }],
};
const endpoints = { products: '/produto', categories: '/api/catalogos/categorias-produto', suppliers: '/fornecedor', works: '/api/catalogos/obras', equipment: '/api/catalogos/equipamentos', applications: '/api/catalogos/aplicacoes' };
const dataKeys = { products: 'products', categories: 'categories', suppliers: 'suppliers', works: 'works', equipment: 'equipment', applications: 'applications' };

function Catalog({ data, api, refresh, notify, user }) {
  const [tab, setTab] = useState('products');
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const perfil = typeof user?.perfil === 'string' ? user.perfil : user?.perfil?.nome;
  const admin = ['ADMINISTRADOR', 'ADMINISTRADOR_SISTEMA'].includes(perfil);
  const tabs = catalogTabs.filter(item => item.id !== 'categories' || admin);
  const current = tabs.find(item => item.id === tab) || tabs[0];
  const rows = (data[dataKeys[tab]] || []).filter(row => `${row.nome} ${row.referencia || ''} ${row.categoria?.nome || ''}`.toLowerCase().includes(query.toLowerCase()));
  const Icon = { products: Package, categories: Boxes, suppliers: Users, works: Building2, equipment: HardHat, applications: Boxes }[tab];
  const fields = tab === 'products' ? catalogSchema.products : catalogSchema[tab];
  const closeForm = () => { setShowForm(false); setEditing(null); };

  const save = async values => {
    try {
      const body = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== ''));
      if (body.precoAtual !== undefined) body.precoAtual = Number(body.precoAtual);
      if (body.categoriaId !== undefined) body.categoriaId = Number(body.categoriaId);
      if (body.ano !== undefined) body.ano = Number(body.ano);
      const editingRow = Boolean(editing);
      await api(editingRow ? `${endpoints[tab]}/${editing.id}` : endpoints[tab], { method: editingRow ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      await refresh(); notify(editingRow ? 'Cadastro atualizado.' : 'Cadastro adicionado.'); closeForm();
    } catch (error) { notify(error.message); }
  };
  const disable = async row => {
    try { await api(`${endpoints[tab]}/${row.id}`, { method: 'DELETE' }); await refresh(); notify('Registro desativado.'); }
    catch (error) { notify(error.message); }
  };

  return <>
    <PageTitle eyebrow="BASE OPERACIONAL" title="Cadastros" description="Mantenha produtos, categorias, fornecedores e obras usados nas cotacoes." action={tab !== 'categories' || admin ? <Button onClick={() => { setEditing(null); setShowForm(value => !value); }}><Plus size={17}/> Novo cadastro</Button> : null}/>
    <div className="catalog-tabs">{tabs.map(item => <button className={tab === item.id ? 'selected' : ''} key={item.id} onClick={() => { setTab(item.id); closeForm(); }}><span>{item.label}</span><em>{data[dataKeys[item.id]]?.length || 0}</em></button>)}</div>
    {showForm && <CatalogForm key={`${tab}-${editing?.id || 'new'}`} fields={fields} categories={data.categories || []} initialValues={editing || undefined} title={editing ? `Editar ${current.label.slice(0, -1).toLowerCase()}` : `Novo ${current.label.slice(0, -1).toLowerCase()}`} onSave={save} onCancel={closeForm}/>}
    <div className="toolbar"><div className="search-input"><Search size={16}/><input placeholder={`Buscar ${current.label.toLowerCase()}`} value={query} onChange={event => setQuery(event.target.value)}/></div><span className="result-count">{rows.length} registros</span></div>
    <div className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>{current.label.slice(0, -1)}</th><th>Informacoes</th><th>Status</th><th>Acoes</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}>
      <td><div className="catalog-name"><span className="catalog-icon"><Icon size={16}/></span><div><b>{row.nome}</b><small className="cell-sub">ID {String(row.id).padStart(4, '0')}</small></div></div></td>
      <td>{tab === 'products' ? <>{row.especificacao || row.referencia || 'Sem especificacao'} · {row.unidade}{row.categoria?.nome ? ` · ${row.categoria.nome}` : ''}{row.precoAtual ? ` · ${money(row.precoAtual)}` : ''}</> : tab === 'categories' ? (row.descricao || '-') : tab === 'suppliers' ? <>{row.telefone || 'Sem telefone'}{row.email ? ` · ${row.email}` : ''}</> : tab === 'works' ? (row.endereco || 'Sem endereco') : tab === 'equipment' ? [row.chassi, row.placa, row.ano].filter(Boolean).join(' · ') || '-' : statusNames[row.tipo] || row.tipo}</td>
      <td><Badge value={row.ativo === false ? 'CANCELADA' : 'APROVADA'}/></td>
      <td><div className="row-actions">{(tab !== 'categories' || admin) && <><button className="icon-button" title="Editar cadastro" aria-label={`Editar ${row.nome}`} onClick={() => { setEditing(row); setShowForm(true); }}><Pencil size={16}/></button><button className="icon-button" title="Desativar" aria-label={`Desativar ${row.nome}`} onClick={() => disable(row)}><X size={16}/></button></>}</div></td>
    </tr>)}</tbody></table>{!rows.length && <Empty icon={Icon} title={`Sem ${current.label.toLowerCase()} cadastrados`} body="Adicione um registro para usar nas proximas cotacoes."/>}</div></div>
  </>;
}

function CatalogForm({ fields, categories, initialValues, title, onSave, onCancel }) {
  const [values, setValues] = useState(Object.fromEntries(fields.map(field => [field.key, initialValues?.[field.key] ?? field.defaultValue ?? ''])));
  return <form className="panel catalog-form" onSubmit={event => { event.preventDefault(); onSave(values); }}>
    <div className="catalog-form-head"><div><span className="eyebrow">{initialValues ? 'EDITAR REGISTRO' : 'NOVO REGISTRO'}</span><h2>{title}</h2></div><button type="button" className="icon-button" onClick={onCancel}><X size={17}/></button></div>
    <div className="catalog-form-grid">{fields.map(field => <label className="field-label" key={field.key}>{field.label}{field.type === 'select' ? <select value={values[field.key] || ''} onChange={event => setValues(current => ({ ...current, [field.key]: event.target.value }))}><option value="">Sem categoria</option>{categories.filter(category => category.ativo !== false).map(category => <option key={category.id} value={category.id}>{category.nome}</option>)}</select> : <input required={field.required} type={field.type || 'text'} step={field.type === 'number' ? '0.01' : undefined} min={field.type === 'number' ? '0' : undefined} value={values[field.key]} onChange={event => setValues(current => ({ ...current, [field.key]: event.target.value }))}/>}</label>)}</div>
    <div className="catalog-form-actions"><button type="button" className="button secondary" onClick={onCancel}>Cancelar</button><Button type="submit"><Check size={15}/>{initialValues ? 'Salvar alteracoes' : 'Salvar cadastro'}</Button></div>
  </form>;
}

export { Catalog, CatalogForm };
