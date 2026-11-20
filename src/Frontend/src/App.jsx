import { useCallback, useEffect, useState } from 'react';
import {
  Activity, ArrowDownToLine, ArrowLeft, ArrowRight, BadgeCheck, Bell, Building2,
  Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, ClipboardList, Clock3,
  FileCheck2, FileText, Gauge, HardHat, LayoutDashboard, LogOut, Menu, MessageCircle,
  Package, Plus, Search, Send, Settings2, ShoppingCart, SlidersHorizontal, Truck,
  X,
} from 'lucide-react';

import { Login, Overview, Quotes, Responses, Approvals, Purchases, Catalog, Reports, Settings, WhatsApp, QuoteWizard, ResponseModal, PurchaseModal, QuoteManagementModal, UsersAdmin } from './pages/index.js';
import { statusNames } from './utils/formatters.js';


function App() {
  const [token, setToken] = useState(localStorage.getItem('orbe-token'));
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('overview');
  const [data, setData] = useState({ quotes: [], purchases: [], works: [], products: [], categories: [], suppliers: [], equipment: [], applications: [] });
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null);
  const [responseQuoteId, setResponseQuoteId] = useState(null);
  const [mobileNav, setMobileNav] = useState(false);

  const api = useCallback(async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: { ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
    });
    if (response.status === 204) return null;
    const type = response.headers.get('content-type') || '';
    const result = type.includes('application/json') ? await response.json() : await response.blob();
    const authenticationFailure = ['Authentication required.', 'Account inactive or unavailable.', 'Invalid or expired token.'].includes(result?.erro);
    if (response.status === 401 && url !== '/auth/login' && authenticationFailure) {
      localStorage.removeItem('orbe-token'); setToken(null); setUser(null);
    }
    if (!response.ok) throw new Error(result?.erro || result?.mensagem || 'Não foi possível concluir a solicitação.');
    return result;
  }, [token]);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [quotes, purchases, works, products, categories, suppliers, equipment, applications] = await Promise.all([
        api('/api/cotacoes?limite=100'), api('/api/compras'), api('/api/catalogos/obras'), api('/produto'), api('/api/catalogos/categorias-produto'), api('/fornecedor'), api('/api/catalogos/equipamentos'), api('/api/catalogos/aplicacoes'),
      ]);
      setData({ quotes, purchases, works, products, categories, suppliers, equipment, applications });
    } catch (e) { notify(e.message); }
    finally { setLoading(false); }
  }, [api, token]);

  useEffect(() => { if (token) api('/auth/me').then(setUser).catch(() => {}); }, [api, token]);
  useEffect(() => { if (user) refresh(); }, [user, refresh]);
  useEffect(() => { if (!notice) return; const id = setTimeout(() => setNotice(''), 3600); return () => clearTimeout(id); }, [notice]);
  const notify = (message) => setNotice(message);

  const signIn = async (email, senha) => {
    try {
      const result = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, senha }) });
      localStorage.setItem('orbe-token', result.token); setToken(result.token); setUser(result.usuario); notify(`Bem-vinda, ${result.usuario.nome.split(' ')[0]}.`); return true;
    } catch (e) { return e.message; }
  };
  const signOut = () => { localStorage.removeItem('orbe-token'); setToken(null); setUser(null); setPage('overview'); };
  const go = (id) => { setPage(id); setMobileNav(false); setModal(null); };
  const perform = async (fn, success) => { try { await fn(); notify(success); setModal(null); await refresh(); } catch (e) { notify(e.message); } };

  if (!token || !user) return <Login onLogin={signIn} />;
  const nav = [
    { title: 'WORKSPACE', items: [{ id: 'overview', label: 'Visão geral', icon: LayoutDashboard }, { id: 'quotes', label: 'Cotações', icon: ClipboardList, count: data.quotes.filter(q => !['CONCLUIDA', 'ENCERRADA', 'CANCELADA'].includes(q.status)).length }, { id: 'responses', label: 'Respostas', icon: MessageCircle }, { id: 'approval', label: 'Aprovações', icon: BadgeCheck }, { id: 'purchases', label: 'Pedidos e compras', icon: ShoppingCart }] },
  ];
  const settingsPages = { settings: 'Configurações', catalog: 'Cadastros', whatsapp: 'WhatsApp', reports: 'Relatórios', users: 'Usuários' };
  const activeLabel = nav.flatMap(n => n.items).find(i => i.id === page)?.label || settingsPages[page] || 'Visão geral';
  const settingsActive = Object.hasOwn(settingsPages, page);
  const contentProps = { api, data, refresh, go, notify, perform, setModal, responseQuoteId, setResponseQuoteId };
  const openResponseQuote = (quote) => { setResponseQuoteId(quote.id); setPage('responses'); setMobileNav(false); setModal(null); };

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}><button className="icon-button mobile-close sidebar-mobile-close" onClick={() => setMobileNav(false)} aria-label="Fechar menu"><X size={18}/></button>
      <nav>{nav.map(group => <div className="nav-group" key={group.title}><span className="nav-caption">{group.title}</span>{group.items.map(item => <button key={item.id} className={`nav-link ${page === item.id ? 'active' : ''}`} onClick={() => go(item.id)}><item.icon size={18}/><span>{item.label}</span>{item.count > 0 && <em>{item.count}</em>}</button>)}</div>)}</nav>
      <div className="sidebar-bottom"><button className={`nav-link ${settingsActive ? 'active' : ''}`} onClick={() => go('settings')}><Settings2 size={18}/><span>Configurações</span></button><div className="help-card"><div className="help-icon"><CircleHelp size={17}/></div><b>Precisa de ajuda?</b><p>Veja como funciona o fluxo de compras.</p><button onClick={() => notify('O fluxo começa criando uma cotação e selecionando uma obra.')}>Acessar central <ArrowRight size={14}/></button></div><div className="profile"><div className="avatar">{user.nome?.slice(0, 1).toUpperCase()}</div><div className="profile-info"><b>{user.nome}</b><small>{(typeof user.perfil === 'string' ? user.perfil : user.perfil?.nome || '').replaceAll('_', ' ')}</small></div><button className="icon-button" title="Sair" onClick={signOut}><LogOut size={16}/></button></div></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" onClick={() => setMobileNav(true)}><Menu size={19}/></button><div className="breadcrumbs"><span>Workspace</span><ChevronRight size={14}/><b>{activeLabel}</b></div></div><div className="topbar-right"><div className="search-shortcut"><Search size={15}/><span>Buscar</span><kbd>⌘ K</kbd></div><button className="icon-button notification" onClick={() => notify('Você está em dia. Nenhuma notificação nova.')}><Bell size={18}/><i></i></button><div className="topbar-divider"></div><div className="top-user"><div className="avatar small-avatar">{user.nome?.slice(0, 1).toUpperCase()}</div><ChevronDown size={14}/></div></div></header>
      <div className="page-wrap">
        {page === 'overview' && <Overview {...contentProps} user={user} />}
        {page === 'quotes' && <Quotes {...contentProps} openResponseQuote={openResponseQuote} />}
        {page === 'responses' && <Responses {...contentProps} />}
        {page === 'approval' && <Approvals {...contentProps} user={user} />}
        {page === 'purchases' && <Purchases {...contentProps} user={user} />}
        {page === 'catalog' && <Catalog {...contentProps} user={user} />}
        {page === 'reports' && <Reports {...contentProps} />}
        {page === 'settings' && <Settings user={user} go={go} />}
        {page === 'whatsapp' && <WhatsApp {...contentProps} />}
        {page === 'users' && <UsersAdmin {...contentProps} user={user} />}
      </div>
      <footer className="footer"><span>ORBE · Gestão de compras</span><span>Fluxos claros. Compras sob controle.</span></footer>
    </main>
    {loading && <div className="refresh-indicator"><span></span> Atualizando dados</div>}
    {notice && <div className="toast"><CheckCircle2 size={17}/>{notice}</div>}
    {modal?.type === 'newQuote' && <QuoteWizard {...contentProps} onClose={() => setModal(null)} />}
    {['editQuote', 'cancelQuote'].includes(modal?.type) && <QuoteManagementModal {...contentProps} quote={modal.quote} mode={modal.type === 'cancelQuote' ? 'cancel' : 'edit'} onClose={() => setModal(null)} />}
    {modal?.type === 'respond' && <ResponseModal {...contentProps} quote={modal.quote} supplierId={modal.supplierId} onClose={() => setModal(null)} />}
    {modal?.type === 'purchaseAction' && <PurchaseModal {...contentProps} purchase={modal.purchase} order={modal.order} action={modal.action} onClose={() => setModal(null)} />}
  </div>;
}


export default App;
