import { useState } from 'react';
import { ArrowRight } from 'lucide-react';

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const result = await onLogin(email, password);
    setBusy(false);
    if (result !== true) setError(result || 'Não foi possível entrar.');
  };

  return <div className="login-page"><div className="login-decoration"><div className="login-orbit orbit-one"></div><div className="login-orbit orbit-two"></div><div className="login-decoration-copy"><div className="brand-mark light-mark"><span></span><span></span><span></span></div><p>Da cotação<br/>à entrega.</p><span>Um processo de compras mais claro para cada obra.</span><div className="login-art-card"><div className="art-line"><span></span><i></i></div><div className="art-line short"><span></span><i></i></div><div className="art-bottom"><b>R$ 8.420,00</b><span>proposta selecionada</span></div></div></div></div><div className="login-form-wrap"><div className="login-form"><div className="brand login-brand"><div className="brand-mark"><span></span><span></span><span></span></div><b>orbe</b></div><span className="eyebrow">ÁREA DE ACESSO</span><h1>Bom ter você<br/>por aqui.</h1><p className="muted">Entre com seus dados para continuar o fluxo de compras.</p>{error && <div className="login-error">{error}</div>}<form onSubmit={submit}><label>E-mail corporativo<input autoFocus type="email" required placeholder="nome@empresa.com.br" value={email} onChange={event => setEmail(event.target.value)}/></label><label>Senha<input type="password" required placeholder="Sua senha" value={password} onChange={event => setPassword(event.target.value)}/></label><button className="button primary full-button" disabled={busy}>{busy ? 'Aguarde...' : 'Entrar'} <ArrowRight size={17}/></button></form></div></div></div>;
}

export { Login };
