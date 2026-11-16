import { Settings2, UserRound, MessageCircle, Boxes } from 'lucide-react';
import { PageTitle } from '../components/index.js';

function Settings({ user, go }) {
  return <>
    <PageTitle eyebrow="SISTEMA" title="Configurações" description="Ajustes da conta e informações de integração do sistema." />
    <div className="settings-grid">
      <section className="panel settings-card">
        <div className="settings-card-icon"><UserRound size={18}/></div>
        <div><span className="eyebrow">CONTA ATUAL</span><h2>{user?.nome || 'Usuário'}</h2><p>{(typeof user?.perfil === 'string' ? user.perfil : user?.perfil?.nome || 'Perfil não informado').replaceAll('_', ' ')}</p></div>
      </section>
      <section className="panel settings-card">
        <div className="settings-card-icon"><MessageCircle size={18}/></div>
        <div><span className="eyebrow">ENVIO DE MENSAGENS</span><h2>WhatsApp</h2><p>A integração é configurada no arquivo .env do servidor com WHATSAPP_PROVIDER_URL e WHATSAPP_PROVIDER_TOKEN. Reinicie a API após alterar os valores.</p></div>
      </section>
      <button className="panel settings-card settings-link" onClick={() => go('catalog')}>
        <div className="settings-card-icon"><Boxes size={18}/></div>
        <div><span className="eyebrow">DADOS DO SISTEMA</span><h2>Cadastros</h2><p>Gerencie produtos, fornecedores, obras, equipamentos e aplicações.</p></div>
        <Settings2 size={17}/>
      </button>
    </div>
  </>;
}

export { Settings };
