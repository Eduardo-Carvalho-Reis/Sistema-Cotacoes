import { useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowDownToLine, ArrowLeft, ArrowRight, BadgeCheck, Bell, Boxes, Building2,
  Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, ClipboardList, Clock3,
  FileCheck2, FileText, Gauge, HardHat, LayoutDashboard, LogOut, Menu, MessageCircle,
  Package, Plus, Search, Send, Settings2, ShoppingCart, SlidersHorizontal, Truck,
  Users, WalletCards, X,
} from 'lucide-react';

import { money, date, statusNames } from '../utils/formatters.js';
import { PageTitle, Button, Badge, Empty, Stat } from '../components/index.js';
import { SearchableSelect } from './Quotes.jsx';
import './Responses.css';

function Responses({ data, setModal, go, api }) {
  const [expandedQuoteId, setExpandedQuoteId] = useState(null);
  const [workId, setWorkId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [quoteId, setQuoteId] = useState('');
  const workOptions = useMemo(() => [...data.works].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })), [data.works]);
  const supplierOptions = useMemo(() => [...data.suppliers].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })), [data.suppliers]);
  const quoteOptions = useMemo(() => data.quotes.filter(quote => quote.fornecedores?.length).sort((a, b) => b.id - a.id), [data.quotes]);
  const quotes = data.quotes.filter(quote =>
    quote.fornecedores?.length
    && (!quoteId || String(quote.id) === quoteId)
    && (!workId || String(quote.obraId) === workId)
    && (!supplierId || quote.fornecedores.some(item => String(item.fornecedorId) === supplierId))
  );
  const quoteRows = quotes.map(quote => ({
    quote,
    suppliers: quote.fornecedores.filter(item => !supplierId || String(item.fornecedorId) === supplierId).map(item => ({
      supplier: item.fornecedor,
      answer: quote.respostas?.find(response => response.fornecedorId === item.fornecedorId),
    })),
  }));
  const totalRegistered = quoteRows.reduce((total, row) => total + row.suppliers.filter(item => item.answer).length, 0);
  const totalPending = quoteRows.reduce((total, row) => total + row.suppliers.filter(item => !item.answer || item.answer.status === 'PREENCHIMENTO').length, 0);

  return <>
    <PageTitle eyebrow="RETORNO DOS FORNECEDORES" title="Respostas" description="Acompanhe as respostas agrupadas por cotaÃ§Ã£o e registre as propostas recebidas." action={<div className="title-pill"><MessageCircle size={16}/> {totalRegistered} registradas</div>}/>
    <div className="tip-banner"><div className="tip-mark"><MessageCircle size={18}/></div><div><b>As respostas chegam por aqui</b><span>Abra uma cotaÃ§Ã£o para ver os fornecedores e registrar valores, disponibilidade e itens extras.</span></div></div>
    <div className="toolbar response-filters">
      <SearchableSelect className="response-filter-select" options={workOptions} value={workId} onChange={setWorkId} placeholder="Filtrar por obra" getLabel={work => work.nome} clearLabel="Todas as obras"/>
      <SearchableSelect className="response-filter-select" options={supplierOptions} value={supplierId} onChange={setSupplierId} placeholder="Filtrar por fornecedor" getLabel={supplier => supplier.nome} clearLabel="Todos os fornecedores"/>
      <SearchableSelect className="response-filter-select" options={quoteOptions} value={quoteId} onChange={setQuoteId} placeholder="Filtrar por cotaÃ§Ã£o" getLabel={quote => `CotaÃ§Ã£o #${String(quote.id).padStart(4, '0')} Â· ${quote.obra?.nome || 'Obra'}`} clearLabel="Todas as cotaÃ§Ãµes"/>
    </div>
    <div className="panel table-panel">
      <div className="panel-heading table-heading"><div><span className="eyebrow">ACOMPANHAMENTO</span><h2>CotaÃ§Ãµes</h2></div><span className="result-count">{totalPending} aguardando preenchimento</span></div>
      <div className="response-quote-list">
        {quoteRows.map(({ quote, suppliers }) => {
          const expanded = expandedQuoteId === quote.id;
          const answered = suppliers.filter(item => item.answer).length;
          return <section className="response-quote-group" key={quote.id}>
            <button className="response-quote-heading" type="button" aria-expanded={expanded} aria-controls={'response-quote-' + quote.id} onClick={() => setExpandedQuoteId(current => current === quote.id ? null : quote.id)}>
              <span className="response-quote-icon"><ClipboardList size={17}/></span>
              <span className="response-quote-title"><b>CotaÃ§Ã£o #{String(quote.id).padStart(4, '0')}</b><span>{quote.obra?.nome || 'Obra'} Â· {quote.itens?.length || 0} produtos</span></span>
              <span className="response-quote-counts"><span>{answered} de {suppliers.length} respostas</span><small>{suppliers.length - answered} aguardando</small></span>
              <ChevronRight className={'response-quote-chevron' + (expanded ? ' expanded' : '')} size={18}/>
            </button>
            {expanded && <div className="response-quote-suppliers" id={'response-quote-' + quote.id}>
              {suppliers.map(({ supplier, answer }) => <div className="response-card" key={supplier?.id || quote.id}>
                <div className="supplier-avatar">{supplier?.nome?.slice(0, 1)}</div>
                <div className="response-main"><b>{supplier?.nome || 'Fornecedor'}</b><span>{quote.itens?.length || 0} produtos solicitados</span></div>
                <div className="response-meta">{answer ? <Badge value={answer.status}/> : <Badge value="PENDENTE"/>}<small>{answer?.dataResposta ? 'Recebida em ' + date(answer.dataResposta) : 'Aguardando retorno'}</small></div>
                <Button variant="secondary small-button" disabled={answer && !['PREENCHIMENTO','ENCAMINHADA'].includes(answer.status)} onClick={() => setModal({ type: 'respond', quote, supplierId: supplier.id })}>{!answer ? 'Registrar resposta' : answer.status === 'PREENCHIMENTO' ? 'Continuar resposta' : 'JÃ¡ encaminhada'} <ArrowRight size={15}/></Button>
              </div>)}
            </div>}
          </section>;
        })}
        {!quoteRows.length && <Empty icon={MessageCircle} title="Ainda sem solicitaÃ§Ãµes" body="Crie uma cotaÃ§Ã£o e envie aos fornecedores para comeÃ§ar a receber respostas."/>}
      </div>
    </div>
  </>;
}

