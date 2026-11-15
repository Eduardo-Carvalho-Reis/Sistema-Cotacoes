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

function Login({ onLogin, onBootstrap }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [setup, setSetup] = useState(false); const [name, setName] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async e => { e.preventDefault(); setBusy(true); setError(''); const result = setup ? await onBootstrap(name, email, password) : await onLogin(email, password); setBusy(false); if (result !== true) setError(result || 'Não foi possível entrar.'); else if (setup) { setSetup(false); setError('Administrador criado. Agora entre com seu e-mail e senha.'); } };
  return <div className="login-page"><div className="login-decoration"><div className="login-orbit orbit-one"></div><div className="login-orbit orbit-two"></div><div className="login-decoration-copy"><div className="brand-mark light-mark"><span></span><span></span><span></span></div><p>Da cotação<br/>à entrega.</p><span>Um processo de compras mais claro para cada obra.</span><div className="login-art-card"><div className="art-line"><span></span><i></i></div><div className="art-line short"><span></span><i></i></div><div className="art-bottom"><b>R$ 8.420,00</b><span>proposta selecionada</span></div></div></div></div><div className="login-form-wrap"><div className="login-form"><div className="brand login-brand"><div className="brand-mark"><span></span><span></span><span></span></div><b>orbe</b></div><span className="eyebrow">{setup ? 'CONFIGURAÇÃO INICIAL' : 'ÁREA DE ACESSO'}</span><h1>{setup ? <>Vamos preparar<br/>seu espaço.</> : <>Bom ter você<br/>por aqui.</>}</h1><p className="muted">{setup ? 'Crie a conta inicial de administração para começar a usar o sistema.' : 'Entre com seus dados para continuar o fluxo de compras.'}</p>{error && <div className="login-error">{error}</div>}<form onSubmit={submit}>{setup && <label>Nome completo<input required placeholder="Seu nome" value={name} onChange={e => setName(e.target.value)}/></label>}<label>E-mail corporativo<input autoFocus type="email" required placeholder="nome@empresa.com.br" value={email} onChange={e => setEmail(e.target.value)}/></label><label>Senha<input type="password" minLength={setup ? 10 : undefined} required placeholder={setup ? 'Mínimo de 10 caracteres' : 'Sua senha'} value={password} onChange={e => setPassword(e.target.value)}/></label><button className="button primary full-button" disabled={busy}>{busy ? 'Aguarde...' : setup ? 'Criar administrador' : 'Entrar'} <ArrowRight size={17}/></button></form><button className="login-switch" onClick={() => { setSetup(v => !v); setError(''); }}>{setup ? 'Já configurou o acesso? Entrar' : 'Primeiro acesso? Configurar administrador'}</button><div className="login-foot"><span>Ambiente seguro</span><span>•</span><span>Suporte ao usuário</span></div></div></div></div>;
}

export { Login };
