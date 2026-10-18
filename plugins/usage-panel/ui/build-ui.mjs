// Keep the shipped resource self-contained; no relative script URL is required.
import {readFileSync,writeFileSync} from 'node:fs';
const target=new URL('./main.html',import.meta.url);
const html=readFileSync(target,'utf8');
const marker=html.indexOf('// Inlined into main.html');
if(marker<0)throw new Error('Marcador do runtime não encontrado no recurso MCP.');
writeFileSync(target,html.slice(0,marker)+readFileSync(new URL('./panel-runtime.js',import.meta.url),'utf8')+'\n})();\n</script></body></html>\n');
