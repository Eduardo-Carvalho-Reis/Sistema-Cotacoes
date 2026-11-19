import { useEffect, useMemo, useState } from 'react';
import { KeyRound, Pencil, Plus, ShieldCheck, UserRound, UserX, X } from 'lucide-react';
import { Badge, Button, Empty, PageTitle } from '../components/index.js';

const emptyUser = { nome: '', email: '', cpf: '', telefone: '', senha: '', perfilId: '', obraId: '', ativo: true };

function UsersAdmin({ api, data, refresh, notify, user }) {
  const [users, setUsers] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [form, setForm] = useState(null);
  const [reset, setReset] = useState(null);
  const [ownPassword, setOwnPassword] = useState(null);
  const [busy, setBusy] = useState(false);
  const perfil = typeof user?.perfil === 'string' ? user.perfil : user?.perfil?.nome;
  const isAdmin = ['ADMINISTRADOR', 'ADMINISTRADOR_SISTEMA'].includes(perfil);
  const userProfiles = useMemo(() => profiles.filter(profile => ['ADMINISTRADOR', 'USUARIO_PADRAO'].includes(profile.nome)), [profiles]);
  const load = async () => {
    try {
      const list = await api('/api/catalogos/usuarios');
      setUsers(list);
      if (isAdmin) setProfiles(await api('/api/catalogos/perfis'));
    } catch (error) { notify(error.message); }
  };
  useEffect(() => { load(); }, [api, isAdmin]);
  const submit = async event => {
    event.preventDefault(); setBusy(true);
    try {
      const body = isAdmin
        ? { nome: form.nome.trim(), email: form.email.trim(), cpf: form.cpf || null, telefone: form.telefone || null, perfilId: Number(form.perfilId), ativo: form.ativo }
        : { nome: form.nome.trim(), cpf: form.cpf || null, telefone: form.telefone || null };
      if (isAdmin && form.senha) body.senha = form.senha;
      if (isAdmin && profiles.find(profile => profile.id === Number(form.perfilId))?.nome === 'USUARIO_PADRAO') body.obraId = Number(form.obraId);
      const url = isAdmin ? (form.id ? `/api/catalogos/usuarios/${form.id}` : '/api/catalogos/usuarios') : `/api/catalogos/usuarios/${user.id}`;
      await api(url, { method: isAdmin && !form.id ? 'POST' : 'PATCH', body: JSON.stringify(body) });
      await load(); await refresh(); setForm(null); notify('Dados salvos.');
    } catch (error) { notify(error.message); } finally { setBusy(false); }
  };
  const toggle = async target => {
    try { await api(`/api/catalogos/usuarios/${target.id}`, { method: 'PATCH', body: JSON.stringify({ ativo: !target.ativo }) }); await load(); notify(target.ativo ? 'Conta desativada.' : 'Conta ativada.'); }
    catch (error) { notify(error.message); }
  };
  const changePassword = async event => {
    event.preventDefault(); setBusy(true);
    try { await api(`/api/catalogos/usuarios/${reset.id}/redefinir-senha`, { method: 'POST', body: JSON.stringify({ senha: reset.senha }) }); setReset(null); notify('Senha redefinida.'); }
    catch (error) { notify(error.message); } finally { setBusy(false); }
  };
  const changeOwnPassword = async event => {
    event.preventDefault(); setBusy(true);
    try { await api('/auth/password', { method: 'PATCH', body: JSON.stringify({ senhaAtual: ownPassword.senhaAtual, novaSenha: ownPassword.novaSenha }) }); setOwnPassword(null); notify('Senha atualizada.'); }
    catch (error) { notify(error.message); } finally { setBusy(false); }
  };
  const openEdit = async target => {
    try {
      const fresh = await api(`/api/catalogos/usuarios/${target.id}`);
      setForm({ id: fresh.id, nome: fresh.nome, email: fresh.email || '', cpf: fresh.cpf || '', telefone: fresh.telefone || '', senha: '', perfilId: fresh.perfilId, obraId: fresh.obraId || '', ativo: fresh.ativo });
    } catch (error) { notify(error.message); }
  };

  return <>
    <PageTitle eyebrow={isAdmin ? 'ADMINISTRAÇÃO' : 'CONTA'} title="Usuários" description={isAdmin ? 'Gerencie contas, perfis, obras vinculadas e acesso ao sistema.' : 'Consulte usuários e atualize seus dados pessoais.'} action={isAdmin ? <Button onClick={() => setForm({ ...emptyUser, perfilId: userProfiles.find(profile => profile.nome === 'USUARIO_PADRAO')?.id || '' })}><Plus size={16}/> Novo usuário</Button> : <><Button variant="secondary" onClick={() => setOwnPassword({ senhaAtual: '', novaSenha: '' })}><KeyRound size={16}/> Alterar senha</Button><Button onClick={() => openEdit(user)}><Pencil size={16}/> Meus dados</Button></>} />
    <div className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Usuário</th><th>E-mail</th><th>Telefone</th><th>Perfil</th><th>Obra</th>{isAdmin && <><th>Status</th><th>Ações</th></>}</tr></thead><tbody>{users.map(target => <tr key={target.id}><td><b>{target.nome}</b>{target.cpf && <small className="table-subtitle">CPF {target.cpf}</small>}</td><td>{target.email}</td><td>{target.telefone || '—'}</td><td>{target.perfil?.nome?.replaceAll('_', ' ') || '—'}</td><td>{target.obra?.nome || (target.perfil?.nome?.includes('ADMINISTRADOR') ? 'Todas' : 'Sem obra')}</td>{isAdmin && <><td><Badge value={target.ativo ? 'ATIVO' : 'CANCELADA'}/></td><td><div className="row-actions"><button className="icon-button" title="Editar usuário" onClick={() => openEdit(target)}><Pencil size={15}/></button><button className="icon-button" title="Redefinir senha" onClick={() => setReset({ id: target.id, nome: target.nome, senha: '' })}><KeyRound size={15}/></button>{target.id !== user.id && <button className="icon-button" title={target.ativo ? 'Desativar conta' : 'Ativar conta'} onClick={() => toggle(target)}>{target.ativo ? <UserX size={15}/> : <UserRound size={15}/>}</button>}</div></td></>}</tr>)}</tbody></table>{!users.length && <Empty icon={ShieldCheck} title="Nenhum usuário cadastrado" body="Não há contas para exibir."/>}</div></div>
    {form && <div className="modal-backdrop"><form className="modal compact-modal" onSubmit={submit}><div className="modal-head"><div><span className="eyebrow">{isAdmin ? 'CONTROLE DE ACESSO' : 'MINHA CONTA'}</span><h2>{isAdmin ? (form.id ? 'Editar usuário' : 'Novo usuário') : 'Meus dados'}</h2></div><button type="button" className="icon-button" onClick={() => setForm(null)}><X size={18}/></button></div><div className="modal-content"><label className="field-label">Nome<input required value={form.nome} onChange={event => setForm({ ...form, nome: event.target.value })}/></label>{isAdmin && <label className="field-label">E-mail<input required type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })}/></label>}<label className="field-label">Telefone / número<input type="tel" value={form.telefone} onChange={event => setForm({ ...form, telefone: event.target.value })}/></label><label className="field-label">CPF<input inputMode="numeric" value={form.cpf} onChange={event => setForm({ ...form, cpf: event.target.value })}/></label>{isAdmin && <><label className="field-label">{form.id ? 'Nova senha (opcional)' : 'Senha inicial'}<input required={!form.id} minLength={10} type="password" value={form.senha} onChange={event => setForm({ ...form, senha: event.target.value })}/></label><label className="field-label">Perfil<select required value={form.perfilId} onChange={event => setForm({ ...form, perfilId: Number(event.target.value), obraId: '' })}><option value="">Selecione</option>{userProfiles.map(profile => <option key={profile.id} value={profile.id}>{profile.nome.replaceAll('_', ' ')}</option>)}</select></label>{profiles.find(profile => profile.id === Number(form.perfilId))?.nome === 'USUARIO_PADRAO' && <label className="field-label">Obra vinculada<select required value={form.obraId} onChange={event => setForm({ ...form, obraId: event.target.value })}><option value="">Selecione a obra</option>{data.works.filter(work => work.ativo).map(work => <option key={work.id} value={work.id}>{work.nome}</option>)}</select></label>}<label className="field-label">Conta<select value={String(form.ativo)} onChange={event => setForm({ ...form, ativo: event.target.value === 'true' })}><option value="true">Ativa</option><option value="false">Desativada</option></select></label></>}</div><div className="modal-foot"><button type="button" className="button secondary" onClick={() => setForm(null)}>Cancelar</button><Button type="submit" disabled={busy}>{busy ? 'Salvando...' : 'Salvar'}</Button></div></form></div>}
    {reset && <div className="modal-backdrop"><form className="modal compact-modal" onSubmit={changePassword}><div className="modal-head"><div><span className="eyebrow">RECUPERAÇÃO ADMINISTRATIVA</span><h2>Redefinir senha</h2></div><button type="button" className="icon-button" onClick={() => setReset(null)}><X size={18}/></button></div><div className="modal-content"><p>Defina uma senha temporária para {reset.nome}.</p><label className="field-label">Senha temporária<input required minLength={10} type="password" value={reset.senha} onChange={event => setReset({ ...reset, senha: event.target.value })}/></label></div><div className="modal-foot"><button type="button" className="button secondary" onClick={() => setReset(null)}>Cancelar</button><Button type="submit" disabled={busy}>{busy ? 'Salvando...' : 'Redefinir senha'}</Button></div></form></div>}
    {ownPassword && <div className="modal-backdrop"><form className="modal compact-modal" onSubmit={changeOwnPassword}><div className="modal-head"><div><span className="eyebrow">MINHA CONTA</span><h2>Alterar senha</h2></div><button type="button" className="icon-button" onClick={() => setOwnPassword(null)}><X size={18}/></button></div><div className="modal-content"><label className="field-label">Senha atual<input required type="password" value={ownPassword.senhaAtual} onChange={event => setOwnPassword({ ...ownPassword, senhaAtual: event.target.value })}/></label><label className="field-label">Nova senha<input required minLength={10} type="password" value={ownPassword.novaSenha} onChange={event => setOwnPassword({ ...ownPassword, novaSenha: event.target.value })}/></label></div><div className="modal-foot"><button type="button" className="button secondary" onClick={() => setOwnPassword(null)}>Cancelar</button><Button type="submit" disabled={busy}>{busy ? 'Salvando...' : 'Atualizar senha'}</Button></div></form></div>}
  </>;
}

export { UsersAdmin };
