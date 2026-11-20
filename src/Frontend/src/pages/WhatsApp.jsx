import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, MessageCircle, Plus, Trash2, Users } from 'lucide-react';
import { Badge, Button, Empty, PageTitle } from '../components/index.js';

function WhatsApp({ api, notify }) {
  const [destinatarios, setDestinatarios] = useState([]);
  const [providerReady, setProviderReady] = useState(false);
  const [form, setForm] = useState({ nome: '', tipo: 'NUMERO', identificador: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [session, setSession] = useState({ configurado: false, status: 'NAO_CONECTADO', conectado: false, qrCode: null });
  const [sessionBusy, setSessionBusy] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [showAllNotifications, setShowAllNotifications] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api('/api/whatsapp/destinatarios');
      setDestinatarios(result.destinatarios || []);
      setProviderReady(result.provedorConfigurado);
      const sessionResult = await api('/api/whatsapp/sessao');
      setSession(sessionResult);
      setNotifications(await api('/api/notificacoes?limite=50'));
    } catch (error) { notify(error.message); }
    finally { setLoading(false); }
  }, [api]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!session.configurado || session.conectado) return undefined;
    let active = true;
    const timer = setInterval(async () => {
      try {
        const current = await api('/api/whatsapp/sessao');
        if (active) setSession(current);
      } catch { /* Keep the current state during temporary network errors. */ }
    }, 4000);
    return () => { active = false; clearInterval(timer); };
  }, [api, session.configurado, session.conectado]);

  const addRecipient = async event => {
    event.preventDefault();
    setSaving(true);
    try {
      await api('/api/whatsapp/destinatarios', { method: 'POST', body: JSON.stringify(form) });
      setForm({ nome: '', tipo: 'NUMERO', identificador: '' });
      notify('Destinatário adicionado.');
      await load();
    } catch (error) { notify(error.message); }
    finally { setSaving(false); }
  };

  const disable = async recipient => {
    try {
      await api(`/api/whatsapp/destinatarios/${recipient.id}`, { method: 'DELETE' });
      notify('Destinatário removido.');
      await load();
    } catch (error) { notify(error.message); }
  };

  const sessionAction = async action => {
    setSessionBusy(true);
    try {
      const result = await api(`/api/whatsapp/sessao${action ? `/${action}` : ''}`, { method: action ? 'POST' : 'GET' });
      setSession(current => ({ ...current, ...result, configurado: result.configurado ?? current.configurado }));
      notify(action === 'desconectar' ? 'Sessão desconectada.' : action === 'reiniciar' ? 'Sessão reiniciada.' : action === 'conectar' ? 'Solicitação de conexão enviada.' : 'Status atualizado.');
    } catch (error) { notify(error.message); }
    finally { setSessionBusy(false); }
  };

  const retryNotification = async notification => {
    try {
      await api(`/api/notificacoes/${notification.id}/tentar-novamente`, { method: 'POST' });
      notify('Tentativa de envio registrada.');
      setNotifications(await api('/api/notificacoes?limite=50'));
    } catch (error) { notify(error.message); }
  };

  const active = destinatarios.filter(item => item.ativo);
  const visibleNotifications = showAllNotifications ? notifications : notifications.slice(0, 5);
  return <>
    <PageTitle eyebrow="ENVIO DE MENSAGENS" title="WhatsApp" description="Configure sua lista pessoal de destinatários para as respostas das cotações." />
    <section className={`panel whatsapp-provider-state ${providerReady ? 'ready' : 'missing'}`}>
      {providerReady ? <CheckCircle2 size={19}/> : <AlertCircle size={19}/>}
      <div><b>{providerReady ? 'Provedor conectado' : 'Provedor não configurado'}</b><span>{providerReady ? 'As respostas serão enviadas aos destinatários ativos ao serem encaminhadas.' : 'Configure WHATSAPP_PROVIDER_URL e WHATSAPP_PROVIDER_TOKEN no .env da API e reinicie o servidor.'}</span></div>
    </section>
    <section className="panel whatsapp-provider-state">
      <MessageCircle size={19}/>
      <div className="whatsapp-session-copy"><b>Sua sessão WhatsApp: {session.status?.replaceAll('_', ' ') || 'DESCONECTADO'}</b><span>{session.configurado ? 'A sessão é isolada por usuário e as credenciais permanecem no backend.' : 'Para ativar sessões individuais, configure WHATSAPP_SERVER_URL, WHATSAPP_SERVER_SECRET_KEY e WPP_TOKEN_ENCRYPTION_KEY no backend.'}</span>
        {session.qrCode && <><img className="whatsapp-qr" src={session.qrCode} alt="QR Code de conexão do WhatsApp"/><small className="whatsapp-field-hint">Leia o QR Code logo após gerar. A tela atualiza o status e o código enquanto aguarda o pareamento.</small></>}
        <div className="whatsapp-form-actions">
          <Button type="button" disabled={sessionBusy || !session.configurado} onClick={() => sessionAction(session.conectado ? 'reiniciar' : 'conectar')}>{sessionBusy ? 'Aguarde...' : session.conectado ? 'Reiniciar sessão' : 'Conectar / gerar QR Code'}</Button>
          {session.conectado && <Button type="button" variant="secondary" disabled={sessionBusy} onClick={() => sessionAction('desconectar')}>Desconectar</Button>}
          <Button type="button" variant="secondary" disabled={sessionBusy} onClick={() => sessionAction('')}>Atualizar status</Button>
        </div>
      </div>
    </section>
    <section className="panel whatsapp-recipients notification-history">
      <div className="panel-heading"><div><span className="eyebrow">AUTOMAÇÕES</span><h2>Histórico de notificações</h2></div><span className="result-count">{notifications.length}</span></div>
      {notifications.length ? <><div className="whatsapp-recipient-list">{visibleNotifications.map(item => <div className="whatsapp-recipient" key={item.id}><span className="whatsapp-recipient-copy"><b>{item.evento.replaceAll('_', ' ')} · {item.entidadeTipo} #{item.entidadeId}</b><span>{item.destinatarioNome || item.telefone || 'Sem destinatário'} · {new Date(item.criadoEm).toLocaleString('pt-BR')} · {item.status} · {item.tentativas} tentativa(s){item.erro ? ` · ${item.erro}` : ''}</span></span>{item.status === 'FALHOU' && <Button type="button" variant="secondary" onClick={() => retryNotification(item)}>Tentar novamente</Button>}</div>)}</div>{notifications.length > 5 && <div className="whatsapp-history-actions"><Button type="button" variant="secondary" onClick={() => setShowAllNotifications(current => !current)}>{showAllNotifications ? 'Mostrar menos' : 'Mais'}</Button></div>}</> : <div className="whatsapp-loading">As notificações automáticas e suas tentativas aparecerão aqui.</div>}
    </section>
    <div className="whatsapp-layout">
      <form className="panel whatsapp-form" onSubmit={addRecipient}>
        <div className="panel-heading"><div><span className="eyebrow">NOVO DESTINATÁRIO</span><h2>Adicionar número ou grupo</h2></div></div>
        <div className="whatsapp-form-fields">
          <label className="field-label">Nome para identificação<input required placeholder="Ex.: Compras / Equipe da obra" value={form.nome} onChange={event => setForm(current => ({ ...current, nome: event.target.value }))}/></label>
          <label className="field-label">Tipo<select value={form.tipo} onChange={event => setForm(current => ({ ...current, tipo: event.target.value, identificador: '' }))}><option value="NUMERO">Número de WhatsApp</option><option value="GRUPO">Grupo do WhatsApp</option></select></label>
          <label className="field-label">{form.tipo === 'NUMERO' ? 'Número com código do país e DDD' : 'ID do grupo WhatsApp'}<input required placeholder={form.tipo === 'NUMERO' ? '+55 11 99999-9999' : '1203...@g.us'} value={form.identificador} onChange={event => setForm(current => ({ ...current, identificador: event.target.value }))}/><small className="whatsapp-field-hint">{form.tipo === 'NUMERO' ? 'Exemplo: +55 11 99999-9999.' : 'Use o ID do grupo fornecido pela sua integração WhatsApp, normalmente terminado em @g.us.'}</small></label>
        </div>
        <div className="whatsapp-form-actions"><Button type="submit" disabled={saving}><Plus size={16}/>{saving ? 'Adicionando...' : 'Adicionar destinatário'}</Button></div>
      </form>
      <section className="panel whatsapp-recipients">
        <div className="panel-heading"><div><span className="eyebrow">DESTINATÁRIOS</span><h2>Recebem as respostas</h2></div><span className="result-count">{active.length} ativos</span></div>
        {loading ? <div className="whatsapp-loading">Carregando destinatários...</div> : active.length ? <div className="whatsapp-recipient-list">{active.map(recipient => <div className="whatsapp-recipient" key={recipient.id}><span className="whatsapp-recipient-icon">{recipient.tipo === 'GRUPO' ? <Users size={17}/> : <MessageCircle size={17}/>}</span><div className="whatsapp-recipient-copy"><b>{recipient.nome}</b><span>{recipient.identificador}</span></div><Badge value={recipient.tipo === 'GRUPO' ? 'GRUPO' : 'ATIVO'}/><button className="icon-button whatsapp-remove" type="button" title="Remover destinatário" aria-label={`Remover ${recipient.nome}`} onClick={() => disable(recipient)}><Trash2 size={16}/></button></div>)}</div> : <Empty icon={MessageCircle} title="Nenhum destinatário cadastrado" body="Adicione um número ou grupo para receber as respostas encaminhadas."/>}
      </section>
    </div>
  </>;
}

export { WhatsApp };
