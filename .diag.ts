import { Daytona } from '@daytonaio/sdk';
const s = await new Daytona().get('a4527134-5c75-4857-8986-085480345e00');
for (const c of [
  'ps aux | grep -c "[n]ext"',
  'curl -s -o /dev/null -w "%{http_code} in %{time_total}s" --max-time 25 http://127.0.0.1:3000/dashboard/default',
]) {
  const r: any = await s.process.executeCommand(c, '/workspace', undefined, 40).catch(e => ({result:String(e)}));
  console.log(`${c}\n  -> ${String(r.result).trim()}`);
}
