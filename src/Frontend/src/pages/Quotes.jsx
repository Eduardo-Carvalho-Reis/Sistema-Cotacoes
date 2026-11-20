import { useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowDownToLine, ArrowLeft, ArrowRight, BadgeCheck, Bell, Boxes, Building2,
  Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, ClipboardList, Clock3,
  FileCheck2, FileText, Gauge, HardHat, LayoutDashboard, LogOut, Menu, MessageCircle,
  Package, Plus, Search, Send, Settings2, ShoppingCart, SlidersHorizontal, Truck,
  Users, WalletCards, X, Pencil, Ban, Trash2,
} from 'lucide-react';

import { money, date, statusNames } from '../utils/formatters.js';
import { PageTitle, Button, Badge, Empty, Stat } from '../components/index.js';
import { exportPdf } from '../utils/exportPdf.js';

function SearchableSelect({ options, value, onChange, placeholder, getLabel, className = '', clearLabel = 'Limpar seleção', createLabel, onCreate }) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const selected = options.find(option => String(option.id) === String(value));
  const search = query || (selected ? getLabel(selected) : '');
  const matches = options.filter(option => getLabel(option).toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR')));
  const visible = search.trim() ? matches.slice(0, 10) : options.slice(0, 10);
  return <div className={`searchable-select ${className}`} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setIsOpen(false); }}>
    <div className="searchable-select-input"><Search size={14}/><input value={search} placeholder={placeholder} onFocus={() => setIsOpen(true)} onClick={() => setIsOpen(true)} onChange={e => { setQuery(e.target.value); setIsOpen(true); if (value) onChange(''); }} onKeyDown={e => { if (e.key === 'Escape') setIsOpen(false); }} autoComplete="off"/></div>
    {isOpen && <div className="searchable-select-options">
      {value && <button type="button" className="searchable-select-option searchable-select-clear" onClick={() => { onChange(''); setQuery(''); setIsOpen(false); }}>{clearLabel}</button>}
      {visible.map(option => <button type="button" key={option.id} className={`searchable-select-option ${String(option.id) === String(value) ? 'selected' : ''}`} onClick={() => { onChange(String(option.id)); setQuery(''); setIsOpen(false); }}>{getLabel(option)}</button>)}
      {createLabel && <button type="button" className="searchable-select-option searchable-select-create" onClick={() => { setIsOpen(false); setQuery(''); onCreate?.(); }}><Plus size={13}/>{createLabel}</button>}
      {!visible.length && <span className="searchable-select-empty">Nenhum resultado encontrado.</span>}
    </div>}
    {isOpen && <small className="searchable-select-count">{search.trim() ? `${matches.length} encontrados` : `Exibindo ${visible.length} de ${options.length}`}</small>}
  </div>;
}

