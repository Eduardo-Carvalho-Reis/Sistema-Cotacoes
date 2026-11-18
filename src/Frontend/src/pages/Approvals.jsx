import { useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowDownToLine, ArrowLeft, ArrowRight, BadgeCheck, Bell, Boxes, Building2,
  Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, ClipboardList, Clock3,
  FileCheck2, FileText, Gauge, HardHat, LayoutDashboard, LogOut, Menu, MessageCircle,
  Package, Plus, Search, Send, Settings2, ShoppingCart, SlidersHorizontal, Truck,
  Users, WalletCards, X,
} from 'lucide-react';

import { money, date, statusNames } from '../utils/formatters.js';
import { PageTitle, Button, Empty } from '../components/index.js';
import './Approvals.css';

function Approvals({ data, api, refresh, notify, go, user }) {
  const [quoteId, setQuoteId] = useState(''); const [decisions, setDecisions] = useState({}); const [busy, setBusy] = useState(false);
  const [offerQuantityEdits, setOfferQuantityEdits] = useState({}); const [savingOfferId, setSavingOfferId] = useState(null);
  const quote = data.quotes.find(q => q.id === Number(quoteId));
  const offers = quote?.respostas?.filter(r => r.status === 'ENCAMINHADA').flatMap(r => r.itens.filter(item => item.status === 'PENDENTE').map(item => ({ ...item, supplier: r.fornecedor, requested: quote.itens?.find(i => i.id === item.cotacaoEnvioItemId) }))) || [];
  const supplierGroups = offers.reduce((groups, offer) => {
    const id = String(offer.supplier?.id ?? 'sem-fornecedor');
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(offer);
    return groups;
  }, new Map());
  const productApprovedTotal = offer => {
    if (offer.indisponivel || !decisions[offer.id]?.status) return null;
    if (decisions[offer.id].status !== 'APROVADA') return 0;
    const quantity = Number(decisions[offer.id]?.quantidade ?? offer.quantidadeOfertada);
    const unitPrice = Number(decisions[offer.id]?.valor ?? offer.valorUnitario);
    return quantity * unitPrice;
  };
  const approvedTotal = rows => rows.reduce((total, offer) => total + (productApprovedTotal(offer) || 0), 0);
  const totalApproved = approvedTotal(offers);
  const decide = (id, field, value) => setDecisions(v => ({ ...v, [id]: { ...v[id], [field]: value } }));
  const previouslyApprovedQuantity = itemId => data.purchases
    .filter(purchase => purchase.cotacaoEnvioId === quote?.id)
    .flatMap(purchase => purchase.selecoes || [])
    .filter(selection => selection.status === 'APROVADA' && Number(selection.oferta?.cotacaoEnvioItemId) === Number(itemId))
    .reduce((total, selection) => total + Number(selection.quantidadeAprovada), 0);
  const maxQuantityFor = (offer, currentDecisions = decisions) => {
    const offeredQuantity = Number(offer.quantidadeOfertada);
    if (!offer.cotacaoEnvioItemId || !offer.requested) return offeredQuantity;
    const allocatedByOtherSuppliers = offers.reduce((total, other) => {
      if (other.id === offer.id || other.cotacaoEnvioItemId !== offer.cotacaoEnvioItemId || currentDecisions[other.id]?.status !== 'APROVADA') return total;
      return total + Number(currentDecisions[other.id]?.quantidade ?? other.quantidadeOfertada);
    }, 0);
    const remainingRequested = Number(offer.requested.quantidadeSolicitada) - previouslyApprovedQuantity(offer.cotacaoEnvioItemId) - allocatedByOtherSuppliers;
    return Math.max(0, Math.min(offeredQuantity, remainingRequested));
  };
  const approveOffer = offer => {
    const maxQuantity = maxQuantityFor(offer);
    if (maxQuantity <= 0) return notify('A quantidade solicitada deste produto já foi distribuída entre os fornecedores.');
    const currentQuantity = Number(decisions[offer.id]?.quantidade ?? offer.quantidadeOfertada);
    decide(offer.id, 'status', 'APROVADA');
    if (decisions[offer.id]?.quantidade == null || currentQuantity > maxQuantity) decide(offer.id, 'quantidade', String(maxQuantity));
  };
  const saveOfferedQuantity = async offer => {
    const quantity = Number(offerQuantityEdits[offer.id] ?? offer.quantidadeOfertada);
    if (!Number.isFinite(quantity) || quantity <= 0) return notify('A quantidade ofertada deve ser maior que zero.');
    setSavingOfferId(offer.id);
    try {
      await api(`/api/compras/ofertas/${offer.id}/quantidade-ofertada`, { method: 'PATCH', body: JSON.stringify({ quantidadeOfertada: quantity }) });
      await refresh();
      setOfferQuantityEdits(current => ({ ...current, [offer.id]: undefined }));
      notify('Quantidade ofertada atualizada.');
    } catch (error) {
      notify(error.message);
    } finally {
      setSavingOfferId(null);
    }
  };
  const offersToReject = offers.filter(offer => !offer.indisponivel && decisions[offer.id]?.status !== 'APROVADA');
  const rejectUnapproved = () => {
    setDecisions(current => {
      const next = { ...current };
      offers.forEach(offer => {
        if (!offer.indisponivel && current[offer.id]?.status !== 'APROVADA') {
          next[offer.id] = { ...current[offer.id], status: 'REJEITADA' };
        }
      });
      return next;
    });
    notify(offersToReject.length + ' oferta(s) marcada(s) para rejeição.');
  };
  const submit = async () => {
    if (!quote || !offers.length) return notify('Selecione uma cotação com ofertas recebidas.');
    if (offers.some(o => !o.indisponivel && !decisions[o.id]?.status)) return notify('Defina uma decisão para cada oferta disponível.');
    const quantidadeInvalida = offers.some(offer => {
      if (offer.indisponivel || decisions[offer.id]?.status !== "APROVADA") return false;
      const quantidade = Number(decisions[offer.id]?.quantidade ?? offer.quantidadeOfertada);
      return !Number.isFinite(quantidade) || quantidade <= 0 || quantidade > Number(offer.quantidadeOfertada);
    });
    if (quantidadeInvalida) return notify("Quantidade aprovada deve ser maior que zero e n\u00e3o pode exceder a quantidade ofertada.");
    const approvedQuantitiesByItem = new Map();
    for (const purchase of data.purchases.filter(item => item.cotacaoEnvioId === quote.id)) {
      for (const selection of purchase.selecoes || []) {
        const itemId = selection.oferta?.cotacaoEnvioItemId;
        if (selection.status === "APROVADA" && itemId) {
          approvedQuantitiesByItem.set(itemId, (approvedQuantitiesByItem.get(itemId) || 0) + Number(selection.quantidadeAprovada));
        }
      }
    }
    for (const offer of offers) {
      if (offer.indisponivel || decisions[offer.id]?.status !== "APROVADA" || !offer.cotacaoEnvioItemId || !offer.requested) continue;
      const itemId = offer.cotacaoEnvioItemId;
      const quantity = Number(decisions[offer.id]?.quantidade ?? offer.quantidadeOfertada);
      const total = (approvedQuantitiesByItem.get(itemId) || 0) + quantity;
      if (total > Number(offer.requested.quantidadeSolicitada)) return notify("A soma aprovada deste produto excede a quantidade solicitada. Ajuste as quantidades entre os fornecedores.");
      approvedQuantitiesByItem.set(itemId, total);
    }
    const body = { cotacaoEnvioId: quote.id, itens: offers.map(o => { const status = o.indisponivel ? 'REJEITADA' : decisions[o.id].status; return { ofertaId: o.id, status, quantidadeAprovada: status === 'REJEITADA' ? 0 : Number(decisions[o.id].quantidade ?? o.quantidadeOfertada), valorUnitarioAprovado: Number(decisions[o.id]?.valor ?? o.valorUnitario) }; }) };
    setBusy(true); try {
      const result = await api('/api/compras/aprovar', { method: 'POST', body: JSON.stringify(body) });
      const notificacoes = result.notificacoes || [];
      const falhas = notificacoes.filter(item => item.status === 'FALHOU');
      await refresh();
      const mensagem = notificacoes.length
        ? falhas.length
          ? 'Decisão registrada. ' + (notificacoes.length - falhas.length) + ' fornecedor(es) notificado(s); ' + falhas.length + ' falha(s): ' + falhas[0].erro
          : 'Decisão registrada. ' + notificacoes.length + ' fornecedor(es) notificado(s).'
        : 'Decisão registrada. Nenhum fornecedor recebeu itens aprovados para notificação.';
      notify(mensagem);
      go('purchases');
    } catch (e) { notify(e.message); } finally { setBusy(false); }
  };
  return <>
    <PageTitle eyebrow="ANÁLISE ADMINISTRATIVA" title="Aprovações" description="Compare as propostas recebidas e defina quais itens serão comprados." />
    <div className="toolbar"><div className="select-wrap"><ClipboardList size={15}/><select value={quoteId} onChange={event => setQuoteId(event.target.value)}><option value="">Selecione uma cotação</option>{data.quotes.filter(item => item.respostas?.some(response => response.status === 'ENCAMINHADA')).map(item => <option key={item.id} value={item.id}>#{String(item.id).padStart(4, '0')} · {item.obra?.nome || 'Obra'}</option>)}</select></div><span className="result-count">{offers.length} ofertas para análise</span><div className="approval-total"><small>Valor total</small><b>{money(totalApproved)}</b></div></div>
    {offers.length > 0 ? <div className="approval-supplier-groups">
      {[...supplierGroups.entries()].map(([supplierId, supplierOffers]) => {
        const supplier = supplierOffers[0].supplier;
        return <section className="panel approval-supplier-group" key={supplierId}>
          <div className="approval-supplier-heading"><div className="supplier-avatar">{supplier?.nome?.slice(0, 1) || '?'}</div><div className="approval-supplier-copy"><b>{supplier?.nome || 'Fornecedor'}</b><span>{supplierOffers.length} {supplierOffers.length === 1 ? 'oferta para análise' : 'ofertas para análise'}</span></div><div className="approval-supplier-total"><small>Valor total</small><b>{money(approvedTotal(supplierOffers))}</b></div></div>
          <div className="table-scroll"><table><thead><tr><th>Produto</th><th>Solicitado</th><th>Ofertado</th><th>Qtd. aprovada</th><th>Valor unitário</th><th>Valor total</th><th>Decisão</th></tr></thead><tbody>{supplierOffers.map(offer => <tr key={offer.id}>
            <td><b>{offer.produto?.nome || 'Produto'}</b></td>
            <td>{offer.requested?.quantidadeSolicitada ?? '—'} {offer.requested?.unidade || ''}</td>
            <td>{offer.indisponivel ? 'Indisponível' : <div className="approval-offered-quantity"><input className="approval-quantity-input" aria-label={"Quantidade ofertada para " + (offer.produto?.nome || "produto")} type="number" min="0.001" step="0.001" value={offerQuantityEdits[offer.id] ?? offer.quantidadeOfertada} disabled={savingOfferId === offer.id} onChange={event => setOfferQuantityEdits(current => ({ ...current, [offer.id]: event.target.value }))}/>{offerQuantityEdits[offer.id] != null && Number(offerQuantityEdits[offer.id]) !== Number(offer.quantidadeOfertada) && <button type="button" className="approval-save-quantity" disabled={savingOfferId === offer.id} onClick={() => saveOfferedQuantity(offer)}>{savingOfferId === offer.id ? 'Salvando...' : 'Salvar'}</button>}</div>}</td>
            <td><input className="approval-quantity-input" aria-label={"Quantidade aprovada para " + (offer.produto?.nome || "produto")} type="number" min="0.001" max={maxQuantityFor(offer)} step="0.001" value={decisions[offer.id]?.quantidade ?? (decisions[offer.id]?.status === "APROVADA" ? offer.quantidadeOfertada : "")} disabled={offer.indisponivel || decisions[offer.id]?.status !== "APROVADA"} onChange={event => decide(offer.id, "quantidade", event.target.value)} /></td>
            <td>{offer.indisponivel ? '—' : money(offer.valorUnitario)}</td>
            <td>{productApprovedTotal(offer) === null ? '—' : money(productApprovedTotal(offer))}</td>
            <td><div className="approval-decision-options">
              <label className={"approval-decision-option approve" + (decisions[offer.id]?.status === "APROVADA" ? " selected" : "")} title="Aprovar oferta">
                <input type="checkbox" aria-label={"Aprovar " + (offer.produto?.nome || "produto")} checked={!offer.indisponivel && decisions[offer.id]?.status === "APROVADA"} disabled={offer.indisponivel} onChange={event => event.target.checked ? approveOffer(offer) : decide(offer.id, "status", "")} />
                <span aria-hidden="true"><Check size={16}/></span>
              </label>
              <label className={"approval-decision-option reject" + (offer.indisponivel || decisions[offer.id]?.status === "REJEITADA" ? " selected" : "")} title="Rejeitar oferta">
                <input type="checkbox" aria-label={"Rejeitar " + (offer.produto?.nome || "produto")} checked={offer.indisponivel || decisions[offer.id]?.status === "REJEITADA"} disabled={offer.indisponivel} onChange={event => decide(offer.id, "status", event.target.checked ? "REJEITADA" : "")} />
                <span aria-hidden="true"><X size={16}/></span>
              </label>
            </div></td>
          </tr>)}</tbody></table></div>
        </section>;
      })}
    </div> : <div className="panel table-panel"><Empty icon={BadgeCheck} title={quote ? 'Sem ofertas encaminhadas' : 'Selecione uma cotação'} body={quote ? 'Escolha uma cotação que tenha respostas prontas para análise.' : 'As propostas encaminhadas pelos fornecedores aparecerão aqui.'}/></div>}
    {!!offers.length && <div className="catalog-form-actions approval-actions"><Button variant="secondary" onClick={rejectUnapproved} disabled={!offersToReject.length}><X size={15}/> Rejeitar todos não aprovados</Button><Button onClick={submit} disabled={busy}>{busy ? "Salvando..." : "Registrar decisões"} <ArrowRight size={16}/></Button></div>}
  </>;
}

export { Approvals };
