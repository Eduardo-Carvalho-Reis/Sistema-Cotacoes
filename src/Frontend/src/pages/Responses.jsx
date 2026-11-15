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

function Responses({ data, setModal, go }) {
  const rows = data.quotes.flatMap(q => (q.fornecedores || []).map(p => ({ quote: q, supplier: p.fornecedor, answer: q.respostas?.find(r => r.fornecedorId === p.fornecedorId) })));
  return <><PageTitle eyebrow="RETORNO DOS FORNECEDORES" title="Respostas" description="Registre manualmente as propostas recebidas e encaminhe cada uma para análise." action={<div className="title-pill"><MessageCircle size={16}/> {rows.filter(r => r.answer).length} registradas</div>}/><div className="tip-banner"><div className="tip-mark"><MessageCircle size={18}/></div><div><b>As respostas chegam por aqui</b><span>Selecione um fornecedor para informar valores, disponibilidade e itens extras. Você pode completar a resposta antes de encaminhá-la.</span></div></div><div className="panel table-panel"><div className="panel-heading table-heading"><div><span className="eyebrow">ACOMPANHAMENTO</span><h2>Fornecedores por cotação</h2></div><span className="result-count">{rows.filter(r => !r.answer || r.answer.status === 'PREENCHIMENTO').length} aguardando preenchimento</span></div><div className="response-card-list">{rows.map(({ quote, supplier, answer }) => <div className="response-card" key={`${quote.id}-${supplier.id}`}><div className="supplier-avatar">{supplier?.nome?.slice(0,1)}</div><div className="response-main"><b>{supplier?.nome || 'Fornecedor'}</b><span>Cotação #{String(quote.id).padStart(4, '0')} · {quote.obra?.nome} · {quote.itens?.length || 0} produtos</span></div><div className="response-meta">{answer ? <Badge value={answer.status}/> : <Badge value="PENDENTE"/>}<small>{answer?.dataResposta ? `Recebida em ${date(answer.dataResposta)}` : 'Aguardando retorno'}</small></div><Button variant="secondary small-button" disabled={answer && answer.status !== 'PREENCHIMENTO'} onClick={() => setModal({ type: 'respond', quote, supplierId: supplier.id })}>{!answer ? 'Registrar resposta' : answer.status === 'PREENCHIMENTO' ? 'Continuar resposta' : 'Já encaminhada'} <ArrowRight size={15}/></Button></div>)}{!rows.length && <Empty icon={MessageCircle} title="Ainda sem solicitações" body="Crie uma cotação e envie aos fornecedores para começar a receber respostas."/>}</div></div></>;
}

function ResponseModal({ quote, supplierId: initialSupplierId, data, api, refresh, notify, onClose }) {
  const [supplierId, setSupplierId] = useState(String(initialSupplierId || quote.fornecedores?.[0]?.fornecedorId || ''));
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
  const save = async () => {
    if (!supplierId) return notify('Selecione o fornecedor.');
    const items = rows.filter(r => !r.adicional || r.produtoId);
    if (items.some(r => !r.indisponivel && (!Number(r.quantidadeOfertada) || Number(r.quantidadeOfertada) <= 0 || Number(r.valorUnitario) < 0))) return notify('Preencha quantidade e valor unitário para cada item disponível.');
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
  const forward = async () => { const id = saved?.id || existing?.id; if (!id) return notify('Salve a resposta antes de encaminhar.'); try { await api(`/api/respostas/${id}/encaminhar`, { method: 'POST' }); await refresh(); notify('Resposta encaminhada para análise administrativa.'); onClose(); } catch (e) { notify(e.message); } };
  return <div className="modal-backdrop"><div className="modal response-modal"><div className="modal-head"><div><span className="eyebrow">COTAÇÃO #{String(quote.id).padStart(4, '0')} · {quote.obra?.nome}</span><h2>Registrar resposta</h2></div><button className="icon-button" onClick={onClose}><X size={19}/></button></div><div className="modal-content"><label className="field-label">Fornecedor<select value={supplierId} onChange={e => setSupplierId(e.target.value)}>{quote.fornecedores?.map(p => <option key={p.fornecedorId} value={p.fornecedorId}>{p.fornecedor?.nome}</option>)}</select></label><div className="response-items-head"><span>PRODUTO SOLICITADO</span><span>QTD. OFERTADA</span><span>VALOR UNITÁRIO</span><span>INDISPONÍVEL</span></div><div className="response-items">{rows.map(r => <div className={`response-item-row ${r.adicional ? 'extra-row' : ''}`} key={r.key}><div className="response-product"><b>{r.adicional ? <select value={r.produtoId} onChange={e => update(r.key, 'produtoId', e.target.value)}><option value="">Produto adicional</option>{data.products.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select> : r.nome}</b>{r.adicional ? <small>Item adicional</small> : <small>Solicitado: {r.solicitada} {r.unidade}</small>}</div><input type="number" min="0" step="0.001" disabled={r.indisponivel} value={r.indisponivel ? 0 : r.quantidadeOfertada} onChange={e => update(r.key, 'quantidadeOfertada', e.target.value)}/><div className="money-input"><span>R$</span><input type="number" min="0" step="0.01" disabled={r.indisponivel} value={r.indisponivel ? 0 : r.valorUnitario} onChange={e => update(r.key, 'valorUnitario', e.target.value)}/></div><label className="switch-label"><input type="checkbox" checked={r.indisponivel} onChange={e => update(r.key, 'indisponivel', e.target.checked)}/><span></span></label></div>)}</div><button className="add-extra-button" onClick={addExtra}><Plus size={15}/> Adicionar produto extra</button><label className="field-label">Observação da proposta<textarea rows="2" placeholder="Prazo, condições ou outras informações" value={note} onChange={e => setNote(e.target.value)}/></label></div><div className="modal-foot"><span className="step-caption">{existing ? 'Rascunho da resposta' : 'Preenchimento manual'}</span><div><Button variant="secondary" disabled={saving} onClick={save}><Check size={15}/>{saving ? 'Salvando...' : 'Salvar rascunho'}</Button><Button disabled={!saved && !existing} onClick={forward}>Encaminhar <ArrowRight size={16}/></Button></div></div></div></div>;
}

export { Responses, ResponseModal };
