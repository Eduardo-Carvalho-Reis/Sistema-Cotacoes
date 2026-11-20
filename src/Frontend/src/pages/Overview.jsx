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

function Overview({ data, go, setModal }) {
  const openQuotes = data.quotes.filter(q => !['CONCLUIDA', 'ENCERRADA', 'CANCELADA'].includes(q.status)).length;
  const pending = data.purchases.flatMap(p => p.pedidos || []).filter(p => ['AGUARDANDO_CONFIRMACAO', 'PARCIALMENTE_RECEBIDO'].includes(p.status)).length;
  const steps = [
    { n: '01', title: 'Criar cotação', desc: 'Defina a obra, os itens e os fornecedores.', id: 'quotes', done: data.quotes.length > 0, icon: ClipboardList },
    { n: '02', title: 'Registrar respostas', desc: 'Cadastre as propostas recebidas.', id: 'responses', done: data.quotes.some(q => q.respostas?.length), icon: MessageCircle },
    { n: '03', title: 'Analisar e aprovar', desc: 'Compare preços e distribua quantidades.', id: 'approval', done: data.purchases.length > 0, icon: BadgeCheck },
    { n: '04', title: 'Acompanhar pedidos', desc: 'Confirme, receba e registre as notas.', id: 'purchases', done: data.purchases.some(p => p.pedidos?.length), icon: Truck },
  ];
  const recent = data.quotes.slice(0, 5);
  return <>
    <div className="welcome-banner"><div><span className="welcome-kicker"><span className="pulse-dot"></span> PAINEL DE COMPRAS</span><h1>Bom dia. Vamos organizar<br/>as próximas compras?</h1><p>Acompanhe cada etapa do processo em um só lugar.</p><Button onClick={() => setModal({ type: 'newQuote' })}><Plus size={17}/> Nova cotação</Button></div><div className="welcome-illustration"><div className="illustration-circle"><div className="illustration-sheet"><div className="sheet-head"><span></span><i></i></div><div className="sheet-row"><span></span><b></b><i></i></div><div className="sheet-row"><span></span><b></b><i></i></div><div className="sheet-row"><span></span><b></b><i></i></div><div className="sheet-check"><Check size={17}/></div></div><div className="float-tag tag-top"><CheckCircle2 size={15}/> Processo rastreável</div><div className="float-tag tag-bottom"><span className="mini-avatar">M</span> Fornecedores conectados</div></div></div></div>
    <div className="stats-grid"><Stat icon={ClipboardList} label="Cotações em andamento" value={openQuotes} detail="Solicitações abertas" tint="green"/><Stat icon={MessageCircle} label="Respostas recebidas" value={data.quotes.reduce((n, q) => n + (q.respostas?.length || 0), 0)} detail="Em todas as cotações" tint="blue"/><Stat icon={ShoppingCart} label="Pedidos pendentes" value={pending} detail="Aguardando ação" tint="amber"/><Stat icon={Building2} label="Obras cadastradas" value={data.works.length} detail="Com compras vinculadas" tint="violet"/></div>
    <div className="content-grid overview-grid"><section className="panel process-panel"><div className="panel-heading"><div><span className="eyebrow">FLUXO OPERACIONAL</span><h2>Da solicitação ao recebimento</h2></div><button className="text-button" onClick={() => go('quotes')}>Ver cotações <ArrowRight size={15}/></button></div><div className="process-list">{steps.map((step, i) => <button key={step.id} className="process-step" onClick={() => go(step.id)}><div className={`step-number ${step.done ? 'done' : ''}`}>{step.done ? <Check size={16}/> : step.n}</div><div className="step-copy"><b>{step.title}</b><span>{step.desc}</span></div><span className={`step-state ${step.done ? 'complete' : ''}`}>{step.done ? 'Concluído' : i === 0 ? 'Começar' : 'Próxima etapa'}</span><ChevronRight size={17} className="step-chevron"/></button>)}</div></section><section className="panel recent-panel"><div className="panel-heading"><div><span className="eyebrow">ACOMPANHAMENTO</span><h2>Cotações recentes</h2></div><button className="icon-button" onClick={() => go('quotes')}><ArrowRight size={17}/></button></div>{recent.length ? <div className="recent-list">{recent.map(q => <button className="recent-row" key={q.id} onClick={() => go('quotes')}><div className="recent-symbol"><ClipboardList size={17}/></div><div className="recent-copy"><b>{q.obra?.nome || `Solicitação #${q.id}`}</b><span>Cotação #{String(q.id).padStart(4, '0')} · {date(q.dataCriacao)}</span></div><Badge value={q.status}/></button>)}</div> : <Empty icon={ClipboardList} title="Tudo começa aqui" body="Crie a primeira cotação para acompanhar seu processo." action={<button className="text-button" onClick={() => setModal({ type: 'newQuote' })}>Criar cotação <ArrowRight size={14}/></button>}/>}</section></div>
    <div className="bottom-note"><div className="note-icon"><Activity size={17}/></div><div><b>Decisões com contexto</b><span>Compare quantidade, unidade e disponibilidade junto ao preço. O menor valor nem sempre representa a melhor proposta.</span></div><button onClick={() => go('reports')}>Ver relatórios <ArrowRight size={14}/></button></div>
  </>;
}

export { Overview };