function Quotes({ data, setModal, api, refresh, notify, openResponseQuote }) {
  const [query, setQuery] = useState(''); const [status, setStatus] = useState(''); const [applicationId, setApplicationId] = useState('');
  const applications = [...(data.applications || [])].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
  const rows = data.quotes.filter(q => q.status !== 'CONCLUIDA' && (!status || q.status === status) && (!applicationId || q.itens?.some(item => String(item.aplicacaoId ?? item.aplicacao?.id) === applicationId)) && `${q.id} ${q.obra?.nome || ''} ${q.usuario?.nome || ''}`.toLowerCase().includes(query.toLowerCase()));
  const send = async (q) => { try { const result = await api(`/api/cotacoes/${q.id}/enviar`, { method: 'POST' }); notify(result.some(r => r.status === 'ENVIADO') ? 'Solicitações enviadas aos fornecedores.' : 'Envios registrados com falha. Confira a configuração do WhatsApp.'); await refresh(); } catch (e) { notify(e.message); } };
  return <><PageTitle eyebrow="SOLICITAÇÕES" title="Cotações" description="Organize pedidos de preço por obra e acompanhe as respostas de cada fornecedor." action={<Button onClick={() => setModal({ type: 'newQuote' })}><Plus size={17}/> Nova cotação</Button>}/><div className="toolbar"><div className="search-input"><Search size={16}/><input placeholder="Buscar por obra ou número" value={query} onChange={e => setQuery(e.target.value)}/></div><div className="select-wrap"><SlidersHorizontal size={15}/><select value={status} onChange={e => setStatus(e.target.value)}><option value="">Todos os status</option>{['RASCUNHO','ENVIADA','EM_ANDAMENTO','CONCLUIDA','ENCERRADA','CANCELADA'].map(s => <option key={s} value={s}>{statusNames[s]}</option>)}</select></div><SearchableSelect className="quote-application-filter" options={applications} value={applicationId} onChange={setApplicationId} placeholder="Filtrar por aplicação" getLabel={a => a.nome} clearLabel="Todas as aplicações"/><span className="result-count">{rows.length} solicitações</span></div><div className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Solicitação</th><th>Obra</th><th>Itens</th><th>Fornecedores</th><th>Aplicação</th><th>Respostas</th><th>Criada em</th><th>Status</th><th></th></tr></thead><tbody>{rows.map(q => { const quoteApplications = [...new Set((q.itens || []).map(item => item.aplicacao?.nome || applications.find(a => String(a.id) === String(item.aplicacaoId))?.nome).filter(Boolean))]; return <tr key={q.id}><td><b className="mono">#{String(q.id).padStart(4, '0')}</b><small className="cell-sub">{q.observacao || 'Cotação de materiais'}</small></td><td><div className="table-primary">{q.obra?.nome || '—'}</div><small className="cell-sub">{q.usuario?.nome || 'Almoxarife'}</small></td><td>{q.itens?.length || 0} produtos</td><td>{q.fornecedores?.length || 0} selecionados</td><td>{quoteApplications.length ? quoteApplications.join(', ') : '—'}</td><td><span className="response-count">{q.respostas?.length || 0}<small> / {q.fornecedores?.length || 0}</small></span></td><td>{date(q.dataCriacao)}</td><td><Badge value={q.status}/></td><td>{q.status === 'CONCLUIDA' ? null : <div className="row-actions">{q.status === 'RASCUNHO' && <button className="icon-button" title="Enviar solicitações" onClick={() => send(q)}><Send size={16}/></button>}{q.status === 'RASCUNHO' && <button className="icon-button" title="Editar cotação" onClick={() => setModal({ type: 'editQuote', quote: q })}><Pencil size={16}/></button>}{!['CONCLUIDA','ENCERRADA','CANCELADA'].includes(q.status) && <button className="icon-button" title="Cancelar cotação" onClick={() => setModal({ type: 'cancelQuote', quote: q })}><Ban size={16}/></button>}{q.status === 'RASCUNHO' && <button className="icon-button" title="Excluir cotação" onClick={async () => { if (!window.confirm('Excluir esta cotação em rascunho?')) return; try { await api(`/api/cotacoes/${q.id}`, { method: 'DELETE' }); await refresh(); notify('Cotação excluída.'); } catch (e) { notify(e.message); } }}><Trash2 size={16}/></button>}<button className="icon-button" title="Registrar resposta" onClick={() => openResponseQuote(q)}><MessageCircle size={16}/></button></div>}<button className="icon-button" title="Exportar cotação em PDF" aria-label="Exportar cotação em PDF" onClick={() => exportPdf({ title: `Cotação #${String(q.id).padStart(4, '0')}`, subtitle: q.obra?.nome || 'Obra', filename: `cotacao-${q.id}`, details: [['Status', statusNames[q.status] || q.status], ['Criada em', date(q.dataCriacao)], ['Solicitante', q.usuario?.nome || '?'], ['Fornecedores', (q.fornecedores || []).map(item => item.fornecedor?.nome).filter(Boolean).join(', ') || '?'], ['Observação', q.observacao || 'Não informado']], columns: ['Produto', 'Quantidade solicitada', 'Unidade', 'Aplicação'], rows: (q.itens || []).map(item => [item.produto?.nome || 'Produto', item.quantidadeSolicitada, item.unidade, item.aplicacao?.nome || '?']) })}><ArrowDownToLine size={16}/></button></td></tr>; })}</tbody></table>{!rows.length && <Empty icon={ClipboardList} title="Nenhuma cotação encontrada" body="Ajuste os filtros ou crie uma nova solicitação."/>}</div></div></>;
}

function QuoteWizard({ data, api, refresh, onClose, notify }) {
  const [step, setStep] = useState(1); const [workId, setWorkId] = useState(''); const [note, setNote] = useState('');
  const [items, setItems] = useState([{ produtoId: '', quantidadeSolicitada: '', aplicacaoId: '' }]); const [supplierIds, setSupplierIds] = useState([]); const [saving, setSaving] = useState(false);
  const [supplierQuery, setSupplierQuery] = useState('');
  const [workOptions] = useState(() => [...data.works].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })));
  const [productOptions] = useState(() => [...data.products].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })));
  const [applicationOptions] = useState(() => [...data.applications].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })));
  const activeSuppliers = useMemo(() => data.suppliers.filter(s => s.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })), [data.suppliers]);
  const visibleSuppliers = useMemo(() => {
    const matches = activeSuppliers.filter(s => s.nome.toLocaleLowerCase('pt-BR').includes(supplierQuery.trim().toLocaleLowerCase('pt-BR')));
    return supplierQuery.trim() ? matches : matches.slice(0, 10);
  }, [activeSuppliers, supplierQuery]);
  const addItem = () => setItems(v => [...v, { produtoId: '', quantidadeSolicitada: '', aplicacaoId: '' }]);
  const patchItem = (index, key, value) => setItems(v => v.map((row, i) => i === index ? { ...row, [key]: value } : row));
  const toggleSupplier = (id) => setSupplierIds(v => v.includes(id) ? v.filter(x => x !== id) : [...v, id]);
  const save = async () => {
    setSaving(true);
    try {
      const body = { obraId: Number(workId), observacao: note || undefined, fornecedorIds: supplierIds, itens: items.map(i => ({ produtoId: Number(i.produtoId), quantidadeSolicitada: Number(i.quantidadeSolicitada), unidade: data.products.find(p => p.id === Number(i.produtoId))?.unidade, aplicacaoId: i.aplicacaoId ? Number(i.aplicacaoId) : undefined })) };
      await api('/api/cotacoes', { method: 'POST', body: JSON.stringify(body) }); await refresh(); notify('Cotação criada. Revise os dados e envie as solicitações.'); onClose();
    } catch (e) { notify(e.message); } finally { setSaving(false); }
  };
  const next = () => {
    if (step === 1 && !workId) return notify('Selecione a obra desta solicitação.');
    if (step === 2 && items.some(i => !i.produtoId || !Number(i.quantidadeSolicitada) || Number(i.quantidadeSolicitada) <= 0)) return notify('Informe produto e quantidade para cada item.');
    if (step === 3 && !supplierIds.length) return notify('Selecione ao menos um fornecedor.');
    setStep(s => Math.min(4, s + 1));
  };
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}><div className="modal wizard-modal"><div className="modal-head"><div><span className="eyebrow">NOVA SOLICITAÇÃO</span><h2>Criar cotação</h2></div><button className="icon-button" onClick={onClose}><X size={19}/></button></div><div className="wizard-progress">{['Obra','Produtos','Fornecedores','Revisão'].map((label, i) => <div className={`wizard-step ${step === i + 1 ? 'current' : ''} ${step > i + 1 ? 'passed' : ''}`} key={label}><span>{step > i + 1 ? <Check size={14}/> : `0${i + 1}`}</span><b>{label}</b></div>)}</div><div className="wizard-body">
    {step === 1 && <div className="wizard-section"><h3>Onde será feita a compra?</h3><p>A cotação fica vinculada a uma única obra durante todo o processo.</p><label className="field-label">Obra<SearchableSelect options={workOptions} value={workId} onChange={setWorkId} placeholder="Selecione uma obra" getLabel={w => w.nome}/></label><label className="field-label">Observação <span className="optional">OPCIONAL</span><textarea rows="3" placeholder="Contexto ou instruções para os fornecedores" value={note} onChange={e => setNote(e.target.value)}/></label></div>}
    {step === 2 && <div className="wizard-section"><div className="section-inline"><div><h3>O que precisamos comprar?</h3><p>Adicione cada produto, quantidade e destino de uso.</p></div><button className="button secondary small-button" onClick={addItem}><Plus size={15}/> Adicionar item</button></div><div className="quote-item-head"><span>PRODUTO</span><span>QUANTIDADE</span><span>APLICAÇÃO</span><span></span></div>{items.map((item, i) => <div className="quote-item-row" key={i}><SearchableSelect options={productOptions} value={item.produtoId} onChange={value => patchItem(i, 'produtoId', value)} placeholder="Selecione o produto" getLabel={p => `${p.nome} · ${p.unidade}`}/><input type="number" min="0.001" step="0.001" placeholder="0,00" value={item.quantidadeSolicitada} onChange={e => patchItem(i, 'quantidadeSolicitada', e.target.value)}/><SearchableSelect options={applicationOptions} value={item.aplicacaoId} onChange={value => patchItem(i, 'aplicacaoId', value)} placeholder="Selecione a aplicação" getLabel={a => a.nome}/><button className="icon-button remove-button" disabled={items.length === 1} onClick={() => setItems(v => v.filter((_, j) => j !== i))}><X size={16}/></button></div>)}</div>}
    {step === 3 && <div className="wizard-section"><h3>Quem vai receber o pedido?</h3><p>Cada fornecedor receberá uma solicitação individual.</p><label className="supplier-search"><Search size={16}/><input type="search" placeholder="Buscar fornecedor por nome" value={supplierQuery} onChange={e => setSupplierQuery(e.target.value)} autoComplete="off"/><small>{supplierQuery ? `${visibleSuppliers.length} encontrados` : `Exibindo ${visibleSuppliers.length} de ${activeSuppliers.length}`}</small></label><div className="supplier-select-list">{visibleSuppliers.map(s => <label key={s.id} className={`supplier-select ${supplierIds.includes(s.id) ? 'selected' : ''}`}><input type="checkbox" checked={supplierIds.includes(s.id)} onChange={() => toggleSupplier(s.id)}/><span className="supplier-avatar">{s.nome.slice(0,1).toUpperCase()}</span><span className="supplier-select-copy"><b>{s.nome}</b><small>{s.telefone || 'Sem telefone cadastrado'}</small></span>{supplierIds.includes(s.id) && <CheckCircle2 size={18}/>}</label>)}{!activeSuppliers.length && <Empty icon={Users} title="Cadastre seus fornecedores" body="Para criar uma cotação, primeiro inclua ao menos um fornecedor."/>}{activeSuppliers.length > 0 && !visibleSuppliers.length && <p className="supplier-empty">Nenhum fornecedor encontrado.</p>}</div></div>}
    {step === 4 && <div className="wizard-section"><h3>Confira a solicitação</h3><p>Após criar, você poderá enviar a mensagem aos fornecedores selecionados.</p><div className="review-card"><div className="review-line"><Building2 size={17}/><span>Obra</span><b>{data.works.find(w => w.id === Number(workId))?.nome}</b></div><div className="review-line"><Package size={17}/><span>Produtos</span><b>{items.length} itens</b></div><div className="review-line"><Users size={17}/><span>Fornecedores</span><b>{supplierIds.length} selecionados</b></div>{note && <div className="review-note">{note}</div>}</div><div className="review-products">{items.map((i, n) => <div key={n}><span>{data.products.find(p => p.id === Number(i.produtoId))?.nome}</span><b>{i.quantidadeSolicitada} {data.products.find(p => p.id === Number(i.produtoId))?.unidade}</b></div>)}</div></div>}
    </div><div className="modal-foot"><span className="step-caption">Etapa {step} de 4</span><div>{step > 1 && <button className="button secondary" onClick={() => setStep(s => s - 1)}><ArrowLeft size={16}/> Voltar</button>}{step < 4 ? <Button onClick={next}>Continuar <ArrowRight size={16}/></Button> : <Button disabled={saving} onClick={save}><Check size={16}/> {saving ? 'Criando...' : 'Criar cotação'}</Button>}</div></div></div></div>;
}

