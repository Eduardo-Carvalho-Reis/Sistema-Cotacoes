import { useMemo, useState } from 'react';
import { Activity, ArrowDownToLine, Building2, CalendarDays, ChevronDown, CircleDollarSign, Package, Search, ShoppingCart, Store, X } from 'lucide-react';
import { money, date, statusNames } from '../utils/formatters.js';
import { Button, Empty, PageTitle } from '../components/index.js';
import { exportPdf } from '../utils/exportPdf.js';
import './Reports.css';

const labels = { gastos: 'Gastos por compra', cotacoes: 'Comparativo de cotações', gerencial: 'Painel gerencial', precos: 'Comparativo de preços', historico: 'Histórico de preços' };
const todayText = value => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
const monthStart = value => new Date(value.getFullYear(), value.getMonth(), 1);
const setDays = (value, days) => new Date(value.getFullYear(), value.getMonth(), value.getDate() + days);
const percent = value => `${Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const displayDateInput = value => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : date(value);

function ReportAutocomplete({ label, placeholder, options, value, onChange, getLabel, allLabel }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = options.find(option => String(option.id) === String(value));
  const matches = options.filter(option => getLabel(option).toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR'))).slice(0, 40);
  return <label className="field-label report-field"><span>{label}</span><div className={`report-autocomplete ${value ? 'is-active' : ''}`} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <Search size={14}/><input value={open ? search : (selected ? getLabel(selected) : '')} placeholder={placeholder} onFocus={() => { setSearch(''); setOpen(true); }} onChange={event => { setSearch(event.target.value); setOpen(true); }} autoComplete="off"/>
    {value && <button type="button" aria-label={`Limpar filtro ${label}`} onMouseDown={event => event.preventDefault()} onClick={() => { onChange(''); setSearch(''); setOpen(false); }}><X size={14}/></button>}
    {open && <div className="report-options"><button type="button" onMouseDown={event => event.preventDefault()} onClick={() => { onChange(''); setSearch(''); setOpen(false); }}>{allLabel}</button>{matches.map(option => <button type="button" key={option.id} onMouseDown={event => event.preventDefault()} onClick={() => { onChange(String(option.id)); setSearch(''); setOpen(false); }}>{getLabel(option)}</button>)}{!matches.length && <small>Nenhuma opção encontrada.</small>}</div>}
  </div></label>;
}

function ApplicationAutocomplete({ options, values, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const matches = options.filter(option => option.nome.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR'))).slice(0, 40);
  const toggle = id => onChange(values.includes(String(id)) ? values.filter(value => value !== String(id)) : [...values, String(id)]);
  return <label className="field-label report-field"><span>Aplicação</span><div className={`report-autocomplete application-autocomplete ${values.length ? 'is-active' : ''}`} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <Search size={14}/><button type="button" className="application-trigger" onClick={() => setOpen(value => !value)}>{values.length ? `${values.length} aplicação(ões) selecionada(s)` : 'Todas as aplicações'}<ChevronDown size={14}/></button>
    {values.length > 0 && <button type="button" aria-label="Limpar aplicações" onMouseDown={event => event.preventDefault()} onClick={() => onChange([])}><X size={14}/></button>}
    {open && <div className="report-options application-options"><input value={search} placeholder="Buscar aplicação" onChange={event => setSearch(event.target.value)} autoFocus/><button type="button" onMouseDown={event => event.preventDefault()} onClick={() => { onChange([]); setSearch(''); setOpen(false); }}>Todas as aplicações</button>{matches.map(option => <button type="button" key={option.id} className={values.includes(String(option.id)) ? 'selected' : ''} onMouseDown={event => event.preventDefault()} onClick={() => toggle(option.id)}><span className="report-checkbox">{values.includes(String(option.id)) ? '✓' : ''}</span>{option.nome}</button>)}{!matches.length && <small>Nenhuma aplicação encontrada.</small>}</div>}
  </div></label>;
}

function Reports({ api, data, notify }) {
  const now = new Date();
  const [kind, setKind] = useState('gerencial');
  const [filters, setFilters] = useState({ obraId: '', fornecedorId: '', produtoId: '', aplicacaoIds: [], de: todayText(monthStart(now)), ate: todayText(now) });
  const [period, setPeriod] = useState('month');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const workOptions = useMemo(() => [...(data.works || [])].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })), [data.works]);
  const supplierOptions = useMemo(() => [...(data.suppliers || [])].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })), [data.suppliers]);
  const productOptions = useMemo(() => [...(data.products || [])].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })), [data.products]);
  const applicationOptions = useMemo(() => [...(data.applications || [])].filter(item => item.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })), [data.applications]);
  const optionsById = (options, id) => options.find(option => String(option.id) === String(id));
  const setFilter = (key, value) => { setFilters(current => ({ ...current, [key]: value })); setResult(null); setDetail(null); };
  const setPreset = preset => {
    const current = new Date(); const end = todayText(current);
    if (preset === 'month') setFilters(value => ({ ...value, de: todayText(monthStart(current)), ate: end }));
    if (preset === 'previous') { const start = new Date(current.getFullYear(), current.getMonth() - 1, 1); const last = new Date(current.getFullYear(), current.getMonth(), 0); setFilters(value => ({ ...value, de: todayText(start), ate: todayText(last) })); }
    if (preset === '30') setFilters(value => ({ ...value, de: todayText(setDays(current, -29)), ate: end }));
    if (preset === '90') setFilters(value => ({ ...value, de: todayText(setDays(current, -89)), ate: end }));
    if (preset === 'year') setFilters(value => ({ ...value, de: `${current.getFullYear()}-01-01`, ate: end }));
    setPeriod(preset); setResult(null); setDetail(null);
  };
  const endpoint = kind === 'precos' || kind === 'historico' ? 'precos' : kind;
  const query = () => {
    const values = { ...filters, aplicacaoIds: filters.aplicacaoIds.join(',') };
    if (kind === 'historico') values.modo = 'historico';
    return new URLSearchParams(Object.entries(values).filter(([, value]) => value !== '' && value != null)).toString();
  };
  const preview = async () => {
    if (['precos', 'historico'].includes(kind) && !filters.produtoId) return notify('Selecione um produto para consultar preços.');
    if (filters.de && filters.ate && filters.de > filters.ate) return notify('A data inicial deve ser anterior à data final.');
    setBusy(true); setDetail(null);
    try { setResult(await api(`/api/relatorios/${endpoint}?${query()}`)); }
    catch (error) { notify(error.message); }
    finally { setBusy(false); }
  };
  const reportRows = () => result?.linhas || [];
  const exportRows = async format => {
    setExportOpen(false);
    if (!result) { notify('Visualize o relatório antes de exportar.'); return; }
    const rows = reportRows();
    const filterDescription = [filters.obraId && `Obra: ${optionsById(workOptions, filters.obraId)?.nome}`, filters.fornecedorId && `Fornecedor: ${optionsById(supplierOptions, filters.fornecedorId)?.nome}`, filters.produtoId && `Produto: ${optionsById(productOptions, filters.produtoId)?.nome}`, filters.aplicacaoIds.length && `Aplicações: ${filters.aplicacaoIds.map(id => optionsById(applicationOptions, id)?.nome).filter(Boolean).join(', ')}`, `Período: ${filters.de || 'sem início'} a ${filters.ate || 'hoje'}`].filter(Boolean).join(' · ');
    const columns = kind === 'gerencial' || kind === 'gastos' ? ['Compra', 'Obra', 'Fornecedor', 'Produto', 'Aplicação', 'Quantidade', 'Unidade', 'Preço unitário', 'Frete alocado', 'Total', 'Data'] : kind === 'cotacoes' ? ['Cotação', 'Obra', 'Produto', 'Aplicação', 'Fornecedor', 'Quantidade solicitada', 'Quantidade ofertada', 'Preço unitário', 'Total', 'Disponibilidade'] : ['Produto', 'Fornecedor', 'Obra', 'Quantidade', 'Unidade', 'Preço unitário', 'Frete', 'Total', 'Data'];
    const exportData = rows.map(row => kind === 'gerencial' || kind === 'gastos' ? [`#${String(row.compraId).padStart(4, '0')}`, row.obra, row.fornecedor, row.produto, row.aplicacao, row.quantidade, row.unidade, money(row.valorUnitario), money(row.freteAlocado), money(row.total), date(row.data)] : kind === 'cotacoes' ? [row.cotacaoId, row.obra, row.produto, row.aplicacao, row.fornecedor, `${row.solicitada} ${row.unidade || ''}`, row.ofertada, money(row.valorUnitario), money(row.total), row.disponibilidade] : [row.produto, row.fornecedor, row.obra, row.quantidade, row.unidade, money(row.valorUnitario), row.frete == null ? '—' : money(row.frete), money(row.total), date(row.data)]);
    if (format === 'csv') {
      const csv = [columns, ...exportData].map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(';')).join('\r\n');
      const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `relatorio-${kind}.csv`; anchor.click(); URL.revokeObjectURL(url); notify('Relatório exportado em CSV.'); return;
    }
    if (!rows.length) return notify('Não há dados para exportar neste relatório.');
    const reportTotal = result.total ?? result.indicadores?.total;
    const opened = exportPdf({ title: labels[kind], subtitle: filterDescription, filename: `relatorio-${kind}`, details: [['Registros', rows.length], ...(reportTotal != null ? [['Total gasto', money(reportTotal)]] : [])], columns, rows: exportData });
    if (!opened) notify('O navegador bloqueou a janela do PDF. Permita a abertura de janelas para este sistema.');
  };
  const findDetails = (title, rowsOrField, value) => {
    const lines = Array.isArray(rowsOrField) ? rowsOrField : reportRows().filter(row => String(row[rowsOrField] ?? '') === String(value));
    setDetail({ title, rows: lines });
  };
  const activeFilters = [filters.obraId && optionsById(workOptions, filters.obraId)?.nome, filters.fornecedorId && optionsById(supplierOptions, filters.fornecedorId)?.nome, filters.produtoId && optionsById(productOptions, filters.produtoId)?.nome, ...filters.aplicacaoIds.map(id => optionsById(applicationOptions, id)?.nome), filters.de || filters.ate ? `${filters.de || '—'} a ${filters.ate || 'hoje'}` : null].filter(Boolean);
  const isDashboard = kind === 'gerencial';

  return <>
    <PageTitle eyebrow="ANÁLISE DE COMPRAS" title="Relatórios" description="Entenda onde os recursos foram aplicados, acompanhe compras e compare fornecedores."/>
    <section className="panel reports-filter-panel">
      <div className="reports-filter-heading"><div><span className="eyebrow">CONSULTA</span><h2>Configure seu relatório</h2></div><span className="reports-filter-note"><CalendarDays size={14}/> Os dados seguem as permissões da sua conta</span></div>
      <div className="reports-filter-grid">
        <label className="field-label report-field"><span>Relatório</span><select value={kind} onChange={event => { setKind(event.target.value); setResult(null); setDetail(null); }}><option value="gastos">{labels.gastos}</option><option value="cotacoes">{labels.cotacoes}</option><option value="gerencial">{labels.gerencial}</option><option value="precos">{labels.precos}</option><option value="historico">{labels.historico}</option></select></label>
        <ReportAutocomplete label="Obra" placeholder="Todas as obras autorizadas" options={workOptions} value={filters.obraId} onChange={value => setFilter('obraId', value)} getLabel={item => item.nome} allLabel="Todas as obras autorizadas"/>
        <ReportAutocomplete label="Fornecedor" placeholder="Todos os fornecedores" options={supplierOptions} value={filters.fornecedorId} onChange={value => setFilter('fornecedorId', value)} getLabel={item => item.nome} allLabel="Todos os fornecedores"/>
        <ReportAutocomplete label="Produto" placeholder="Todos os produtos" options={productOptions} value={filters.produtoId} onChange={value => setFilter('produtoId', value)} getLabel={item => `${item.nome} · ${item.unidade || 'unidade não informada'}`} allLabel="Todos os produtos"/>
        <ApplicationAutocomplete options={applicationOptions} values={filters.aplicacaoIds} onChange={value => setFilter('aplicacaoIds', value)}/>
      </div>
      <div className="reports-period-row"><div><span className="report-filter-label">Período</span><div className="period-shortcuts">{[['month','Este mês'], ['previous','Mês anterior'], ['30','Últimos 30 dias'], ['90','Últimos 90 dias'], ['year','Este ano'], ['custom','Personalizado']].map(([key, label]) => <button type="button" key={key} className={period === key ? 'active' : ''} onClick={() => setPreset(key)}>{label}</button>)}</div></div><label className="field-label report-date-field"><span>De</span><input type="date" value={filters.de} onChange={event => { setFilter('de', event.target.value); setPeriod('custom'); }}/></label><label className="field-label report-date-field"><span>Até</span><input type="date" value={filters.ate} onChange={event => { setFilter('ate', event.target.value); setPeriod('custom'); }}/></label><div className="reports-actions"><Button onClick={preview} disabled={busy}><Search size={15}/>{busy ? 'Consultando…' : 'Visualizar relatório'}</Button><div className="report-export-wrap"><Button variant="secondary" disabled={!result} onClick={() => setExportOpen(value => !value)}><ArrowDownToLine size={15}/>Exportar</Button>{exportOpen && <div className="report-export-menu"><button onClick={() => exportRows('csv')}>CSV · Excel</button><button onClick={() => exportRows('pdf')}>PDF</button></div>}</div></div></div>
      {activeFilters.length > 0 && <div className="active-report-filters"><span>Filtros ativos</span>{activeFilters.map((value, index) => <span className="active-filter-chip" key={`${value}-${index}`}>{value}</span>)}</div>}
    </section>

    <section className="panel reports-results">
      <div className="reports-results-heading"><div><span className="eyebrow">RESULTADOS</span><h2>{labels[kind]}</h2></div>{result && <span className="reports-result-count">{reportRows().length} registros · {filters.de ? displayDateInput(filters.de) : 'todo período'} a {filters.ate ? displayDateInput(filters.ate) : 'hoje'}</span>}</div>
      {!result ? <div className="reports-empty"><div className="reports-empty-icon"><Activity size={20}/></div><b>Pronto para analisar</b><span>Defina os filtros e selecione “Visualizar relatório” para consultar os dados.</span></div> : busy ? <div className="reports-empty"><div className="reports-spinner"/><b>Atualizando relatório</b><span>Estamos organizando os dados da consulta.</span></div> : isDashboard ? <Dashboard result={result} onDetails={findDetails}/> : <OtherReport kind={kind} result={result} onDetails={findDetails}/>}
    </section>
    {detail && <section className="panel report-detail-panel"><div className="report-detail-heading"><div><span className="eyebrow">DETALHAMENTO</span><h2>{detail.title}</h2><span>{detail.rows.length} registros relacionados</span></div><button className="icon-button" aria-label="Fechar detalhamento" onClick={() => setDetail(null)}><X size={17}/></button></div><DetailTable rows={detail.rows}/></section>}
  </>;
}

