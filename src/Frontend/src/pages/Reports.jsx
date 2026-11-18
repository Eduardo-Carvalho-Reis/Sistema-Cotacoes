import { useState } from 'react';
import { ArrowDownToLine, Search } from 'lucide-react';
import { money, date } from '../utils/formatters.js';
import { Button, PageTitle } from '../components/index.js';

const labels = { gastos: 'Gastos por compra', cotacoes: 'Comparativo de cotacoes', gerencial: 'Painel gerencial', precos: 'Comparativo de precos', historico: 'Historico de precos' };
const supplierColumns = [['fornecedor', 'Fornecedor'], ['totalComprado', 'Comprado', money], ['quantidadeCompras', 'Compras'], ['variedadeProdutos', 'Produtos'], ['participacaoPercentual', 'Participacao', value => `${Number(value).toFixed(1)}%`]];
const workColumns = [['obra', 'Obra'], ['mes', 'Mes'], ['total', 'Total', money]];
const detailColumns = [['nome', 'Grupo'], ['produto', 'Produto'], ['especificacao', 'Especificacao'], ['categoria', 'Categoria'], ['fornecedor', 'Fornecedor'], ['obra', 'Obra'], ['data', 'Data', value => value ? date(value) : '-'], ['unidade', 'Unidade'], ['quantidadeSolicitada', 'Qtd solicitada'], ['quantidade', 'Qtd ofertada'], ['valorUnitario', 'Preco unitario', value => value == null ? '-' : money(value)], ['frete', 'Frete', value => value == null ? '-' : money(value)], ['condicaoPagamento', 'Condicao de pagamento'], ['total', 'Total', value => value == null ? '-' : money(value)], ['menorPreco', 'Menor', value => value == null ? '-' : money(value)], ['precoMedio', 'Medio', value => value == null ? '-' : money(value)], ['maiorPreco', 'Maior', value => value == null ? '-' : money(value)]];

