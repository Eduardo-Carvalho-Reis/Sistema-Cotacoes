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

function Approvals({ data, api, refresh, notify, go, user }) {
  const [quoteId, setQuoteId] = useState(''); const [decisions, setDecisions] = useState({}); const [busy, setBusy] = useState(false);
  const quote = data.quotes.find(q => q.id === Number(quoteId));
  const offers = quote?.respostas?.filter(r => r.status === 'ENCAMINHADA').flatMap(r => r.itens.map(item => ({ ...item, supplier: r.fornecedor, requested: quote.itens?.find(i => i.id === item.cotacaoEnvioItemId) }))) || [];
  const decide = (id, field, value) => setDecisions(v => ({ ...v, [id]: { ...v[id], [field]: value } }));
  const submit = async () => {
    if (!quote || !offers.length) return notify('Selecione uma cotação com ofertas recebidas.');
    if (offers.some(o => !o.indisponivel && !decisions[o.id]?.status)) return notify('Defina uma decisão para cada oferta disponível.');
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
    <div className="toolbar"><div className="select-wrap"><ClipboardList size={15}/><select value={quoteId} onChange={e => setQuoteId(e.target.value)}><option value="">Selecione uma cotação</option>{data.quotes.filter(q => q.respostas?.some(r => r.status === 'ENCAMINHADA')).map(q => <option key={q.id} value={q.id}>#{String(q.id).padStart(4, '0')} · {q.obra?.nome || 'Obra'}</option>)}</select></div><span className="result-count">{offers.length} ofertas para análise</span></div>
    <div className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Produto</th><th>Fornecedor</th><th>Solicitado</th><th>Ofertado</th><th>Valor unitário</th><th>Decisão</th></tr></thead><tbody>{offers.map(o => <tr key={o.id}><td><b>{o.produto?.nome || 'Produto'}</b></td><td>{o.supplier?.nome || 'Fornecedor'}</td><td>{o.requested?.quantidadeSolicitada ?? '—'} {o.requested?.unidade || ''}</td><td>{o.indisponivel ? 'Indisponível' : o.quantidadeOfertada}</td><td>{o.indisponivel ? '—' : money(o.valorUnitario)}</td><td>{o.indisponivel ? <Badge value="INDISPONIVEL"/> : <div className="select-wrap"><select value={decisions[o.id]?.status || ''} onChange={e => decide(o.id, 'status', e.target.value)}><option value="">Escolher</option><option value="APROVADA">Aprovar</option><option value="REJEITADA">Rejeitar</option></select></div>}</td></tr>)}</tbody></table>{quote && !offers.length && <Empty icon={BadgeCheck} title="Sem ofertas encaminhadas" body="Escolha uma cotação que tenha respostas prontas para análise."/>}{!quote && <Empty icon={BadgeCheck} title="Selecione uma cotação" body="As propostas encaminhadas pelos fornecedores aparecerão aqui."/>}</div></div>
    {!!offers.length && <div className="catalog-form-actions"><Button onClick={submit} disabled={busy}>{busy ? 'Salvando...' : 'Registrar decisões'} <ArrowRight size={16}/></Button></div>}
  </>;
}

export { Approvals };