function Dashboard({ result, onDetails }) {
  const indicators = result.indicadores || {};
  const cards = [
    ['Total gasto no período', money(indicators.total), CircleDollarSign, 'total'],
    ['Compras realizadas', indicators.quantidadeCompras || 0, ShoppingCart, 'quantidadeCompras'],
    ['Fornecedores utilizados', indicators.quantidadeFornecedores || 0, Store, 'quantidadeFornecedores'],
    ['Produtos adquiridos', indicators.quantidadeProdutos || 0, Package, 'quantidadeProdutos'],
    ['Obras com movimentação', indicators.quantidadeObras || 0, Building2, 'quantidadeObras'],
  ];
  const topWork = result.gastosPorObra?.[0]; const topSupplier = result.fornecedores?.[0]; const topApplication = result.gastosPorAplicacao?.[0]; const comparison = indicators.comparacao;
  const insights = [topWork && `A obra ${topWork.obra} concentra ${percent(topWork.participacaoPercentual)} dos gastos do período.`, topSupplier && `O fornecedor ${topSupplier.fornecedor} representa ${percent(topSupplier.participacaoPercentual)} das compras.`, topApplication && topApplication.aplicacao !== 'Sem aplicação' && `A aplicação ${topApplication.aplicacao} tem o maior volume de despesas, com ${money(topApplication.total)}.`, comparison?.variacaoPercentual != null && `Os gastos ${comparison.variacaoPercentual > 0 ? 'aumentaram' : comparison.variacaoPercentual < 0 ? 'diminuíram' : 'mantiveram-se'} ${percent(Math.abs(comparison.variacaoPercentual))} frente ao período anterior.`].filter(Boolean);
  return <div className="dashboard-content">
    <div className="report-kpi-grid">{cards.map(([label, value, Icon, comparisonKey]) => { const previous = comparison?.anterior?.[comparisonKey]; const change = comparison?.variacoes?.[comparisonKey]; return <button type="button" className="report-kpi" key={label} onClick={() => onDetails(label, result.linhas || [])}><span className="report-kpi-icon"><Icon size={17}/></span><span className="report-kpi-label">{label}</span><b>{value}</b>{previous != null && <small className={change == null || change === 0 ? '' : change > 0 ? 'trend-up' : 'trend-down'}>{change == null ? `Anterior: ${comparisonKey === 'total' ? money(previous) : previous}` : `${percent(Math.abs(change))} vs. período anterior`}</small>}</button>; })}</div>
    {insights.length > 0 && <section className="management-summary"><span className="eyebrow">RESUMO GERENCIAL</span><div>{insights.map((text, index) => <p key={index}><span>{index + 1}</span>{text}</p>)}</div></section>}
    <div className="report-charts-grid"><ChartCard title="Gastos por obra" description="Participação no total do período" rows={result.gastosPorObra || []} nameKey="obra" onSelect={row => onDetails(row.obra, result.linhas.filter(line => line.obraId === row.obraId))}/><ChartCard title="Gastos por aplicação" description="Distribuição das compras aprovadas" rows={result.gastosPorAplicacao || []} nameKey="aplicacao" onSelect={row => onDetails(row.aplicacao, result.linhas.filter(line => line.aplicacaoId === row.aplicacaoId))}/><MonthlyChart rows={result.gastosPorMes || []} onSelect={row => onDetails(row.mes, result.linhas.filter(line => line.mes === row.mes))}/><SupplierRanking rows={result.fornecedores || []} onSelect={row => onDetails(row.fornecedor, result.linhas.filter(line => line.fornecedorId === row.fornecedorId))}/></div>
    {!result.linhas?.length && <Empty icon={ShoppingCart} title="Sem movimentações neste período" body="Altere o período ou os filtros para consultar outras compras aprovadas."/>}
  </div>;
}

