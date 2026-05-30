import dns from 'dns';
import { MongoClient } from 'mongodb';

// 学校/公司 DNS 屏蔽了 *.mongodb.net，用公共 DNS 接管 dns.lookup
const resolver = new dns.Resolver();
resolver.setServers(['8.8.8.8', '1.1.1.1']);

// 只在首次加载时保存，避免热重载时保存到已被劫持的 customLookup
const originalLookup = (dns as any).__originalLookup || dns.lookup;
(dns as any).__originalLookup = originalLookup;

// localhost 和局域网地址走系统 DNS，其余走公共 DNS
function isLocalHostname(hostname: string) {
  return hostname === 'localhost' || hostname === '::1' || hostname.endsWith('.local') || /^127\.|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\.|^0\.0\.0\.0$/.test(hostname);
}

function customLookup(
  hostname: string,
  options: dns.LookupOptions | ((err: NodeJS.ErrnoException | null, address: string, family: number) => void),
  callback?: (err: NodeJS.ErrnoException | null, address: string, family: number) => void,
) {
  if (isLocalHostname(hostname)) {
    return (originalLookup as Function)(hostname, options, callback);
  }
  const cb = typeof options === 'function' ? options : callback!;
  const opts = typeof options === 'object' ? options : {};
  const family = opts.family || opts.hints || 0;
  const all = opts.all || false;

  const tasks: Promise<string[]>[] = [];
  if (family !== 6) tasks.push(promisifyResolve(resolver.resolve4.bind(resolver), hostname).catch(() => []));
  if (family !== 4) tasks.push(promisifyResolve(resolver.resolve6.bind(resolver), hostname).catch(() => []));

  Promise.all(tasks).then((results) => {
    const addresses = results.flatMap((addrs, i) =>
      addrs.map(addr => ({ address: addr, family: (i === 0 && family !== 6) || family === 4 ? 4 : 6 }) as { address: string; family: 4 | 6 })
    );
    if (addresses.length === 0) {
      const err = new Error(`getaddrinfo ENOTFOUND ${hostname}`) as NodeJS.ErrnoException & { hostname: string };
      err.code = 'ENOTFOUND';
      err.errno = -3008;
      err.syscall = 'getaddrinfo';
      err.hostname = hostname;
      return all ? (cb as Function)(err) : cb(err, '', 0);
    }
    if (all) {
      (cb as Function)(null, addresses);
    } else {
      cb(null, addresses[0].address, addresses[0].family);
    }
  }).catch((err) => (all ? (cb as Function)(err) : cb(err, '', 0)));
}

function promisifyResolve(fn: (hostname: string, cb: (err: NodeJS.ErrnoException | null, addresses: string[]) => void) => void, hostname: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    fn(hostname, (err, addresses) => {
      if (err) reject(err);
      else resolve(addresses);
    });
  });
}

(dns as any).lookup = customLookup;

const uri = process.env.MONGODB_URI!;
const client = new MongoClient(uri);

export async function getDb() {
  await client.connect();
  return client.db();
}
