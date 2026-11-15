import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
const root = dirname(new URL(import.meta.url).pathname).replace(/^\//, '').replaceAll('%20', ' ');
const source = join(root, 'App.jsx');
const lines = readFileSync(source, 'utf8').split(/(?<=\n)/);
const starts = lines.map((line, i) => /^function [A-Z]/.test(line) ? i : -1).filter(i => i >= 0);
const appStart = starts[0];
const nextStart = starts[1];
const icons = lines.slice(1, 8).join('');
const imports = `import { useEffect, useMemo, useState } from 'react';\n${icons}`;
const utils = lines.slice(9, 13).join('');
const funcs = {};
for (let pos = 1; pos < starts.length; pos++) {
  const start = starts[pos];
  const end = starts[pos + 1] ?? lines.findIndex((line, i) => i > start && line.startsWith('export default App;'));
  const name = lines[start].match(/^function (\w+)/)[1];
  funcs[name] = lines.slice(start, end).join('').trim() + '\n';
}
const ensure = p => mkdirSync(join(root, p), { recursive: true });
ensure('utils'); ensure('components'); ensure('pages');
writeFileSync(join(root, 'utils/formatters.js'), utils);
writeFileSync(join(root, 'components/ui.jsx'), `${imports}\nimport { statusNames, statusClass } from '../utils/formatters.js';\n\n${['PageTitle','Button','Badge','Empty','Stat'].map(n=>funcs[n]).join('\n')}\nexport { PageTitle, Button, Badge, Empty, Stat };\n`);
writeFileSync(join(root, 'components/index.js'), "export { PageTitle, Button, Badge, Empty, Stat } from './ui.jsx';\n");
const pageMap = { Overview:['Overview'], Quotes:['Quotes','QuoteWizard'], Responses:['Responses','ResponseModal'], Approvals:['Approvals'], Purchases:['Purchases','PurchaseModal'], Catalog:['Catalog','CatalogForm'], Reports:['Reports'], Login:['Login'] };
for (const [file, names] of Object.entries(pageMap)) {
 const content = `${imports}\nimport { money, date, statusNames } from '../utils/formatters.js';\nimport { PageTitle, Button, Badge, Empty, Stat } from '../components/index.js';\n\n${names.map(n=>funcs[n]).join('\n')}\nexport { ${names.join(', ')} };\n`;
 writeFileSync(join(root, `pages/${file}.jsx`), content);
}
const app = lines.slice(0, nextStart).join('')
 .replace("import { useCallback, useEffect, useMemo, useState } from 'react';", "import { useCallback, useEffect, useState } from 'react';")
 .replace(/^const money = .*\nconst date = .*\nconst statusNames = .*\nconst statusClass = .*\n/m, '')
 + `\nimport { Login, Overview, Quotes, Responses, Approvals, Purchases, Catalog, Reports, QuoteWizard, ResponseModal, PurchaseModal } from './pages/index.js';\nimport { money, date, statusNames } from './utils/formatters.js';\nimport { PageTitle, Button, Badge, Empty, Stat } from './components/index.js';\n`;
writeFileSync(source, app);
writeFileSync(join(root, 'pages/index.js'), Object.entries(pageMap).map(([file,names])=>`export { ${names.join(', ')} } from './${file}.jsx';`).join('\n')+'\n');
unlinkSync(join(root, 'refactor_tmp.py'));