function ChartCard({ title, description, rows, nameKey, onSelect }) {
  const visible = rows.slice(0, 6); const max = Math.max(...visible.map(row => row.total), 0);
  return <section className="report-chart-card"><div className="report-chart-heading"><div><h3>{title}</h3><span>{description}</span></div></div>{visible.length ? <div className="horizontal-bars">{visible.map((row, index) => <button type="button" className="horizontal-bar-row" key={row.id ?? row[nameKey]} onClick={() => onSelect(row)}><span className="horizontal-bar-label" title={row[nameKey]}>{row[nameKey]}</span><span className="horizontal-bar-track"><i style={{ width: `${max ? row.total / max * 100 : 0}%` }}/></span><b>{money(row.total)}</b><small>{percent(row.participacaoPercentual)}{row.quantidadeCompras != null ? ` · ${row.quantidadeCompras} compras` : ''}</small></button>)}</div> : <p className="chart-empty">Sem dados para comparar.</p>}</section>;
}

function MonthlyChart({ rows, onSelect }) {
  const max = Math.max(...rows.map(row => row.total), 0);
  return <section className="report-chart-card"><div className="report-chart-heading"><div><h3>Gastos por período</h3><span>Evolução mensal incluindo frete</span></div></div>{rows.length ? <div className="monthly-bars">{rows.map(row => <button type="button" key={row.mes} title={`${row.mes}: ${money(row.total)}`} onClick={() => onSelect(row)}><span className="monthly-bar-value">{money(row.total)}</span><i style={{ height: `${max ? Math.max(row.total / max * 100, 4) : 0}%` }}/><small>{row.mes}</small></button>)}</div> : <p className="chart-empty">Sem dados para o período.</p>}</section>;
}