function QuoteManagementModal({ quote, mode, data, api, refresh, notify, onClose }) {
  const [observacao, setObservacao] = useState(quote.observacao || '');
  const [items, setItems] = useState((quote.itens || []).map(item => ({ produtoId: item.produtoId, quantidadeSolicitada: item.quantidadeSolicitada, unidade: item.unidade, aplicacaoId: item.aplicacaoId || '' })));
  const [supplierIds, setSupplierIds] = useState((quote.fornecedores || []).map(item => item.fornecedorId));
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      if (mode === 'cancel') {
        await api(`/api/cotacoes/${quote.id}/cancelar`, { method: 'POST', body: JSON.stringify({ motivo }) });
        notify('Cotação cancelada e registrada no histórico.');
      } else {
        await api(`/api/cotacoes/${quote.id}`, { method: 'PATCH', body: JSON.stringify({ observacao, itens: items.map(item => ({ ...item, produtoId: Number(item.produtoId), quantidadeSolicitada: Number(item.quantidadeSolicitada), aplicacaoId: item.aplicacaoId ? Number(item.aplicacaoId) : null })), fornecedorIds }) });
        notify('Cotação atualizada.');
      }
      await refresh(); onClose();
    } catch (error) { notify(error.message); } finally { setSaving(false); }
  };
  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><div className="modal wizard-modal"><div className="modal-head"><div><span className="eyebrow">COTAÇÃO #{String(quote.id).padStart(4, '0')}</span><h2>{mode === 'cancel' ? 'Cancelar cotação' : 'Editar cotação'}</h2></div><button className="icon-button" onClick={onClose}><X size={19}/></button></div><div className="modal-content">
    {mode === 'cancel' ? <label className="field-label">Motivo do cancelamento<textarea required rows="4" value={motivo} onChange={event => setMotivo(event.target.value)} /></label> : <>
      <label className="field-label">Observação<textarea rows="2" value={observacao} onChange={event => setObservacao(event.target.value)} /></label>
      <h3>Itens</h3>{items.map((item, index) => <div className="quote-item-row" key={index}><select value={item.produtoId} onChange={event => setItems(rows => rows.map((row, i) => i === index ? { ...row, produtoId: Number(event.target.value), unidade: data.products.find(product => product.id === Number(event.target.value))?.unidade || 'UN' } : row))}>{data.products.filter(product => product.ativo !== false).map(product => <option key={product.id} value={product.id}>{product.nome} · {product.unidade}</option>)}</select><input type="number" min="0.001" step="0.001" value={item.quantidadeSolicitada} onChange={event => setItems(rows => rows.map((row, i) => i === index ? { ...row, quantidadeSolicitada: event.target.value } : row))}/><select value={item.aplicacaoId} onChange={event => setItems(rows => rows.map((row, i) => i === index ? { ...row, aplicacaoId: event.target.value } : row))}><option value="">Sem aplicação</option>{data.applications.map(app => <option key={app.id} value={app.id}>{app.nome}</option>)}</select><button className="icon-button" disabled={items.length === 1} onClick={() => setItems(rows => rows.filter((_, i) => i !== index))}><X size={15}/></button></div>)}
      <Button variant="secondary small-button" onClick={() => setItems(rows => [...rows, { produtoId: data.products.find(product => product.ativo !== false)?.id || '', quantidadeSolicitada: 1, unidade: 'UN', aplicacaoId: '' }])}><Plus size={15}/> Adicionar item</Button>
      <h3>Fornecedores</h3><div className="supplier-select-list">{data.suppliers.filter(supplier => supplier.ativo !== false).map(supplier => <label className="supplier-select" key={supplier.id}><input type="checkbox" checked={supplierIds.includes(supplier.id)} onChange={event => setSupplierIds(current => event.target.checked ? [...current, supplier.id] : current.filter(id => id !== supplier.id))}/>{supplier.nome}</label>)}</div>
    </>}
    </div><div className="modal-foot"><button className="button secondary" onClick={onClose}>Voltar</button><Button disabled={saving || (mode === 'cancel' && !motivo.trim())} onClick={save}>{saving ? 'Salvando...' : mode === 'cancel' ? 'Confirmar cancelamento' : 'Salvar alterações'}</Button></div></div></div>;
}

export { Quotes, QuoteWizard, SearchableSelect, QuoteManagementModal };






