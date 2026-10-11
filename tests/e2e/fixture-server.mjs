// Serves tests/e2e/.fixtures over HTTP so the timetable "share link" flow can be exercised offline.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';

const port = Number(process.argv[2] || 3299);
const dir = join(import.meta.dirname, '.fixtures');
createServer(async (req, res) => {
  try {
    const name = basename(new URL(req.url, 'http://x').pathname);
    const body = await readFile(join(dir, name));
    res.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Last-Modified': new Date().toUTCString() });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port);