function SupplierRanking({ rows, onSelect }) {
  return <section className="report-chart-card supplier-ranking-card"><div className="report-chart-heading"><div><h3>Fornecedores em destaque</h3><span>Ordenados por valor comprado</span></div></div>{rows.length ? <div className="supplier-ranking-list">{rows.slice(0, 6).map((row, index) => <button type="button" key={row.fornecedorId} onClick={() => onSelect(row)}><span className="rank-number">{String(index + 1).padStart(2, '0')}</span><span className="rank-copy"><b>{row.fornecedor}</b><small>{row.quantidadeCompras} compras · {row.variedadeProdutos} produtos</small></span><span className="rank-total"><b>{money(row.totalComprado)}</b><small>{percent(row.participacaoPercentual)}</small></span></button>)}</div> : <p className="chart-empty">Sem fornecedores neste período.</p>}</section>;
}

function OtherReport({ kind, result, onDetails }) {
  if (kind === 'precos' || kind === 'historico') return <><div className="price-summary-cards">{result.produto && <div><span>Produto</span><b>{result.produto.nome}</b><small>Unidade: {result.produto.unidade}</small></div>}{result.estatisticas && [['Menor preço', result.estatisticas.menorPreco], ['Preço médio', result.estatisticas.precoMedio], ['Maior preço', result.estatisticas.maiorPreco]].map(([label, value]) => <div key={label}><span>{label}</span><b>{money(value)}</b><small>por unidade</small></div>)}</div><DetailTable rows={result.linhas || []} onRow={row => onDetails(`${row.fornecedor} · ${row.produto}`, [row])}/></>;
  const rows = result.linhas || [];
  return rows.length ? <DetailTable rows={rows} onRow={row => onDetails(`${row.produto || row.obra} · ${row.fornecedor || ''}`, [row])}/> : <Empty icon={Activity} title="Nenhum registro encontrado" body="Com esses filtros, não há dados para apresentar."/>;
}