function ResponseModal({ quote, supplierId: initialSupplierId, data, api, refresh, notify, onClose }) {
  const [supplierId, setSupplierId] = useState(String(initialSupplierId || quote.fornecedores?.[0]?.fornecedorId || ''));
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [newProductRowKey, setNewProductRowKey] = useState(null);
  const [newProduct, setNewProduct] = useState({ nome: '', referencia: '', unidade: 'UN', precoAtual: '' });
  const [savingProduct, setSavingProduct] = useState(false);
  const [destinatarios, setDestinatarios] = useState([]);
  const [destinatarioIds, setDestinatarioIds] = useState([]);
  useEffect(() => { api('/api/whatsapp/destinatarios').then(result => { const active = result.destinatarios.filter(item => item.ativo); setDestinatarios(active); setDestinatarioIds(active.map(item => item.id)); }).catch(() => {}); }, [api]);
  const existing = quote.respostas?.find(r => r.fornecedorId === Number(supplierId));
  const [rows, setRows] = useState([]); const [note, setNote] = useState(''); const [saved, setSaved] = useState(null); const [saving, setSaving] = useState(false);
  useEffect(() => {
    const answer = quote.respostas?.find(r => r.fornecedorId === Number(supplierId));
    setNote(answer?.observacao || ''); setSaved(answer || null);
    const mapped = (quote.itens || []).map(i => { const offer = answer?.itens?.find(o => o.cotacaoEnvioItemId === i.id); return { key: `item-${i.id}`, cotacaoEnvioItemId: i.id, produtoId: i.produtoId, nome: i.produto?.nome, unidade: i.unidade, solicitada: Number(i.quantidadeSolicitada), quantidadeOfertada: offer?.quantidadeOfertada ?? i.quantidadeSolicitada, valorUnitario: offer?.valorUnitario ?? '', indisponivel: offer?.indisponivel || false, itemId: offer?.id }; });
    (answer?.itens || []).filter(o => o.adicional).forEach(o => mapped.push({ key: `extra-${o.id}`, produtoId: o.produtoId, nome: o.produto?.nome, unidade: o.produto?.unidade || 'UN', quantidadeOfertada: o.quantidadeOfertada, valorUnitario: o.valorUnitario, indisponivel: o.indisponivel, adicional: true, itemId: o.id }));
    setRows(mapped);
  }, [quote, supplierId]);
  const update = (key, field, value) => setRows(v => v.map(r => r.key === key ? { ...r, [field]: value } : r));
  const addExtra = () => setRows(v => [...v, { key: `extra-${Date.now()}`, produtoId: '', quantidadeOfertada: '', valorUnitario: '', indisponivel: false, adicional: true }]);
  const createProduct = async event => {
    event.preventDefault();
    setSavingProduct(true);
    try {
      const body = { nome: newProduct.nome.trim(), unidade: newProduct.unidade.trim() || 'UN' };
      if (newProduct.referencia.trim()) body.referencia = newProduct.referencia.trim();
      if (newProduct.precoAtual !== '') body.precoAtual = Number(newProduct.precoAtual);
      const product = await api('/produto', { method: 'POST', body: JSON.stringify(body) });
      await refresh();
      setRows(current => current.map(row => row.key === newProductRowKey ? { ...row, produtoId: String(product.id) } : row));
      setNewProduct({ nome: '', referencia: '', unidade: 'UN', precoAtual: '' });
      setShowNewProduct(false);
      notify('Produto cadastrado e selecionado.');
    } catch (error) { notify(error.message); } finally { setSavingProduct(false); }
  };
  const save = async () => {
    if (!supplierId) return notify('Selecione o fornecedor.');
    const items = rows.filter(r => !r.adicional || r.produtoId);
    if (items.some(r => !r.indisponivel && (!Number(r.quantidadeOfertada) || Number(r.quantidadeOfertada) <= 0 || Number(r.valorUnitario) < 0))) return notify('Preencha quantidade e valor unitÃ¡rio para cada item disponÃ­vel.');
    setSaving(true);
    try {
      let response = existing;
      if (!existing) response = await api('/api/respostas', { method: 'POST', body: JSON.stringify({ cotacaoEnvioId: quote.id, fornecedorId: Number(supplierId), observacao: note, itens: items.map(r => ({ cotacaoEnvioItemId: r.cotacaoEnvioItemId, produtoId: Number(r.produtoId), quantidadeOfertada: r.indisponivel ? 0 : Number(r.quantidadeOfertada), valorUnitario: r.indisponivel ? 0 : Number(r.valorUnitario), indisponivel: r.indisponivel, adicional: Boolean(r.adicional) })) }) });
      else {
        await api(`/api/respostas/${existing.id}`, { method: 'PATCH', body: JSON.stringify({ observacao: note }) });
        for (const r of items) {
          const payload = { produtoId: Number(r.produtoId), quantidadeOfertada: r.indisponivel ? 0 : Number(r.quantidadeOfertada || 0), valorUnitario: r.indisponivel ? 0 : Number(r.valorUnitario || 0), indisponivel: r.indisponivel, adicional: Boolean(r.adicional), ...(r.cotacaoEnvioItemId ? { cotacaoEnvioItemId: r.cotacaoEnvioItemId } : {}) };
          if (r.itemId) await api(`/api/respostas/${existing.id}/itens/${r.itemId}`, { method: 'PATCH', body: JSON.stringify(payload) });
          else await api(`/api/respostas/${existing.id}/itens`, { method: 'POST', body: JSON.stringify(payload) });
        }
      }
      setSaved(response); await refresh(); notify('Resposta salva como rascunho.');
    } catch (e) { notify(e.message); } finally { setSaving(false); }
  };
  const forward = async () => {
    const id = saved?.id || existing?.id;
    if (!id) return notify('Salve a resposta antes de encaminhar.');
    if (!destinatarioIds.length) return notify('Selecione ao menos um destinatário.');
    try {
      const result = await api(`/api/respostas/${id}/encaminhar`, { method: 'POST', body: JSON.stringify({ destinatarioIds }) });
      await refresh();
      const failures = result.whatsapp?.falhas || [];
      notify(failures.length ? `Resposta encaminhada com falha no WhatsApp para: ${failures.map(item => item.nome).join(', ')}.` : `Resposta encaminhada e enviada para ${result.whatsapp?.enviados?.length || 0} destinatário(s).`);
      onClose();
    } catch (e) { notify(e.message); }
  };

  return <div className="modal-backdrop"><div className="modal response-modal"><div className="modal-head"><div><span className="eyebrow">COTAÇÃO #{String(quote.id).padStart(4, '0')} · {quote.obra?.nome}</span><h2>Registrar resposta</h2></div><button className="icon-button" onClick={onClose}><X size={19}/></button></div><div className="modal-content"><label className="field-label">Fornecedor<select value={supplierId} onChange={e => setSupplierId(e.target.value)}>{quote.fornecedores?.map(p => <option key={p.fornecedorId} value={p.fornecedorId}>{p.fornecedor?.nome}</option>)}</select></label><div className="response-items-head"><span>PRODUTO SOLICITADO</span><span>QTD. OFERTADA</span><span>VALOR UNITÁRIO</span><span>INDISPONÍVEL / AÇÕES</span></div><div className="response-items">{rows.map(r => <div className={`response-item-row ${r.adicional ? 'extra-row' : ''}`} key={r.key}><div className="response-product"><b>{r.adicional ? <SearchableSelect className="response-extra-product" options={data.products.filter(product => product.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))} value={r.produtoId} onChange={value => update(r.key, 'produtoId', value)} placeholder="Produto adicional" getLabel={product => product.nome} createLabel="Novo produto" onCreate={() => { setNewProductRowKey(r.key); setShowNewProduct(true); }}/> : r.nome}</b>{!r.adicional && <small>Solicitado: {r.solicitada} {r.unidade}</small>}</div><input type="number" min="0" step="0.001" disabled={r.indisponivel} value={r.indisponivel ? 0 : r.quantidadeOfertada} onChange={e => update(r.key, 'quantidadeOfertada', e.target.value)}/><div className="money-input"><span>R$</span><input type="number" min="0" step="0.01" disabled={r.indisponivel} value={r.indisponivel ? 0 : r.valorUnitario} onChange={e => update(r.key, 'valorUnitario', e.target.value)}/></div><div className="response-row-controls"><label className="switch-label" title="Indisponível"><input type="checkbox" checked={r.indisponivel} onChange={e => update(r.key, 'indisponivel', e.target.checked)}/><span></span></label>{r.adicional && <button type="button" className="icon-button remove-extra-button" title="Remover produto adicional" aria-label="Remover produto adicional" onClick={() => setRows(current => current.filter(row => row.key !== r.key))}><X size={15}/></button>}</div></div>)}</div><button className="add-extra-button" onClick={addExtra}><Plus size={15}/> Adicionar produto extra</button><label className="field-label">Observação da proposta<textarea rows="2" placeholder="Prazo, condições ou outras informações" value={note} onChange={e => setNote(e.target.value)}/></label><fieldset className="field-label"><legend>Destinatários do envio</legend>{destinatarios.length ? destinatarios.map(item => <label key={item.id}><input type="checkbox" checked={destinatarioIds.includes(item.id)} onChange={event => setDestinatarioIds(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))}/> {item.nome} · {item.identificador}</label>) : <small>Cadastre destinatários na página WhatsApp.</small>}</fieldset></div><div className="modal-foot"><span className="step-caption">{existing ? 'Resposta salva' : 'Preenchimento manual'}</span><div><Button variant="secondary" disabled={saving} onClick={save}><Check size={15}/>{saving ? 'Salvando...' : 'Salvar rascunho'}</Button><Button disabled={(!saved && !existing) || existing?.status === 'ENCAMINHADA'} onClick={forward}>Encaminhar <ArrowRight size={16}/></Button></div></div>{showNewProduct && <div className="modal-backdrop product-create-backdrop" onMouseDown={event => event.target === event.currentTarget && setShowNewProduct(false)}><form className="modal new-product-modal" onSubmit={createProduct}><div className="modal-head"><div><span className="eyebrow">CADASTRO RÁPIDO</span><h2>Novo produto</h2></div><button type="button" className="icon-button" onClick={() => setShowNewProduct(false)}><X size={19}/></button></div><div className="modal-content"><label className="field-label">Nome do produto<input required autoFocus value={newProduct.nome} onChange={event => setNewProduct(current => ({ ...current, nome: event.target.value }))}/></label><div className="form-two"><label className="field-label">Unidade<input value={newProduct.unidade} onChange={event => setNewProduct(current => ({ ...current, unidade: event.target.value }))}/></label><label className="field-label">Referência<input value={newProduct.referencia} onChange={event => setNewProduct(current => ({ ...current, referencia: event.target.value }))}/></label></div><label className="field-label">Preço de referência<input type="number" min="0" step="0.01" value={newProduct.precoAtual} onChange={event => setNewProduct(current => ({ ...current, precoAtual: event.target.value }))}/></label></div><div className="modal-foot"><button type="button" className="button secondary" onClick={() => setShowNewProduct(false)}>Cancelar</button><Button type="submit" disabled={savingProduct}>{savingProduct ? 'Salvando...' : 'Cadastrar produto'}</Button></div></form></div>}</div></div>;
}

export { Responses, ResponseModal };