function Reports({ api, data, notify }) {
  const [kind, setKind] = useState('gerencial');
  const [format, setFormat] = useState('csv');
  const [filters, setFilters] = useState({ obraId: '', fornecedorId: '', produtoId: '', categoriaId: '', de: '', ate: '' });
  const [group, setGroup] = useState('obra');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const endpoint = kind === 'gerencial' ? 'gerencial' : ['precos', 'historico'].includes(kind) ? 'precos' : kind;
  const query = () => {
    const values = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
    if (kind === 'gastos') values.agruparPor = group;
    return new URLSearchParams(values).toString();
  };
  const load = async () => {
    if (['precos', 'historico'].includes(kind) && !filters.produtoId) throw new Error('Selecione um produto para consultar precos.');
    return api(`/api/relatorios/${endpoint}?${query()}`);
  };
  const preview = async () => {
    setBusy(true);
    try { setResult(await load()); }
    catch (error) { notify(error.message); }
    finally { setBusy(false); }
  };
  const download = async () => {
    setBusy(true);
    try {
      if (['precos', 'historico', 'gerencial'].includes(kind)) {
        const value = result || await load(); setResult(value);
        const rows = kind === 'gerencial' ? value.fornecedores : value.linhas;
        if (!rows?.length) throw new Error('Nao ha dados para exportar com esses filtros.');
        const keys = Object.keys(rows[0]);
        const csv = [keys.join(';'), ...rows.map(row => keys.map(key => `"${String(row[key] ?? '').replaceAll('"', '""')}"`).join(';'))].join('\r\n');
        const file = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(file); const link = document.createElement('a'); link.href = url; link.download = `relatorio-${kind}.csv`; link.click(); URL.revokeObjectURL(url);
      } else {
        const file = await api(`/api/relatorios/${endpoint}?${query()}&formato=${format}`);
        const url = URL.createObjectURL(file); const link = document.createElement('a'); link.href = url; link.download = `relatorio-${kind}.${format}`; link.click(); URL.revokeObjectURL(url);
      }
      notify('Relatorio exportado.');
    } catch (error) { notify(error.message); }
    finally { setBusy(false); }
  };
  const rows = kind === 'gerencial' ? result?.fornecedores : kind === 'gastos' ? result?.resumo : result?.linhas;
  return <>
    <PageTitle eyebrow="VISAO GERENCIAL" title="Relatorios" description="Consulte compras aprovadas e ofertas registradas por obra, fornecedor, produto e periodo." />
    <div className="report-layout">
      <section className="panel report-controls">
        <span className="eyebrow">CONFIGURAR RELATORIO</span><h2>Filtros</h2>
        <label className="field-label">Relatorio<select value={kind} onChange={event => { setKind(event.target.value); setResult(null); }}>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="field-label">Obra<select value={filters.obraId} onChange={event => setFilters({ ...filters, obraId: event.target.value })}><option value="">Todas as obras autorizadas</option>{data.works.map(work => <option value={work.id} key={work.id}>{work.nome}</option>)}</select></label>
        <label className="field-label">Fornecedor<select value={filters.fornecedorId} onChange={event => setFilters({ ...filters, fornecedorId: event.target.value })}><option value="">Todos os fornecedores</option>{data.suppliers.map(supplier => <option value={supplier.id} key={supplier.id}>{supplier.nome}</option>)}</select></label>
        <label className="field-label">Produto<select value={filters.produtoId} onChange={event => setFilters({ ...filters, produtoId: event.target.value })}><option value="">Todos os produtos</option>{data.products.map(product => <option value={product.id} key={product.id}>{product.nome} ({product.unidade})</option>)}</select></label>
        <label className="field-label">Categoria<select value={filters.categoriaId} onChange={event => setFilters({ ...filters, categoriaId: event.target.value })}><option value="">Todas as categorias</option>{(data.categories || []).map(category => <option value={category.id} key={category.id}>{category.nome}</option>)}</select></label>
        <div className="form-two"><label className="field-label">De<input type="date" value={filters.de} onChange={event => setFilters({ ...filters, de: event.target.value })}/></label><label className="field-label">Ate<input type="date" value={filters.ate} onChange={event => setFilters({ ...filters, ate: event.target.value })}/></label></div>
        {kind === 'gastos' && <label className="field-label">Agrupar por<select value={group} onChange={event => setGroup(event.target.value)}><option value="obra">Obra</option><option value="fornecedor">Fornecedor</option><option value="produto">Produto</option><option value="categoria">Categoria</option></select></label>}
        {!['gerencial', 'precos', 'historico'].includes(kind) && <label className="field-label">Formato<select value={format} onChange={event => setFormat(event.target.value)}><option value="csv">CSV</option><option value="pdf">PDF</option></select></label>}
        <div className="report-buttons"><Button variant="secondary" onClick={preview} disabled={busy}><Search size={15}/>{busy ? 'Consultando...' : 'Visualizar'}</Button><Button onClick={download} disabled={busy}><ArrowDownToLine size={16}/>Exportar</Button></div>
        <small className="report-hint">Precos sao comparados pelo produto cadastrado e sua unidade. Frete e condicoes aparecem quando informados na resposta.</small>
      </section>
      <section className="panel report-preview">
        <div className="panel-heading"><div><span className="eyebrow">RESULTADOS</span><h2>{labels[kind]}</h2></div></div>
        {!result ? <div className="preview-empty-copy">Aplique os filtros para consultar dados reais.</div> : <>
          {result.estatisticas && <div className="report-result-row"><div><b>{result.produto?.nome} · {result.produto?.unidade}</b><small>Menor / medio / maior preco unitario</small></div><strong>{money(result.estatisticas.menorPreco)} / {money(result.estatisticas.precoMedio)} / {money(result.estatisticas.maiorPreco)}</strong></div>}
          {kind === 'gerencial' && <><h3>Ranking de fornecedores</h3><ReportTable rows={result.fornecedores} columns={supplierColumns}/><h3>Gastos por obra e mes</h3><ReportTable rows={result.gastosPorObraMes} columns={workColumns}/><h3>Gastos por categoria</h3><ReportTable rows={result.gastosPorCategoria || []} columns={[['categoria', 'Categoria'], ['total', 'Total', money]]}/></>}
          {kind !== 'gerencial' && <ReportTable rows={rows || []} columns={detailColumns}/>}
        </>}
      </section>
    </div>
  </>;
}

function ReportTable({ rows = [], columns }) {
  if (!rows.length) return <p className="preview-empty-copy">Nenhum registro no periodo.</p>;
  return <div className="table-scroll report-table"><table><thead><tr>{columns.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead><tbody>{rows.slice(0, 100).map((row, index) => <tr key={row.id || [row.fornecedorId, row.produtoId, row.obraId, row.cotacaoId, row.nome, index].filter(value => value != null).join('-')}>{columns.map(([key, , format]) => <td key={key}>{format ? format(row[key]) : row[key] ?? '-'}</td>)}</tr>)}</tbody></table></div>;
}

export { Reports };