function DetailTable({ rows, onRow }) {
  const [page, setPage] = useState(0);
  if (!rows.length) return <p className="chart-empty">Nenhum detalhe encontrado.</p>;
  const pageSize = 25;
  const pageCount = Math.ceil(rows.length / pageSize);
  const currentPage = Math.min(page, pageCount - 1);
  const cotacao = Object.hasOwn(rows[0], 'solicitada');
  const preco = Object.hasOwn(rows[0], 'quantidadeSolicitada');
  const columns = cotacao ? [['cotacaoId', 'Cotação'], ['obra', 'Obra'], ['produto', 'Produto'], ['aplicacao', 'Aplicação'], ['fornecedor', 'Fornecedor'], ['solicitada', 'Qtd. solicitada'], ['ofertada', 'Qtd. ofertada'], ['valorUnitario', 'Preço unitário', 'money'], ['total', 'Total', 'money'], ['disponibilidade', 'Disponibilidade']] : preco ? [['cotacaoId', 'Cotação'], ['data', 'Data', 'date'], ['obra', 'Obra'], ['fornecedor', 'Fornecedor'], ['produto', 'Produto'], ['quantidadeSolicitada', 'Qtd. solicitada'], ['quantidade', 'Qtd. ofertada'], ['unidade', 'Unidade'], ['valorUnitario', 'Preço unitário', 'money'], ['frete', 'Frete', 'money'], ['total', 'Total', 'money'], ['condicaoPagamento', 'Condição de pagamento']] : [['compraId', 'Compra'], ['data', 'Data', 'date'], ['obra', 'Obra'], ['fornecedor', 'Fornecedor'], ['produto', 'Produto'], ['quantidade', 'Quantidade'], ['unidade', 'Unidade'], ['valorUnitario', 'Valor unitário', 'money'], ['freteAlocado', 'Frete', 'money'], ['total', 'Total', 'money'], ['aplicacao', 'Aplicação']];
  return <div className="report-detail-table-wrap"><table className="report-detail-table"><thead><tr>{columns.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((row, index) => <tr key={`${row.compraId || row.cotacaoId || index}-${row.produtoId || index}`} onClick={() => onRow?.(row)}>{columns.map(([key, , format]) => <td key={key}>{format === 'money' ? money(row[key]) : format === 'date' ? date(row[key]) : row[key] ?? '—'}</td>)}</tr>)}</tbody></table>{pageCount > 1 && <div className="report-table-pagination"><span>{currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, rows.length)} de {rows.length}</span><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Anterior</button><button type="button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Próxima</button></div>}</div>;
}

export { Reports };
