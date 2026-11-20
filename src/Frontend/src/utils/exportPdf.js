const escapeHtml = value => String(value ?? '—').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

function exportPdf({ title, subtitle, details = [], columns = [], rows = [], filename = 'exportacao' }) {
  const popup = window.open('', '_blank', 'width=900,height=700');
  if (!popup) return false;
  const detailMarkup = details.map(([label, value]) => `<div class="detail"><b>${escapeHtml(label)}</b><span>${escapeHtml(value)}</span></div>`).join('');
  const headerMarkup = columns.map(column => `<th>${escapeHtml(column)}</th>`).join('');
  const rowMarkup = rows.map(row => `<tr>${row.map(value => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('');
  popup.document.open();
  popup.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    @page{size:A4;margin:18mm}*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#202a35;margin:0}header{border-bottom:2px solid #193d63;padding-bottom:14px;margin-bottom:20px}h1{font-size:22px;margin:0 0 6px;color:#193d63}header p{margin:0;color:#667586;font-size:12px}.details{display:grid;grid-template-columns:1fr 1fr;gap:9px 20px;margin:0 0 20px}.detail{border-bottom:1px solid #e3e8ed;padding:5px 0}.detail b{display:block;color:#667586;font-size:10px;text-transform:uppercase;margin-bottom:3px}.detail span{white-space:pre-wrap}table{width:100%;border-collapse:collapse;font-size:11px}th{text-align:left;background:#eef3f7;color:#193d63}th,td{border:1px solid #dbe2e8;padding:8px;vertical-align:top}footer{margin-top:24px;border-top:1px solid #dbe2e8;padding-top:8px;color:#778494;font-size:9px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body><header><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle || '')}</p></header>${detailMarkup ? `<section class="details">${detailMarkup}</section>` : ''}${columns.length ? `<table><thead><tr>${headerMarkup}</tr></thead><tbody>${rowMarkup || `<tr><td colspan="${columns.length}">Nenhum item registrado</td></tr>`}</tbody></table>` : ''}<footer>Documento exportado do sistema de cotações · ${escapeHtml(new Date().toLocaleString('pt-BR'))}</footer><script>window.addEventListener('load',()=>setTimeout(()=>{window.print()},250));</script></body></html>`);
  popup.document.close();
  popup.document.title = `${filename}.pdf`;
  return true;
}

export { exportPdf };
