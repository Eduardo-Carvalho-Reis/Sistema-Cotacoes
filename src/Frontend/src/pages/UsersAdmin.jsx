import { useEffect, useMemo, useState } from 'react';
import { KeyRound, Pencil, Plus, ShieldCheck, UserRound, UserX, X } from 'lucide-react';
import { Badge, Button, Empty, PageTitle } from '../components/index.js';

const emptyUser = { nome: '', email: '', senha: '', perfilId: '', obraId: '', ativo: true };

function UsersAdmin({ api, data, refresh, notify }) {
  const [users, setUsers] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [form, setForm] = useState(null);
  const [reset, setReset] = useState(null);
  const [busy, setBusy] = useState(false);
  const userProfiles = useMemo(() => profiles.filter(profile => ['ADMINISTRADOR', 'USUARIO_PADRAO'].includes(profile.nome)), [profiles]);
  const load = async () => {
    try {
      const [list, roles] = await Promise.all([api('/api/catalogos/usuarios'), api('/api/catalogos/perfis')]);
      setUsers(list); setProfiles(roles);
    } catch (error) { notify(error.message); }
  };
  useEffect(() => { load(); }, [api]);
  const submit = async event => {
    event.preventDefault(); setBusy(true);
    try {
      const body = { nome: form.nome.trim(), email: form.email.trim(), perfilId: Number(form.perfilId), ativo: form.ativo };
      if (form.senha) body.senha = form.senha;
      const selectedProfile = profiles.find(profile => profile.id === Number(form.perfilId));
      if (selectedProfile?.nome === 'USUARIO_PADRAO') body.obraId = Number(form.obraId);
      await api(form.id ? `/api/catalogos/usuarios/${form.id}` : '/api/catalogos/usuarios', { method: form.id ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      await load(); await refresh(); setForm(null); notify(form.id ? 'Usuário atualizado.' : 'Usuário criado.');
    } catch (error) { notify(error.message); } finally { setBusy(false); }
  };
  const toggle = async user => {
    try { await api(`/api/catalogos/usuarios/${user.id}`, { method: 'PATCH', body: JSON.stringify({ ativo: !user.ativo }) }); await load(); notify(user.ativo ? 'Conta desativada.' : 'Conta ativada.'); }
    catch (error) { notify(error.message); }
  };
  const changePassword = async event => {
    event.preventDefault(); setBusy(true);
    try { await api(`/api/catalogos/usuarios/${reset.id}/redefinir-senha`, { method: 'POST', body: JSON.stringify({ senha: reset.senha }) }); setReset(null); notify('Senha temporária redefinida.'); }
    catch (error) { notify(error.message); } finally { setBusy(false); }
  };
  return <>
    <PageTitle eyebrow="ADMINISTRAÇÃO" title="Usuários" description="Gerencie contas, perfis, obras vinculadas e acesso ao sistema." action={<Button onClick={() => setForm({ ...emptyUser, perfilId: userProfiles.find(profile => profile.nome === 'USUARIO_PADRAO')?.id || '' })}><Plus size={16}/> Novo usuário</Button>} />
    <div className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Usuário</th><th>E-mail</th><th>Perfil</th><th>Obra</th><th>Status</th><th>Ações</th></tr></thead><tbody>{users.map(user => <tr key={user.id}><td><b>{user.nome}</b></td><td>{user.email}</td><td>{user.perfil?.nome?.replaceAll('_', ' ') || '—'}</td><td>{user.obra?.nome || (user.perfil?.nome?.includes('ADMINISTRADOR') ? 'Todas' : 'Sem obra')}</td><td><Badge value={user.ativo ? 'ATIVO' : 'CANCELADA'}/></td><td><div className="row-actions"><button className="icon-button" title="Editar usuário" onClick={() => setForm({ id: user.id, nome: user.nome, email: user.email, senha: '', perfilId: user.perfilId, obraId: user.obraId || '', ativo: user.ativo })}><Pencil size={15}/></button><button className="icon-button" title="Redefinir senha" onClick={() => setReset({ id: user.id, nome: user.nome, senha: '' })}><KeyRound size={15}/></button><button className="icon-button" title={user.ativo ? 'Desativar conta' : 'Ativar conta'} onClick={() => toggle(user)}>{user.ativo ? <UserX size={15}/> : <UserRound size={15}/>}</button></div></td></tr>)}</tbody></table>{!users.length && <Empty icon={ShieldCheck} title="Nenhum usuário cadastrado" body="Crie uma conta para começar."/>}</div></div>
    {form && <div className="modal-backdrop"><form className="modal compact-modal" onSubmit={submit}><div className="modal-head"><div><span className="eyebrow">CONTROLE DE ACESSO</span><h2>{form.id ? 'Editar usuário' : 'Novo usuário'}</h2></div><button type="button" className="icon-button" onClick={() => setForm(null)}><X size={18}/></button></div><div className="modal-content"><label className="field-label">Nome<input required value={form.nome} onChange={event => setForm({ ...form, nome: event.target.value })}/></label><label className="field-label">E-mail<input required type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })}/></label><label className="field-label">{form.id ? 'Nova senha (opcional)' : 'Senha inicial'}<input required={!form.id} minLength={10} type="password" value={form.senha} onChange={event => setForm({ ...form, senha: event.target.value })}/></label><label className="field-label">Perfil<select required value={form.perfilId} onChange={event => setForm({ ...form, perfilId: Number(event.target.value), obraId: '' })}><option value="">Selecione</option>{userProfiles.map(profile => <option key={profile.id} value={profile.id}>{profile.nome.replaceAll('_', ' ')}</option>)}</select></label>{profiles.find(profile => profile.id === Number(form.perfilId))?.nome === 'USUARIO_PADRAO' && <label className="field-label">Obra vinculada<select required value={form.obraId} onChange={event => setForm({ ...form, obraId: event.target.value })}><option value="">Selecione a obra</option>{data.works.filter(work => work.ativo).map(work => <option key={work.id} value={work.id}>{work.nome}</option>)}</select></label>}<label className="field-label">Conta<select value={String(form.ativo)} onChange={event => setForm({ ...form, ativo: event.target.value === 'true' })}><option value="true">Ativa</option><option value="false">Desativada</option></select></label></div><div className="modal-foot"><button type="button" className="button secondary" onClick={() => setForm(null)}>Cancelar</button><Button type="submit" disabled={busy}>{busy ? 'Salvando...' : 'Salvar usuário'}</Button></div></form></div>}
    {reset && <div className="modal-backdrop"><form className="modal compact-modal" onSubmit={changePassword}><div className="modal-head"><div><span className="eyebrow">RECUPERAÇÃO ADMINISTRATIVA</span><h2>Redefinir senha</h2></div><button type="button" className="icon-button" onClick={() => setReset(null)}><X size={18}/></button></div><div className="modal-content"><p>Defina uma senha temporária para {reset.nome} e compartilhe-a com a pessoa por um canal confiável.</p><label className="field-label">Senha temporária<input required minLength={10} type="password" value={reset.senha} onChange={event => setReset({ ...reset, senha: event.target.value })}/></label></div><div className="modal-foot"><button type="button" className="button secondary" onClick={() => setReset(null)}>Cancelar</button><Button type="submit" disabled={busy}>{busy ? 'Salvando...' : 'Redefinir senha'}</Button></div></form></div>}
  </>;
}

export { UsersAdmin };
