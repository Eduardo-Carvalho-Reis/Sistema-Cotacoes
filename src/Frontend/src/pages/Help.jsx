import { ArrowRight, BadgeCheck, BarChart3, ClipboardList, HelpCircle, MessageCircle, Package, Settings2, ShoppingCart, Users, Workflow } from 'lucide-react';
import { PageTitle } from '../components/index.js';
import './Help.css';

const steps = [
  { number: '01', title: 'Prepare os cadastros', text: 'Cadastre obras, produtos, fornecedores e aplicações. Esses dados serão usados para identificar cada solicitação e comparar propostas.' },
  { number: '02', title: 'Crie uma cotação', text: 'Escolha a obra, informe produtos, quantidades e aplicações, selecione os fornecedores e envie a solicitação.' },
  { number: '03', title: 'Registre as respostas', text: 'Abra a cotação e informe, para cada fornecedor, os produtos ofertados, quantidades, preços, frete e condições da proposta.' },
  { number: '04', title: 'Compare e aprove', text: 'Analise as propostas e aprove os itens que serão comprados, definindo quantidades e valores aprovados.' },
  { number: '05', title: 'Acompanhe os pedidos', text: 'Gere os pedidos por fornecedor, acompanhe confirmação, notas fiscais e previsão de entrega e registre os recebimentos.' },
  { number: '06', title: 'Consulte os resultados', text: 'Use o painel e os relatórios para acompanhar compras, comparar preços e entender como os recursos foram distribuídos.' },
];

const modules = [
  { id: 'overview', title: 'Visão geral', icon: BarChart3, description: 'Acompanhe um resumo do processo, os indicadores principais e as pendências que precisam de atenção.' },
  { id: 'quotes', title: 'Cotações', icon: ClipboardList, description: 'Crie solicitações por obra, detalhe produtos e aplicações, escolha fornecedores e acompanhe o status. Cotações concluídas ficam disponíveis para consulta.' },
  { id: 'responses', title: 'Respostas', icon: MessageCircle, description: 'Registre propostas individualmente por fornecedor. Informe disponibilidade, quantidade, preço unitário, frete, condição de pagamento e observações. Depois, encaminhe o comparativo aos destinatários configurados.' },
  { id: 'approval', title: 'Aprovações', icon: BadgeCheck, description: 'Compare as ofertas recebidas e escolha os itens, quantidades e valores que serão aprovados. A cotação concluída não aparece mais nesta fila.' },
  { id: 'purchases', title: 'Pedidos e compras', icon: ShoppingCart, description: 'Gere pedidos separados por fornecedor e acompanhe confirmação, notas fiscais, entregas e recebimentos. Usuários padrão podem consultar todas as compras, mas só editar as da obra vinculada.' },
  { id: 'catalog', title: 'Cadastros', icon: Package, description: 'Mantenha produtos, fornecedores, obras, aplicações e demais referências usados nas cotações. Algumas alterações são restritas a administradores.' },
  { id: 'reports', title: 'Relatórios', icon: BarChart3, description: 'Filtre compras por obra, fornecedor, produto, aplicação e período. Consulte indicadores, gráficos, detalhes e exporte os dados.' },
  { id: 'whatsapp', title: 'WhatsApp', icon: MessageCircle, description: 'Configure os destinatários que recebem comparativos encaminhados. O envio depende da configuração do provedor de mensagens.' },
  { id: 'settings', title: 'Configurações', icon: Settings2, description: 'Acesse as opções da conta e as preferências disponíveis para o seu perfil.' },
  { id: 'users', title: 'Usuários', icon: Users, description: 'Administradores gerenciam contas, perfis de acesso e a obra vinculada. Cada usuário também pode atualizar os próprios dados de perfil.' },
];

function Help({ go }) {
  return <>
    <PageTitle eyebrow="GUIA DO SISTEMA" title="Central de ajuda" description="Entenda para que serve cada módulo e como uma compra percorre o sistema."/>
    <section className="help-flow panel"><div className="help-section-title"><span className="help-section-icon"><Workflow size={18}/></span><div><span className="eyebrow">DO PEDIDO AO RECEBIMENTO</span><h2>Fluxo de compras</h2><p>As etapas ajudam a manter as informações da solicitação até a entrega.</p></div></div><div className="help-flow-grid">{steps.map((step, index) => <article className="help-flow-step" key={step.number}><span className="help-step-number">{step.number}</span><div><h3>{step.title}</h3><p>{step.text}</p></div>{index < steps.length - 1 && <ArrowRight className="help-step-arrow" size={15}/>}</article>)}</div></section>
    <section className="help-modules-section"><div className="help-modules-heading"><div><span className="eyebrow">NAVEGAÇÃO</span><h2>Conheça os módulos</h2></div><span>{modules.length} áreas do sistema</span></div><div className="help-module-grid">{modules.map(module => <article className="panel help-module-card" key={module.id}><div className="help-module-icon"><module.icon size={18}/></div><div className="help-module-copy"><h3>{module.title}</h3><p>{module.description}</p></div><button type="button" aria-label={`Abrir ${module.title}`} onClick={() => go(module.id)}>Abrir módulo <ArrowRight size={14}/></button></article>)}</div></section>
    <section className="help-access-note"><HelpCircle size={17}/><p><b>Precisa de acesso a uma obra?</b><span>Peça a um administrador para conferir a obra vinculada ao seu usuário e o seu perfil de acesso.</span></p></section>
  </>;
}

export { Help };
